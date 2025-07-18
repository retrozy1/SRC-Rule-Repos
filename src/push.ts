import { Value, Variable } from 'speedruncom.js';
import client, { getGameData } from './speedrun.js';
import { getChangedFiles } from './git.js';
import { readMarkdown } from './files.js';
import { sanitize } from './utils.js';
import { GameTypeFolderNames } from './types.js';
import config from '../config.js';
import path from 'path';

const filterByPath = (changedFiles: string[], subpath: string) => {
    return changedFiles.filter(dir => dir.split('/')[0] === subpath && dir.split('/').length === 3);
};

const findItemByName = <T extends { name: string }>(items: T[], name: string): T | undefined => {
    return items.find(item => sanitize(item.name) === name);
};

const findItemById = <T extends { id: string }>(items: T[], id: string): T | undefined => {
    return items.find(item => sanitize(item.id) === id);
};

const allChangedFiles = getChangedFiles();
const updatedGames = new Set(allChangedFiles.map(file => file.split('/')[0]));

for (const gameName of updatedGames) {
    const key = Object.entries(GameTypeFolderNames).find(([_, val]) => val === gameName)?.[0];
    const gameId = typeof config.id === 'string' ? config.id : config.id[key];

    const changedFiles = allChangedFiles
        .filter(file => file.startsWith(gameName))
        .map(file => file.split('/').slice(1).join('/'));

    const { categories, levels, variables, values } = await getGameData(gameId);

    //Game rules
    if (changedFiles.includes('Game Rules.md')) {
        const { data: gameSettings } = await client.post('GetGameSettings', {
            gameId
        });

        gameSettings.settings.rules = await readMarkdown(path.join(gameName, 'Game Rules.md'));

        client.post('PutGameSettings', {
            gameId,
            settings: gameSettings.settings
        });
    }

    //Categories
    for (const rulePath of filterByPath(changedFiles, 'Categories')) {
        const category = categories.find(cat => sanitize(cat.name) === rulePath.split('/')[1]);

        category.rules = await readMarkdown(path.join(gameName, rulePath));

        client.post('PutCategoryUpdate', {
            gameId,
            categoryId: category.id,
            category
        });
    }

    //Levels
    for (const rulePath of filterByPath(changedFiles, 'Levels')) {
        const level = levels.find(lvl => sanitize(lvl.name) === rulePath.split('/')[1]);

        level.rules = await readMarkdown(path.join(gameName, rulePath));

        client.post('PutLevelUpdate', {
            gameId,
            levelId: level.id,
            level
        });
    }

    //Variables

    const updatedVars = new Map<string, { newDescription?: string, newValues?: { valueId: string, newRules: string }[] }>();
    const updatedVariablePaths = changedFiles.filter(file => file.endsWith('.txt') || file.split('/').length > 4);

    for (const rulePath of updatedVariablePaths) {
        const variableName = rulePath.split('/')[rulePath.split('/').length - (rulePath.endsWith('.txt') ? 1 : 2)];
        let availableVariables: Variable[];

        const directSubpath = rulePath.split('/')[0];

        if (directSubpath === 'Categories') {
            const categoryName = rulePath.split('/')[1];
            let category = findItemByName(categories, categoryName);
            if (!category) category = findItemById(categories, categoryName.slice(-8));
            availableVariables = variables.filter(v => v.categoryId === category.id && !v.levelId);

        } else if (directSubpath === 'Levels') {
            const levelName = rulePath.split('/')[1];
            let level = findItemByName(levels, levelName);
            if (!level) level = findItemById(levels, levelName.slice(-8));
            availableVariables = variables.filter(v => v.levelId === level.id && !v.categoryId);

        } else if (directSubpath === 'Global Variables') {
            availableVariables = variables.filter(v => !v.categoryId && !v.levelId);

        } else if (directSubpath === 'Mapped Variables') {
            const levelName = rulePath.split('/')[1];
            const categoryName = rulePath.split('/')[2];
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
        const varElement = updatedVars.get(variable.id);

        if (rulePath.endsWith('.txt')) {
            varElement.newDescription = await readMarkdown(path.join(gameName, rulePath));
        } else {
            const valueName = rulePath.split('/')[rulePath.split('/').length - 1].slice(0, -3);
            const availableValues = values.filter(val => val.variableId === variable.id);
            let value = findItemByName(availableValues, valueName);
            if (!value) value = findItemById(availableValues, valueName.slice(-8));
            
            varElement.newValues.push({ valueId: value.id, newRules: await readMarkdown(path.join(gameName, rulePath)) });
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
            gameId,
            variableId: key,
            variable,
            values: variableValues
        });
    });
}