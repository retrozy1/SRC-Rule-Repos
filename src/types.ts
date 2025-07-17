
type AtLeastTwo<T, Keys extends keyof T = keyof T> =
    Pick<T, Exclude<keyof T, Keys>> &
    (
        { [K1 in Keys]: {
            [K2 in Exclude<Keys, K1>]:
                Required<Pick<T, K1 | K2>> & Partial<Pick<T, Exclude<Keys, K1 | K2>>>;
        }[Exclude<Keys, K1>] }[Keys]
    );

interface GameTypes {
    romHackGameId: string;
    moddedGameId: string;
    fanGameId: string;
    preReleaseId: string;
    dlcId: string;
    mainGameId: string;
    miniGameId: string;
    customServerId: string;
    categoryExtensionsId: string;
}

export type Config = {
    id: string// | AtLeastTwo<GameTypes>;
}