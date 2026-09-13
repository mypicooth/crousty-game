const { randomUUID } = require('node:crypto');
const { services, requireAdmin, HttpError, send, failure, body } = require('../server/platform.cjs');

module.exports = async function handler(req, res) {
  try {
    const { db, auth } = services();
    const user = await requireAdmin(req, auth);
    const { normalizeGame, migrateGame, validId } = await import('../shared/game-config.mjs');
    const shape = (game, id) => { try { return { ...migrateGame(game), ...normalizeGame(migrateGame(game)), id }; } catch { return { ...migrateGame(game), id }; } };
    const action = req.query.action || 'games';
    const id = req.query.id;
    if (id && !validId(id)) throw new HttpError(400, 'Identifiant de jeu invalide.');
    if (req.method === 'GET' && action === 'games') {
      const data = (await db.ref('studio/games').get()).val() || {};
      const games = Object.entries(data).map(([id, game]) => shape(game, id));
      games.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return send(res, 200, { games, email: user.email, emailReady: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM), gameOrigin: process.env.PUBLIC_GAME_ORIGIN || 'https://crousty-game.vercel.app' });
    }
    if (req.method === 'GET' && action === 'participants' && id) {
      const path = id === 'crousty_2026' ? 'campaigns/crousty_2026/players_private' : `studio/participants/${id}`;
      const players = (await db.ref(path).get()).val() || {};
      const legacyScores = id === 'crousty_2026' ? (await db.ref('campaigns/crousty_2026/leaderboard').get()).val() || {} : {};
      // Explicit projection keeps session/run/internal fields out of admin responses.
      const participants = Object.entries(players).map(([id, p]) => ({ id, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, extra: p.extra || {}, gamesPlayed: p.gamesPlayed || 0, highScore: p.highScore ?? legacyScores[id]?.highScore ?? 0, consentMarketing: !!p.consentMarketing, consentGame: !!p.consentGame, consentTimestamp: p.consentTimestamp || p.createdAt, createdAt: p.createdAt }));
      participants.sort((a, b) => b.createdAt - a.createdAt);
      return send(res, 200, { participants });
    }
    if (req.method === 'POST' && action === 'save') {
      const input = body(req);
      let config;
      try { config = normalizeGame(input); } catch (e) { const error = new HttpError(400, e.message); error.path = e.path || ''; throw error; }
      if (config.status === 'published' && config.emailsEnabled && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)) throw new HttpError(400, 'L’envoi d’emails doit être raccordé avant de publier avec cette option.');
      const gameId = id || 'g_' + randomUUID().replaceAll('-', '');
      const gameRef = db.ref(`studio/games/${gameId}`);
      const existing = (await gameRef.get()).val();
      if (id && !existing) throw new HttpError(404, 'Jeu introuvable.');
      const game = { ...config, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), updatedBy: user.uid };
      await gameRef.set(game);
      return send(res, 200, { game: shape(game, gameId) });
    }
    if (req.method === 'POST' && action === 'duplicate' && id) {
      const existing = (await db.ref(`studio/games/${id}`).get()).val();
      if (!existing) throw new HttpError(404, 'Jeu introuvable.');
      const gameId = 'g_' + randomUUID().replaceAll('-', '');
      const game = { ...existing, name: existing.name + ' — copie', status: 'draft', createdAt: Date.now(), updatedAt: Date.now(), updatedBy: user.uid };
      await db.ref(`studio/games/${gameId}`).set(game);
      return send(res, 200, { game: shape(game, gameId) });
    }
    if (req.method === 'DELETE' && action === 'participant' && id) {
      if (id === 'crousty_2026') throw new HttpError(400, 'La suppression du jeu historique se gère dans Firebase.');
      const participant = req.query.participant;
      if (!validId(participant)) throw new HttpError(400, 'Participant invalide.');
      await db.ref().update({ [`studio/participants/${id}/${participant}`]: null, [`studio/leaderboards/${id}/${participant}`]: null, [`studio/emails/${id}/${participant}`]: null });
      return send(res, 200, { deleted: true });
    }
    throw new HttpError(405, 'Action non prise en charge.');
  } catch (error) { failure(res, error); }
};
