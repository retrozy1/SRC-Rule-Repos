import { EventType, Value, Variable } from 'speedruncom.js';
import client, { getGameData } from './speedrun.js';
import config from '../config.js';
import { writeMarkdownFile, directoryExists, makeDirectory, remove } from './files.js';
import { tryDiff, push } from './git.js';
import { sanitize } from './utils.js';
import path from 'path';

const GAME_ID = config.id;

const updatedEvents = [
    EventType.CategoryArchived,
    EventType.CategoryCreated,
    EventType.CategoryRestored,
    EventType.CategoryUpdated,
    EventType.GameUpdated,
    EventType.LevelArchived,
    EventType.LevelCreated,
    EventType.LevelUpdated,
    EventType.ValueCreated,
    EventType.ValueUpdated,
    EventType.VariableArchived,
    EventType.VariableCreated,
    EventType.VariableUpdated
];

const createdFiles = new Set<string>();

const makeFile = async (filePath: string, content: string) => {
    await writeMarkdownFile(filePath, content);
    createdFiles.add(path.resolve(filePath));
};

const makeDir = async (directoryPath: string) => {
    await makeDirectory(directoryPath)
    createdFiles.add(path.resolve(directoryPath));
}

const makeIdExtensions = <T extends { name: string, id: string }>(items: T[], item: T): string => {
    let itemName = sanitize(item.name);
    if (items.filter(i => sanitize(i.name) === itemName).length > 1) {
        itemName += `-${item.id}`;
    }
    return itemName;
};

const makeVariables = async (dir: string, arr: any[]) => {
    for (const v of arr) {
        await makeValues(
            path.join(dir, sanitize(v.name)),
            v
        );
    }
};

const makeValues = async (dir: string, variable: Variable) => {
    await makeDir(dir);
    await makeFile(path.join(dir, 'Description.txt'), variable.description ?? '');

    const vals = valMap.get(variable.id) ?? [];
    for (const val of vals) {
        await makeFile(
            path.join(dir, 'Values', `${sanitize(val.name)}.md`),
            val.rules ?? ''
        );
    }
}

const session = await client.post('GetSession', {}).then(ses => ses.data.session);
const gameModeration = session.gameModeratorList.find(gm => gm.gameId === GAME_ID);

if (!gameModeration) throw new Error('This account does not moderate this game.');
if (gameModeration.level === -1) throw new Error('This account is a verifier. The account must be a Moderator or Super Moderator of the game.');

const smod = gameModeration.level === 1;
const init = !(await directoryExists('Rules'));

const { categories, game, levels, values, variables } = await getGameData(GAME_ID);

//Easiest way to deal with item renames/deletion - start on a clean directory
if (!init) await remove('Rules');

//Game rules
await makeFile(path.join('Rules', 'Game Rules.md'), game.rules ?? '');

//Organize variables and values
const valMap: Map<string, Value[]> = new Map();

for (const val of values) {
    if (!valMap.has(val.variableId)) {
        valMap.set(val.variableId, []);
    }
    valMap.get(val.variableId).push(val);
}

// Categories
for (const cat of categories) {
    const catName = makeIdExtensions(categories, cat);
    const catDir = path.join('Rules', 'Categories', catName);
    await makeFile(
        path.join(catDir, `${catName}.md`),
        cat.rules
    );

    await makeVariables(
        path.join(catDir, 'Variables'),
        variables.filter(v => v.categoryId === cat.id && !v.levelId)
    );
}

// Levels
for (const lvl of levels) {
    const lvlName = makeIdExtensions(levels, lvl);
    const lvlDir = path.join('Rules', 'Levels', lvlName);
    await makeFile(
        path.join(lvlDir, `${lvlName}.md`),
        lvl.rules ?? ''
    );

    await makeVariables(
        path.join(lvlDir, 'Variables'),
        variables.filter(v => v.levelId === lvl.id && !v.categoryId)
    );
}

// Global Variables
await makeVariables(
    path.join('Rules', 'Global Variables'),
    variables.filter(v => !v.categoryId && !v.levelId)
);

// Mapped Variables
const mappedVars = variables.filter(v => v.categoryId && v.levelId);
for (const variable of mappedVars) {
    const category = categories.find(c => c.id === variable.categoryId);
    const level = levels.find(l => l.id === variable.levelId);

    const levelName = makeIdExtensions(levels, level);
    const categoryName = makeIdExtensions(categories, category);
    const variableName = makeIdExtensions(mappedVars, variable);

    const mappingDir = path.join(
        'Rules',
        'Mapped Variables',
        levelName,
        categoryName,
        variableName
    );
    await makeValues(mappingDir, variable);
}

//Commit
try {
    tryDiff();
    console.log('No changes found');
} catch {
    console.log('Changes found, pushing changes...');

    let message: string;
    if (init) {
        message = 'Initial rule creation';
    } else {
        message = 'Rules updated from speedrun.com';
        if (smod) {
            const { data: auditLog } = await client.post('GetAuditLogList', {
                gameId: GAME_ID,
                page: 1
            });

            const latestChange = auditLog.auditLogList.find(entry =>
                updatedEvents.includes(entry.eventType)
            );

            if (latestChange) message += ` by ${auditLog.userList.find(user => user.id === latestChange.actorId).name}`;
        }
    }

    //push(message);

    console.log('Changes pushed');
}