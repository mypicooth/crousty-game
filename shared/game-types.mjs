import { FLAPPY_DEFAULTS, normalizeFlappy, migrateLegacyGame } from './flappy-config.mjs';

export const GAME_TYPES = [
  { id: 'flappy', label: 'Flappy Bird', tagline: 'Un tap, un envol. Un classique qui rassemble.', icon: '↗', defaults: FLAPPY_DEFAULTS, normalize: normalizeFlappy, migrate: migrateLegacyGame }
];
export const gameType = id => GAME_TYPES.find(type => type.id === id);
