import 'dotenv/config';
import Client from 'speedruncom.js';

export const GAME_ID = process.env.GAME_ID;

const client = new Client();
client.axiosClient.defaults.headers.common['Cookie'] = `PHPSESSID=${process.env.PHPSESSID}`;

export const getGameData = async (game_id: string) => {
    let { data } = await client.get('GetGameData', { gameId: GAME_ID });

    data.categories = data.categories.filter(cat => !cat.archived);
    data.levels = data.levels.filter(lvl => !lvl.archived);
    data.variables = data.variables.filter(v => !v.archived);
    data.values = data.values.filter(val => !val.archived);

    return data;
}

export default client;