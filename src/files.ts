import { promises as fs } from 'fs';
import path from 'path';

//Pulling

export const makeDirectory = async (dir: string) => {
    await fs.mkdir(path.dirname(dir), { recursive: true });
};

export const writeMarkdownFile = async (filePath: string, content: string) => {
    await makeDirectory(filePath);
    await fs.writeFile(filePath, content);
};

export const directoryExists = async (path: string) => {
    try {
        const stat = await fs.stat(path);
        return stat.isDirectory();
    } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
    }
}

export const remove = async (dir: string) => {
    await fs.rm(dir, { recursive: true });
}

//Pushing

export const readMarkdown = async (dir: string) => {
    return await fs.readFile(dir, 'utf-8');
}