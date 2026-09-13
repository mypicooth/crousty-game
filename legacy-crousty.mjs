import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, get, update } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { normalizeFlappy } from './shared/flappy-config.mjs';

const firebaseConfig = {
  apiKey: "AIzaSyAGu61hEih85vRpKUN0zXOrVmOFXR-WQls",
  authDomain: "crousty-game-b9c17.firebaseapp.com",
  databaseURL: "https://crousty-game-b9c17-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "crousty-game-b9c17",
  storageBucket: "crousty-game-b9c17.firebasestorage.app",
  messagingSenderId: "1032243559819",
  appId: "1:1032243559819:web:2d547412cee8932087038e",
  measurementId: "G-J4FZF4MPDE"
};
const CAMPAIGN_ID = 'crousty_2026';

async function withTimeout(operation) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Connexion trop lente')), 12000); })]); }
  finally { clearTimeout(timer); }
}
const fail = () => { throw new Error('Connexion impossible. Réessaie dans un instant.'); };

export function loadLegacyGame() {
  const db = getDatabase(initializeApp(firebaseConfig));
  const path = `campaigns/${CAMPAIGN_ID}`;
  let playerId = '', gamesPlayed = 0, bestScore = 0;
  const campaign = {
    id: CAMPAIGN_ID, type: 'flappy', name: 'CROUSTY GAME', company: 'Crousty', maxGames: 3, countdownSeconds: 3, termsUrl: '', privacyUrl: '',
    marketingLabel: "J'accepte de recevoir les offres et actualités de Crousty.",
    flappy: normalizeFlappy({ character: { rotateOnJump: false, hitboxScale: 100 }, screens: { welcome: { title: 'CROUSTY GAME' }, ranking: { title: '🏆 TOP 10 CROUSTY' } }, leaderboard: { showOwnRank: false } })
  };
  return { campaign, backend: {
    async register(player) {
      playerId = crypto.randomUUID(); gamesPlayed = 0; bestScore = 0;
      const timestamp = Date.now();
      try {
        await withTimeout(update(ref(db), {
          [`${path}/players_private/${playerId}`]: { firstName: player.firstName, lastName: player.lastName, email: player.email, phone: player.phone, consentMarketing: player.consentMarketing, consentGame: true, consentTimestamp: timestamp, createdAt: timestamp, gamesPlayed: 0, highScore: 0 },
          [`${path}/leaderboard/${playerId}`]: { displayName: player.firstName + ' ' + player.lastName.charAt(0).toUpperCase() + '.', highScore: 0 }
        }));
      } catch { playerId = ''; fail(); }
      return { gamesPlayed: 0, highScore: 0 };
    },
    async start() {
      try { await withTimeout(update(ref(db, `${path}/players_private/${playerId}`), { gamesPlayed: gamesPlayed + 1 })); } catch { fail(); }
      gamesPlayed++; return { gamesPlayed, highScore: bestScore };
    },
    async finish(score) {
      bestScore = Math.max(bestScore, Number(score));
      try {
        await withTimeout(update(ref(db), {
          [`${path}/leaderboard/${playerId}/highScore`]: bestScore, [`${path}/players_private/${playerId}/highScore`]: bestScore,
          [`${path}/players_private/${playerId}/gamesPlayed`]: gamesPlayed, [`${path}/players_private/${playerId}/lastPlayedAt`]: Date.now()
        }));
      } catch { fail(); }
      return { highScore: bestScore, gamesPlayed };
    },
    async leaderboard() {
      let data;
      try { data = (await withTimeout(get(ref(db, `${path}/leaderboard`)))).val() || {}; } catch { fail(); }
      const players = Object.values(data)
        .filter(p => p && typeof p.displayName === 'string' && Number.isFinite(Number(p.highScore)))
        .sort((a, b) => Number(b.highScore) - Number(a.highScore)).slice(0, 10)
        .map(p => ({ displayName: p.displayName, highScore: Number(p.highScore) }));
      return { players };
    }
  } };
}
