import { createFlappyGame } from './game/flappy/screens.mjs';

const params = new URLSearchParams(location.search);
let campaign, backend, preview = null;
if (params.get('game')) {
  ({ campaign, backend } = await (await import('./managed-game.mjs')).loadManagedGame(params.get('game')));
} else if (params.get('preview') === '1') {
  preview = (await import('./game/flappy/preview.mjs')).createPreview();
  ({ campaign, backend } = preview);
} else {
  document.body.classList.add('legacy-game');
  ({ campaign, backend } = (await import('./legacy-crousty.mjs')).loadLegacyGame());
}
const game = createFlappyGame({ campaign, backend });
preview?.connect(game);
