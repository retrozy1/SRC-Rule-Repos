import Client, { Value, Variable, Category } from 'speedruncom.js';
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const gameId = process.env.GAME_ID;

const sanitize = (name: string) => {
    return name.replace(/[\/\\?%*:|"<>]/g, '-');
}

const filterByPath = (subpath: string) => {
    return changedFiles.filter(dir => dir.split('/')[1] === subpath && dir.split('/').length - 1 === 3);
}

const readMarkdown = async (dir: string) => {
    return await fs.readFile(dir, 'utf-8');
}

const findItemByName = <T extends { name: string }>(items: T[], name: string): T | undefined => {
    return items.find(item => sanitize(item.name) === name);
}

const findItemById = <T extends { id: string }>(items: T[], id: string): T | undefined => {
    return items.find(item => sanitize(item.id) === id);
}

const client = new Client({
    userAgent: 'gameRulesRepo',
    PHPSESSID: process.env.PHPSESSID
});

let { categories, levels, variables, values } = await Client.GetGameData({
    gameId
});

//Remove archives
categories = categories.filter(cat => !cat.archived);
levels = levels.filter(lvl => !lvl.archived);
variables = variables.filter(v => !v.archived);
values = values.filter(val => !val.archived);

//Gets an array of strings of modified file dirs from last commit
const changedFiles = execSync('git diff --name-status HEAD~1 HEAD', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(line => line.startsWith('M\t'))
    .map(line => line.split('\t')[1]);

//Game rules
if (changedFiles.includes('Rules/GameRules.md')) {
    const gameSettings = await client.GetGameSettings({
        gameId
    });

    gameSettings.settings.rules = await readMarkdown(path.join('Rules', 'GameRules.md'));

    await client.PutGameSettings({
        gameId,
        settings: gameSettings.settings
    });
}

//Categories
for (const rulePath of filterByPath('Categories')) {
    const category = categories.find(cat => sanitize(cat.name) === rulePath.split('/')[2]);

    category.rules = await readMarkdown(rulePath);

    await client.PutCategoryUpdate({
        gameId,
        categoryId: category.id,
        category
    });
}

//Levels
for (const rulePath of filterByPath('Levels')) {
    const level = levels.find(lvl => sanitize(lvl.name) === rulePath.split('/')[2]);

    level.rules = await readMarkdown(rulePath);

    await client.PutLevelUpdate({
        gameId,
        levelId: level.id,
        level
    });
}

//Variables

const updatedVars = new Map<string, { newDescription?: string, newValues?: { valueId: string, newRules: string }[] }>();
const updatedVariablePaths = changedFiles.filter(file => file.endsWith('.txt') || file.split('/').length > 4);

for (const rulePath of updatedVariablePaths) {
    const variableName = rulePath.split('/')[rulePath.split('/').length - (rulePath.endsWith('.txt') ? 2 : 3)];
    let availableVariables: Variable[];

    const directSubpath = rulePath.split('/')[2];

    if (directSubpath === 'Categories') {
        const categoryName = rulePath.split('/')[3];
        let category = findItemByName(categories, categoryName)
        if (!category) category = findItemById(categories, categoryName.slice(-8));
        availableVariables = variables.filter(v => v.categoryId === category.id && !v.levelId);

    } else if (directSubpath === 'Levels') {
        const levelName = rulePath.split('/')[3];
        let level = findItemByName(levels, levelName);
        if (!level) level = findItemById(levels, levelName.slice(-8));
        availableVariables = variables.filter(v => v.levelId === level.id && !v.categoryId);

    } else if (directSubpath === 'GlobalVariables') {
        availableVariables = variables.filter(v => !v.categoryId && !v.levelId);

    } else if (directSubpath === 'MappedVariables') {
        const levelName = rulePath.split('/')[3];
        const categoryName = rulePath.split('/')[4];
        let level = findItemByName(levels, levelName);
        if (!level) level = findItemById(levels, levelName.slice(-8));
        let category = findItemByName(categories, categoryName);
        if (!category) category = findItemById(categories, categoryName.slice(-8));
        availableVariables = variables.filter(v => v.levelId === level.id && v.categoryId === category.id);
    }

    let variable = findItemByName(availableVariables, variableName);
    if (!variable) variable = findItemById(availableVariables, variableName.slice(-8));
    
    if (!updatedVars.has(variable.id)) {
        updatedVars.set(variable.id, { newValues: [] });
    }
    const varElement = updatedVars.get(variable.id)

    if (rulePath.endsWith('.txt')) {
        varElement.newDescription = await readMarkdown(rulePath);
    } else {
        const valueName = rulePath.split('/')[rulePath.split('/').length - 1].slice(0, -3);
        const availableValues = values.filter(val => val.variableId === variable.id)
        let value = findItemByName(availableValues, valueName);
        if (!value) value = findItemById(availableValues, valueName.slice(-8));
        
        varElement.newValues.push({ valueId: value.id, newRules: await readMarkdown(rulePath) });
    }
}

updatedVars.forEach(async (value, key) => {
    const variable = variables.find(v => v.id === key);
    if (value.newDescription) variable.description = value.newDescription;

    const variableValues: Value[] = [];
    for (const val of value.newValues) {
        const v = values.find(v => v.id === val.valueId);
        v.rules = val.newRules;
        variableValues.push(v);
    }

    client.PutVariableUpdate({
        gameId,
        variableId: key,
        variable,
        values: variableValues
    });
});