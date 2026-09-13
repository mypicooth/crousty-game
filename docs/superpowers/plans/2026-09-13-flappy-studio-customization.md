# Section JEUX & personnalisation complète Flappy Bird — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une section JEUX → Flappy Bird à l'admin et rendre chaque campagne Flappy Bird entièrement personnalisable (écrans, formulaire avec champs libres, personnage, décors par palier, obstacles, gameplay, classement), avec un aperçu = vrai jeu en iframe piloté en direct.

**Architecture:** Config structurée `game.flappy` (sections) normalisée par `shared/flappy-config.mjs` et enregistrée dans un registre de types (`shared/game-types.mjs`). Le jeu est découpé en `theme` (rendu), `engine` (physique) et `screens` (états) derrière une interface backend unique implémentée par le jeu géré (`/api/game`), le jeu historique Crousty (Firebase direct) et le mode aperçu (`postMessage`). L'admin lie ses champs par chemins pointés (`name="flappy.theme.font"`).

**Tech Stack:** Vanilla ES modules (navigateur), Node ≥ 22 (`node --test`), Vercel functions CommonJS, Firebase Admin SDK, Playwright (tests navigateur facultatifs).

**Spec:** `docs/superpowers/specs/2026-09-13-flappy-studio-customization-design.md`

## Global Constraints

- Node ≥ 22 ; aucune nouvelle dépendance npm.
- Tous les textes visibles (jeu et admin) en français ; messages d'erreur en français.
- Les valeurs par défaut de `FLAPPY_DEFAULTS` reproduisent exactement le gameplay et le rendu actuels (vitesse 5/7/10/15, gravité 0.65/0.75/0.9/1.2, saut 12.6, gap 31, spawn 100, seuils 20/40/60).
- Le jeu historique Crousty (`/` sans paramètre) doit rester fonctionnel et visuellement identique : `tests/browser.cjs` doit passer sans changement de comportement.
- URLs d'assets : HTTPS uniquement. Uploads : PNG/JPG/WebP/PDF ≤ 3 Mo (inchangé).
- Le mode aperçu n'écrit jamais dans Firebase ni n'appelle `/api/game`.
- Ids DOM du formulaire joueur conservés : `#firstName #lastName #email #phone #consentGame #consentMarketing #gameConsentText #marketingText #loginBtn #replayBtn #countdown #countdownValue #rankingScreen #rankingTitle #bestScore #rankingStatus #rankingRetry`, classes `.bird .background .message .message2 .score .score_title .score_val .ranking .pipe_sprite`.
- Le score de fin de partie est lu depuis `.score_val` (le DOM est la source de vérité : les tests navigateur injectent un score en modifiant ce nœud).
- Commits fréquents, message court en anglais, terminé par `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Commandes : `npm test` (node:test), `npm run build`, `npm run dev` (http://127.0.0.1:3000), `node tests/browser.cjs`, `node tests/studio-browser.cjs` (Playwright : `PLAYWRIGHT_MODULE` et `CHROME_PATH` facultatifs ; si Playwright est absent, le signaler dans le rapport de tâche sans bloquer).

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `shared/validate.mjs` (nouveau) | Validateurs partagés : `ConfigError`, `text`, `assetUrl`, `color`, `number`, `oneOf`, `getPath`, `setPath`. |
| `shared/flappy-config.mjs` (nouveau) | `FLAPPY_DEFAULTS`, `PRESETS`, `FONTS`, `DEFAULT_BACKGROUNDS`, `normalizeFlappy`, `migrateLegacyGame`, `renderText`, `formatName`, `stageBackground`, `validateRegistration`. |
| `shared/game-types.mjs` (nouveau) | Registre `GAME_TYPES` + `gameType(id)`. |
| `shared/game-config.mjs` | Campagne : `DEFAULT_GAME`, `normalizeGame` (délègue au type), `migrateGame`, `publicGame`, `isGameOpen`, `participantCsv(players, game)`. |
| `api/game.js` | API publique : config migrée, inscription validée par le formulaire, classement paramétré. |
| `api/admin.js` | API admin : migration à la lecture, `extra` des participants. |
| `game/flappy/theme.mjs` (nouveau) | Rendu de la config dans le DOM (CSS vars, textes, images, formulaire). |
| `game/flappy/engine.mjs` (nouveau) | Physique paramétrée, testable sans DOM via un adaptateur `world`. |
| `game/flappy/screens.mjs` (nouveau) | Machine d'états du jeu, indépendante du backend. |
| `game/flappy/preview.mjs` (nouveau) | Backend simulé + liaison `postMessage`. |
| `legacy-crousty.mjs` (nouveau) | Backend Firebase direct du jeu historique. |
| `managed-game.mjs` | Backend `/api/game` (sans DOM). |
| `main.js` | Point d'entrée : choisit le backend. |
| `index.html`, `style.css` | Structure des écrans + CSS vars `--fb-*`. |
| `admin/index.html`, `admin/studio.js`, `admin/studio.css` | Navigation JEUX, éditeur en sections, aperçu iframe. |
| `scripts/build.cjs`, `scripts/dev.cjs` | Servent `game/` et `legacy-crousty.mjs`. |
| `tests/flappy-config.test.mjs`, `tests/engine.test.mjs` (nouveaux), `tests/studio.test.mjs`, `tests/studio-browser.cjs`, `tests/browser.cjs` | Tests. |

---

### Task 1 : Validateurs partagés et configuration Flappy

**Files:**
- Create: `shared/validate.mjs`
- Create: `shared/flappy-config.mjs`
- Test: `tests/flappy-config.test.mjs`

**Interfaces:**
- Produces (`shared/validate.mjs`): `class ConfigError extends Error { path }`, `text(value, max=200)`, `assetUrl(value, path)`, `color(value, fallback)`, `number(value, {min,max,integer,fallback,path,label})`, `oneOf(value, options, fallback)`, `getPath(obj, 'a.b.c')`, `setPath(obj, 'a.b.c', value)`.
- Produces (`shared/flappy-config.mjs`): `FLAPPY_DEFAULTS`, `PRESETS`, `FONTS`, `DEFAULT_BACKGROUNDS`, `FIXED_FIELDS`, `slug(label)`, `normalizeFlappy(input) → flappy`, `migrateLegacyGame(game) → game`, `renderText(template, vars) → string`, `formatName(firstName, lastName, format) → string`, `stageBackground(stages, index) → url`, `validateRegistration(form, input) → { firstName, lastName, email, phone, extra }`.

- [ ] **Step 1 : Écrire les tests (échouent)**

Créer `tests/flappy-config.test.mjs` :

```js
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
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `node --test tests/flappy-config.test.mjs`
Expected: échec « Cannot find module … shared/flappy-config.mjs ».

- [ ] **Step 3 : Créer `shared/validate.mjs`**

```js
export class ConfigError extends Error {
  constructor(message, path = '') { super(message); this.path = path; }
}
export const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
export function assetUrl(value, path = '') {
  if (!value) return '';
  let url;
  try { url = new URL(String(value)); } catch { throw new ConfigError('Lien invalide.', path); }
  if (url.protocol !== 'https:') throw new ConfigError('Les liens doivent utiliser HTTPS.', path);
  return url.href;
}
export const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? String(value).toLowerCase() : fallback;
export function number(value, { min, max, integer = false, fallback, path = '', label = 'Valeur' }) {
  const n = value === '' || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) throw new ConfigError(`${label} : choisis une valeur entre ${min} et ${max}.`, path);
  return n;
}
export const oneOf = (value, options, fallback) => options.includes(value) ? value : fallback;
export const getPath = (obj, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
export function setPath(obj, path, value) {
  const keys = path.split('.'); const last = keys.pop();
  let node = obj;
  for (const key of keys) node = node[key] ??= {};
  node[last] = value;
  return obj;
}
```

- [ ] **Step 4 : Créer `shared/flappy-config.mjs`**

```js
import { ConfigError, text, assetUrl, color, number, oneOf } from './validate.mjs';

export const FIXED_FIELDS = ['firstName', 'lastName', 'email', 'phone'];
export const DEFAULT_BACKGROUNDS = ['/img/background.jpg', '/img/background2.jpg', '/img/background3.png', '/img/background4.jpg'];
const BASE_STAGES = [[0, 5, 0.65], [20, 7, 0.75], [40, 10, 0.9], [60, 15, 1.2]];
export const PRESETS = { easy: { speedFactor: 0.8, gap: 36 }, normal: { speedFactor: 1, gap: 31 }, hard: { speedFactor: 1.2, gap: 28 } };
export const FONTS = {
  system: { label: 'Système (Arial)', family: 'Arial, Helvetica, sans-serif', google: '' },
  pixel: { label: 'Pixel (Flappy Bird)', family: "'Flappy Pixel', Arial, sans-serif", google: '' },
  manrope: { label: 'Manrope', family: 'Manrope, Arial, sans-serif', google: 'Manrope:wght@400;700;800' },
  poppins: { label: 'Poppins', family: 'Poppins, Arial, sans-serif', google: 'Poppins:wght@400;700;900' },
  fredoka: { label: 'Fredoka', family: 'Fredoka, Arial, sans-serif', google: 'Fredoka:wght@400;700' }
};
export const FLAPPY_DEFAULTS = {
  brand: { logoUrl: '', accent: '#ffdc65' },
  theme: { font: 'system', panelBg: '#ffffff', panelText: '#111111', buttonBg: '#111111', buttonText: '#ffffff', hudText: '#ffffff', overlayColor: '#000000', overlayOpacity: 78 },
  screens: {
    welcome: { title: '', subtitle: 'Fais le meilleur score !', button: 'JOUER', info: '{{parties}} parties pour réaliser ton meilleur score' },
    countdown: { title: 'PRÊT ?', hint: 'Touche l’écran pour voler', hintDesktop: 'Sur ordinateur : espace ou flèche ↑' },
    hud: { roundLabel: 'PARTIE {{n}}/{{total}}' },
    gameOver: { title: 'GAME OVER', scoreLabel: 'Score : {{score}}', replay: 'REJOUER', seeRanking: 'VOIR LE CLASSEMENT' },
    ranking: { title: '🏆 TOP {{places}} · {{jeu}}', bestScore: 'Ton meilleur score : {{score}} pts', caption: 'Tes {{parties}} parties sont terminées. Merci d’avoir joué !', empty: 'Aucun score pour le moment.', ctaLabel: '', ctaUrl: '' }
  },
  form: {
    fields: { firstName: { visible: true, required: true, label: 'Prénom' }, lastName: { visible: true, required: true, label: 'Nom' }, email: { visible: true, required: true, label: 'E-mail' }, phone: { visible: true, required: true, label: 'Téléphone' } },
    customFields: []
  },
  character: { imageUrl: '', size: 64, startX: 18, startY: 40, rotateOnJump: true, hitboxScale: 90 },
  stages: BASE_STAGES.map(([minScore, speed, gravity]) => ({ minScore, backgroundUrl: '', speed, gravity })),
  obstacles: { style: 'gradient', topUrl: '', bottomUrl: '', colorA: '#2f8f2f', colorB: '#6ddd53', border: '#164d16', width: 15, radius: 8 },
  physics: { preset: 'normal', jumpForce: 12.6, gap: 31, spawnEvery: 100 },
  leaderboard: { places: 10, nameFormat: 'firstInitial', showOwnRank: true }
};
const EMPTY_ALLOWED = new Set(['welcome.title', 'ranking.ctaLabel', 'ranking.ctaUrl']);
const round2 = n => Math.round(n * 100) / 100;
export const slug = label => String(label ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

export function normalizeFlappy(input = {}) {
  const d = FLAPPY_DEFAULTS; const f = {};
  const brand = input.brand || {};
  f.brand = { logoUrl: assetUrl(brand.logoUrl, 'brand.logoUrl'), accent: color(brand.accent, d.brand.accent) };
  const theme = input.theme || {};
  f.theme = { font: oneOf(theme.font, Object.keys(FONTS), d.theme.font), overlayOpacity: number(theme.overlayOpacity, { min: 0, max: 100, integer: true, fallback: d.theme.overlayOpacity, path: 'theme.overlayOpacity', label: 'Opacité du fond du classement' }) };
  for (const key of ['panelBg', 'panelText', 'buttonBg', 'buttonText', 'hudText', 'overlayColor']) f.theme[key] = color(theme[key], d.theme[key]);
  f.screens = {};
  for (const [screen, fields] of Object.entries(d.screens)) {
    f.screens[screen] = {};
    for (const [key, fallback] of Object.entries(fields)) {
      const value = text(input.screens?.[screen]?.[key]);
      f.screens[screen][key] = value || (EMPTY_ALLOWED.has(`${screen}.${key}`) ? '' : fallback);
    }
  }
  f.screens.ranking.ctaUrl = assetUrl(f.screens.ranking.ctaUrl, 'screens.ranking.ctaUrl');
  if (f.screens.ranking.ctaLabel && !f.screens.ranking.ctaUrl) throw new ConfigError('Indique le lien du bouton affiché sous le classement.', 'screens.ranking.ctaUrl');
  if (!f.screens.ranking.ctaLabel) f.screens.ranking.ctaUrl = '';
  f.form = { fields: {}, customFields: [] };
  for (const key of FIXED_FIELDS) {
    const src = input.form?.fields?.[key] || {}; const def = d.form.fields[key];
    const visible = key === 'email' ? true : src.visible !== false;
    f.form.fields[key] = { visible, required: key === 'email' ? true : visible && src.required !== false, label: text(src.label, 80) || def.label };
  }
  const custom = Array.isArray(input.form?.customFields) ? input.form.customFields : [];
  if (custom.length > 5) throw new ConfigError('5 champs personnalisés maximum.', 'form.customFields');
  const ids = new Set(FIXED_FIELDS.map(k => k.toLowerCase()));
  f.form.customFields = custom.map((field, index) => {
    const path = `form.customFields.${index}`;
    const label = text(field?.label, 80);
    if (!label) throw new ConfigError('Donne un libellé à chaque champ personnalisé.', path + '.label');
    const id = /^[a-z0-9_]{1,30}$/.test(field?.id || '') ? field.id : slug(label);
    if (!id || ids.has(id)) throw new ConfigError(`Le champ « ${label} » a un identifiant déjà utilisé ou réservé.`, path + '.id');
    ids.add(id);
    const type = oneOf(field?.type, ['text', 'select', 'checkbox'], 'text');
    const rawOptions = Array.isArray(field?.options) ? field.options : String(field?.options ?? '').split('\n');
    const options = type === 'select' ? [...new Set(rawOptions.map(o => text(o, 80)).filter(Boolean))] : [];
    if (type === 'select' && (options.length < 1 || options.length > 20)) throw new ConfigError(`Le champ « ${label} » doit proposer entre 1 et 20 options.`, path + '.options');
    return { id, label, type, required: field?.required === true, options };
  });
  const c = input.character || {};
  f.character = {
    imageUrl: assetUrl(c.imageUrl, 'character.imageUrl'),
    size: number(c.size, { min: 32, max: 120, integer: true, fallback: d.character.size, path: 'character.size', label: 'Taille du personnage' }),
    startX: number(c.startX, { min: 5, max: 40, fallback: d.character.startX, path: 'character.startX', label: 'Position horizontale' }),
    startY: number(c.startY, { min: 20, max: 70, fallback: d.character.startY, path: 'character.startY', label: 'Position verticale' }),
    rotateOnJump: c.rotateOnJump !== false,
    hitboxScale: number(c.hitboxScale, { min: 60, max: 100, integer: true, fallback: d.character.hitboxScale, path: 'character.hitboxScale', label: 'Zone de collision' })
  };
  const rawStages = Array.isArray(input.stages) && input.stages.length ? input.stages : d.stages;
  if (rawStages.length > 4) throw new ConfigError('4 paliers maximum.', 'stages');
  f.stages = rawStages.map((s, i) => ({
    minScore: number(s?.minScore, { min: 0, max: 10000, integer: true, fallback: BASE_STAGES[i][0], path: `stages.${i}.minScore`, label: 'Score du palier' }),
    backgroundUrl: assetUrl(s?.backgroundUrl, `stages.${i}.backgroundUrl`),
    speed: number(s?.speed, { min: 2, max: 25, fallback: BASE_STAGES[i][1], path: `stages.${i}.speed`, label: 'Vitesse' }),
    gravity: number(s?.gravity, { min: 0.3, max: 2, fallback: BASE_STAGES[i][2], path: `stages.${i}.gravity`, label: 'Gravité' })
  }));
  if (f.stages[0].minScore !== 0) throw new ConfigError('Le premier palier commence au score 0.', 'stages.0.minScore');
  for (let i = 1; i < f.stages.length; i++) if (f.stages[i].minScore <= f.stages[i - 1].minScore) throw new ConfigError('Les scores des paliers doivent être croissants.', `stages.${i}.minScore`);
  const o = input.obstacles || {};
  f.obstacles = {
    style: oneOf(o.style, ['gradient', 'image'], 'gradient'), topUrl: assetUrl(o.topUrl, 'obstacles.topUrl'), bottomUrl: assetUrl(o.bottomUrl, 'obstacles.bottomUrl'),
    colorA: color(o.colorA, d.obstacles.colorA), colorB: color(o.colorB, d.obstacles.colorB), border: color(o.border, d.obstacles.border),
    width: number(o.width, { min: 8, max: 25, fallback: d.obstacles.width, path: 'obstacles.width', label: 'Largeur des obstacles' }),
    radius: number(o.radius, { min: 0, max: 30, integer: true, fallback: d.obstacles.radius, path: 'obstacles.radius', label: 'Arrondi des obstacles' })
  };
  if (f.obstacles.style === 'image' && !f.obstacles.topUrl && !f.obstacles.bottomUrl) f.obstacles.style = 'gradient';
  const p = input.physics || {};
  f.physics = {
    preset: oneOf(p.preset, ['easy', 'normal', 'hard', 'custom'], 'normal'),
    jumpForce: number(p.jumpForce, { min: 6, max: 20, fallback: d.physics.jumpForce, path: 'physics.jumpForce', label: 'Force de saut' }),
    gap: number(p.gap, { min: 20, max: 45, fallback: d.physics.gap, path: 'physics.gap', label: 'Écart entre les obstacles' }),
    spawnEvery: number(p.spawnEvery, { min: 40, max: 200, integer: true, fallback: d.physics.spawnEvery, path: 'physics.spawnEvery', label: 'Fréquence des obstacles' })
  };
  if (f.physics.preset !== 'custom') {
    const preset = PRESETS[f.physics.preset];
    f.physics = { ...f.physics, jumpForce: d.physics.jumpForce, gap: preset.gap, spawnEvery: d.physics.spawnEvery };
    f.stages = f.stages.map((s, i) => ({ ...s, speed: round2(BASE_STAGES[i][1] * preset.speedFactor), gravity: BASE_STAGES[i][2] }));
  }
  const l = input.leaderboard || {};
  f.leaderboard = {
    places: number(l.places, { min: 3, max: 50, integer: true, fallback: d.leaderboard.places, path: 'leaderboard.places', label: 'Nombre de places' }),
    nameFormat: oneOf(l.nameFormat, ['firstInitial', 'first', 'full'], 'firstInitial'),
    showOwnRank: l.showOwnRank !== false
  };
  return f;
}

export function migrateLegacyGame(game) {
  if (!game || game.flappy) return game;
  const { birdUrl, backgroundUrl, pipeUrl, difficulty, accent, logoUrl, subtitle, ...rest } = game;
  const brandAccent = color(accent, FLAPPY_DEFAULTS.brand.accent);
  return { ...rest, flappy: {
    brand: { logoUrl: logoUrl || '', accent: brandAccent },
    theme: { buttonBg: brandAccent, buttonText: '#111111' },
    screens: { welcome: { subtitle: subtitle || '' } },
    character: { imageUrl: birdUrl || '' },
    stages: [{ minScore: 0, backgroundUrl: backgroundUrl || '' }, { minScore: 20 }, { minScore: 40 }, { minScore: 60 }],
    obstacles: pipeUrl ? { style: 'image', topUrl: pipeUrl, bottomUrl: pipeUrl } : {},
    physics: { preset: ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal' }
  } };
}

export function renderText(template, vars = {}) {
  return String(template ?? '').replace(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu, (match, key) => key in vars ? String(vars[key]) : match);
}
export function formatName(firstName, lastName, format) {
  const first = String(firstName || '').trim(); const last = String(lastName || '').trim();
  if (format === 'full') return [first, last].filter(Boolean).join(' ');
  if (format === 'first' || !last) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}
export function stageBackground(stages, index) {
  for (let i = Math.min(index, stages.length - 1); i >= 0; i--) if (stages[i].backgroundUrl) return stages[i].backgroundUrl;
  return DEFAULT_BACKGROUNDS[Math.min(index, DEFAULT_BACKGROUNDS.length - 1)];
}
export function validateRegistration(form, input = {}) {
  const player = {};
  for (const key of FIXED_FIELDS) {
    const field = form.fields[key];
    const value = field.visible ? text(input[key], key === 'email' ? 254 : 80) : '';
    if (field.required && !value) throw new ConfigError(`Le champ ${field.label} est obligatoire.`, key);
    player[key] = value;
  }
  player.email = player.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(player.email)) throw new ConfigError('Indique une adresse email valide.', 'email');
  const given = input.extra && typeof input.extra === 'object' && !Array.isArray(input.extra) ? input.extra : {};
  const known = new Set(form.customFields.map(f => f.id));
  for (const key of Object.keys(given)) if (!known.has(key)) throw new ConfigError('Champ de formulaire inconnu.', 'extra.' + key);
  const extra = {};
  for (const field of form.customFields) {
    const raw = given[field.id]; let value;
    if (field.type === 'checkbox') value = raw === true;
    else if (field.type === 'select') { value = text(raw, 80); if (value && !field.options.includes(value)) throw new ConfigError(`Choisis une option valide pour ${field.label}.`, 'extra.' + field.id); }
    else value = text(raw, 200);
    if (field.required && !value) throw new ConfigError(`Le champ ${field.label} est obligatoire.`, 'extra.' + field.id);
    extra[field.id] = value;
  }
  return { ...player, extra };
}
```

- [ ] **Step 5 : Lancer les tests**

Run: `node --test tests/flappy-config.test.mjs`
Expected: 9 tests PASS.

- [ ] **Step 6 : Commit**

```bash
git add shared/validate.mjs shared/flappy-config.mjs tests/flappy-config.test.mjs
git commit -m "Add sectioned Flappy Bird configuration model with validation and migration"
```

---
### Task 2 : Registre des types de jeu et configuration de campagne

**Files:**
- Create: `shared/game-types.mjs`
- Modify: `shared/game-config.mjs` (fichier entier remplacé)
- Test: `tests/studio.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `FLAPPY_DEFAULTS`, `normalizeFlappy`, `migrateLegacyGame` (Task 1) ; `text`, `assetUrl` de `shared/validate.mjs`.
- Produces: `GAME_TYPES`, `gameType(id)` ; `DEFAULT_GAME` (campagne + `type:'flappy'` + `flappy: FLAPPY_DEFAULTS`), `normalizeGame(input) → game` (avec `game.flappy` normalisé), `migrateGame(game)`, `publicGame(game)`, `isGameOpen(game, now)`, `csvCell`, `participantCsv(players, game)`.

- [ ] **Step 1 : Ajouter les tests dans `tests/studio.test.mjs`**

Ajouter l'import `migrateGame` à la ligne d'import existante (`import { normalizeGame, DEFAULT_GAME, publicGame, isGameOpen, participantCsv, migrateGame } from '../shared/game-config.mjs';`) puis, après le test `'configuration validation, publication gates and safe CSV exports'`, ajouter :

```js
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
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `node --test tests/studio.test.mjs`
Expected: échec « does not provide an export named 'migrateGame' ».

- [ ] **Step 3 : Créer `shared/game-types.mjs`**

```js
import { FLAPPY_DEFAULTS, normalizeFlappy, migrateLegacyGame } from './flappy-config.mjs';

export const GAME_TYPES = [
  { id: 'flappy', label: 'Flappy Bird', tagline: 'Un tap, un envol. Un classique qui rassemble.', icon: '↗', defaults: FLAPPY_DEFAULTS, normalize: normalizeFlappy, migrate: migrateLegacyGame }
];
export const gameType = id => GAME_TYPES.find(type => type.id === id);
```

- [ ] **Step 4 : Remplacer `shared/game-config.mjs`**

```js
import { text, assetUrl } from './validate.mjs';
import { GAME_TYPES, gameType } from './game-types.mjs';
export { assetUrl };

export const DEFAULT_GAME = {
  name: 'Nouveau jeu', company: '', type: 'flappy', status: 'draft',
  maxGames: 3, countdownSeconds: 3, termsUrl: '', privacyUrl: '',
  marketingLabel: 'J’accepte de recevoir les offres et actualités de la société organisatrice.',
  emailsEnabled: false, emailSubject: 'Merci d’avoir joué à {{jeu}} !',
  emailBody: 'Bonjour {{prenom}},\n\nMerci pour ta participation à {{jeu}}.\nTon meilleur score : {{score}} points.\n\nÀ bientôt !',
  startsAt: '', endsAt: '',
  flappy: GAME_TYPES[0].defaults
};

export function validId(value) { return /^[a-zA-Z0-9_-]{1,80}$/.test(value || ''); }
export function migrateGame(game) {
  const type = gameType(game?.type || 'flappy');
  return type ? type.migrate(game) : game;
}
export function normalizeGame(rawInput = {}) {
  const type = gameType(rawInput.type || 'flappy');
  if (!type) throw new Error('Type de jeu inconnu.');
  const input = type.migrate(rawInput);
  const game = { ...DEFAULT_GAME, type: type.id };
  for (const key of ['name', 'company', 'marketingLabel', 'emailSubject']) game[key] = text(input[key] ?? game[key]);
  game.emailBody = text(input.emailBody ?? game.emailBody, 5000);
  game.status = ['draft', 'published', 'paused'].includes(input.status) ? input.status : 'draft';
  game.maxGames = Number(input.maxGames ?? 3);
  game.countdownSeconds = Number(input.countdownSeconds ?? 3);
  if (!Number.isInteger(game.maxGames) || game.maxGames < 1 || game.maxGames > 10) throw new Error('Choisis entre 1 et 10 parties.');
  if (!Number.isInteger(game.countdownSeconds) || game.countdownSeconds < 1 || game.countdownSeconds > 5) throw new Error('Le compte à rebours doit durer de 1 à 5 secondes.');
  for (const key of ['termsUrl', 'privacyUrl']) game[key] = assetUrl(input[key], key);
  game.emailsEnabled = input.emailsEnabled === true;
  for (const key of ['startsAt', 'endsAt']) {
    if (input[key] && !Number.isFinite(Date.parse(input[key]))) throw new Error('Date de campagne invalide.');
    game[key] = input[key] ? new Date(input[key]).toISOString() : '';
  }
  if (game.startsAt && game.endsAt && game.startsAt >= game.endsAt) throw new Error('La date de fin doit suivre la date de début.');
  if (!game.name) throw new Error('Donne un nom au jeu.');
  if (game.status === 'published' && (!game.company || !game.termsUrl || !game.privacyUrl)) throw new Error('Avant publication, renseigne la société, le règlement et la politique de confidentialité.');
  try { game[type.id] = type.normalize(input[type.id] || {}); }
  catch (error) { if (typeof error.path === 'string') error.path = error.path ? `${type.id}.${error.path}` : type.id; throw error; }
  return game;
}
export function publicGame(game) {
  const { emailBody, emailSubject, updatedBy, ...result } = game;
  return result;
}
export function isGameOpen(game, now = Date.now()) {
  return game?.status === 'published'
    && (!game.startsAt || Date.parse(game.startsAt) <= now)
    && (!game.endsAt || Date.parse(game.endsAt) > now);
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function customFieldsOf(game) {
  return game?.[game?.type || 'flappy']?.form?.customFields || [];
}
export function participantCsv(players, game) {
  const custom = customFieldsOf(game);
  const rows = [['Prénom', 'Nom', 'Email', 'Téléphone', ...custom.map(f => f.label), 'Parties', 'Meilleur score', 'Consentement marketing', 'Consentement jeu', 'Date du consentement']];
  for (const p of players) rows.push([
    p.firstName, p.lastName, p.email, p.phone,
    ...custom.map(f => f.type === 'checkbox' ? (p.extra?.[f.id] ? 'Oui' : 'Non') : (p.extra?.[f.id] ?? '')),
    p.gamesPlayed, p.highScore, p.consentMarketing ? 'Oui' : 'Non', p.consentGame ? 'Oui' : 'Non', p.consentTimestamp ? new Date(p.consentTimestamp).toISOString() : ''
  ]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
```

Note : l'ancien test `assert.throws(() => normalizeGame({ birdUrl: 'javascript:alert(1)' }))` reste vrai (la migration envoie `birdUrl` vers `character.imageUrl`, refusé par `assetUrl`).

- [ ] **Step 5 : Lancer tous les tests**

Run: `npm test`
Expected: PASS (les tests existants de `studio.test.mjs` continuent de passer : le fixture `published` n'a pas de `flappy` et est migré ; `duplicate` copie le jeu tel quel).

- [ ] **Step 6 : Commit**

```bash
git add shared/game-types.mjs shared/game-config.mjs tests/studio.test.mjs
git commit -m "Register game types and delegate campaign normalization to the flappy model"
```

---

### Task 3 : API — inscription pilotée par le formulaire, classement paramétré, migration à la lecture

**Files:**
- Modify: `api/game.js` (fichier entier remplacé)
- Modify: `api/admin.js` (blocs `games`, `save`, `participants`)
- Test: `tests/studio.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `normalizeGame`, `migrateGame`, `publicGame`, `isGameOpen`, `validId` (Task 2) ; `validateRegistration`, `formatName` (Task 1) ; `requireSession`, `issueSession`, `participantId` (`server/platform.cjs`, existants).
- Produces (HTTP) : `GET /api/game?id&action=config → { game, open }` (game normalisé, avec `flappy`) ; `POST register` accepte `{ firstName, lastName, email, phone, extra, consentGame, consentMarketing }` ; `GET leaderboard → { players: [{ displayName, highScore }], me?: { rank, total } }` ; `GET /api/admin?action=games → { games: [normalisé + id/createdAt/updatedAt] }` ; `participants` renvoie `extra`.

- [ ] **Step 1 : Ajouter les tests dans `tests/studio.test.mjs`**

```js
test('registration follows the game form: hidden, optional, custom and unknown fields', async () => {
  db = memoryDatabase();
  const config = { ...published, flappy: { form: { fields: { phone: { visible: false }, lastName: { required: false } }, customFields: [{ label: 'Magasin', type: 'select', options: ['Paris', 'Lyon'], required: true }, { label: 'News', type: 'checkbox' }] } } };
  await db.ref('studio/games/formgame').set(config);
  const base = { firstName: 'Camille', email: 'form@example.com', consentGame: true };
  const missing = await call(game, { method: 'POST', query: { id: 'formgame', action: 'register' }, body: base });
  assert.equal(missing.status, 400); assert.match(missing.error, /Magasin/);
  const bad = await call(game, { method: 'POST', query: { id: 'formgame', action: 'register' }, body: { ...base, extra: { magasin: 'Nice' } } });
  assert.equal(bad.status, 400);
  const unknown = await call(game, { method: 'POST', query: { id: 'formgame', action: 'register' }, body: { ...base, extra: { magasin: 'Paris', hack: 1 } } });
  assert.equal(unknown.status, 400);
  const ok = await call(game, { method: 'POST', query: { id: 'formgame', action: 'register' }, body: { ...base, phone: 'ignored', extra: { magasin: 'Paris' } } });
  assert.equal(ok.status, 200);
  const stored = Object.values(db.data.studio.participants.formgame)[0];
  assert.deepEqual(stored.extra, { magasin: 'Paris', news: false }); assert.equal(stored.phone, ''); assert.equal(stored.lastName, '');
  const listed = await call(admin, { token: 'admin', query: { action: 'participants', id: 'formgame' } });
  assert.deepEqual(listed.participants[0].extra, { magasin: 'Paris', news: false });
  const publicConfig = await call(game, { query: { id: 'formgame', action: 'config' } });
  assert.equal(publicConfig.game.flappy.form.customFields[0].id, 'magasin'); assert.equal(publicConfig.game.emailBody, undefined);
});

test('leaderboard honours places, name format and own rank; legacy entries keep their display name', async () => {
  db = memoryDatabase();
  await db.ref('studio/games/board').set({ ...published, maxGames: 5, flappy: { leaderboard: { places: 3, nameFormat: 'full', showOwnRank: true } } });
  await db.ref('studio/leaderboards/board/old').set({ displayName: 'Ancien J.', highScore: 50 });
  const register = async email => (await call(game, { method: 'POST', query: { id: 'board', action: 'register' }, body: { firstName: 'Camille', lastName: 'Test', email, phone: '0', consentGame: true } })).token;
  const tokens = [];
  for (const [index, score] of [30, 20, 10, 5].entries()) {
    const token = await register(`p${index}@example.com`); tokens.push(token);
    const { runId } = await call(game, { token, method: 'POST', query: { id: 'board', action: 'start' }, body: { requestId: 'r' + index } });
    await call(game, { token, method: 'POST', query: { id: 'board', action: 'finish' }, body: { runId, score } });
  }
  const anonymous = await call(game, { query: { id: 'board', action: 'leaderboard' } });
  assert.deepEqual(anonymous.players, [{ displayName: 'Ancien J.', highScore: 50 }, { displayName: 'Camille Test', highScore: 30 }, { displayName: 'Camille Test', highScore: 20 }]);
  assert.equal(anonymous.me, undefined);
  const mine = await call(game, { token: tokens[3], query: { id: 'board', action: 'leaderboard' } });
  assert.deepEqual(mine.me, { rank: 5, total: 5 });
  await db.ref('studio/games/board/flappy/leaderboard/nameFormat').set('first');
  assert.equal((await call(game, { query: { id: 'board', action: 'leaderboard' } })).players[1].displayName, 'Camille');
  await db.ref('studio/games/board/flappy/leaderboard/showOwnRank').set(false);
  assert.equal((await call(game, { token: tokens[0], query: { id: 'board', action: 'leaderboard' } })).me, undefined);
});

test('admin reads migrate flat games and saves drop the legacy keys', async () => {
  db = memoryDatabase();
  await db.ref('studio/games/old').set({ ...published, birdUrl: 'https://a.example/bird.png', difficulty: 'hard', createdAt: 5 });
  const list = await call(admin, { token: 'admin', query: { action: 'games' } });
  assert.equal(list.games[0].birdUrl, undefined); assert.equal(list.games[0].flappy.character.imageUrl, 'https://a.example/bird.png'); assert.equal(list.games[0].createdAt, 5);
  const saved = await call(admin, { token: 'admin', method: 'POST', query: { action: 'save', id: 'old' }, body: list.games[0] });
  assert.equal(saved.status, 200); assert.equal(db.data.studio.games.old.birdUrl, undefined); assert.equal(db.data.studio.games.old.flappy.physics.preset, 'hard');
  const invalid = await call(admin, { token: 'admin', method: 'POST', query: { action: 'save' }, body: { ...published, flappy: { stages: [{ minScore: 3 }] } } });
  assert.equal(invalid.status, 400); assert.equal(invalid.path, 'flappy.stages.0.minScore');
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `node --test tests/studio.test.mjs`
Expected: les trois nouveaux tests échouent (400 attendu non obtenu / `extra` absent / `path` absent).

- [ ] **Step 3 : Remplacer `api/game.js`**

```js
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
        .map(([pid, p]) => ({ pid, displayName: p.firstName ? formatName(p.firstName, p.lastName, nameFormat) : String(p.displayName || ''), highScore: Number(p.highScore) || 0 }))
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
```

- [ ] **Step 4 : Modifier `api/admin.js`**

Remplacer la ligne d'import de `game-config` et les trois blocs concernés :

```js
    const { normalizeGame, migrateGame, validId } = await import('../shared/game-config.mjs');
    const shape = (game, id) => { try { return { ...migrateGame(game), ...normalizeGame(migrateGame(game)), id }; } catch { return { ...migrateGame(game), id }; } };
```

Bloc `games` :
```js
    if (req.method === 'GET' && action === 'games') {
      const data = (await db.ref('studio/games').get()).val() || {};
      const games = Object.entries(data).map(([id, game]) => shape(game, id));
      games.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return send(res, 200, { games, email: user.email, emailReady: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM), gameOrigin: process.env.PUBLIC_GAME_ORIGIN || 'https://crousty-game.vercel.app' });
    }
```

Dans `participants`, ajouter `extra: p.extra || {}` à la projection (après `phone: p.phone,`).

Dans `save`, remplacer le `catch` de normalisation :
```js
      try { config = normalizeGame(input); } catch (e) { const error = new HttpError(400, e.message); error.path = e.path || ''; throw error; }
```
et dans `server/platform.cjs`, faire remonter `path` dans `failure` :
```js
function failure(res, error) {
  if (!error.status) console.error('Studio API error:', error.code || error.name);
  send(res, error.status || 500, { error: error.status ? error.message : 'Le service est momentanément indisponible. Réessaie dans un instant.', ...(error.path ? { path: error.path } : {}) });
}
```
Le bloc `duplicate` retourne `shape(game, gameId)` au lieu de `{ ...game, id: gameId }` ; `save` retourne `shape(game, gameId)`.

- [ ] **Step 5 : Lancer tous les tests**

Run: `npm test`
Expected: PASS. Le test existant « two attempts survive re-registration » vérifie toujours `displayName: 'Camille T.'` (format `firstInitial` par défaut, calculé à la lecture).

- [ ] **Step 6 : Commit**

```bash
git add api/game.js api/admin.js server/platform.cjs tests/studio.test.mjs
git commit -m "Validate registrations against the game form and parameterize the leaderboard"
```

---
### Task 4 : Structure HTML, CSS vars et module de thème du jeu

**Files:**
- Modify: `index.html` (fichier entier remplacé)
- Modify: `style.css` (règles listées)
- Create: `game/flappy/theme.mjs`
- Test: `tests/theme.test.mjs`

**Interfaces:**
- Consumes: `FONTS`, `renderText`, `stageBackground`, `FIXED_FIELDS` (Task 1) ; `getPath` (`shared/validate.mjs`).
- Produces: `hexToRgba(hex, alpha)`, `cssVariables(flappy) → { '--fb-…': value }`, `applyTheme(campaign, vars, doc=document)`, `setBackground(doc, url)`, `buildForm(form, container, doc)`, `readForm(doc) → { firstName, lastName, email, phone, extra }`.

- [ ] **Step 1 : Test des parties pures (échoue)**

Créer `tests/theme.test.mjs` :

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cssVariables, hexToRgba } from '../game/flappy/theme.mjs';
import { normalizeFlappy } from '../shared/flappy-config.mjs';

test('css variables reflect the flappy config', () => {
  assert.equal(hexToRgba('#000000', 0.78), 'rgba(0, 0, 0, 0.78)');
  assert.equal(hexToRgba('#ffdc65', 1), 'rgba(255, 220, 101, 1)');
  const vars = cssVariables(normalizeFlappy());
  assert.equal(vars['--fb-accent'], '#ffdc65'); assert.equal(vars['--fb-overlay'], 'rgba(0, 0, 0, 0.78)');
  assert.equal(vars['--fb-font'], 'Arial, Helvetica, sans-serif'); assert.equal(vars['--fb-bird-size'], '64px');
  assert.equal(vars['--fb-bird-x'], '18vw'); assert.equal(vars['--fb-pipe-width'], '15vw'); assert.equal(vars['--fb-pipe-top'], 'none');
  const image = cssVariables(normalizeFlappy({ obstacles: { style: 'image', topUrl: 'https://a.example/t.png' } }));
  assert.equal(image['--fb-pipe-top'], 'url("https://a.example/t.png")'); assert.equal(image['--fb-pipe-bottom'], 'url("https://a.example/t.png")');
});
```

Run: `node --test tests/theme.test.mjs` → échec « Cannot find module ».

- [ ] **Step 2 : Remplacer `index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Crousty Game</title>
  <link rel="stylesheet" href="style.css">
  <script defer type="module" src="main.js"></script>
</head>
<body>
  <div id="previewBanner" class="preview-banner" hidden>APERÇU — parties illimitées, scores non enregistrés</div>
  <div class="background"></div>
  <img class="bird" src="/img/logo.png" alt="">

  <div class="message" id="welcomeScreen">
    <div class="game-logo"><span data-text="welcome.title">CROUSTY GAME</span></div>
    <div class="game-subtitle" data-text="welcome.subtitle">Fais le meilleur score !</div>
    <div class="user-info">
      <div id="formFields"></div>
      <label class="consent-line"><input type="checkbox" id="consentGame"><span id="gameConsentText">J'accepte le règlement du jeu et la politique de confidentialité.</span></label>
      <label class="consent-line"><input type="checkbox" id="consentMarketing"><span id="marketingText">J'accepte de recevoir les offres et actualités de Crousty.</span></label>
    </div>
    <button id="loginBtn" data-text="welcome.button">JOUER</button>
    <div class="game-info" data-text="welcome.info">3 parties pour réaliser ton meilleur score</div>
  </div>

  <div class="message2"></div>

  <div id="countdown" class="countdown" hidden>
    <div class="countdown-panel">
      <p data-text="countdown.title">PRÊT ?</p>
      <strong id="countdownValue" role="status" aria-live="polite">3</strong>
      <p><span data-text="countdown.hint">Touche l’écran pour voler</span><br><small data-text="countdown.hintDesktop">Sur ordinateur : espace ou flèche ↑</small></p>
    </div>
  </div>

  <button id="replayBtn" class="replay-btn">REJOUER</button>

  <div class="score"><span class="score_title"></span><span class="score_val"></span></div>

  <section id="rankingScreen" class="ranking-screen" aria-labelledby="rankingTitle" hidden>
    <h1 id="rankingTitle" tabindex="-1" data-text="ranking.title">🏆 TOP 10 CROUSTY</h1>
    <p id="bestScore" class="best-score"></p>
    <p id="ownRank" class="own-rank" hidden></p>
    <p class="ranking-caption" data-text="ranking.caption">Tes 3 parties sont terminées. Merci d’avoir joué !</p>
    <ul class="ranking" aria-label="Les meilleurs scores"></ul>
    <p id="rankingStatus" role="status"></p>
    <button id="rankingRetry" type="button" hidden>RÉESSAYER</button>
    <a id="rankingCta" class="ranking-cta" target="_blank" rel="noopener noreferrer" hidden></a>
  </section>
</body>
</html>
```

- [ ] **Step 3 : Modifier `style.css`**

Remplacer le bloc d'en-tête (jusqu'à la règle `.managed-game #loginBtn…` incluse) par :

```css
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
:root {
  --fb-accent: #ffdc65; --fb-panel-bg: #ffffff; --fb-panel-text: #111111; --fb-button-bg: #111111; --fb-button-text: #ffffff;
  --fb-hud-text: #ffffff; --fb-overlay: rgba(0, 0, 0, 0.78); --fb-font: Arial, Helvetica, sans-serif;
  --fb-bird-size: 64px; --fb-bird-x: 18vw; --fb-bird-y: 40vh;
  --fb-pipe-width: 15vw; --fb-pipe-radius: 8px; --fb-pipe-a: #2f8f2f; --fb-pipe-b: #6ddd53; --fb-pipe-border: #164d16; --fb-pipe-top: none; --fb-pipe-bottom: none;
}
@font-face { font-family: 'Flappy Pixel'; src: url('/font/flappy-bird-font.woff2') format('woff2'), url('/font/flappy-bird-font.woff') format('woff'), url('/font/flappy-bird-font.ttf') format('truetype'); font-display: swap; }
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: var(--fb-font); touch-action: manipulation; background: #111; }
body { position: relative; }
.brand-logo { display: block; width: min(65%, 180px); max-height: 85px; object-fit: contain; margin: 0 auto 12px; }
.custom-pipes .pipe_sprite { background-size: cover; background-position: center; }
.custom-pipes .pipe_sprite_top { background-image: var(--fb-pipe-top); }
.custom-pipes .pipe_sprite_bottom { background-image: var(--fb-pipe-bottom); }
.preview-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 200; padding: 6px 10px; background: #263d30; color: #d7f57b; font: 700 11px/1.3 Arial, sans-serif; letter-spacing: 1px; text-align: center; pointer-events: none; }
.own-rank { margin: -6px 0 12px; font-weight: 700; }
.ranking-cta { display: inline-block; margin-top: 18px; min-height: 52px; padding: 14px 24px; border-radius: 14px; background: var(--fb-accent); color: #111; font-size: 18px; font-weight: 900; text-decoration: none; }
.legacy-game .bird { width: clamp(48px, 12vw, 80px); }
```

Puis appliquer ces changements ponctuels :
- `.bird` : `width: min(var(--fb-bird-size), 18vw); top: var(--fb-bird-y); left: var(--fb-bird-x); transform-origin: center;` (remplace `width: clamp(48px, 12vw, 80px); top: 40vh; left: 18vw;`).
- `.message` : `background: var(--fb-panel-bg); color: var(--fb-panel-text);` (remplace `background: rgba(255, 255, 255, 0.96);`).
- `.user-info input[type="text"], …` : ajouter `select` à la liste des sélecteurs (`.user-info select`) pour qu'une liste déroulante ait le même style ; `#formFields { display: flex; flex-direction: column; gap: 10px; }`.
- `.consent-line` : `color: inherit;` (remplace `color: #222;`).
- `#loginBtn` et `.replay-btn` : `background: var(--fb-button-bg); color: var(--fb-button-text);`.
- `.game-info` : `color: inherit; opacity: .6;` (remplace `color: #666;`).
- `.score` : `color: var(--fb-hud-text);`.
- `#countdownValue`, `.best-score` : `color: var(--fb-accent);`.
- `#rankingRetry` : `background: var(--fb-accent);`.
- `.ranking-screen` : `background: var(--fb-overlay);`.
- `.pipe_sprite` : `width: clamp(52px, var(--fb-pipe-width), 90px); background: linear-gradient(90deg, var(--fb-pipe-a), var(--fb-pipe-b), var(--fb-pipe-a)); border: 3px solid var(--fb-pipe-border); border-radius: var(--fb-pipe-radius);`.
- Media `(max-width: 480px)` : remplacer `.bird { left: 14vw; width: 58px; }` par `.legacy-game .bird { left: 14vw; width: 58px; }`.
- Supprimer les anciennes règles `.custom-background`, `.custom-pipes .pipe_sprite { background-image: var(--game-pipe) … }`, `#countdownValue, .best-score { color: var(--game-accent…) }` et `.managed-game #loginBtn…`.

- [ ] **Step 4 : Créer `game/flappy/theme.mjs`**

```js
import { FONTS, renderText, stageBackground, FIXED_FIELDS } from '../../shared/flappy-config.mjs';
import { getPath } from '../../shared/validate.mjs';

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
const cssUrl = url => `url(${JSON.stringify(url)})`;
export function cssVariables(f) {
  const image = f.obstacles.style === 'image';
  return {
    '--fb-accent': f.brand.accent, '--fb-panel-bg': f.theme.panelBg, '--fb-panel-text': f.theme.panelText,
    '--fb-button-bg': f.theme.buttonBg, '--fb-button-text': f.theme.buttonText, '--fb-hud-text': f.theme.hudText,
    '--fb-overlay': hexToRgba(f.theme.overlayColor, f.theme.overlayOpacity / 100), '--fb-font': FONTS[f.theme.font].family,
    '--fb-bird-size': f.character.size + 'px', '--fb-bird-x': f.character.startX + 'vw', '--fb-bird-y': f.character.startY + 'vh',
    '--fb-pipe-width': f.obstacles.width + 'vw', '--fb-pipe-radius': f.obstacles.radius + 'px',
    '--fb-pipe-a': f.obstacles.colorA, '--fb-pipe-b': f.obstacles.colorB, '--fb-pipe-border': f.obstacles.border,
    '--fb-pipe-top': image ? cssUrl(f.obstacles.topUrl || f.obstacles.bottomUrl) : 'none',
    '--fb-pipe-bottom': image ? cssUrl(f.obstacles.bottomUrl || f.obstacles.topUrl) : 'none'
  };
}
function loadFont(key, doc) {
  const font = FONTS[key]; let link = doc.getElementById('fbFont');
  if (!font.google) { link?.remove(); return; }
  if (!link) { link = doc.createElement('link'); link.id = 'fbFont'; link.rel = 'stylesheet'; doc.head.append(link); }
  const href = 'https://fonts.googleapis.com/css2?family=' + font.google + '&display=swap';
  if (link.getAttribute('href') !== href) link.href = href;
}
export function setBackground(doc, url) { doc.querySelector('.background').style.backgroundImage = cssUrl(url); }
export function readForm(doc = document) {
  const value = id => doc.getElementById(id)?.value?.trim() ?? '';
  const extra = {};
  for (const node of doc.querySelectorAll('[data-custom]')) extra[node.dataset.custom] = node.type === 'checkbox' ? node.checked : node.value.trim();
  return { firstName: value('firstName'), lastName: value('lastName'), email: value('email'), phone: value('phone'), extra };
}
export function buildForm(form, container, doc = document) {
  const previous = readForm(doc);
  container.replaceChildren();
  const types = { firstName: 'text', lastName: 'text', email: 'email', phone: 'tel' };
  const autocomplete = { firstName: 'given-name', lastName: 'family-name', email: 'email', phone: 'tel' };
  for (const key of FIXED_FIELDS) {
    const field = form.fields[key]; if (!field.visible) continue;
    const input = doc.createElement('input');
    input.type = types[key]; input.id = key; input.autocomplete = autocomplete[key]; input.required = field.required;
    input.placeholder = field.label + (field.required ? ' *' : ''); input.value = previous[key] || '';
    container.append(input);
  }
  for (const field of form.customFields) {
    const id = 'cf_' + field.id; const label = field.label + (field.required ? ' *' : '');
    if (field.type === 'checkbox') {
      const wrap = doc.createElement('label'); wrap.className = 'consent-line';
      const box = doc.createElement('input'); box.type = 'checkbox'; box.id = id; box.dataset.custom = field.id; box.checked = previous.extra[field.id] === true;
      const span = doc.createElement('span'); span.textContent = label;
      wrap.append(box, span); container.append(wrap); continue;
    }
    let input;
    if (field.type === 'select') {
      input = doc.createElement('select');
      const empty = doc.createElement('option'); empty.value = ''; empty.textContent = label; input.append(empty);
      for (const option of field.options) { const o = doc.createElement('option'); o.value = option; o.textContent = option; input.append(o); }
    } else { input = doc.createElement('input'); input.type = 'text'; input.placeholder = label; input.maxLength = 200; }
    input.id = id; input.dataset.custom = field.id; input.value = previous.extra[field.id] ?? '';
    container.append(input);
  }
}
function consentTexts(campaign, doc) {
  const consent = doc.getElementById('gameConsentText');
  consent.replaceChildren(doc.createTextNode('J’accepte '));
  [['le règlement du jeu', campaign.termsUrl], ['la politique de confidentialité', campaign.privacyUrl]].forEach(([label, url], index) => {
    if (index) consent.append(doc.createTextNode(' et '));
    if (!url) { consent.append(doc.createTextNode(label)); return; }
    const a = doc.createElement('a'); a.textContent = label; a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; consent.append(a);
  });
  consent.append(doc.createTextNode('.'));
  doc.getElementById('marketingText').textContent = campaign.marketingLabel;
}
export function applyTheme(campaign, vars, doc = document) {
  const f = campaign.flappy;
  for (const [key, value] of Object.entries(cssVariables(f))) doc.documentElement.style.setProperty(key, value);
  loadFont(f.theme.font, doc);
  doc.body.classList.toggle('custom-pipes', f.obstacles.style === 'image');
  doc.title = campaign.name;
  for (const node of doc.querySelectorAll('[data-text]')) {
    const template = getPath(f.screens, node.dataset.text) ?? '';
    node.textContent = renderText(node.dataset.text === 'welcome.title' && !template ? campaign.name : template, vars);
  }
  const logo = doc.querySelector('.game-logo'); logo.querySelector('img')?.remove();
  if (f.brand.logoUrl) { const img = doc.createElement('img'); img.src = f.brand.logoUrl; img.alt = campaign.company || ''; img.className = 'brand-logo'; logo.prepend(img); }
  const bird = doc.querySelector('.bird'); const src = f.character.imageUrl || '/img/logo.png';
  if (bird.getAttribute('src') !== src) bird.src = src;
  setBackground(doc, stageBackground(f.stages, 0));
  buildForm(f.form, doc.getElementById('formFields'), doc);
  consentTexts(campaign, doc);
  const cta = doc.getElementById('rankingCta');
  cta.hidden = !f.screens.ranking.ctaLabel; cta.textContent = f.screens.ranking.ctaLabel; cta.href = f.screens.ranking.ctaUrl || '#';
}
```

- [ ] **Step 5 : Test + vérification visuelle**

Run: `node --test tests/theme.test.mjs` → PASS.
Le jeu (`main.js`) ne compile plus tant que Task 6 n'est pas faite (formulaire généré) : c'est attendu ; ne pas lancer les tests navigateur ici.

- [ ] **Step 6 : Commit**

```bash
git add index.html style.css game/flappy/theme.mjs tests/theme.test.mjs
git commit -m "Expose game visuals as CSS variables and add the flappy theme module"
```

---

### Task 5 : Moteur de jeu paramétré (`game/flappy/engine.mjs`)

**Files:**
- Create: `game/flappy/engine.mjs`
- Test: `tests/engine.test.mjs`

**Interfaces:**
- Consumes: `startFixedStepLoop` (`game-loop.mjs`, existant).
- Produces: `spawnInterval(spawnEvery, speed)`, `stageIndex(stages, score)`, `createEngine({ physics, stages, character }, world, hooks) → { step(), jump(), end(), score, running, stage }`, `domWorld(doc) → world`. Contrat `world` : `birdRect() → {top,left,right,bottom,width,height}`, `setBirdTop(px)`, `setBirdRotation(deg)`, `floor() → px`, `random() → [0,1)`, `createPipe(kind, topVh, scoring) → { scoring, rect(), setLeft(px), remove() }`, `clearPipes()`. Hooks : `onScore(score)`, `onStage(index)`, `onEnd(score)`.

- [ ] **Step 1 : Tests (échouent)**

Créer `tests/engine.test.mjs` :

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, spawnInterval, stageIndex } from '../game/flappy/engine.mjs';
import { normalizeFlappy } from '../shared/flappy-config.mjs';

function fakeWorld({ width = 400, height = 800, pinned = false, random = 0.5 } = {}) {
  let birdTop = 320, rotation = 0; const size = 60; const pipes = [];
  const world = {
    birdRect: () => ({ top: birdTop, left: 72, width: size, height: size, right: 72 + size, bottom: birdTop + size }),
    setBirdTop: px => { if (!pinned) birdTop = px; },
    setBirdRotation: deg => { rotation = deg; },
    floor: () => height, random: () => random,
    createPipe(kind, topVh, scoring = false) {
      const pipe = { kind, scoring, left: width, top: topVh * height / 100, removed: false,
        rect() { return { left: this.left, right: this.left + 60, top: this.top, bottom: this.top + height * 0.7, width: 60, height: height * 0.7 }; },
        setLeft(px) { this.left = px; }, remove() { this.removed = true; } };
      pipes.push(pipe); return pipe;
    },
    clearPipes() { pipes.length = 0; }
  };
  return { world, pipes, get birdTop() { return birdTop; }, set birdTop(v) { birdTop = v; }, get rotation() { return rotation; } };
}
const config = overrides => normalizeFlappy({ physics: { preset: 'custom', ...overrides?.physics }, ...overrides });

test('pure helpers reproduce the original spawn cadence and stage lookup', () => {
  assert.equal(spawnInterval(100, 5), 100); assert.equal(spawnInterval(100, 15), 40); assert.equal(spawnInterval(40, 25), 20);
  const stages = normalizeFlappy().stages;
  assert.equal(stageIndex(stages, 0), 0); assert.equal(stageIndex(stages, 19), 0); assert.equal(stageIndex(stages, 20), 1); assert.equal(stageIndex(stages, 61), 3);
});

test('gravity, jump and rotation follow the configured physics', () => {
  const w = fakeWorld(); const engine = createEngine(config(), w.world, {});
  engine.step(); assert.equal(w.birdTop, 320.65); assert.ok(w.rotation > 0);
  engine.jump(); engine.step(); assert.equal(Math.round(w.birdTop * 100) / 100, 308.7); assert.equal(w.rotation, -25);
  const still = fakeWorld(); createEngine(config({ character: { rotateOnJump: false } }), still.world, {}).step(); assert.equal(still.rotation, 0);
});

test('hitting the floor or ceiling ends the run once', () => {
  const w = fakeWorld(); let ended = 0; const engine = createEngine(config(), w.world, { onEnd: () => ended++ });
  w.birdTop = 739.5; assert.equal(engine.step(), false); assert.equal(engine.running, false); assert.equal(ended, 1);
  assert.equal(engine.step(), false); assert.equal(ended, 1);
});

test('pipes spawn on cadence, move at the stage speed and score when passed', () => {
  const w = fakeWorld({ pinned: true }); const scores = []; const stagesSeen = [];
  const engine = createEngine(config({ physics: { spawnEvery: 40 }, stages: [{ minScore: 0, speed: 5, gravity: 0.65 }, { minScore: 2, speed: 7, gravity: 0.75 }] }), w.world, { onScore: s => scores.push(s), onStage: i => stagesSeen.push(i) });
  assert.deepEqual(stagesSeen, [0]);
  for (let i = 0; i < 42; i++) engine.step(); // le spawn a lieu quand ticks > intervalle, soit au 42e pas
  assert.equal(w.pipes.length, 2); assert.equal(w.pipes[0].scoring, false); assert.equal(w.pipes[1].scoring, true);
  const before = w.pipes[0].left; engine.step(); assert.equal(before - w.pipes[0].left, 5);
  for (let i = 0; i < 400 && scores.length < 2; i++) engine.step();
  assert.deepEqual(scores, [1, 2]); assert.deepEqual(stagesSeen, [0, 1]); assert.equal(engine.stage, 1);
  const live = w.pipes.find(p => !p.removed); const x = live.left; engine.step(); assert.equal(x - live.left, 7);
  assert.ok(w.pipes.some(p => p.removed), 'off-screen pipes are removed');
});

test('hitbox scale decides collisions', () => {
  const run = hitboxScale => {
    const w = fakeWorld({ pinned: true, random: 0.134 }); let ended = false;
    const engine = createEngine(config({ physics: { spawnEvery: 40 }, character: { hitboxScale } }), w.world, { onEnd: () => { ended = true; } });
    for (let i = 0; i < 150 && engine.running; i++) engine.step();
    return { ended, score: engine.score };
  };
  assert.deepEqual(run(100), { ended: true, score: 0 });
  assert.deepEqual(run(80), { ended: false, score: 1 });
});
```

Run: `node --test tests/engine.test.mjs` → échec « Cannot find module ».

- [ ] **Step 2 : Créer `game/flappy/engine.mjs`**

```js
// Physique du Flappy Bird, sans DOM : `world` fournit les mesures et les mutations.
export function spawnInterval(spawnEvery, speed) { return Math.max(20, spawnEvery - (speed - 5) * 6); }
export function stageIndex(stages, score) {
  let index = 0;
  for (let i = 0; i < stages.length; i++) if (score >= stages[i].minScore) index = i;
  return index;
}
export function createEngine({ physics, stages, character }, world, hooks = {}) {
  let velocity = 0, score = 0, ticks = 0, stage = 0, running = true;
  let speed = stages[0].speed, gravity = stages[0].gravity;
  const pipes = [];
  hooks.onStage?.(0);
  const shrink = (character.hitboxScale ?? 100) / 100;
  function hitbox(rect) {
    const dx = rect.width * (1 - shrink) / 2, dy = rect.height * (1 - shrink) / 2;
    return { left: rect.left + dx, right: rect.right - dx, top: rect.top + dy, bottom: rect.bottom - dy };
  }
  function end() { if (!running) return; running = false; hooks.onEnd?.(score); }
  function jump() { if (running) velocity = -physics.jumpForce; }
  function step() {
    if (!running) return false;
    const raw = world.birdRect(); const bird = hitbox(raw);
    for (const pipe of [...pipes]) {
      const rect = pipe.rect();
      if (rect.right <= 0) { pipe.remove(); pipes.splice(pipes.indexOf(pipe), 1); continue; }
      if (bird.left < rect.right && bird.right > rect.left && bird.top < rect.bottom && bird.bottom > rect.top) { end(); return false; }
      if (pipe.scoring && rect.right < raw.left && rect.right + speed >= raw.left) {
        score++; hooks.onScore?.(score);
        const next = stageIndex(stages, score);
        if (next !== stage) { stage = next; speed = stages[stage].speed; gravity = stages[stage].gravity; hooks.onStage?.(stage); }
      }
      pipe.setLeft(rect.left - speed);
    }
    velocity += gravity;
    world.setBirdTop(world.birdRect().top + velocity);
    if (character.rotateOnJump) world.setBirdRotation(Math.max(-25, Math.min(90, velocity * 4)));
    const after = world.birdRect();
    if (after.top <= 0 || after.bottom >= world.floor()) { end(); return false; }
    if (ticks > spawnInterval(physics.spawnEvery, speed)) {
      ticks = 0;
      const position = Math.floor(world.random() * 60) + 8;
      pipes.push(world.createPipe('top', position - 70, false), world.createPipe('bottom', position + physics.gap, true));
    }
    ticks++;
    return true;
  }
  return { step, jump, end, get score() { return score; }, get running() { return running; }, get stage() { return stage; } };
}
export function domWorld(doc = document) {
  const bird = doc.querySelector('.bird'); const background = doc.querySelector('.background');
  return {
    birdRect: () => bird.getBoundingClientRect(),
    setBirdTop: px => { bird.style.top = px + 'px'; },
    setBirdRotation: deg => { bird.style.transform = `rotate(${deg}deg)`; },
    floor: () => background.getBoundingClientRect().bottom,
    random: Math.random,
    createPipe(kind, topVh, scoring = false) {
      const el = doc.createElement('div');
      el.className = `pipe_sprite pipe_sprite_${kind}`; el.style.top = topVh + 'vh'; el.style.left = '100vw';
      doc.body.appendChild(el);
      return { scoring, rect: () => el.getBoundingClientRect(), setLeft: px => { el.style.left = px + 'px'; }, remove: () => el.remove() };
    },
    clearPipes() { doc.querySelectorAll('.pipe_sprite').forEach(e => e.remove()); }
  };
}
```

- [ ] **Step 3 : Tests**

Run: `node --test tests/engine.test.mjs` → 5 PASS. Si « gravity, jump » échoue sur l'arrondi : la valeur attendue est `320 + 0.65 + (-12.6 + 0.65) = 308.7`.

- [ ] **Step 4 : Commit**

```bash
git add game/flappy/engine.mjs tests/engine.test.mjs
git commit -m "Add configurable flappy engine with injectable world adapter"
```

---
### Task 6 : Machine d'états, backends géré et historique, point d'entrée

**Files:**
- Create: `game/flappy/screens.mjs`
- Create: `legacy-crousty.mjs`
- Modify: `managed-game.mjs` (fichier entier remplacé)
- Modify: `main.js` (fichier entier remplacé)
- Modify: `scripts/build.cjs`, `scripts/dev.cjs`
- Test: `tests/browser.cjs`, `tests/studio-browser.cjs` (exécution, adaptation minimale)

**Interfaces:**
- Consumes: `applyTheme`, `readForm`, `setBackground` (Task 4) ; `createEngine`, `domWorld` (Task 5) ; `renderText`, `validateRegistration`, `stageBackground`, `normalizeFlappy` (Task 1) ; `getPath` ; `startFixedStepLoop`.
- Produces: `createFlappyGame({ campaign, backend, doc }) → { update(campaign), goto(screen) }`. Contrat backend : `{ unlimited?: boolean, register(player) → { gamesPlayed, highScore }, start() → { gamesPlayed, highScore }, finish(score) → { highScore, gamesPlayed }, leaderboard() → { players, me? } }` ; les erreurs levées portent un message affichable. `loadManagedGame(id) → { campaign, backend }`, `loadLegacyGame() → { campaign, backend }`.

- [ ] **Step 1 : Créer `game/flappy/screens.mjs`**

```js
import { renderText, validateRegistration, stageBackground } from '../../shared/flappy-config.mjs';
import { getPath } from '../../shared/validate.mjs';
import { applyTheme, readForm, setBackground } from './theme.mjs';
import { createEngine, domWorld } from './engine.mjs';
import { startFixedStepLoop } from '../../game-loop.mjs';

export function createFlappyGame({ campaign, backend, doc = document }) {
  const $ = id => doc.getElementById(id);
  const el = {
    bird: doc.querySelector('.bird'), message: $('welcomeScreen'), message2: doc.querySelector('.message2'),
    score: doc.querySelector('.score'), scoreTitle: doc.querySelector('.score_title'), scoreValue: doc.querySelector('.score_val'),
    login: $('loginBtn'), replay: $('replayBtn'), countdown: $('countdown'), countdownValue: $('countdownValue'),
    ranking: $('rankingScreen'), rankingTitle: $('rankingTitle'), rankingList: doc.querySelector('.ranking'), rankingStatus: $('rankingStatus'),
    rankingRetry: $('rankingRetry'), bestScore: $('bestScore'), ownRank: $('ownRank')
  };
  const world = domWorld(doc);
  let state = 'Start', registered = false, gamesPlayed = 0, bestScore = 0, playerName = '';
  let actionPending = false, scoreSave = Promise.resolve(), scoreSaved = true;
  let engine = null, loop = null, controls = null;

  const vars = (extra = {}) => ({ jeu: campaign.name, société: campaign.company, parties: campaign.maxGames, total: campaign.maxGames, places: campaign.flappy.leaderboard.places, score: bestScore, prenom: playerName, n: gamesPlayed, ...extra });
  const t = (path, extra) => renderText(getPath(campaign.flappy.screens, path), vars(extra));
  const limitReached = () => !backend.unlimited && gamesPlayed >= campaign.maxGames;

  function update(next) { campaign = next; applyTheme(campaign, vars(), doc); }
  update(campaign);

  function stopRun() { controls?.abort(); loop?.stop(); controls = null; loop = null; engine = null; }

  async function endGame(score) {
    bestScore = Math.max(bestScore, Number(score));
    const result = await backend.finish(Number(score));
    bestScore = result.highScore; scoreSaved = true;
  }
  async function ensureScoreSaved() { await scoreSave; if (!scoreSaved) await endGame(bestScore); }

  async function showLeaderboard() {
    const { players = [], me } = await backend.leaderboard();
    el.rankingList.replaceChildren();
    for (const [index, player] of players.entries()) {
      const li = doc.createElement('li'); li.textContent = `${index + 1}. ${player.displayName} — ${Number(player.highScore)} pts`; el.rankingList.append(li);
    }
    el.rankingStatus.textContent = players.length ? '' : t('ranking.empty');
    const show = !!me && campaign.flappy.leaderboard.showOwnRank;
    el.ownRank.hidden = !show; if (show) el.ownRank.textContent = `Ta place : ${me.rank} sur ${me.total}`;
  }
  async function displayFinalRanking() {
    state = 'ShowRanking'; stopRun();
    world.clearPipes(); el.bird.hidden = true; el.message.hidden = true; el.message2.textContent = ''; el.replay.style.display = 'none'; el.countdown.hidden = true;
    el.score.hidden = true; el.ranking.hidden = false; el.ownRank.hidden = true;
    el.bestScore.textContent = t('ranking.bestScore', { score: bestScore });
    el.rankingTitle.focus(); el.rankingRetry.hidden = true; el.rankingStatus.textContent = 'Enregistrement du score…';
    try {
      await ensureScoreSaved(); el.rankingStatus.textContent = 'Chargement du classement…'; await showLeaderboard();
    } catch (error) {
      console.error('Classement indisponible', error);
      el.rankingStatus.textContent = scoreSaved ? 'Impossible de charger le classement. Vérifie ta connexion puis réessaie.' : 'Ton score n’a pas encore pu être enregistré. Vérifie ta connexion puis réessaie.';
      el.rankingRetry.hidden = false;
    }
  }

  function finishGame() {
    if (state !== 'Play') return;
    state = 'End'; stopRun();
    const score = Number(el.scoreValue.textContent) || 0;
    el.message2.replaceChildren(t('gameOver.title'), doc.createElement('br'), t('gameOver.scoreLabel', { score }));
    // gamesPlayed inclut déjà la partie qui vient de se terminer.
    el.replay.textContent = limitReached() ? t('gameOver.seeRanking') : t('gameOver.replay');
    el.replay.style.display = 'block';
    scoreSaved = false;
    scoreSave = endGame(score).catch(error => console.error('Impossible de sauvegarder le score', error));
  }
  function play() {
    controls = new AbortController();
    engine = createEngine(campaign.flappy, world, {
      onScore: score => { el.scoreValue.textContent = String(score); new Audio('/sound/Coin.mp3').play().catch(() => {}); },
      onStage: index => setBackground(doc, stageBackground(campaign.flappy.stages, index)),
      onEnd: finishGame
    });
    loop = startFixedStepLoop(() => engine.step() && state === 'Play');
    doc.addEventListener('visibilitychange', loop.resetClock, { signal: controls.signal });
    doc.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); engine?.jump(); } }, { signal: controls.signal });
    doc.addEventListener('pointerdown', e => { if (!['input', 'button', 'label', 'select', 'option', 'textarea', 'a'].includes(e.target.tagName.toLowerCase())) engine?.jump(); }, { signal: controls.signal });
  }
  function startCountdown() {
    const seconds = campaign.countdownSeconds || 3;
    el.countdownValue.textContent = String(seconds); el.countdown.hidden = false;
    let ticks = 0; controls = new AbortController();
    loop = startFixedStepLoop(() => {
      ticks++;
      if (ticks >= seconds * 60) { stopRun(); el.countdown.hidden = true; state = 'Play'; play(); return false; }
      const remaining = String(seconds - Math.floor(ticks / 60));
      if (el.countdownValue.textContent !== remaining) el.countdownValue.textContent = remaining;
      return true;
    });
    doc.addEventListener('visibilitychange', loop.resetClock, { signal: controls.signal });
  }

  async function handleLoginAndStartGame() {
    if (state === 'ShowRanking') { await displayFinalRanking(); return; }
    if (state === 'Play' || state === 'Countdown') return;
    if (!registered) {
      let player;
      try { player = validateRegistration(campaign.flappy.form, readForm(doc)); } catch (error) { alert(error.message); return; }
      if (!$('consentGame').checked) { alert('Vous devez accepter le règlement du jeu pour participer.'); return; }
      const result = await backend.register({ ...player, consentGame: true, consentMarketing: $('consentMarketing').checked });
      registered = true; playerName = player.firstName; gamesPlayed = result.gamesPlayed; bestScore = result.highScore;
    }
    if (limitReached()) { await displayFinalRanking(); return; }
    await ensureScoreSaved();
    const started = await backend.start(); gamesPlayed = started.gamesPlayed; bestScore = started.highScore;
    world.clearPipes(); el.bird.style.top = ''; el.bird.style.transform = ''; el.bird.hidden = false;
    state = 'Countdown'; el.message.hidden = true; el.replay.style.display = 'none'; el.message2.textContent = '';
    el.scoreTitle.textContent = t('hud.roundLabel', { n: gamesPlayed, total: campaign.maxGames }); el.scoreValue.textContent = '0'; el.score.hidden = false;
    setBackground(doc, stageBackground(campaign.flappy.stages, 0));
    startCountdown();
  }
  async function requestStart() {
    if (actionPending || state === 'Play' || state === 'Countdown') return;
    actionPending = true; el.login.disabled = true; el.replay.disabled = true; el.rankingRetry.disabled = true;
    try { await handleLoginAndStartGame(); }
    catch (error) { console.error(error); alert(error.message || 'Connexion impossible. Réessaie dans un instant.'); }
    finally { actionPending = false; el.login.disabled = false; el.replay.disabled = false; el.rankingRetry.disabled = false; }
  }
  el.login.addEventListener('click', requestStart);
  el.replay.addEventListener('click', requestStart);
  el.rankingRetry.addEventListener('click', requestStart);
  doc.addEventListener('keydown', async e => { if (e.key === 'Enter' && state !== 'Play') { e.preventDefault(); if (!e.repeat) await requestStart(); } });

  function resetToWelcome() {
    stopRun(); state = 'Start'; world.clearPipes();
    el.bird.hidden = false; el.bird.style.top = ''; el.bird.style.transform = '';
    el.message.hidden = false; el.message2.textContent = ''; el.replay.style.display = 'none';
    el.score.hidden = false; el.scoreTitle.textContent = ''; el.scoreValue.textContent = '';
    el.ranking.hidden = true; el.countdown.hidden = true;
    setBackground(doc, stageBackground(campaign.flappy.stages, 0));
  }
  function goto(screen) {
    if (screen === 'welcome') return resetToWelcome();
    if (screen === 'countdown') { resetToWelcome(); el.message.hidden = true; el.countdown.hidden = false; el.countdownValue.textContent = String(campaign.countdownSeconds); return; }
    if (screen === 'gameOver') {
      resetToWelcome(); el.message.hidden = true; state = 'End';
      el.scoreTitle.textContent = t('hud.roundLabel', { n: 1, total: campaign.maxGames }); el.scoreValue.textContent = '12';
      el.message2.replaceChildren(t('gameOver.title'), doc.createElement('br'), t('gameOver.scoreLabel', { score: 12 }));
      el.replay.textContent = t('gameOver.replay'); el.replay.style.display = 'block'; return;
    }
    if (screen === 'ranking') { bestScore = bestScore || 12; scoreSaved = true; displayFinalRanking(); }
  }
  return { update, goto };
}
```

- [ ] **Step 2 : Remplacer `managed-game.mjs`**

```js
export async function loadManagedGame(id) {
  let token = '', runId = '', startRequestId = '';
  async function request(action, data) {
    const response = await fetch(`/api/game?id=${encodeURIComponent(id)}&action=${action}`, {
      method: data ? 'POST' : 'GET', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Ce jeu est momentanément indisponible.');
    return result;
  }
  let campaign;
  try {
    const result = await request('config');
    campaign = result.game;
    if (!result.open) throw new Error('Cette campagne n’est pas ouverte aux participations.');
  } catch (error) {
    const welcome = document.querySelector('.message');
    welcome.replaceChildren();
    const title = document.createElement('h1'); title.textContent = 'Jeu indisponible';
    const details = document.createElement('p'); details.textContent = error.message;
    const retry = document.createElement('button'); retry.textContent = 'Réessayer'; retry.addEventListener('click', () => location.reload());
    welcome.append(title, details, retry);
    document.querySelector('.bird').hidden = true;
    throw error;
  }
  return { campaign, backend: {
    async register(player) { const result = await request('register', player); token = result.token; return result; },
    async start() {
      if (!startRequestId) startRequestId = crypto.randomUUID();
      const result = await request('start', { requestId: startRequestId });
      runId = result.runId; startRequestId = ''; return result;
    },
    finish(score) { return request('finish', { runId, score }); },
    leaderboard() { return request('leaderboard'); }
  } };
}
```

- [ ] **Step 3 : Créer `legacy-crousty.mjs`**

```js
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
```

- [ ] **Step 4 : Remplacer `main.js`**

```js
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
```

- [ ] **Step 5 : Servir les nouveaux fichiers**

`scripts/build.cjs` : ajouter `'legacy-crousty.mjs', 'game'` à la liste copiée.
`scripts/dev.cjs` : ajouter `'legacy-crousty.mjs', 'game'` à `publicPaths`.

- [ ] **Step 6 : Créer un `game/flappy/preview.mjs` minimal (complété en Task 7)**

```js
export function createPreview() { throw new Error('Aperçu indisponible.'); }
```

- [ ] **Step 7 : Tests unitaires + navigateur**

Run: `npm test` → PASS.
Run: `npm run build` → OK, `dist/game/flappy/*.mjs` présent.
Run: `node tests/browser.cjs` (si Playwright disponible). Attendu : PASS pour les 3 résolutions. Le test lit `.ranking li` (10 entrées), `#replayBtn` (`style.display === 'block'`, libellés `REJOUER` / `VOIR LE CLASSEMENT`), `#countdownValue`, `.bird` immobile pendant le compte à rebours : tout est conservé. Si un sélecteur du formulaire échoue, vérifier que `buildForm` produit bien `#firstName #lastName #email #phone`.
Run: `node tests/studio-browser.cjs` : le scénario admin échouera sur `#birdUrl` (l'admin n'est pas encore migré) — attendu, corrigé en Task 12/13. Ne pas l'adapter ici.

- [ ] **Step 8 : Commit**

```bash
git add main.js managed-game.mjs legacy-crousty.mjs game/flappy/screens.mjs game/flappy/preview.mjs scripts/build.cjs scripts/dev.cjs
git commit -m "Split the game into theme, engine and screens behind a backend interface"
```

---

### Task 7 : Mode aperçu (`game/flappy/preview.mjs`)

**Files:**
- Modify: `game/flappy/preview.mjs` (remplace le stub)

**Interfaces:**
- Consumes: `DEFAULT_GAME`, `normalizeGame` (Task 2) ; `createFlappyGame().update/goto` (Task 6).
- Produces: `createPreview() → { campaign, backend, connect(game) }`. Messages acceptés (même origine uniquement) : `{ type: 'flappy:config', game }`, `{ type: 'flappy:goto', screen }`. Message émis vers `opener`/`parent` : `{ type: 'flappy:ready' }`.

- [ ] **Step 1 : Écrire `game/flappy/preview.mjs`**

```js
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
```

- [ ] **Step 2 : Vérification manuelle**

Run: `npm run dev`, ouvrir `http://127.0.0.1:3000/index.html?preview=1` : bandeau « APERÇU » visible, formulaire avec 4 champs, on peut jouer sans limite (le bouton reste `REJOUER`). Dans la console : `postMessage({ type: 'flappy:goto', screen: 'ranking' }, location.origin)` affiche le classement factice avec « Ta place : 4 sur 27 » ; `postMessage({ type: 'flappy:config', game: { name: 'Test', maxGames: 2, flappy: { brand: { accent: '#ff0000' } } } }, location.origin)` change le titre et la couleur du compte à rebours.

- [ ] **Step 3 : Commit**

```bash
git add game/flappy/preview.mjs
git commit -m "Add preview mode driven by postMessage with a simulated backend"
```

---
### Task 8 : Admin — structure HTML et styles (navigation JEUX, éditeur en sections, aperçu iframe)

**Files:**
- Modify: `admin/index.html` (fichier entier remplacé)
- Modify: `admin/studio.css` (ajouts en fin de fichier)

**Interfaces:**
- Produces (ids/attributs consommés par Task 9) : sidebar `#navGames` (`data-type=""`), `#navTypes`, `#navLegacy` ; dashboard `#dashboardEyebrow #dashboardTitle #dashboardIntro` ; éditeur `#editorType`, `#openPreview`, nav `.editor-nav button[data-tab]` (general, brand, welcome, character, stages, obstacles, gameplay, ending, rules, emails, data), conteneurs `#brandUploads #characterUploads #obstacleUploads #legalUploads #stagesList #addStage #customFieldsList #addCustomField #obstacleColors #fontSelect #physicsHelp #participantsHead`, boutons `[data-reset]`, `[data-goto]`, `#previewFrame`, `#phonePreview` ; dialogue `#typeOptions`. Inputs nommés par chemin (`name="flappy.theme.font"`, `output[data-output]`).

**Important :** entre ce commit et celui de Task 9, l'admin ne fonctionne pas (l'ancien `studio.js` cible d'anciens ids). Enchaîner les deux tâches.

- [ ] **Step 1 : Remplacer `admin/index.html`**

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>myPicBooth · Game Studio</title>
  <link rel="stylesheet" href="/admin/studio.css">
  <script type="module" src="/admin/studio.js"></script>
</head>
<body>
  <section id="login" class="login-layout">
    <div class="login-art">
      <a class="wordmark" href="/admin/">myPicBooth<span>GAME STUDIO</span></a>
      <div class="art-copy"><span class="eyebrow">DE LA MARQUE AU JEU.</span><h1>De petites parties.<br>De grandes<br><em>rencontres.</em></h1><p>Un espace pour imaginer, personnaliser et piloter vos expériences de jeu.</p></div>
      <div class="art-game" aria-hidden="true"><span class="art-bird">↗</span><i></i><i></i><i></i></div>
      <span class="art-footer">VOS MARQUES. VOS RÈGLES. VOS JEUX.</span>
    </div>
    <div class="login-form-wrap"><form id="loginForm" class="login-form">
      <span class="eyebrow">ESPACE ADMINISTRATEUR</span><h2>Bienvenue au studio.</h2><p>Connectez-vous pour retrouver vos jeux et vos campagnes.</p>
      <label>Adresse email<input id="adminEmail" type="email" autocomplete="username" value="contact@mypicbooth.com" required></label>
      <label>Mot de passe<input id="adminPassword" type="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit">Se connecter <span>→</span></button>
      <div class="login-divider">ou</div><button id="googleLogin" class="secondary" type="button">Continuer avec Google</button>
      <p id="loginStatus" class="feedback" role="status"></p><p class="small-note">Accès réservé aux comptes autorisés par myPicBooth.</p>
    </form></div>
  </section>

  <div id="studio" class="app-shell" hidden>
    <aside class="sidebar">
      <a class="wordmark" href="/admin/">myPicBooth<span>GAME STUDIO</span></a>
      <span class="nav-label">ESPACE DE TRAVAIL</span>
      <button id="navGames" class="nav-item active" data-type=""><span>▦</span> Tableau de bord</button>
      <span class="nav-label">JEUX</span>
      <div id="navTypes"></div>
      <span class="nav-label">HISTORIQUE</span>
      <button id="navLegacy" class="nav-item"><span>↗</span> Participants Crousty</button>
      <div class="sidebar-bottom"><span class="avatar">mP</span><div><strong>Administration</strong><small id="accountEmail"></small></div><button id="logout" title="Se déconnecter" aria-label="Se déconnecter">↪</button></div>
    </aside>
    <main>
      <header class="topbar"><span>Votre espace créatif</span><span class="workspace-chip"><i></i> myPicBooth</span></header>
      <p id="globalStatus" class="global-status" role="status" hidden></p>

      <section id="dashboard" class="page">
        <div class="page-heading"><div><span class="eyebrow" id="dashboardEyebrow">VOTRE COLLECTION</span><h1 id="dashboardTitle">À vous de jouer.</h1><p id="dashboardIntro">Chaque marque a son univers. Donnez-lui son jeu.</p></div><button id="newGame" class="primary">＋ Créer un jeu</button></div>
        <div class="stats-row"><div><span>Total des jeux</span><strong id="totalGames">0</strong></div><div><span>En ligne</span><strong id="publishedGames">0</strong></div><div><span>En préparation</span><strong id="draftGames">0</strong></div></div>
        <div class="collection-heading"><h2>Mes jeux <span id="gameCount"></span></h2><label class="search-label"><span class="sr-only">Rechercher un jeu</span><input id="gameSearch" type="search" placeholder="Rechercher une marque, un jeu…"></label></div>
        <div id="gameGrid" class="game-grid"></div>
        <div id="emptyState" class="empty-state" hidden><span class="empty-icon">↗</span><h2>Votre prochain jeu commence ici.</h2><p>Choisissez un type de jeu, ajoutez votre marque et préparez votre première campagne.</p><button id="emptyNewGame" class="primary">Créer mon premier jeu</button></div>
      </section>

      <section id="editor" class="page" hidden>
        <button id="backGames" class="back-button">← Tous les jeux</button>
        <div class="page-heading editor-heading"><div><span class="eyebrow">ATELIER DE CRÉATION · <span id="editorType"></span></span><h1 id="editorTitle">Créer un jeu</h1></div><div class="actions"><button id="duplicateGame" class="secondary" hidden>Dupliquer</button><button id="openPreview" class="secondary" type="button">Aperçu en grand ↗</button><button id="openGame" class="secondary" hidden>Ouvrir le jeu ↗</button><button id="saveGame" class="primary" form="gameForm" type="submit">Enregistrer</button></div></div>
        <div class="editor-layout">
          <nav class="editor-nav" aria-label="Réglages du jeu">
            <button type="button" class="active" data-tab="general">01 · Campagne</button>
            <button type="button" data-tab="brand">02 · Marque & thème</button>
            <button type="button" data-tab="welcome">03 · Accueil & formulaire</button>
            <button type="button" data-tab="character">04 · Personnage</button>
            <button type="button" data-tab="stages">05 · Décors & paliers</button>
            <button type="button" data-tab="obstacles">06 · Obstacles</button>
            <button type="button" data-tab="gameplay">07 · Gameplay</button>
            <button type="button" data-tab="ending">08 · Fin & classement</button>
            <button type="button" data-tab="rules">09 · Règles</button>
            <button type="button" data-tab="emails">10 · Email</button>
            <button type="button" data-tab="data">Participants</button>
          </nav>
          <div class="editor-main">
            <form id="gameForm">
              <section class="editor-panel" data-panel="general"><span class="eyebrow">LE POINT DE DÉPART</span><h2>Une marque, une expérience.</h2><p class="panel-intro">Les informations qui donneront vie à votre campagne.</p>
                <div class="field-grid"><label>Nom du jeu<input name="name" required maxlength="200" placeholder="Ex. L’envol Crousty"></label><label>Société organisatrice<input name="company" maxlength="200" placeholder="Ex. Crousty"></label></div>
                <div class="field-grid"><label>Début de campagne<input name="startsAt" type="datetime-local"></label><label>Fin de campagne<input name="endsAt" type="datetime-local"></label></div>
                <label>État de la campagne<select name="status"><option value="draft">Brouillon — visible dans l’administration</option><option value="published">Publié — accessible aux participants</option><option value="paused">En pause — nouvelles parties fermées</option></select></label>
                <div class="info-box">Avant publication, ajoutez le règlement et la politique de confidentialité de la société dans la section Règles.</div>
              </section>

              <section class="editor-panel" data-panel="brand" hidden><span class="eyebrow">VOTRE IDENTITÉ</span><h2>Marque & thème.</h2><p class="panel-intro">Logo, couleurs et typographie appliqués à tous les écrans du jeu.</p>
                <div class="upload-grid" id="brandUploads"></div>
                <div class="field-grid"><label>Couleur d’accent<input name="flappy.brand.accent" type="color"></label><label>Police<select name="flappy.theme.font" id="fontSelect"></select></label></div>
                <h3>Panneau d’accueil</h3><div class="field-grid"><label>Fond du panneau<input name="flappy.theme.panelBg" type="color"></label><label>Texte du panneau<input name="flappy.theme.panelText" type="color"></label></div>
                <h3>Boutons</h3><div class="field-grid"><label>Fond des boutons<input name="flappy.theme.buttonBg" type="color"></label><label>Texte des boutons<input name="flappy.theme.buttonText" type="color"></label></div>
                <h3>Score et classement</h3><div class="field-grid"><label>Couleur du score en jeu<input name="flappy.theme.hudText" type="color"></label><label>Voile du classement<input name="flappy.theme.overlayColor" type="color"></label></div>
                <label>Opacité du voile (%)<input name="flappy.theme.overlayOpacity" type="range" min="0" max="100" step="1"><output data-output="flappy.theme.overlayOpacity"></output></label>
                <button type="button" class="link-button reset-section" data-reset="brand">Réinitialiser cette section</button>
              </section>

              <section class="editor-panel" data-panel="welcome" hidden><span class="eyebrow">PREMIER CONTACT</span><h2>Accueil & formulaire.</h2><p class="panel-intro">Ce que le participant lit avant de jouer, et ce qu’il vous confie.</p>
                <label>Titre (vide : le nom du jeu)<input name="flappy.screens.welcome.title" maxlength="200"></label>
                <label>Message d’accueil<input name="flappy.screens.welcome.subtitle" maxlength="200"></label>
                <div class="field-grid"><label>Bouton<input name="flappy.screens.welcome.button" maxlength="200"></label><label>Texte sous le bouton<input name="flappy.screens.welcome.info" maxlength="200"></label></div>
                <p class="field-help">Variables : <code>{{jeu}}</code>, <code>{{société}}</code>, <code>{{parties}}</code>.</p>
                <h3>Champs du formulaire</h3>
                <div class="table-wrap"><table class="fields-table"><thead><tr><th>Champ</th><th>Visible</th><th>Obligatoire</th><th>Libellé</th></tr></thead><tbody>
                  <tr><td>Prénom</td><td><input type="checkbox" name="flappy.form.fields.firstName.visible"></td><td><input type="checkbox" name="flappy.form.fields.firstName.required"></td><td><input name="flappy.form.fields.firstName.label" maxlength="80"></td></tr>
                  <tr><td>Nom</td><td><input type="checkbox" name="flappy.form.fields.lastName.visible"></td><td><input type="checkbox" name="flappy.form.fields.lastName.required"></td><td><input name="flappy.form.fields.lastName.label" maxlength="80"></td></tr>
                  <tr><td>E-mail</td><td><input type="checkbox" name="flappy.form.fields.email.visible" checked disabled></td><td><input type="checkbox" name="flappy.form.fields.email.required" checked disabled></td><td><input name="flappy.form.fields.email.label" maxlength="80"></td></tr>
                  <tr><td>Téléphone</td><td><input type="checkbox" name="flappy.form.fields.phone.visible"></td><td><input type="checkbox" name="flappy.form.fields.phone.required"></td><td><input name="flappy.form.fields.phone.label" maxlength="80"></td></tr>
                </tbody></table></div>
                <p class="field-help">L’e-mail reste obligatoire : il sert de clé pour la limite de parties.</p>
                <h3>Champs personnalisés</h3>
                <div id="customFieldsList" class="list"></div>
                <button type="button" id="addCustomField" class="secondary">＋ Ajouter un champ</button>
                <p class="field-help">5 champs maximum. Les réponses apparaissent dans la liste des participants et l’export CSV.</p>
                <button type="button" class="link-button reset-section" data-reset="welcome">Réinitialiser cette section</button>
              </section>

              <section class="editor-panel" data-panel="character" hidden><span class="eyebrow">LE HÉROS</span><h2>Personnage.</h2><p class="panel-intro">Une image PNG ou WebP au fond transparent donne le meilleur résultat.</p>
                <div class="upload-grid" id="characterUploads"></div>
                <label>Taille (px)<input name="flappy.character.size" type="range" min="32" max="120" step="1"><output data-output="flappy.character.size"></output></label>
                <div class="field-grid"><label>Position horizontale (% de la largeur)<input name="flappy.character.startX" type="number" min="5" max="40" step="1"></label><label>Hauteur de départ (% de la hauteur)<input name="flappy.character.startY" type="number" min="20" max="70" step="1"></label></div>
                <label class="switch-line"><input name="flappy.character.rotateOnJump" type="checkbox"><span><strong>Incliner le personnage</strong><small>Il pique du nez en tombant et se redresse au saut.</small></span></label>
                <label>Zone de collision (% de l’image)<input name="flappy.character.hitboxScale" type="range" min="60" max="100" step="1"><output data-output="flappy.character.hitboxScale"></output></label>
                <p class="field-help">Réduire la zone de collision rend le jeu plus tolérant autour des bords transparents de l’image.</p>
                <button type="button" class="link-button reset-section" data-reset="character">Réinitialiser cette section</button>
              </section>

              <section class="editor-panel" data-panel="stages" hidden><span class="eyebrow">L’UNIVERS</span><h2>Décors & paliers.</h2><p class="panel-intro">Le décor change à chaque palier de score. Vitesse et gravité suivent la difficulté choisie dans Gameplay.</p>
                <div id="stagesList" class="list"></div>
                <button type="button" id="addStage" class="secondary">＋ Ajouter un palier</button>
                <p class="field-help">Un palier sans fond reprend le fond précédent, ou le décor par défaut.</p>
                <button type="button" class="link-button reset-section" data-reset="stages">Réinitialiser cette section</button>
              </section>

              <section class="editor-panel" data-panel="obstacles" hidden><span class="eyebrow">LES OBSTACLES</span><h2>Obstacles.</h2><p class="panel-intro">Des tuyaux en dégradé, ou vos propres images.</p>
                <div class="radio-row"><label class="template-option radio-option"><input type="radio" name="flappy.obstacles.style" value="gradient"><div><strong>Dégradé de couleurs</strong><small>Deux couleurs et une bordure.</small></div></label><label class="template-option radio-option"><input type="radio" name="flappy.obstacles.style" value="image"><div><strong>Images</strong><small>Une image pour le haut, une pour le bas.</small></div></label></div>
                <div id="obstacleColors"><div class="field-grid"><label>Couleur principale<input name="flappy.obstacles.colorA" type="color"></label><label>Couleur de reflet<input name="flappy.obstacles.colorB" type="color"></label></div><label>Bordure<input name="flappy.obstacles.border" type="color"></label></div>
                <div class="upload-grid" id="obstacleUploads"></div>
                <div class="field-grid"><label>Largeur (% de la largeur d’écran)<input name="flappy.obstacles.width" type="number" min="8" max="25" step="1"></label><label>Arrondi des coins (px)<input name="flappy.obstacles.radius" type="number" min="0" max="30" step="1"></label></div>
                <button type="button" class="link-button reset-section" data-reset="obstacles">Réinitialiser cette section</button>
              </section>

              <section class="editor-panel" data-panel="gameplay" hidden><span class="eyebrow">LE RYTHME</span><h2>Gameplay.</h2><p class="panel-intro">Adaptez la difficulté à votre événement.</p>
                <label>Difficulté<select name="flappy.physics.preset"><option value="easy">Accessible — obstacles plus espacés</option><option value="normal">Classique — rythme actuel</option><option value="hard">Soutenu — un peu plus de challenge</option><option value="custom">Personnalisé — réglages libres</option></select></label>
                <div class="field-grid three"><label>Force de saut<input name="flappy.physics.jumpForce" type="number" min="6" max="20" step="0.1"></label><label>Écart entre les obstacles (% hauteur)<input name="flappy.physics.gap" type="number" min="20" max="45" step="1"></label><label>Intervalle entre obstacles (ticks)<input name="flappy.physics.spawnEvery" type="number" min="40" max="200" step="1"></label></div>
                <p class="field-help" id="physicsHelp"></p>
                <h3>Compte à rebours</h3>
                <div class="field-grid"><label>Durée (secondes)<input name="countdownSeconds" type="number" min="1" max="5" required></label><label>Titre<input name="flappy.screens.countdown.title" maxlength="200"></label></div>
                <div class="field-grid"><label>Consigne<input name="flappy.screens.countdown.hint" maxlength="200"></label><label>Consigne sur ordinateur<input name="flappy.screens.countdown.hintDesktop" maxlength="200"></label></div>
                <button type="button" class="link-button reset-section" data-reset="gameplay">Réinitialiser cette section</button>
              </section>

              <section class="editor-panel" data-panel="ending" hidden><span class="eyebrow">LE DERNIER ÉCRAN</span><h2>Fin de partie & classement.</h2><p class="panel-intro">Les textes affichés pendant et après la partie.</p>
                <h3>Pendant la partie</h3><label>Libellé de la manche<input name="flappy.screens.hud.roundLabel" maxlength="200"></label><p class="field-help">Variables : <code>{{n}}</code>, <code>{{total}}</code>.</p>
                <h3>Game over</h3>
                <div class="field-grid"><label>Titre<input name="flappy.screens.gameOver.title" maxlength="200"></label><label>Score<input name="flappy.screens.gameOver.scoreLabel" maxlength="200"></label></div>
                <div class="field-grid"><label>Bouton rejouer<input name="flappy.screens.gameOver.replay" maxlength="200"></label><label>Bouton vers le classement<input name="flappy.screens.gameOver.seeRanking" maxlength="200"></label></div>
                <h3>Classement</h3>
                <div class="field-grid"><label>Titre<input name="flappy.screens.ranking.title" maxlength="200"></label><label>Meilleur score<input name="flappy.screens.ranking.bestScore" maxlength="200"></label></div>
                <label>Légende<input name="flappy.screens.ranking.caption" maxlength="200"></label>
                <label>Texte sans score<input name="flappy.screens.ranking.empty" maxlength="200"></label>
                <div class="field-grid three"><label>Nombre de places<input name="flappy.leaderboard.places" type="number" min="3" max="50" step="1"></label><label>Affichage des noms<select name="flappy.leaderboard.nameFormat"><option value="firstInitial">Prénom + initiale (Camille T.)</option><option value="first">Prénom seul</option><option value="full">Prénom et nom</option></select></label><label class="inline-check tall"><input type="checkbox" name="flappy.leaderboard.showOwnRank"> Afficher le rang du joueur</label></div>
                <div class="field-grid"><label>Bouton sous le classement (facultatif)<input name="flappy.screens.ranking.ctaLabel" maxlength="200" placeholder="Ex. Découvrir nos offres"></label><label>Lien du bouton<input name="flappy.screens.ranking.ctaUrl" type="url" placeholder="https://"></label></div>
                <p class="field-help">Variables : <code>{{jeu}}</code>, <code>{{société}}</code>, <code>{{parties}}</code>, <code>{{places}}</code>, <code>{{score}}</code>, <code>{{prenom}}</code>.</p>
                <button type="button" class="link-button reset-section" data-reset="ending">Réinitialiser cette section</button>
              </section>

              <section class="editor-panel" data-panel="rules" hidden><span class="eyebrow">LES RÈGLES DU JEU</span><h2>À chaque campagne, ses règles.</h2><p class="panel-intro">Nombre de tentatives et documents légaux.</p>
                <label>Parties par adresse email<input name="maxGames" type="number" min="1" max="10" required></label>
                <p class="field-help">La limite est conservée après un rechargement. Elle s’applique à l’adresse email déclarée ; elle ne vérifie pas l’identité de la personne.</p>
                <h3>Documents de la société</h3><div id="legalUploads" class="upload-grid"></div>
                <label>Texte du consentement marketing<textarea name="marketingLabel" rows="3" maxlength="200"></textarea></label><p class="field-help">Le consentement marketing reste facultatif et séparé de l’acceptation du règlement.</p>
              </section>

              <section class="editor-panel" data-panel="emails" hidden><span class="eyebrow">LE DERNIER MOT</span><h2>Prolongez le souvenir.</h2><p class="panel-intro">Un récapitulatif envoyé au participant après sa dernière partie.</p>
                <label class="switch-line"><input name="emailsEnabled" type="checkbox"><span><strong>Envoyer le meilleur score par email</strong><small>Un récapitulatif par participant, à la fin de ses tentatives.</small></span></label>
                <p id="emailSetup" class="info-box"></p><label>Objet de l’email<input name="emailSubject" maxlength="200"></label><label>Message<textarea name="emailBody" rows="10" maxlength="5000"></textarea></label>
                <p class="field-help">Personnalisation disponible : <code>{{prenom}}</code>, <code>{{score}}</code>, <code>{{jeu}}</code>.</p>
                <div class="email-preview"><span class="eyebrow">APERÇU DU MESSAGE</span><strong id="emailPreviewSubject"></strong><pre id="emailPreviewBody"></pre></div>
              </section>
            </form>

            <section class="editor-panel" data-panel="data" hidden><div class="collection-heading"><div><h2>Les participants</h2><p class="panel-intro" id="participantCount"></p></div><button id="exportCsv" class="secondary">Exporter CSV ↓</button></div>
              <div class="data-filters"><input id="participantSearch" type="search" placeholder="Nom, email, téléphone…" aria-label="Rechercher un participant"><label class="inline-check"><input id="marketingOnly" type="checkbox"> Consentement marketing uniquement</label></div>
              <div class="table-wrap"><table><thead id="participantsHead"></thead><tbody id="participantsBody"></tbody></table></div><p id="dataStatus" role="status"></p>
            </section>
          </div>

          <aside class="preview-aside">
            <div class="preview-label"><span>APERÇU EN DIRECT</span><span class="preview-dot"></span></div>
            <div class="preview-toolbar"><button type="button" data-goto="welcome">Accueil</button><button type="button" data-goto="countdown">Décompte</button><button type="button" data-goto="gameOver">Game over</button><button type="button" data-goto="ranking">Classement</button></div>
            <div class="phone-preview" id="phonePreview"><iframe id="previewFrame" src="/index.html?preview=1" title="Aperçu du jeu"></iframe></div>
            <p class="preview-note">L’aperçu suit vos modifications sans les enregistrer.<br>Parties illimitées, scores non enregistrés.</p>
          </aside>
        </div>
      </section>
    </main>
  </div>

  <dialog id="newGameDialog"><form id="createGameForm"><button type="button" id="closeNewGame" class="dialog-close" aria-label="Fermer">×</button><span class="eyebrow">NOUVELLE EXPÉRIENCE</span><h2>Quel sera votre prochain jeu ?</h2><p>Choisissez un type de jeu, puis personnalisez chaque détail.</p><label>Nom du jeu<input id="newGameName" placeholder="Ex. L’envol Crousty" required maxlength="200"></label><label>Société<input id="newGameCompany" placeholder="Nom de la marque" maxlength="200"></label><div id="typeOptions"></div><button type="submit" class="primary">Créer et personnaliser →</button><p id="createStatus" role="status"></p></form></dialog>
</body>
</html>
```

- [ ] **Step 2 : Ajouter en fin de `admin/studio.css`**

```css
.nav-count{margin-left:auto;font-style:normal;font-size:10px;color:var(--muted)}
.badge.type{left:auto;right:14px;background:#1d2b22;color:#d7f57b}
.editor-layout{grid-template-columns:170px minmax(0,1fr) 300px}
.editor-nav{display:flex;flex-direction:column;gap:2px;align-self:start;position:sticky;top:20px}
.editor-nav button{background:none;border:0;border-left:2px solid transparent;text-align:left;padding:10px 12px;font-size:11px;color:var(--muted);border-radius:0 8px 8px 0}
.editor-nav button.active{border-left-color:var(--forest);color:var(--forest);font-weight:700;background:#eef2e6}
.editor-nav button.has-error::after{content:'●';color:var(--danger);margin-left:6px}
.editor-panel{border-top:1px solid var(--line);border-radius:12px}
.field-grid.three{grid-template-columns:1fr 1fr 1fr}
.list{display:grid;gap:14px;margin-bottom:14px}
.list-item{border:1px solid var(--line);border-radius:10px;padding:16px;background:#fafbf7}
.list-item .field-grid{gap:14px}.list-item label{margin-bottom:12px}
.list-item-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:13px}
.link-button{border:0;background:none;color:var(--forest);font-size:11px;font-weight:700;padding:4px 6px}
.link-button.danger{color:var(--danger)}.link-button:disabled{opacity:.35}
.reset-section{display:block;margin-top:20px;color:var(--muted)}
.field-error{margin:-14px 0 18px;font-size:11px;color:var(--danger)}
.fields-table td,.fields-table th{padding:10px 8px;vertical-align:middle}.fields-table input:not([type=checkbox]){margin-top:0;min-height:38px;font-size:12px}
.radio-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.radio-option{cursor:pointer;margin-bottom:0}.radio-option input{margin:0;flex:none}
.inline-check.tall{align-self:end;padding-bottom:14px}
output{display:inline-block;margin-left:10px;font-size:12px;color:var(--muted);min-width:32px}
input[type=range]{display:inline-block;width:calc(100% - 60px);min-height:0;padding:0;border:0;margin-top:14px;vertical-align:middle}
.preview-toolbar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px}.preview-toolbar button{flex:1;border:1px solid var(--line);background:#fff;border-radius:6px;font-size:10px;padding:6px 4px}
.phone-preview{position:relative;overflow:hidden;border:6px solid #293e32;border-radius:32px;background:#000;height:600px}
#previewFrame{width:390px;height:780px;border:0;display:block;transform-origin:top left}
#typeOptions .template-option{margin-top:14px}
@media(max-width:1150px){.editor-layout{grid-template-columns:minmax(0,1fr)}.editor-nav{flex-direction:row;overflow-x:auto;position:static;border-bottom:1px solid var(--line);margin-bottom:0}.editor-nav button{white-space:nowrap;border-left:0;border-bottom:2px solid transparent;border-radius:0}.editor-nav button.active{border-bottom-color:var(--forest);background:none}.editor-panel{border-top:0;border-radius:0 0 12px 12px}.preview-aside{display:none}.field-grid.three{grid-template-columns:1fr}.radio-row{grid-template-columns:1fr}}
@media(max-width:700px){.list-item .field-grid{grid-template-columns:1fr}}
```

- [ ] **Step 3 : Commit**

```bash
git add admin/index.html admin/studio.css
git commit -m "Restructure admin markup: JEUX navigation, sectioned editor and live preview frame"
```

---
### Task 9 : Admin — logique complète (`admin/studio.js`)

**Files:**
- Modify: `admin/studio.js` (fichier entier remplacé)

**Interfaces:**
- Consumes: `DEFAULT_GAME`, `normalizeGame`, `participantCsv`, `customFieldsOf` (Task 2) ; `GAME_TYPES`, `gameType` ; `FONTS` ; `getPath`, `setPath` ; les ids/attributs de Task 8 ; l'API admin (`games` renvoie des jeux normalisés avec `flappy`, `save` renvoie `path` sur erreur 400) ; le protocole aperçu de Task 7 (`flappy:ready`, `flappy:config`, `flappy:goto`).
- Produces: le comportement admin complet.

- [ ] **Step 1 : Remplacer `admin/studio.js`**

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { DEFAULT_GAME, normalizeGame, participantCsv, customFieldsOf } from '/shared/game-config.mjs';
import { GAME_TYPES, gameType } from '/shared/game-types.mjs';
import { FONTS } from '/shared/flappy-config.mjs';
import { getPath, setPath } from '/shared/validate.mjs';

const app = initializeApp({ apiKey: 'AIzaSyAGu61hEih85vRpKUN0zXOrVmOFXR-WQls', authDomain: 'crousty-game-b9c17.firebaseapp.com', projectId: 'crousty-game-b9c17', appId: '1:1032243559819:web:2d547412cee8932087038e' });
const auth = getAuth(app);
const $ = id => document.getElementById(id);
const form = $('gameForm');
let games = [], current = null, participants = [], emailReady = false, gameOrigin = 'https://crousty-game.vercel.app';
let dirty = false, activeTab = 'general', activeType = '', loading = false, uploadCount = 0, uploadSeq = 0, authGeneration = 0, previewTimer;
const editorState = { stages: [], customFields: [] };
const previewTargets = new Set();

function status(message, error = false) {
  $('globalStatus').textContent = message; $('globalStatus').classList.toggle('error', error); $('globalStatus').hidden = !message;
}
async function api(action, { id, method = 'GET', data, participant } = {}) {
  if (!auth.currentUser) throw new Error('Connectez-vous pour continuer.');
  const token = await auth.currentUser.getIdToken();
  const query = new URLSearchParams({ action });
  if (id) query.set('id', id); if (participant) query.set('participant', participant);
  const response = await fetch('/api/admin?' + query, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'Une erreur est survenue.'); error.path = result.path || ''; throw error; }
  return result;
}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssUrl = value => value ? `url(${JSON.stringify(value)})` : '';
const typeOf = game => gameType(game?.type || 'flappy');

// ---------- Connexion ----------
function loginError(error) {
  const messages = { 'auth/invalid-credential': 'Email ou mot de passe incorrect.', 'auth/user-disabled': 'Ce compte est désactivé.', 'auth/operation-not-allowed': 'Ce mode de connexion doit être activé dans Firebase.', 'auth/unauthorized-domain': 'Ce domaine doit être autorisé dans Firebase Authentication.', 'auth/popup-closed-by-user': 'La connexion a été annulée.', 'auth/too-many-requests': 'Trop de tentatives. Réessayez dans un instant.' };
  $('loginStatus').textContent = messages[error.code] || error.message || 'Connexion impossible.';
}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('loginStatus').textContent = 'Connexion…';
  try { await signInWithEmailAndPassword(auth, $('adminEmail').value.trim(), $('adminPassword').value); } catch (error) { loginError(error); } finally { button.disabled = false; }
});
$('googleLogin').addEventListener('click', async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { loginError(error); } });
onAuthStateChanged(auth, async user => {
  const generation = ++authGeneration;
  if (!user) {
    games = []; participants = []; current = null; dirty = false;
    $('gameGrid').replaceChildren(); $('participantsBody').replaceChildren(); form.reset();
    $('studio').hidden = true; $('login').hidden = false; return;
  }
  try {
    const result = await api('games');
    if (generation !== authGeneration) return;
    games = result.games; emailReady = result.emailReady; gameOrigin = result.gameOrigin;
    $('accountEmail').textContent = result.email; $('adminPassword').value = '';
    $('login').hidden = true; $('studio').hidden = false; showDashboard('');
  } catch (error) { if (generation !== authGeneration) return; await signOut(auth); loginError(error); }
});
$('logout').addEventListener('click', async () => { if (canLeave()) await signOut(auth); });
function canLeave() { return !dirty || confirm('Quitter sans enregistrer les modifications ?'); }
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

// ---------- Navigation JEUX ----------
for (const type of GAME_TYPES) {
  const button = document.createElement('button'); button.className = 'nav-item'; button.dataset.type = type.id;
  button.innerHTML = `<span>${escapeHtml(type.icon)}</span> ${escapeHtml(type.label)} <em class="nav-count"></em>`;
  button.addEventListener('click', () => { if (canLeave()) showDashboard(type.id); });
  $('navTypes').append(button);
}
function showDashboard(type = activeType) {
  activeType = type;
  $('dashboard').hidden = false; $('editor').hidden = true; current = null; dirty = false; status('');
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.type === type));
  const meta = gameType(type);
  $('dashboardEyebrow').textContent = meta ? 'TYPE DE JEU' : 'VOTRE COLLECTION';
  $('dashboardTitle').textContent = meta ? meta.label : 'À vous de jouer.';
  $('dashboardIntro').textContent = meta ? meta.tagline : 'Chaque marque a son univers. Donnez-lui son jeu.';
  renderGames();
}
$('navGames').addEventListener('click', () => { if (canLeave()) showDashboard(''); });
$('backGames').addEventListener('click', () => { if (canLeave()) showDashboard(); });
function renderGames() {
  for (const type of GAME_TYPES) document.querySelector(`.nav-item[data-type="${type.id}"] .nav-count`).textContent = String(games.filter(g => typeOf(g)?.id === type.id).length).padStart(2, '0');
  const typed = games.filter(g => !activeType || typeOf(g)?.id === activeType);
  $('totalGames').textContent = typed.length;
  $('publishedGames').textContent = typed.filter(g => g.status === 'published').length;
  $('draftGames').textContent = typed.filter(g => g.status === 'draft').length;
  $('gameCount').textContent = String(typed.length).padStart(2, '0');
  const search = $('gameSearch').value.trim().toLowerCase();
  const filtered = typed.filter(g => (g.name + ' ' + g.company).toLowerCase().includes(search));
  $('gameGrid').replaceChildren(); $('emptyState').hidden = typed.length > 0;
  for (const game of filtered) {
    const type = typeOf(game); const f = game.flappy || {};
    const article = document.createElement('article'); article.className = 'game-card';
    article.innerHTML = `<div class="card-cover"><span class="badge ${escapeHtml(game.status)}">${({ draft: 'BROUILLON', published: 'EN LIGNE', paused: 'EN PAUSE' })[game.status] || 'BROUILLON'}</span><span class="badge type">${escapeHtml(type?.label || game.type || '')}</span><img alt=""></div><div class="card-body"><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.company || 'Société à compléter')} · ${escapeHtml(type?.label || '')}</p><div class="card-footer"><span>${game.maxGames} parties / email</span><button>Gérer le jeu →</button></div></div>`;
    const cover = article.querySelector('.card-cover'); cover.style.backgroundColor = f.brand?.accent || '#e3eccb';
    const background = f.stages?.[0]?.backgroundUrl; if (background) cover.style.backgroundImage = cssUrl(background);
    article.querySelector('img').src = f.character?.imageUrl || '/img/logo.png';
    article.querySelector('button').addEventListener('click', () => openEditor(game));
    $('gameGrid').appendChild(article);
  }
  if (typed.length && !filtered.length) $('gameGrid').textContent = 'Aucun jeu ne correspond à votre recherche.';
}
$('gameSearch').addEventListener('input', renderGames);

// ---------- Création ----------
GAME_TYPES.forEach((type, index) => {
  const label = document.createElement('label'); label.className = 'template-option radio-option';
  label.innerHTML = `<input type="radio" name="newGameType" value="${type.id}" ${index ? '' : 'checked'}><span class="template-icon">${escapeHtml(type.icon)}</span><div><strong>${escapeHtml(type.label)}</strong><small>${escapeHtml(type.tagline)}</small></div>`;
  $('typeOptions').append(label);
});
for (const id of ['newGame', 'emptyNewGame']) $(id).addEventListener('click', () => {
  $('createStatus').textContent = '';
  const radio = document.querySelector(`input[name=newGameType][value="${activeType}"]`); if (radio) radio.checked = true;
  $('newGameDialog').showModal(); $('newGameName').focus();
});
$('closeNewGame').addEventListener('click', () => $('newGameDialog').close());
$('createGameForm').addEventListener('submit', async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try {
    const type = gameType(new FormData($('createGameForm')).get('newGameType')) || GAME_TYPES[0];
    const { game } = await api('save', { method: 'POST', data: { ...DEFAULT_GAME, type: type.id, [type.id]: type.defaults, name: $('newGameName').value, company: $('newGameCompany').value } });
    games.unshift(game); renderGames(); $('newGameDialog').close(); $('createGameForm').reset(); openEditor(game);
  } catch (error) { $('createStatus').textContent = error.message; }
  finally { event.submitter.disabled = false; }
});

// ---------- Uploads ----------
async function uploadFile(file) {
  if (file.size > 3 * 1024 * 1024) throw new Error('Le fichier dépasse la limite de 3 Mo.');
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
  const response = await fetch('/api/assets', { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await auth.currentUser.getIdToken() }, body: JSON.stringify({ type: file.type, data }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Import impossible.');
  return result.url;
}
function createUploadBox({ name = '', title, documentFile = false, value = '', onChange }) {
  const box = document.createElement('div'); box.className = 'upload-box';
  const id = name ? name.replaceAll('.', '_') : 'upload_' + (++uploadSeq);
  box.innerHTML = `<label for="${id}">${escapeHtml(title)}</label><input type="url" id="${id}" placeholder="Lien HTTPS ou import ci-dessous"><input type="file" accept="${documentFile ? 'application/pdf' : 'image/png,image/jpeg,image/webp'}" aria-label="Importer : ${escapeHtml(title)}"><small>${documentFile ? 'PDF' : 'PNG, JPG, WebP'} · 3 Mo maximum</small><a target="_blank" rel="noopener noreferrer" hidden>Voir le fichier ↗</a>`;
  const url = box.querySelector('input[type=url]'), link = box.querySelector('a');
  if (name) url.name = name;
  url.value = value;
  const sync = () => { link.hidden = !url.value.startsWith('https://'); if (!link.hidden) link.href = url.value; };
  url.addEventListener('input', () => { sync(); onChange?.(url.value); });
  box.querySelector('input[type=file]').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    uploadCount++; $('saveGame').disabled = true; event.target.disabled = true; status('Import du fichier…');
    const editingId = current?.id;
    try {
      const uploaded = await uploadFile(file);
      if (current?.id !== editingId) return;
      url.value = uploaded; sync(); onChange?.(uploaded); markDirty(); status('Fichier importé. Enregistrez le jeu pour appliquer la modification.');
    } catch (error) { status(error.message || 'Import impossible.', true); }
    finally { uploadCount--; $('saveGame').disabled = uploadCount > 0; event.target.disabled = false; event.target.value = ''; }
  });
  sync(); box.sync = sync;
  return box;
}
for (const [name, title, container, documentFile] of [
  ['flappy.brand.logoUrl', 'Logo de la marque', 'brandUploads'],
  ['flappy.character.imageUrl', 'Image du personnage', 'characterUploads'],
  ['flappy.obstacles.topUrl', 'Obstacle du haut', 'obstacleUploads'],
  ['flappy.obstacles.bottomUrl', 'Obstacle du bas', 'obstacleUploads'],
  ['termsUrl', 'Règlement / conditions du jeu', 'legalUploads', true],
  ['privacyUrl', 'Politique de confidentialité', 'legalUploads', true]
]) $(container).append(createUploadBox({ name, title, documentFile }));
for (const [key, font] of Object.entries(FONTS)) { const option = document.createElement('option'); option.value = key; option.textContent = font.label; option.style.fontFamily = font.family; $('fontSelect').append(option); }

// ---------- Liaison formulaire ↔ configuration ----------
const localDateTime = value => { const date = new Date(value); return new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function fillForm(game) {
  for (const input of form.elements) {
    if (!input.name) continue;
    let value = getPath(game, input.name); if (value === undefined) value = getPath(DEFAULT_GAME, input.name); if (value === undefined) continue;
    if (input.type === 'checkbox') input.checked = !!value;
    else if (input.type === 'radio') input.checked = input.value === String(value);
    else if (input.type === 'datetime-local') input.value = value ? localDateTime(value) : '';
    else input.value = value;
  }
  editorState.stages = structuredClone(game.flappy?.stages || DEFAULT_GAME.flappy.stages);
  editorState.customFields = structuredClone(game.flappy?.form?.customFields || []);
  renderCustomFields(); syncOutputs(); syncPresetLocks(); syncObstacleStyle();
  document.querySelectorAll('.upload-box').forEach(box => box.sync?.());
}
function values() {
  const result = { type: current?.type || 'flappy' };
  for (const [name, value] of new FormData(form)) setPath(result, name, value);
  for (const input of form.querySelectorAll('input[type=checkbox][name]')) setPath(result, input.name, input.checked);
  for (const input of form.querySelectorAll('input[type=number][name],input[type=range][name]')) if (input.value !== '' && !input.disabled) setPath(result, input.name, Number(input.value));
  setPath(result, 'flappy.stages', structuredClone(editorState.stages));
  setPath(result, 'flappy.form.customFields', structuredClone(editorState.customFields));
  return result;
}
function syncOutputs() { document.querySelectorAll('output[data-output]').forEach(output => { output.value = form.elements[output.dataset.output]?.value ?? ''; }); }
function syncObstacleStyle() {
  const image = form.elements['flappy.obstacles.style'].value === 'image';
  $('obstacleColors').hidden = image; $('obstacleUploads').hidden = !image;
}
function syncPresetLocks() {
  const locked = form.elements['flappy.physics.preset'].value !== 'custom';
  for (const key of ['jumpForce', 'gap', 'spawnEvery']) form.elements['flappy.physics.' + key].disabled = locked;
  $('physicsHelp').textContent = locked ? 'Ces valeurs suivent la difficulté choisie. Passez en « Personnalisé » pour les modifier.' : 'Réglages libres : testez-les dans l’aperçu avant de publier.';
  if (locked) {
    try {
      const { flappy } = normalizeGame({ ...values(), name: 'aperçu', status: 'draft' });
      for (const key of ['jumpForce', 'gap', 'spawnEvery']) form.elements['flappy.physics.' + key].value = flappy.physics[key];
      editorState.stages.forEach((stage, index) => { stage.speed = flappy.stages[index].speed; stage.gravity = flappy.stages[index].gravity; });
    } catch {}
  }
  renderStages();
}
form.elements['flappy.physics.preset'].addEventListener('change', syncPresetLocks);
form.querySelectorAll('input[name="flappy.obstacles.style"]').forEach(radio => radio.addEventListener('change', syncObstacleStyle));
function markDirty() { dirty = true; pushPreview(); }
form.addEventListener('input', () => { markDirty(); syncOutputs(); refreshEmailPreview(); });

// ---------- Listes dynamiques : paliers ----------
function renderStages() {
  const list = $('stagesList'); list.replaceChildren();
  const locked = form.elements['flappy.physics.preset'].value !== 'custom';
  editorState.stages.forEach((stage, index) => {
    const item = document.createElement('div'); item.className = 'list-item'; item.dataset.stage = index;
    item.innerHTML = `<div class="list-item-head"><strong>Palier ${index + 1}</strong>${index ? '<button type="button" class="link-button danger" data-remove>Retirer</button>' : '<span class="eyebrow">DÉPART</span>'}</div>
      <div class="field-grid three"><label>Dès le score<input type="number" min="0" max="10000" step="1" data-key="minScore" ${index ? '' : 'readonly'}></label><label>Vitesse<input type="number" min="2" max="25" step="0.1" data-key="speed" ${locked ? 'disabled' : ''}></label><label>Gravité<input type="number" min="0.3" max="2" step="0.05" data-key="gravity" ${locked ? 'disabled' : ''}></label></div>`;
    for (const input of item.querySelectorAll('[data-key]')) input.value = stage[input.dataset.key];
    item.append(createUploadBox({ title: `Fond du palier ${index + 1}`, value: stage.backgroundUrl, onChange: url => { editorState.stages[index].backgroundUrl = url; } }));
    item.querySelector('[data-remove]')?.addEventListener('click', () => { editorState.stages.splice(index, 1); renderStages(); markDirty(); });
    list.append(item);
  });
  $('addStage').disabled = editorState.stages.length >= 4;
}
$('stagesList').addEventListener('input', event => {
  const item = event.target.closest('[data-stage]'); const key = event.target.dataset.key; if (!item || !key) return;
  editorState.stages[item.dataset.stage][key] = event.target.value === '' ? '' : Number(event.target.value);
});
$('addStage').addEventListener('click', () => {
  const last = editorState.stages.at(-1);
  editorState.stages.push({ minScore: last.minScore + 20, backgroundUrl: '', speed: last.speed, gravity: last.gravity });
  renderStages(); markDirty();
});

// ---------- Listes dynamiques : champs personnalisés ----------
function renderCustomFields() {
  const list = $('customFieldsList'); list.replaceChildren();
  editorState.customFields.forEach((field, index) => {
    const item = document.createElement('div'); item.className = 'list-item'; item.dataset.field = index;
    item.innerHTML = `<div class="list-item-head"><strong>Champ ${index + 1}</strong><span><button type="button" class="link-button" data-move="-1" ${index ? '' : 'disabled'}>↑</button><button type="button" class="link-button" data-move="1" ${index < editorState.customFields.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="link-button danger" data-remove>Supprimer</button></span></div>
      <div class="field-grid"><label>Libellé<input maxlength="80" data-key="label"></label><label>Type<select data-key="type"><option value="text">Texte libre</option><option value="select">Liste déroulante</option><option value="checkbox">Case à cocher</option></select></label></div>
      <label class="options-field" ${field.type === 'select' ? '' : 'hidden'}>Options (une par ligne)<textarea rows="3" data-key="options"></textarea></label>
      <label class="inline-check"><input type="checkbox" data-key="required"> Obligatoire</label>`;
    item.querySelector('[data-key=label]').value = field.label; item.querySelector('[data-key=type]').value = field.type;
    item.querySelector('[data-key=options]').value = (field.options || []).join('\n'); item.querySelector('[data-key=required]').checked = !!field.required;
    item.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
      const target = index + Number(button.dataset.move);
      [editorState.customFields[index], editorState.customFields[target]] = [editorState.customFields[target], editorState.customFields[index]];
      renderCustomFields(); markDirty();
    }));
    item.querySelector('[data-remove]').addEventListener('click', () => { editorState.customFields.splice(index, 1); renderCustomFields(); markDirty(); });
    list.append(item);
  });
  $('addCustomField').disabled = editorState.customFields.length >= 5;
}
$('customFieldsList').addEventListener('input', event => {
  const item = event.target.closest('[data-field]'); const key = event.target.dataset.key; if (!item || !key) return;
  const field = editorState.customFields[item.dataset.field];
  if (key === 'required') field.required = event.target.checked;
  else if (key === 'options') field.options = event.target.value.split('\n');
  else field[key] = event.target.value;
  if (key === 'type') item.querySelector('.options-field').hidden = field.type !== 'select';
});
$('addCustomField').addEventListener('click', () => {
  editorState.customFields.push({ id: '', label: '', type: 'text', required: false, options: [] });
  renderCustomFields(); markDirty(); $('customFieldsList').querySelector('.list-item:last-child [data-key=label]').focus();
});

// ---------- Réinitialisation par section ----------
const RESET_PATHS = { brand: ['flappy.brand', 'flappy.theme'], welcome: ['flappy.screens.welcome', 'flappy.form'], character: ['flappy.character'], stages: ['flappy.stages'], obstacles: ['flappy.obstacles'], gameplay: ['flappy.physics', 'flappy.screens.countdown', 'countdownSeconds'], ending: ['flappy.screens.hud', 'flappy.screens.gameOver', 'flappy.screens.ranking', 'flappy.leaderboard'] };
document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => {
  if (!confirm('Remettre les valeurs par défaut de cette section ?')) return;
  const draft = values();
  for (const path of RESET_PATHS[button.dataset.reset]) setPath(draft, path, structuredClone(getPath(DEFAULT_GAME, path)));
  fillForm(draft); markDirty();
}));

// ---------- Erreurs de validation ----------
const SECTION_OF = [['flappy.brand', 'brand'], ['flappy.theme', 'brand'], ['flappy.screens.welcome', 'welcome'], ['flappy.form', 'welcome'], ['flappy.character', 'character'], ['flappy.stages', 'stages'], ['flappy.obstacles', 'obstacles'], ['flappy.physics', 'gameplay'], ['flappy.screens.countdown', 'gameplay'], ['countdownSeconds', 'gameplay'], ['flappy.screens', 'ending'], ['flappy.leaderboard', 'ending'], ['maxGames', 'rules'], ['termsUrl', 'rules'], ['privacyUrl', 'rules'], ['marketingLabel', 'rules'], ['email', 'emails']];
function clearErrors() { document.querySelectorAll('.field-error').forEach(node => node.remove()); document.querySelectorAll('[data-tab].has-error').forEach(button => button.classList.remove('has-error')); }
function showError(error) {
  clearErrors();
  const path = error.path || '';
  const section = SECTION_OF.find(([prefix]) => path.startsWith(prefix))?.[1] || 'general';
  document.querySelector(`[data-tab="${section}"]`)?.classList.add('has-error');
  let target = path ? form.querySelector(`[name="${CSS.escape(path)}"]`) : null;
  const list = path.match(/^flappy\.(stages|form\.customFields)\.(\d+)(?:\.(\w+))?/);
  if (list) { const attr = list[1] === 'stages' ? 'stage' : 'field'; target = document.querySelector(`[data-${attr}="${list[2]}"] [data-key="${list[3]}"]`) || document.querySelector(`[data-${attr}="${list[2]}"]`); }
  const note = document.createElement('p'); note.className = 'field-error'; note.textContent = error.message;
  (target?.closest('label') || target?.closest('.list-item') || target)?.after(note);
  return section;
}

// ---------- Aperçu en direct ----------
const frame = $('previewFrame');
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'flappy:ready') return;
  previewTargets.add(event.source); pushPreview(true);
});
function pushPreview(immediate = false) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (!current || $('editor').hidden || !current.flappy) return;
    let game;
    try { game = normalizeGame({ ...values(), status: 'draft' }); clearErrors(); } catch (error) { showError(error); return; }
    for (const target of previewTargets) { if (target.closed) { previewTargets.delete(target); continue; } target.postMessage({ type: 'flappy:config', game }, location.origin); }
  }, immediate ? 0 : 150);
}
document.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => frame.contentWindow?.postMessage({ type: 'flappy:goto', screen: button.dataset.goto }, location.origin)));
$('openPreview').addEventListener('click', () => { const popup = window.open('/index.html?preview=1', '_blank'); if (popup) previewTargets.add(popup); });
function fitPreview() { const scale = $('phonePreview').clientWidth / 390; frame.style.transform = `scale(${scale})`; $('phonePreview').style.height = Math.round(780 * scale) + 'px'; }
new ResizeObserver(fitPreview).observe($('phonePreview'));

// ---------- Éditeur ----------
function openEditor(game) {
  current = { ...game }; participants = []; dirty = false;
  $('dashboard').hidden = true; $('editor').hidden = false;
  $('editorTitle').textContent = game.name; $('editorType').textContent = typeOf(game)?.label || '';
  $('duplicateGame').hidden = false; $('openGame').hidden = game.status !== 'published'; $('saveGame').hidden = false; $('openPreview').hidden = false;
  document.querySelector('.preview-aside').hidden = false;
  document.querySelectorAll('[data-tab]').forEach(button => { button.hidden = false; });
  clearErrors(); fillForm(game);
  $('emailSetup').textContent = emailReady ? 'Le service d’envoi est raccordé. L’email partira après la dernière partie.' : 'Le service d’envoi attend son raccordement. Vous pouvez préparer le message ; la publication avec envoi activé sera disponible une fois le domaine d’envoi configuré.';
  status(''); selectTab('general'); refreshEmailPreview(); pushPreview(true);
}
function refreshEmailPreview() {
  const game = values();
  const render = text => String(text ?? '').replaceAll('{{prenom}}', 'Camille').replaceAll('{{score}}', '24').replaceAll('{{jeu}}', game.name || 'Votre jeu');
  $('emailPreviewSubject').textContent = render(game.emailSubject); $('emailPreviewBody').textContent = render(game.emailBody);
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (loading || uploadCount) return;
  const draft = values();
  try { normalizeGame(draft); } catch (error) { selectTab(showError(error)); status(error.message, true); return; }
  loading = true; $('saveGame').disabled = true;
  try {
    const { game } = await api('save', { id: current.id, method: 'POST', data: draft });
    games = games.map(g => g.id === game.id ? game : g); current = game; dirty = false; clearErrors(); fillForm(game);
    $('editorTitle').textContent = game.name; $('openGame').hidden = game.status !== 'published';
    status(game.status === 'published' ? 'Jeu enregistré et publié. Le lien est prêt à être partagé.' : 'Modifications enregistrées.');
  } catch (error) { if (error.path) selectTab(showError(error)); status(error.message, true); }
  finally { loading = false; $('saveGame').disabled = false; }
});
$('openGame').addEventListener('click', () => window.open(gameOrigin + '/?game=' + encodeURIComponent(current.id), '_blank', 'noopener,noreferrer'));
$('duplicateGame').addEventListener('click', async () => {
  if (!canLeave()) return;
  try { const { game } = await api('duplicate', { id: current.id, method: 'POST' }); games.unshift(game); openEditor(game); status('Copie créée en brouillon. Aucun participant n’a été copié.'); }
  catch (error) { status(error.message, true); }
});
function selectTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('[data-panel]').forEach(panel => panel.hidden = panel.dataset.panel !== tab);
  if (tab === 'data') loadParticipants();
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));

// ---------- Participants ----------
async function loadParticipants() {
  const id = current.id; participants = []; renderParticipants(); $('dataStatus').textContent = 'Chargement des participants…';
  try { const result = await api('participants', { id }); if (current?.id !== id) return; participants = result.participants; renderParticipants(); }
  catch (error) { if (current?.id === id) $('dataStatus').textContent = error.message; }
}
function filteredParticipants() {
  const query = $('participantSearch').value.toLowerCase();
  return participants.filter(p => (!$('marketingOnly').checked || p.consentMarketing) && `${p.firstName} ${p.lastName} ${p.email} ${p.phone} ${Object.values(p.extra || {}).join(' ')}`.toLowerCase().includes(query));
}
function renderParticipants() {
  const custom = customFieldsOf(current); const list = filteredParticipants();
  $('participantsHead').innerHTML = `<tr><th>Participant</th><th>Coordonnées</th>${custom.map(f => `<th>${escapeHtml(f.label)}</th>`).join('')}<th>Parties</th><th>Score</th><th>Marketing</th><th></th></tr>`;
  $('participantsBody').replaceChildren();
  $('participantCount').textContent = `${participants.length} participant${participants.length > 1 ? 's' : ''} · ${list.length} affiché${list.length > 1 ? 's' : ''}`;
  $('dataStatus').textContent = list.length ? '' : 'Aucun participant à afficher.'; $('exportCsv').disabled = !list.length;
  for (const p of list) {
    const row = document.createElement('tr');
    const extra = custom.map(f => `<td>${escapeHtml(f.type === 'checkbox' ? (p.extra?.[f.id] ? 'Oui' : 'Non') : (p.extra?.[f.id] ?? ''))}</td>`).join('');
    row.innerHTML = `<td><strong>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</strong><small>${p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : ''}</small></td><td>${escapeHtml(p.email)}<small>${escapeHtml(p.phone)}</small></td>${extra}<td>${p.gamesPlayed}</td><td>${p.highScore}</td><td>${p.consentMarketing ? 'Oui' : 'Non'}</td><td></td>`;
    if (current.id !== 'crousty_2026') {
      const button = document.createElement('button'); button.textContent = 'Supprimer';
      button.addEventListener('click', async () => {
        if (!confirm('Supprimer les données et le score de ce participant ? Cette action est définitive et réinitialisera sa limite de parties.')) return;
        button.disabled = true;
        try { await api('participant', { id: current.id, participant: p.id, method: 'DELETE' }); participants = participants.filter(item => item.id !== p.id); renderParticipants(); status('Données du participant supprimées.'); }
        catch (error) { button.disabled = false; status(error.message, true); }
      });
      row.lastElementChild.appendChild(button);
    }
    $('participantsBody').appendChild(row);
  }
}
for (const id of ['participantSearch', 'marketingOnly']) $(id).addEventListener('input', renderParticipants);
$('exportCsv').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([participantCsv(filteredParticipants(), current)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `participants-${current.id}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('navLegacy').addEventListener('click', () => {
  if (!canLeave()) return;
  current = { id: 'crousty_2026', type: 'flappy', name: 'Crousty · jeu historique' }; dirty = false;
  $('dashboard').hidden = true; $('editor').hidden = false; $('editorTitle').textContent = current.name; $('editorType').textContent = 'Flappy Bird';
  $('saveGame').hidden = true; $('openGame').hidden = true; $('duplicateGame').hidden = true; $('openPreview').hidden = true;
  document.querySelector('.preview-aside').hidden = true;
  document.querySelectorAll('[data-tab]').forEach(button => button.hidden = button.dataset.tab !== 'data');
  document.querySelectorAll('.nav-item').forEach(button => button.classList.remove('active')); $('navLegacy').classList.add('active');
  status(''); selectTab('data');
});
```

- [ ] **Step 2 : Vérification manuelle**

Run: `npm run dev` puis ouvrir `http://127.0.0.1:3000/admin/`. Sans `STUDIO_ENABLED`, l'API renvoie 503 : la connexion échoue avec le message d'activation — normal. Pour tester l'interface complète, lancer plutôt `node tests/studio-browser.cjs` (Task 10) ou définir un `.env` de test et `STUDIO_ENABLED=true` avec un compte de service (jamais commité).

Vérifier au minimum, avec le scénario navigateur ou manuellement :
1. la sidebar montre JEUX → « Flappy Bird 00 » ; le tableau de bord et le filtre par type fonctionnent ;
2. la création propose le type ; l'éditeur affiche 11 sections, l'iframe d'aperçu se charge et suit un changement de titre (< 1 s) ;
3. « Décompte / Game over / Classement » changent l'écran de l'aperçu ;
4. un score de palier non croissant affiche l'erreur sous le champ et un point rouge sur « 05 · Décors & paliers » ; « Enregistrer » refuse et bascule sur la section ;
5. un champ personnalisé `select` ajouté apparaît dans l'aperçu.

- [ ] **Step 3 : Commit**

```bash
git add admin/studio.js
git commit -m "Rebuild admin logic: type navigation, path-bound editor, dynamic lists and live preview"
```

---

### Task 10 : Tests navigateur de l'admin, documentation et vérification finale

**Files:**
- Modify: `tests/studio-browser.cjs`
- Modify: `tests/README.md`, `ADMIN_SETUP.md`
- Test: `npm test`, `node tests/browser.cjs`, `node tests/studio-browser.cjs`, `npm run build`

- [ ] **Step 1 : Adapter `tests/studio-browser.cjs`**

Dans `routeServices`, les routes `firebasejs`, `assets.example` et `/api/**` restent. Remplacer la partie « admin » du scénario (de `await page.locator('#newGame').click();` jusqu'à `assert.equal(data.studio.games[gameId].birdUrl,...)`) par :

```js
    await page.locator('#newGame').click();
    await page.locator('#newGameName').fill('L’envol Crousty');
    await page.locator('#newGameCompany').fill('Crousty');
    await page.locator('#createGameForm button[type=submit]').click();
    await page.locator('#editor').waitFor({ state: 'visible' });
    assert.match(await page.locator('.nav-item[data-type=flappy] .nav-count').textContent(), /01/);
    await page.locator('[data-tab=character]').click();
    await page.locator('#flappy_character_imageUrl').locator('..').locator('input[type=file]').setInputFiles({ name: 'bird.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => document.querySelector('#flappy_character_imageUrl').value.includes('assets.example'));
    await page.locator('[data-tab=welcome]').click();
    await page.locator('[name="flappy.screens.welcome.title"]').fill('Envol test');
    await page.locator('#addCustomField').click();
    await page.locator('[data-field="0"] [data-key=label]').fill('Magasin');
    await page.locator('[data-field="0"] [data-key=type]').selectOption('select');
    await page.locator('[data-field="0"] [data-key=options]').fill('Paris\nLyon');
    await page.locator('[data-field="0"] [data-key=required]').check();
    const preview = page.frameLocator('#previewFrame');
    await preview.locator('[data-text="welcome.title"]').filter({ hasText: 'Envol test' }).waitFor();
    assert.equal(await preview.locator('#cf_magasin option').count(), 3);
    await page.locator('[data-tab=stages]').click();
    await page.locator('[data-stage="1"] [data-key=minScore]').fill('0');
    await page.locator('#saveGame').click();
    await page.locator('.field-error').waitFor();
    assert.equal(await page.locator('[data-tab=stages].has-error').count(), 1);
    await page.locator('[data-stage="1"] [data-key=minScore]').fill('20');
    await page.locator('[data-tab=gameplay]').click();
    await page.locator('[name=countdownSeconds]').fill('1');
    await page.locator('[data-tab=rules]').click();
    await page.locator('[name=maxGames]').fill('2');
    await page.locator('#termsUrl').fill('https://assets.example/rules.pdf');
    await page.locator('#privacyUrl').fill('https://assets.example/privacy.pdf');
    await page.locator('[data-tab=emails]').click();
    await page.locator('[name=emailSubject]').fill('Bravo {{prenom}}, ton score chez {{jeu}}');
    assert.match(await page.locator('#emailPreviewSubject').textContent(), /Bravo Camille/);
    await page.locator('[data-goto=ranking]').click();
    await preview.locator('#rankingScreen').waitFor({ state: 'visible' });
    await preview.locator('#ownRank').filter({ hasText: 'Ta place : 4 sur 27' }).waitFor();
    await page.locator('[data-tab=general]').click();
    await page.locator('[name=status]').selectOption('published');
    await page.locator('#saveGame').click();
    await page.waitForFunction(() => document.querySelector('#globalStatus').textContent.includes('publié'));
    const gameId = Object.keys(data.studio.games)[0];
    assert.equal(data.studio.games[gameId].maxGames, 2);
    assert.equal(data.studio.games[gameId].flappy.character.imageUrl, 'https://assets.example/brand.png');
    assert.deepEqual(data.studio.games[gameId].flappy.form.customFields[0], { id: 'magasin', label: 'Magasin', type: 'select', required: true, options: ['Paris', 'Lyon'] });
```

Dans la partie « joueur », après `await playerPage.locator('#phone').fill('0000');` ajouter `await playerPage.locator('#cf_magasin').selectOption('Lyon');` (les deux fois : première inscription et après `reload`). Remplacer l'assertion CSV `assert.match(csv,/"8"/);` par :

```js
    assert.match(csv, /"Magasin"/); assert.match(csv, /"Lyon"/); assert.match(csv, /"8"/);
```

Ajouter, juste avant `await page.locator('#backGames').click();` :

```js
    assert.equal(await page.locator('#participantsHead th').nth(2).textContent(), 'Magasin');
```

Mettre à jour le `console.log('PASS admin: …')` pour mentionner « preview iframe, custom field, stage validation ».

- [ ] **Step 2 : Lancer tout**

Run: `npm test` → PASS.
Run: `npm run build` → OK.
Run: `node tests/browser.cjs` → PASS (jeu historique).
Run: `node tests/studio-browser.cjs` → PASS. En cas d'échec sur le `frameLocator` : vérifier que le serveur de dev sert `/game/` et `/index.html?preview=1`, et que la console de l'iframe n'affiche pas « Aperçu : configuration ignorée ».

- [ ] **Step 3 : Documentation**

`ADMIN_SETUP.md`, section « Ce qui est livré », remplacer la ligne « Nom, société, dates, logo, personnage, fond, texture d’obstacles, couleur. » par :

```
- Section JEUX avec un sous-menu par type de jeu (Flappy Bird aujourd’hui).
- Personnalisation complète de chaque campagne Flappy Bird : textes de tous les écrans,
  formulaire (champs visibles/obligatoires + jusqu’à 5 champs libres), marque et thème
  (logo, couleurs, police), personnage, décors par palier de score, obstacles, gameplay
  (presets ou réglages libres), classement (places, format des noms, rang, bouton).
- Aperçu en direct : le vrai jeu en mode brouillon dans l’éditeur, jouable, sans écriture.
```

Ajouter après la section « Emails » :

```
## Aperçu et compatibilité

L’aperçu charge `/index.html?preview=1` sur l’origine de l’administration et reçoit la
configuration par `postMessage` (même origine uniquement). Il n’écrit jamais dans Firebase.
Les jeux créés avant cette version sont convertis à la lecture (anciennes clés `birdUrl`,
`backgroundUrl`, `pipeUrl`, `difficulty`, `accent`, `logoUrl`, `subtitle`) et enregistrés au
nouveau format à leur prochaine sauvegarde. Le jeu historique Crousty n’est pas concerné.
```

`tests/README.md` : ajouter une ligne « `node --test tests/flappy-config.test.mjs tests/engine.test.mjs tests/theme.test.mjs` valide la configuration, le moteur et le thème sans navigateur. » et, dans la description de `studio-browser.cjs`, « …teste aussi l’aperçu en iframe, un champ personnalisé et la validation des paliers ».

- [ ] **Step 4 : Commit final**

```bash
git add tests/studio-browser.cjs tests/README.md ADMIN_SETUP.md
git commit -m "Extend admin browser scenario to preview, custom fields and docs"
```

---

## Auto-revue du plan (faite)

- **Couverture spec** : §3 (modèle, validation, variables, migration, registre) → Tasks 1-2 ; §4.1 modules → Tasks 4-7 ; §4.2 HTML/CSS → Task 4 ; §4.3 aperçu → Tasks 7, 9 ; §5 admin → Tasks 8-9 ; §6 API/CSV → Tasks 2-3, 9 ; §7 tests → Tasks 1-5, 10.
- **Chemins d'erreur** : `normalizeFlappy` produit des chemins relatifs (`stages.0.minScore`), `normalizeGame` les préfixe (`flappy.stages.0.minScore`) ; l'API et l'admin utilisent la forme préfixée.
- **Noms cohérents** : `createFlappyGame({ campaign, backend })` retourne `{ update, goto }` (Tasks 6-7) ; backend `{ unlimited, register, start, finish, leaderboard }` ; `createUploadBox` ids `flappy_character_imageUrl`, `termsUrl`, `privacyUrl` (Tasks 9-10) ; `customFieldsOf` (Tasks 2, 9).
