const { randomUUID } = require('node:crypto');
const { services, requireSession, issueSession, participantId, HttpError, send, failure, body } = require('../server/platform.cjs');
const { sendRecap } = require('../server/emails.cjs');

module.exports = async function handler(req, res) {
  try {
    const { db } = services();
    const { validId, publicGame, isGameOpen } = await import('../shared/game-config.mjs');
    const id = req.query.id;
    if (!validId(id)) throw new HttpError(400, 'Jeu invalide.');
    const game = (await db.ref(`studio/games/${id}`).get()).val();
    if (!game || game.status === 'draft') throw new HttpError(404, 'Ce jeu n’est pas disponible.');
    const action = req.query.action || 'config';
    if (req.method === 'GET' && action === 'config') return send(res, 200, { game: { ...publicGame(game), id }, open: isGameOpen(game) });
    if (req.method === 'GET' && action === 'leaderboard') {
      const data = (await db.ref(`studio/leaderboards/${id}`).get()).val() || {};
      const players = Object.values(data).sort((a, b) => b.highScore - a.highScore).slice(0, 10).map(p => ({ displayName: p.displayName, highScore: p.highScore }));
      return send(res, 200, { players });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Action non prise en charge.');
    const input = body(req);
    if (action === 'register') {
      if (!isGameOpen(game)) throw new HttpError(409, 'Cette campagne n’accepte plus de participations.');
      const email = String(input.email || '').trim().toLowerCase();
      const firstName = String(input.firstName || '').trim().slice(0, 80);
      const lastName = String(input.lastName || '').trim().slice(0, 80);
      const phone = String(input.phone || '').trim().slice(0, 40);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !firstName || !lastName || !phone || input.consentGame !== true) throw new HttpError(400, 'Remplis tous les champs et accepte le règlement.');
      const pid = participantId(id, email);
      const participantRef = db.ref(`studio/participants/${id}/${pid}`);
      const result = await participantRef.transaction(previous => previous || {
        firstName, lastName, email, phone, gamesPlayed: 0, highScore: 0,
        consentGame: true, consentMarketing: input.consentMarketing === true,
        consentTimestamp: Date.now(), createdAt: Date.now(),
        termsUrl: game.termsUrl, privacyUrl: game.privacyUrl
      });
      const player = result.snapshot.val();
      return send(res, 200, { token: issueSession(id, pid), gamesPlayed: player.gamesPlayed, highScore: player.highScore });
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
      await db.ref(`studio/leaderboards/${id}/${session.id}`).transaction(previous => ({ displayName: p.firstName + ' ' + p.lastName.charAt(0).toUpperCase() + '.', highScore: Math.max(previous?.highScore || 0, p.highScore) }));
      if (p.gamesPlayed >= game.maxGames) await sendRecap(db, game, id, session.id, p);
      return send(res, 200, { highScore: p.highScore, gamesPlayed: p.gamesPlayed });
    }
    throw new HttpError(405, 'Action non prise en charge.');
  } catch (error) { failure(res, error); }
};
