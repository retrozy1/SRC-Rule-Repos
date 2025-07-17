import { Value, Variable } from 'speedruncom.js';
import client, { getGameData } from './speedrun.js';
import { getChangedFiles } from './git.js';
import { readMarkdown } from './files.js';
import { sanitize } from './utils.js';
import path from 'path';
import config from '../config.js';

const GAME_ID = config.id

const filterByPath = (subpath: string) => {
    return changedFiles.filter(dir => dir.split('/')[1] === subpath && dir.split('/').length - 1 === 3);
}

const findItemByName = <T extends { name: string }>(items: T[], name: string): T | undefined => {
    return items.find(item => sanitize(item.name) === name);
}

const findItemById = <T extends { id: string }>(items: T[], id: string): T | undefined => {
    return items.find(item => sanitize(item.id) === id);
}

//Gets an array of strings of modified file dirs from last commit
const changedFiles = getChangedFiles();

const { categories, levels, variables, values } = await getGameData(GAME_ID)

//Game rules
if (changedFiles.includes('Rules/GameRules.md')) {
    const { data: gameSettings } = await client.post('GetGameSettings', {
        gameId: GAME_ID
    });

    gameSettings.settings.rules = await readMarkdown(path.join('Rules', 'GameRules.md'));

    client.post('PutGameSettings', {
        gameId: GAME_ID,
        settings: gameSettings.settings
    });
}

//Categories
for (const rulePath of filterByPath('Categories')) {
    const category = categories.find(cat => sanitize(cat.name) === rulePath.split('/')[2]);

    category.rules = await readMarkdown(rulePath);

    client.post('PutCategoryUpdate', {
        gameId: GAME_ID,
        categoryId: category.id,
        category
    });
}

//Levels
for (const rulePath of filterByPath('Levels')) {
    const level = levels.find(lvl => sanitize(lvl.name) === rulePath.split('/')[2]);

    level.rules = await readMarkdown(rulePath);

    client.post('PutLevelUpdate', {
        gameId: GAME_ID,
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

    const directSubpath = rulePath.split('/')[1];

    if (directSubpath === 'Categories') {
        const categoryName = rulePath.split('/')[2];
        let category = findItemByName(categories, categoryName)
        if (!category) category = findItemById(categories, categoryName.slice(-8));
        availableVariables = variables.filter(v => v.categoryId === category.id && !v.levelId);

    } else if (directSubpath === 'Levels') {
        const levelName = rulePath.split('/')[2];
        let level = findItemByName(levels, levelName);
        if (!level) level = findItemById(levels, levelName.slice(-8));
        availableVariables = variables.filter(v => v.levelId === level.id && !v.categoryId);

    } else if (directSubpath === 'GlobalVariables') {
        availableVariables = variables.filter(v => !v.categoryId && !v.levelId);

    } else if (directSubpath === 'MappedVariables') {
        const levelName = rulePath.split('/')[2];
        const categoryName = rulePath.split('/')[3];
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

    client.post('PutVariableUpdate', {
        gameId: GAME_ID,
        variableId: key,
        variable,
        values: variableValues
    });
});