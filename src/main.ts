import { PLANETS, SYSTEMS } from './data/galaxy';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const game = new Game(canvas, uiRoot);
// Exposed for debugging from the console.
Object.assign(window, { game, PLANETS, SYSTEMS });
game.start();
