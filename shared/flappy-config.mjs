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
  let result;
  if (format === 'full') result = [first, last].filter(Boolean).join(' ');
  else if (format === 'first' || !last) result = first;
  else result = `${first} ${last.charAt(0).toUpperCase()}.`;
  result = result.trim();
  return result || 'Joueur';
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
