import { EventType, Variable } from 'speedruncom.js';
import client, { getGameData } from './speedrun.js';
import config from '../config.js';
import { writeMarkdownFile, directoryExists, makeDirectory, remove } from './files.js';
import { checkChanges, push } from './git.js';
import { sanitize } from './utils.js';
import { ValueMap, GameTypeFolderNames } from './types.js';
import path from 'path';

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

const makeIdExtensions = <T extends { name: string, id: string }>(items: T[], item: T): string => {
    let itemName = sanitize(item.name);
    if (items.filter(i => sanitize(i.name) === itemName).length > 1) {
        itemName += `-${item.id}`;
    }
    return itemName;
};

const makeVariables = async (valueMap: ValueMap, dir: string, arr: any[]) => {
    for (const v of arr) {
        await makeValues(
            valueMap,
            path.join(dir, sanitize(v.name)),
            v
        );
    }
};

const makeValues = async (map: ValueMap, dir: string, variable: Variable) => {
    await makeDirectory(dir);
    await writeMarkdownFile(path.join(dir, 'Description.txt'), variable.description ?? '');

    const vals = map.get(variable.id) ?? [];
    for (const val of vals) {
        await writeMarkdownFile(
            path.join(dir, 'Values', `${sanitize(val.name)}.md`),
            val.rules ?? ''
        );
    }
}

const session = await client.post('GetSession', {}).then(ses => ses.data.session);
let init: boolean;
let wasChanged: boolean;
const siteRuleChangers: Set<string> = new Set();

const makeGameRuleFiles = async (game_id: string, dirName: string) => {
    const gameModeration = session.gameModeratorList.find(gm => gm.gameId === game_id);

    if (!gameModeration) throw new Error('This account does not moderate this game.');
    if (gameModeration.level === -1) throw new Error('This account is a verifier. The account must be a Moderator or Super Moderator of the game.');

    const smod = gameModeration.level === 1;
    init = !(await directoryExists(dirName));

    const { categories, game, levels, values, variables } = await getGameData(game_id);

    //Easiest way to deal with item renames/deletion - start on a clean directory
    if (!init) await remove(dirName);

    //Game rules
    await writeMarkdownFile(path.join(dirName, 'Game Rules.md'), game.rules ?? '');

    //Organize variables and values
    const valMap: ValueMap = new Map();

    for (const val of values) {
        if (!valMap.has(val.variableId)) {
            valMap.set(val.variableId, []);
        }
        valMap.get(val.variableId).push(val);
    }

    // Categories
    for (const cat of categories) {
        const catName = makeIdExtensions(categories, cat);
        const catDir = path.join(dirName, 'Categories', catName);
        await writeMarkdownFile(
            path.join(catDir, `${catName}.md`),
            cat.rules
        );

        await makeVariables(
            valMap,
            path.join(catDir, 'Variables'),
            variables.filter(v => v.categoryId === cat.id && !v.levelId)
        );
    }

    // Levels
    for (const lvl of levels) {
        const lvlName = makeIdExtensions(levels, lvl);
        const lvlDir = path.join(dirName, 'Levels', lvlName);
        await writeMarkdownFile(
            path.join(lvlDir, `${lvlName}.md`),
            lvl.rules ?? ''
        );

        await makeVariables(
            valMap,
            path.join(lvlDir, 'Variables'),
            variables.filter(v => v.levelId === lvl.id && !v.categoryId)
        );
    }

    // Global Variables
    await makeVariables(
        valMap,
        path.join(dirName, 'Global Variables'),
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
            dirName,
            'Mapped Variables',
            levelName,
            categoryName,
            variableName
        );
        await makeValues(valMap, mappingDir, variable);
    }

    wasChanged ??= checkChanges();
    if (wasChanged && smod) {
        const { data: auditLog } = await client.post('GetAuditLogList', {
            gameId: game_id,
            page: 1
        });

        const latestChange = auditLog.auditLogList.find(entry =>
            updatedEvents.includes(entry.eventType)
        );

        siteRuleChangers.add(auditLog.userList.find(user => user.id === latestChange.actorId).name)
    }
}

if (typeof config.id === 'string') {
    await makeGameRuleFiles(config.id, 'Rules');
} else {
    for (const [key, value] of Object.entries(config.id)) {
        await makeGameRuleFiles(value, GameTypeFolderNames[key]);
    }
}

//Commit and push
if (wasChanged) {
    console.log('Changes found, pushing changes...');

    let message: string;
    if (init) {
        message = 'Initial rule creation';
    } else {
        message = 'Rules updated from speedrun.com';
        if (siteRuleChangers.size) message += ` by ${[...siteRuleChangers].join(', ')}`;
    }

    push(message);

    console.log('Changes pushed');
} else {
    console.log('No changes found');
}