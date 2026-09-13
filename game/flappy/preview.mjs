import { DEFAULT_GAME, normalizeGame } from '../../shared/game-config.mjs';

const NAMES = ['Camille T.', 'Noah B.', 'Léa M.', 'Yanis K.', 'Inès R.', 'Lucas D.', 'Emma P.', 'Adam S.', 'Chloé V.', 'Nour H.', 'Tom L.', 'Zoé F.'];

export function createPreview() {
  let current = normalizeGame({ ...DEFAULT_GAME, name: 'Aperçu du jeu', company: 'Votre marque' });
  let gamesPlayed = 0, highScore = 0;
  const backend = {
    unlimited: true,
    async register() { return { gamesPlayed, highScore }; },
    async start() { gamesPlayed++; return { gamesPlayed, highScore }; },
    async finish(score) { highScore = Math.max(highScore, Number(score) || 0); return { gamesPlayed, highScore }; },
    async leaderboard() {
      const places = current.flappy.leaderboard.places;
      const players = Array.from({ length: places }, (_, i) => ({ displayName: NAMES[i % NAMES.length], highScore: Math.max(1, 64 - i * 3) }));
      return { players, me: { rank: 4, total: 27 } };
    }
  };
  function connect(game) {
    document.getElementById('previewBanner').hidden = false;
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'flappy:config') {
        try { current = normalizeGame({ ...event.data.game, status: 'draft' }); game.update(current); }
        catch (error) { console.warn('Aperçu : configuration ignorée —', error.message); }
      }
      if (event.data.type === 'flappy:goto') game.goto(String(event.data.screen));
    });
    const target = window.opener || (window.parent !== window ? window.parent : null);
    target?.postMessage({ type: 'flappy:ready' }, location.origin);
  }
  return { campaign: current, backend, connect };
}
