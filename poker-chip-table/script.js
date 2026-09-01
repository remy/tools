import { load } from './state.js';
import { initSetup } from './setup.js';
import { initGame } from './game.js';

const setupScreen = document.getElementById('screen-setup');
const gameScreen = document.getElementById('screen-game');

const hasGame = load();

initSetup(showGame);
initGame(showSetup);

if (hasGame) showGame();
else showSetup();

function showGame() {
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  document.body.classList.add('playing');
}

function showSetup() {
  gameScreen.hidden = true;
  setupScreen.hidden = false;
  document.body.classList.remove('playing');
}
