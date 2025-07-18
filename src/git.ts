import { execSync } from 'child_process';

export const push = (message: string) => {
    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    execSync('git add -A');
    execSync(`git commit -m "${message}"`);
    execSync('git push');
}

export const checkChanges = () => {
    const changes = execSync('git status --porcelain').toString().trim();
    if (changes.length) return true;
}

export const tryChanges = () => {
    execSync('git diff --quiet');
}

export const getChangedFiles = () => {
    return execSync('git diff --name-status HEAD~1 HEAD', { encoding: 'utf-8' })
        .trim()
        .split('\n')
        .filter(line => line.startsWith('M\t'))
        .map(line => line.split('\t')[1]);
}