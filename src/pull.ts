import Client, { Value, Variable } from 'speedruncom.js';
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const client = new Client({
    userAgent: 'gameRulesRepo',
    PHPSESSID: process.env.PHPSESSID
});

async function writeMarkdownFile(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
}

function sanitize(name: string) {
    return name.replace(/[\/\\?%*:|"<>]/g, '-');
}

const session = await client.GetSession({}).then(ses => ses.session);
const gameModeration = session.gameModeratorList.find(gm => gm.gameId === process.env.GAME_ID);
if (gameModeration) {
    if (gameModeration.level === -1) {
        throw new Error('This account is a verifier. The account must be a Moderator or Super Moderator of the game.')
    }
} else {
    throw new Error('This account does not moderate this game.')
}

const smod = gameModeration.level === 1;
let init: boolean;

const stats = await fs.stat('../Rules')
    .catch(() => init = true)
    .then(() => init = false);


const makeVariables = async (dir: string, arr: any[]) => {
    for (const v of arr) {
        await makeValues(
            path.join(dir, sanitize(v.name)),
            v
        )
    }
}

const makeValues = async (dir: string, v: Variable) => {
    await fs.mkdir(dir, { recursive: true });
    await writeMarkdownFile(path.join(dir, 'Description.txt'), v.description ?? '');

    const vals = valMap.get(v.id) ?? [];
    for (const val of vals) {
        await writeMarkdownFile(
            path.join(dir, 'Values', `${sanitize(val.name)}.md`),
            val.rules ?? ''
        );
    }
}

let { game, categories, levels, variables, values } = await Client.GetGameData({
    gameId: process.env.GAME_ID
});

//Remove archives
categories = categories.filter(cat => !cat.archived);
levels = levels.filter(lvl => !lvl.archived);
variables = variables.filter(v => !v.archived);
values = values.filter(val => !val.archived);

//Game rules
await writeMarkdownFile(path.join('Rules', 'GameRules.md'), game.rules ?? '');

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
    const catDir = path.join('Rules', 'Categories', sanitize(cat.name));
    await writeMarkdownFile(path.join(catDir, `${sanitize(cat.name)}.md`), cat.rules);

    await makeVariables(
        path.join('Rules', 'Categories', sanitize(cat.name), 'Variables'),
        variables.filter(v => v.categoryId === cat.id && !v.levelId)
    );
}

// Levels
for (const lvl of levels) {
    const lvlDir = path.join('Rules', 'Levels', sanitize(lvl.name));
    await writeMarkdownFile(
        path.join(lvlDir, `${sanitize(lvl.name)}.md`),
        lvl.rules ?? ''
    );

    await makeVariables(
        path.join(lvlDir, 'Variables'),
        variables.filter(v => v.levelId === lvl.id && !v.categoryId)
    );
}

// Global Variables
await makeVariables(
    path.join('Rules', 'GlobalVariables'),
    variables.filter(v => !v.categoryId && !v.levelId)
);

// Mapped Variables
const mappedVars = variables.filter(v => v.categoryId && v.levelId);
for (const v of mappedVars) {
    const cat = categories.find(c => c.id === v.categoryId);
    const lvl = levels.find(l => l.id === v.levelId);

    const vals = valMap.get(v.id) ?? [];

    const mappingDir = path.join(
        'Rules',
        'MappedVariables',
        sanitize(lvl.name),
        sanitize(cat.name),
        sanitize(v.name)
    );
    await makeValues(mappingDir, v);
}

try {
    execSync('git diff --quiet');
    console.log('No changes found');
} catch {
    console.log('Changes found, pushing changes...');
    let message: string;
    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    execSync('git add -A');

    if (init) {
        message = 'Initial rule creation';
    } else {
        message = 'Rules updated from speedrun.com';
        if (smod) {
            const auditLog = await client.GetAuditLogList({
                gameId: process.env.GAME_ID,
                page: 1
            });

            const updatedEvents = [
                'category-created',
                'category-archived',
                'category-restored',
                'category-updated',
                'game-updated',
                'level-created',
                'level-archived',
                'level-updated',
                'value-created',
                'value-updated',
                'variable-archived',
                'variable-created',
                'variable-updated'
            ];

            const latestChange = auditLog.auditLogList.find(entry =>
                updatedEvents.includes(entry.eventType)
            );

            message += ` by ${auditLog.userList.find(user => user.id === latestChange.actorId).name}`;
        }
    }
    execSync(`git commit -m "${message}"`);
    execSync('git push');
    console.log('Changes pushed');
}