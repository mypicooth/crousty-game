import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAPPY_DEFAULTS, normalizeFlappy, migrateLegacyGame, renderText, formatName, stageBackground, validateRegistration, DEFAULT_BACKGROUNDS } from '../shared/flappy-config.mjs';
import { getPath, setPath } from '../shared/validate.mjs';

test('defaults normalize to themselves and reproduce the current gameplay', () => {
  const f = normalizeFlappy();
  assert.deepEqual(f, normalizeFlappy(FLAPPY_DEFAULTS));
  assert.deepEqual(f.stages.map(s => [s.minScore, s.speed, s.gravity]), [[0, 5, 0.65], [20, 7, 0.75], [40, 10, 0.9], [60, 15, 1.2]]);
  assert.equal(f.physics.jumpForce, 12.6); assert.equal(f.physics.gap, 31); assert.equal(f.physics.spawnEvery, 100);
  assert.equal(f.form.fields.email.required, true); assert.equal(f.leaderboard.places, 10);
});

test('presets override physics; custom keeps user values', () => {
  const easy = normalizeFlappy({ physics: { preset: 'easy', gap: 20, jumpForce: 6 }, stages: [{ minScore: 0, speed: 20, gravity: 1.5 }] });
  assert.equal(easy.physics.gap, 36); assert.equal(easy.physics.jumpForce, 12.6); assert.equal(easy.stages[0].speed, 4); assert.equal(easy.stages[0].gravity, 0.65);
  const hard = normalizeFlappy({ physics: { preset: 'hard' } });
  assert.deepEqual(hard.stages.map(s => s.speed), [6, 8.4, 12, 18]); assert.equal(hard.physics.gap, 28);
  const custom = normalizeFlappy({ physics: { preset: 'custom', gap: 20, jumpForce: 6, spawnEvery: 40 }, stages: [{ minScore: 0, speed: 20, gravity: 1.5 }] });
  assert.equal(custom.physics.gap, 20); assert.equal(custom.stages[0].speed, 20); assert.equal(custom.stages.length, 1);
});

test('bounds, colors, urls and stage ordering are enforced with paths', () => {
  assert.throws(() => normalizeFlappy({ character: { size: 200 } }), e => e.path === 'character.size');
  assert.throws(() => normalizeFlappy({ physics: { preset: 'custom', gap: 50 } }), e => e.path === 'physics.gap');
  assert.throws(() => normalizeFlappy({ leaderboard: { places: 2 } }), e => e.path === 'leaderboard.places');
  assert.throws(() => normalizeFlappy({ stages: [{ minScore: 5 }] }), e => e.path === 'stages.0.minScore');
  assert.throws(() => normalizeFlappy({ stages: [{ minScore: 0 }, { minScore: 20 }, { minScore: 10 }] }), e => e.path === 'stages.2.minScore');
  assert.throws(() => normalizeFlappy({ stages: [{}, {}, {}, {}, {}] }), e => e.path === 'stages');
  assert.throws(() => normalizeFlappy({ character: { imageUrl: 'http://insecure.example/x.png' } }), e => e.path === 'character.imageUrl');
  assert.equal(normalizeFlappy({ theme: { panelBg: 'red' } }).theme.panelBg, '#ffffff');
  assert.equal(normalizeFlappy({ theme: { panelBg: '#ABCDEF' } }).theme.panelBg, '#abcdef');
  assert.equal(normalizeFlappy({ theme: { font: 'comic' } }).theme.font, 'system');
});

test('texts fall back to defaults when empty, except title and CTA', () => {
  const f = normalizeFlappy({ screens: { welcome: { title: '', subtitle: '' }, ranking: { ctaLabel: 'Notre site', ctaUrl: 'https://example.com/' } } });
  assert.equal(f.screens.welcome.title, ''); assert.equal(f.screens.welcome.subtitle, 'Fais le meilleur score !');
  assert.equal(f.screens.ranking.ctaUrl, 'https://example.com/');
  assert.throws(() => normalizeFlappy({ screens: { ranking: { ctaLabel: 'Site' } } }), e => e.path === 'screens.ranking.ctaUrl');
  assert.equal(normalizeFlappy({ screens: { ranking: { ctaUrl: 'https://example.com/' } } }).screens.ranking.ctaUrl, '');
});

test('form fields: email locked, hidden fields not required, custom fields validated', () => {
  const f = normalizeFlappy({ form: { fields: { email: { visible: false, required: false }, phone: { visible: false, required: true, label: 'Mobile' } }, customFields: [{ label: 'Magasin', type: 'select', options: 'Paris\nLyon\n\nParis' }, { id: 'ok_1', label: 'Newsletter', type: 'checkbox', required: true }] } });
  assert.deepEqual(f.form.fields.email, { visible: true, required: true, label: 'E-mail' });
  assert.deepEqual(f.form.fields.phone, { visible: false, required: false, label: 'Mobile' });
  assert.deepEqual(f.form.customFields[0], { id: 'magasin', label: 'Magasin', type: 'select', required: false, options: ['Paris', 'Lyon'] });
  assert.equal(f.form.customFields[1].id, 'ok_1');
  assert.throws(() => normalizeFlappy({ form: { customFields: [{ label: 'Email' }] } }), e => e.path === 'form.customFields.0.id');
  assert.throws(() => normalizeFlappy({ form: { customFields: [{ label: 'A' }, { label: 'a' }] } }), e => e.path === 'form.customFields.1.id');
  assert.throws(() => normalizeFlappy({ form: { customFields: [{ label: 'Liste', type: 'select', options: [] }] } }), e => e.path === 'form.customFields.0.options');
  assert.throws(() => normalizeFlappy({ form: { customFields: Array.from({ length: 6 }, (_, i) => ({ label: 'F' + i })) } }), e => e.path === 'form.customFields');
  assert.throws(() => normalizeFlappy({ form: { customFields: [{ label: '' }] } }), e => e.path === 'form.customFields.0.label');
});

test('obstacles image style needs at least one image', () => {
  assert.equal(normalizeFlappy({ obstacles: { style: 'image' } }).obstacles.style, 'gradient');
  const one = normalizeFlappy({ obstacles: { style: 'image', topUrl: 'https://a.example/top.png' } }).obstacles;
  assert.equal(one.style, 'image'); assert.equal(one.bottomUrl, '');
});

test('legacy flat games migrate to the sectioned model', () => {
  const legacy = { name: 'Envol', company: 'Crousty', status: 'published', birdUrl: 'https://a.example/bird.png', backgroundUrl: 'https://a.example/bg.jpg', pipeUrl: 'https://a.example/pipe.png', difficulty: 'hard', accent: '#123456', logoUrl: 'https://a.example/logo.png', subtitle: 'Vole !', maxGames: 2 };
  const migrated = migrateLegacyGame(legacy);
  assert.equal(migrated.birdUrl, undefined); assert.equal(migrated.maxGames, 2);
  const f = normalizeFlappy(migrated.flappy);
  assert.equal(f.character.imageUrl, 'https://a.example/bird.png');
  assert.equal(f.stages[0].backgroundUrl, 'https://a.example/bg.jpg'); assert.equal(f.stages.length, 4);
  assert.deepEqual([f.obstacles.style, f.obstacles.topUrl, f.obstacles.bottomUrl], ['image', 'https://a.example/pipe.png', 'https://a.example/pipe.png']);
  assert.equal(f.physics.preset, 'hard'); assert.equal(f.brand.accent, '#123456'); assert.equal(f.brand.logoUrl, 'https://a.example/logo.png');
  assert.equal(f.screens.welcome.subtitle, 'Vole !');
  assert.equal(f.theme.buttonBg, '#123456'); assert.equal(f.theme.buttonText, '#111111');
  const already = { name: 'x', flappy: { brand: { accent: '#000000' } } };
  assert.equal(migrateLegacyGame(already), already);
});

test('renderText, formatName, stageBackground, getPath/setPath', () => {
  assert.equal(renderText('{{jeu}} · {{score}} pts {{inconnu}}', { jeu: 'Envol', score: 3 }), 'Envol · 3 pts {{inconnu}}');
  assert.equal(formatName('camille', 'test', 'firstInitial'), 'camille T.');
  assert.equal(formatName('Camille', 'Test', 'first'), 'Camille');
  assert.equal(formatName('Camille', 'Test', 'full'), 'Camille Test');
  assert.equal(formatName('Camille', '', 'firstInitial'), 'Camille');
  assert.equal(formatName('', 'Dupont', 'firstInitial'), 'D.');
  assert.equal(formatName('', 'Dupont', 'full'), 'Dupont');
  assert.equal(formatName('', '', 'first'), 'Joueur');
  const stages = normalizeFlappy().stages;
  assert.deepEqual(stages.map((_, i) => stageBackground(stages, i)), DEFAULT_BACKGROUNDS);
  const custom = normalizeFlappy({ stages: [{ minScore: 0, backgroundUrl: 'https://a.example/1.jpg' }, { minScore: 10 }, { minScore: 20, backgroundUrl: 'https://a.example/3.jpg' }] }).stages;
  assert.deepEqual(custom.map((_, i) => stageBackground(custom, i)), ['https://a.example/1.jpg', 'https://a.example/1.jpg', 'https://a.example/3.jpg']);
  const obj = {}; setPath(obj, 'a.b.c', 1); assert.deepEqual(obj, { a: { b: { c: 1 } } }); assert.equal(getPath(obj, 'a.b.c'), 1); assert.equal(getPath(obj, 'a.x.c'), undefined);
});

test('validateRegistration follows the form definition', () => {
  const form = normalizeFlappy({ form: { fields: { phone: { visible: false }, lastName: { required: false } }, customFields: [{ label: 'Magasin', type: 'select', options: ['Paris', 'Lyon'], required: true }, { label: 'Newsletter', type: 'checkbox' }, { label: 'Commentaire' }] } }).form;
  const player = validateRegistration(form, { firstName: ' Camille ', email: 'Camille@Example.com', phone: '0000', extra: { magasin: 'Lyon', newsletter: true, commentaire: ' ok ' } });
  assert.deepEqual(player, { firstName: 'Camille', lastName: '', email: 'camille@example.com', phone: '', extra: { magasin: 'Lyon', newsletter: true, commentaire: 'ok' } });
  assert.throws(() => validateRegistration(form, { firstName: 'C', email: 'c@example.com', extra: { magasin: '' } }), /Magasin/);
  assert.throws(() => validateRegistration(form, { firstName: 'C', email: 'c@example.com', extra: { magasin: 'Nice' } }), /Magasin/);
  assert.throws(() => validateRegistration(form, { firstName: 'C', email: 'c@example.com', extra: { magasin: 'Paris', autre: 1 } }), /inconnu/);
  assert.throws(() => validateRegistration(form, { email: 'c@example.com', extra: { magasin: 'Paris' } }), /Prénom/);
  assert.throws(() => validateRegistration(form, { firstName: 'C', email: 'nope', extra: { magasin: 'Paris' } }), /email/);
  const unchecked = validateRegistration(form, { firstName: 'C', email: 'c@example.com', extra: { magasin: 'Paris' } });
  assert.equal(unchecked.extra.newsletter, false); assert.equal(unchecked.extra.commentaire, '');
});
