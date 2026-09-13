const { randomUUID } = require('node:crypto');
const { services, requireSession, issueSession, participantId, HttpError, send, failure, body } = require('../server/platform.cjs');
const { sendRecap } = require('../server/emails.cjs');

module.exports = async function handler(req, res) {
  try {
    const { db } = services();
    const { validId, publicGame, isGameOpen, migrateGame, normalizeGame } = await import('../shared/game-config.mjs');
    const { validateRegistration, formatName } = await import('../shared/flappy-config.mjs');
    const id = req.query.id;
    if (!validId(id)) throw new HttpError(400, 'Jeu invalide.');
    const stored = (await db.ref(`studio/games/${id}`).get()).val();
    if (!stored || stored.status === 'draft') throw new HttpError(404, 'Ce jeu n’est pas disponible.');
    let game;
    try { game = { ...migrateGame(stored), ...normalizeGame(migrateGame(stored)) }; }
    catch (error) { console.error('Invalid stored game', id, error.message); throw new HttpError(500, 'Ce jeu est momentanément indisponible.'); }
    const action = req.query.action || 'config';
    if (req.method === 'GET' && action === 'config') return send(res, 200, { game: { ...publicGame(game), id }, open: isGameOpen(game) });
    if (req.method === 'GET' && action === 'leaderboard') {
      const { places, nameFormat, showOwnRank } = game.flappy.leaderboard;
      const data = (await db.ref(`studio/leaderboards/${id}`).get()).val() || {};
      const entries = Object.entries(data)
        .map(([pid, p]) => ({ pid, displayName: (p.firstName || p.lastName) ? formatName(p.firstName, p.lastName, nameFormat) : String(p.displayName || ''), highScore: Number(p.highScore) || 0 }))
        .sort((a, b) => b.highScore - a.highScore);
      const players = entries.slice(0, places).map(({ displayName, highScore }) => ({ displayName, highScore }));
      let me;
      if (showOwnRank && req.headers.authorization) {
        try { const session = requireSession(req, id); const rank = entries.findIndex(e => e.pid === session.id); if (rank >= 0) me = { rank: rank + 1, total: entries.length }; } catch {}
      }
      return send(res, 200, { players, ...(me ? { me } : {}) });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Action non prise en charge.');
    const input = body(req);
    if (action === 'register') {
      if (!isGameOpen(game)) throw new HttpError(409, 'Cette campagne n’accepte plus de participations.');
      let player;
      try { player = validateRegistration(game.flappy.form, input); } catch (error) { throw new HttpError(400, error.message); }
      if (input.consentGame !== true) throw new HttpError(400, 'Accepte le règlement du jeu pour participer.');
      const pid = participantId(id, player.email);
      const participantRef = db.ref(`studio/participants/${id}/${pid}`);
      const result = await participantRef.transaction(previous => previous || {
        ...player, gamesPlayed: 0, highScore: 0,
        consentGame: true, consentMarketing: input.consentMarketing === true,
        consentTimestamp: Date.now(), createdAt: Date.now(),
        termsUrl: game.termsUrl, privacyUrl: game.privacyUrl
      });
      const p = result.snapshot.val();
      return send(res, 200, { token: issueSession(id, pid), gamesPlayed: p.gamesPlayed, highScore: p.highScore });
    }
    const session = requireSession(req, id);
    const participantRef = db.ref(`studio/participants/${id}/${session.id}`);
    if (action === 'start') {
      if (!isGameOpen(game)) throw new HttpError(409, 'Cette campagne n’accepte plus de participations.');
      if (!validId(input.requestId)) throw new HttpError(400, 'Demande de partie invalide.');
      const runId = randomUUID();
      const result = await participantRef.transaction(player => {
        if (!player) return;
        if (player.startRequestId === input.requestId) return player;
        if (player.gamesPlayed >= game.maxGames) return;
        return { ...player, gamesPlayed: player.gamesPlayed + 1, startRequestId: input.requestId, runId, runStartedAt: Date.now(), lastPlayedAt: Date.now() };
      });
      if (!result.committed) throw new HttpError(409, 'Tu as utilisé toutes tes parties.');
      const p = result.snapshot.val();
      return send(res, 200, { runId: p.runId, gamesPlayed: p.gamesPlayed, highScore: p.highScore });
    }
    if (action === 'finish') {
      const score = Number(input.score);
      if (!Number.isInteger(score) || score < 0 || score > 10000 || !validId(input.runId)) throw new HttpError(400, 'Score invalide.');
      const result = await participantRef.transaction(player => {
        if (!player || player.runId !== input.runId) return;
        if (player.finishedRunId === input.runId) return player;
        return { ...player, highScore: Math.max(player.highScore || 0, score), finishedRunId: input.runId, lastPlayedAt: Date.now() };
      });
      if (!result.committed) throw new HttpError(409, 'Cette partie n’est plus active.');
      const p = result.snapshot.val();
      await db.ref(`studio/leaderboards/${id}/${session.id}`).transaction(previous => ({ firstName: p.firstName, lastName: p.lastName || '', highScore: Math.max(previous?.highScore || 0, p.highScore) }));
      if (p.gamesPlayed >= game.maxGames) await sendRecap(db, game, id, session.id, p);
      return send(res, 200, { highScore: p.highScore, gamesPlayed: p.gamesPlayed });
    }
    throw new HttpError(405, 'Action non prise en charge.');
  } catch (error) { failure(res, error); }
};
