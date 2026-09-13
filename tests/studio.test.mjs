import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizeGame, DEFAULT_GAME, publicGame, isGameOpen, participantCsv, migrateGame } from '../shared/game-config.mjs';
const require = createRequire(import.meta.url);
const platform = require('../server/platform.cjs');
process.env.STUDIO_SESSION_SECRET = 'test-only-secret-that-is-at-least-32-characters';
process.env.STUDIO_ADMIN_EMAILS = 'contact@mypicbooth.com';

const snapshot = value => ({ val: () => structuredClone(value ?? null) });
function memoryDatabase() {
  const data = {};
  function read(path) { return path.split('/').filter(Boolean).reduce((node, part) => node?.[part], data); }
  function write(path, value) {
    const parts = path.split('/').filter(Boolean); const key = parts.pop();
    let node = data; for (const part of parts) node = node[part] ||= {};
    if (value === null) delete node[key]; else node[key] = structuredClone(value);
  }
  return {
    data,
    ref(path = '') { return {
      async get() { return snapshot(read(path)); },
      async set(value) { write(path, value); },
      async update(values) { for (const [key, value] of Object.entries(values)) write([path, key].filter(Boolean).join('/'), value); },
      async transaction(fn) {
        const next = fn(structuredClone(read(path) ?? null));
        if (next === undefined) return { committed: false, snapshot: snapshot(read(path)) };
        write(path, next); return { committed: true, snapshot: snapshot(next) };
      }
    }; }
  };
}
let db;
const realServices = platform.services;
platform.services = () => ({ db, auth: { async verifyIdToken(token) {
  if (!['admin', 'outsider', 'unverified'].includes(token)) throw new Error('invalid token');
  return { uid: token, email_verified: token !== 'unverified', email: token === 'outsider' ? 'outsider@example.com' : 'contact@mypicbooth.com' };
} }, bucket: { file() { throw new Error('Invalid files must never reach storage'); } } });
const admin = require('../api/admin.js');
const game = require('../api/game.js');
const assets = require('../api/assets.js');
async function call(handler, { method = 'GET', query = {}, body, token } = {}) {
  let status = 200; let result;
  await handler({ method, query, body, headers: { authorization: token ? 'Bearer ' + token : '' } }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { result = value; } });
  return { status, ...result };
}
const published = { ...DEFAULT_GAME, name: 'Test', company: 'Marque', status: 'published', maxGames: 2, countdownSeconds: 1, termsUrl: 'https://example.com/terms.pdf', privacyUrl: 'https://example.com/privacy.pdf' };

test('configuration validation, publication gates and safe CSV exports', () => {
  assert.throws(() => normalizeGame({ maxGames: 0 }));
  assert.throws(() => normalizeGame({ maxGames: 11 }));
  assert.throws(() => normalizeGame({ status: 'published' }));
  assert.throws(() => normalizeGame({ birdUrl: 'javascript:alert(1)' }));
  assert.throws(() => normalizeGame({ startsAt: '2026-12-02', endsAt: '2026-12-01' }));
  assert.equal(normalizeGame(published).maxGames, 2);
  assert.equal(isGameOpen({ ...published, startsAt: '2099-01-01' }), false);
  assert.equal(publicGame({ ...published, updatedBy: 'secret-uid' }).updatedBy, undefined);
  assert.equal(publicGame(published).emailBody, undefined);
  const csv = participantCsv([{ firstName: '=HYPERLINK("evil")', email: 'a@example.com', consentMarketing: false }]);
  assert.ok(csv.includes("'=")); assert.ok(csv.includes('"Non"'));
});

test('campaign normalization delegates the flappy block to the game type and migrates flat games', () => {
  const game = normalizeGame({ ...published, flappy: { physics: { preset: 'custom', gap: 40 }, form: { customFields: [{ label: 'Magasin', type: 'select', options: ['Paris'] }] } } });
  assert.equal(game.type, 'flappy'); assert.equal(game.flappy.physics.gap, 40); assert.equal(game.flappy.form.customFields[0].id, 'magasin');
  assert.equal(game.subtitle, undefined);
  const legacy = normalizeGame({ ...published, birdUrl: 'https://a.example/bird.png', difficulty: 'easy', accent: '#112233' });
  assert.equal(legacy.birdUrl, undefined); assert.equal(legacy.flappy.character.imageUrl, 'https://a.example/bird.png'); assert.equal(legacy.flappy.physics.preset, 'easy'); assert.equal(legacy.flappy.brand.accent, '#112233');
  assert.throws(() => normalizeGame({ ...published, type: 'tetris' }), /Type de jeu inconnu/);
  assert.throws(() => normalizeGame({ ...published, flappy: { leaderboard: { places: 1 } } }), e => e.path === 'flappy.leaderboard.places');
  assert.equal(migrateGame({ name: 'x', pipeUrl: 'https://a.example/p.png' }).flappy.obstacles.topUrl, 'https://a.example/p.png');
  const csv = participantCsv([{ firstName: 'Camille', email: 'a@example.com', extra: { magasin: 'Paris', news: true } }], game);
  assert.match(csv.split('\r\n')[0], /"Téléphone";"Magasin";"Parties"/);
  assert.match(csv.split('\r\n')[1], /"Paris"/);
  const withCheckbox = normalizeGame({ ...published, flappy: { form: { customFields: [{ label: 'News', type: 'checkbox' }] } } });
  assert.match(participantCsv([{ extra: { news: true } }], withCheckbox), /"Oui"/);
  assert.match(participantCsv([{ extra: {} }], withCheckbox), /"Non"/);
});

test('studio is closed until server activation', () => {
  const previous = process.env.STUDIO_ENABLED; process.env.STUDIO_ENABLED = 'false';
  assert.throws(realServices, error => error.status === 503);
  if (previous === undefined) delete process.env.STUDIO_ENABLED; else process.env.STUDIO_ENABLED = previous;
});

test('admin endpoints reject anonymous, unauthorized and unverified users', async () => {
  db = memoryDatabase();
  for (const [token, expected] of [[undefined, 401], ['outsider', 403], ['unverified', 403]]) {
    assert.equal((await call(admin, { token, query: { action: 'participants', id: 'crousty_2026' } })).status, expected);
    assert.equal((await call(admin, { token, method: 'POST', query: { action: 'save' }, body: published })).status, expected);
  }
  assert.deepEqual(db.data, {});
});

test('create, publish, duplicate and delete participant through authorized API', async () => {
  db = memoryDatabase();
  const result = await call(admin, { token: 'admin', method: 'POST', query: { action: 'save' }, body: published });
  assert.equal(result.status, 200); const id = result.game.id;
  const duplicate = await call(admin, { token: 'admin', method: 'POST', query: { action: 'duplicate', id } });
  assert.equal(duplicate.game.status, 'draft'); assert.notEqual(duplicate.game.id, id);
  await db.ref(`studio/participants/${id}/test`).set({ firstName: 'Camille', email: 'test@example.com', runId: 'private-run', highScore: 9 });
  const list = await call(admin, { token: 'admin', query: { action: 'participants', id } });
  assert.equal(list.participants[0].email, 'test@example.com'); assert.equal(list.participants[0].runId, undefined);
  assert.equal((await call(admin, { token: 'admin', method: 'DELETE', query: { action: 'participant', id, participant: 'test' } })).status, 200);
  assert.equal((await db.ref(`studio/participants/${id}/test`).get()).val(), null);
});

test('two attempts survive re-registration; starts and finishes are idempotent', async () => {
  db = memoryDatabase(); await db.ref('studio/games/testgame').set(published);
  const player = { firstName: 'Camille', lastName: 'Test', email: 'Camille@example.com', phone: '0000', consentGame: true, consentMarketing: false };
  const registration = await call(game, { method: 'POST', query: { id: 'testgame', action: 'register' }, body: player });
  assert.equal(registration.status, 200); const token = registration.token;
  for (let round = 1; round <= 2; round++) {
    const options = { token, method: 'POST', query: { id: 'testgame', action: 'start' }, body: { requestId: 'request_' + round } };
    const [first, duplicate] = await Promise.all([call(game, options), call(game, options)]);
    assert.equal(first.gamesPlayed, round); assert.equal(first.runId, duplicate.runId);
    const finish = { token, method: 'POST', query: { id: 'testgame', action: 'finish' }, body: { runId: first.runId, score: round === 1 ? 8 : 3 } };
    assert.equal((await call(game, finish)).highScore, 8);
    finish.body.score = 99;
    assert.equal((await call(game, finish)).highScore, 8);
  }
  const repeated = await call(game, { method: 'POST', query: { id: 'testgame', action: 'register' }, body: { ...player, email: 'camille@EXAMPLE.com' } });
  assert.equal(repeated.gamesPlayed, 2);
  assert.equal((await call(game, { token: repeated.token, method: 'POST', query: { id: 'testgame', action: 'start' }, body: { requestId: 'third' } })).status, 409);
  const board = await call(game, { query: { id: 'testgame', action: 'leaderboard' } });
  assert.deepEqual(board.players, [{ displayName: 'Camille T.', highScore: 8 }]);
  assert.equal(JSON.stringify(board).includes('email'), false);
  await db.ref('studio/games/other').set(published);
  assert.equal((await call(game, { token, method: 'POST', query: { id: 'other', action: 'start' }, body: { requestId: 'cross_game' } })).status, 401);
});

test('invalid uploads and tampered session tokens are rejected', async () => {
  db = memoryDatabase();
  assert.equal((await call(assets, { token: 'admin', method: 'POST', body: { type: 'image/png', data: Buffer.from('<script>bad</script>').toString('base64') } })).status, 400);
  const token = platform.issueSession('testgame', 'a'.repeat(32));
  assert.throws(() => platform.requireSession({ headers: { authorization: 'Bearer ' + token.slice(0, -4) + 'fake' } }, 'testgame'), error => error.status === 401);
});

test('historical Crousty participants retain scores stored only in the leaderboard', async () => {
  db = memoryDatabase();
  await db.ref('campaigns/crousty_2026/players_private/legacy').set({ firstName: 'Camille', gamesPlayed: 3 });
  await db.ref('campaigns/crousty_2026/leaderboard/legacy').set({ displayName: 'Camille T.', highScore: 17 });
  const result = await call(admin, { token: 'admin', query: { action: 'participants', id: 'crousty_2026' } });
  assert.equal(result.participants[0].highScore, 17);
});

test('recap email retries preserve content and do not resend an acknowledged email', async () => {
  db = memoryDatabase();
  const { sendRecap } = require('../server/emails.cjs');
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY, previousFrom = process.env.RESEND_FROM;
  process.env.RESEND_API_KEY = 'test-only'; process.env.RESEND_FROM = 'Studio <test@example.invalid>';
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails'); requests.push(options);
    return { ok: requests.length > 1, json: async () => ({ id: 'test-delivery' }) };
  };
  try {
    const config = { ...published, emailsEnabled: true };
    const player = { email: 'test@example.invalid', firstName: 'Camille', highScore: 8 };
    await sendRecap(db, config, 'testgame', 'participant', player);
    assert.equal((await db.ref('studio/emails/testgame/participant').get()).val().error, 'delivery_failed');
    await sendRecap(db, { ...config, emailSubject: 'New subject after failure' }, 'testgame', 'participant', player);
    await sendRecap(db, config, 'testgame', 'participant', player);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body, requests[1].body);
    assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
    assert.deepEqual(JSON.parse(requests[0].body).to, ['test@example.invalid']);
    assert.match(JSON.parse(requests[0].body).text, /8 points/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM; else process.env.RESEND_FROM = previousFrom;
  }
});
