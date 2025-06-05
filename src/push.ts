import Client, { Value } from 'speedruncom.js';
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const sanitize = (name: string) => {
    return name.replace(/[\/\\?%*:|"<>]/g, '-');
}

const filterByPath = (subpath: string) => {
    return changedFiles.filter(dir => dir.split('/')[1] === subpath && dir.split('/').length - 1 === 3);
}

const readMarkdown = async (dir: string) => {
    return await fs.readFile(dir, 'utf-8');
}

const client = new Client({
    userAgent: 'gameRulesRepo',
    PHPSESSID: process.env.PHPSESSID
});

const { categories, levels, variables, values } = await Client.GetGameData({
    gameId: process.env.GAME_ID
});

//Gets an array of strings of modified file dirs from last commit
const changedFiles = execSync('git diff --name-status HEAD~1 HEAD', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(line => line.startsWith('M\t'))
    .map(line => line.split('\t')[1]);

//Game rules
if (changedFiles.includes('Rules/GameRules.md')) {
    const gameSettings = await client.GetGameSettings({
        gameId: process.env.GAME_ID
    });

    gameSettings.settings.rules = await readMarkdown(path.join('Rules', 'GameRules.md'));

    await client.PutGameSettings({
        gameId: process.env.GAME_ID,
        settings: gameSettings.settings
    });
}

//Categories
for (const rulePath of filterByPath('Categories')) {
    const category = categories.find(cat => sanitize(cat.name) === rulePath.split('/')[2]);

    category.rules = await readMarkdown(rulePath);

    await client.PutCategoryUpdate({
        gameId: process.env.GAME_ID,
        categoryId: category.id,
        category
    });
}

//Levels
for (const rulePath of filterByPath('Levels')) {
    const level = levels.find(lvl => sanitize(lvl.name) === rulePath.split('/')[2]);

    level.rules = await readMarkdown(rulePath);

    await client.PutLevelUpdate({
        gameId: process.env.GAME_ID,
        levelId: level.id,
        level
    });
}

//Variables

const updatedVars = new Map<string, { newDescription?: string, newValues?: { valueId: string, newRules: string }[] }>();
const updatedVariablePaths = changedFiles.filter(file => file.endsWith('.txt') || file.split('/').length > 4);
const updatedValuePaths = updatedVariablePaths.filter(dir => dir.endsWith('.md'));

for (const rulePath of updatedValuePaths) {
    const valueName = rulePath.split('/')[rulePath.split('/').length - 1].split('.')[0];
    const value = values.find(val => sanitize(val.name) === valueName);
    
    if (!updatedVars.has(value.variableId)) {
        updatedVars.set(value.variableId, {});
    }
    const varElement = updatedVars.get(value.variableId)
    varElement.newValues.push({ valueId: value.id, newRules: await readMarkdown(rulePath) });

    const descriptionPath = path.join(...rulePath.split('/').slice(0, -1));
    if (!varElement.newDescription && updatedVariablePaths.includes(descriptionPath)) {
        varElement.newDescription = await readMarkdown(descriptionPath);
    }
}

updatedVars.forEach(async (value, key) => {
    const variable = variables.find(v => v.id === key);
    if (value.newDescription) variable.description = value.newDescription;

    let values: Value[];
    for (const val of value.newValues) {
        const v = values.find(v => v.id === v.id)
        v.rules = val.newRules;
        values.push(v);
    }

    await client.PutVariableUpdate({
        gameId: process.env.GAME_ID,
        variableId: key,
        variable,
        values
    });
})