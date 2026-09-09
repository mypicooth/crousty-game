export const DEFAULT_GAME = {
  name: 'Nouveau jeu', company: '', type: 'flappy', status: 'draft',
  subtitle: 'Fais le meilleur score !', maxGames: 3, countdownSeconds: 3,
  difficulty: 'normal', accent: '#ffdc65', logoUrl: '', birdUrl: '',
  backgroundUrl: '', pipeUrl: '', termsUrl: '', privacyUrl: '',
  marketingLabel: 'J’accepte de recevoir les offres et actualités de la société organisatrice.',
  emailsEnabled: false, emailSubject: 'Merci d’avoir joué à {{jeu}} !',
  emailBody: 'Bonjour {{prenom}},\n\nMerci pour ta participation à {{jeu}}.\nTon meilleur score : {{score}} points.\n\nÀ bientôt !',
  startsAt: '', endsAt: ''
};

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
export function validId(value) { return /^[a-zA-Z0-9_-]{1,80}$/.test(value || ''); }
export function assetUrl(value) {
  if (!value) return '';
  const url = new URL(String(value));
  if (url.protocol !== 'https:') throw new Error('Les liens doivent utiliser HTTPS.');
  return url.href;
}
export function normalizeGame(input = {}) {
  const game = { ...DEFAULT_GAME };
  for (const key of ['name', 'company', 'subtitle', 'marketingLabel', 'emailSubject']) game[key] = text(input[key] ?? game[key]);
  game.emailBody = text(input.emailBody ?? game.emailBody, 5000);
  game.status = ['draft', 'published', 'paused'].includes(input.status) ? input.status : 'draft';
  game.maxGames = Number(input.maxGames ?? 3);
  game.countdownSeconds = Number(input.countdownSeconds ?? 3);
  if (!Number.isInteger(game.maxGames) || game.maxGames < 1 || game.maxGames > 10) throw new Error('Choisis entre 1 et 10 parties.');
  if (!Number.isInteger(game.countdownSeconds) || game.countdownSeconds < 1 || game.countdownSeconds > 5) throw new Error('Le compte à rebours doit durer de 1 à 5 secondes.');
  game.difficulty = ['easy', 'normal', 'hard'].includes(input.difficulty) ? input.difficulty : 'normal';
  game.accent = /^#[0-9a-f]{6}$/i.test(input.accent) ? input.accent : DEFAULT_GAME.accent;
  for (const key of ['logoUrl', 'birdUrl', 'backgroundUrl', 'pipeUrl', 'termsUrl', 'privacyUrl']) game[key] = assetUrl(input[key]);
  game.emailsEnabled = input.emailsEnabled === true;
  for (const key of ['startsAt', 'endsAt']) {
    if (input[key] && !Number.isFinite(Date.parse(input[key]))) throw new Error('Date de campagne invalide.');
    game[key] = input[key] ? new Date(input[key]).toISOString() : '';
  }
  if (game.startsAt && game.endsAt && game.startsAt >= game.endsAt) throw new Error('La date de fin doit suivre la date de début.');
  if (!game.name) throw new Error('Donne un nom au jeu.');
  if (game.status === 'published' && (!game.company || !game.termsUrl || !game.privacyUrl)) throw new Error('Avant publication, renseigne la société, le règlement et la politique de confidentialité.');
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
export function participantCsv(players) {
  const rows = [['Prénom', 'Nom', 'Email', 'Téléphone', 'Parties', 'Meilleur score', 'Consentement marketing', 'Consentement jeu', 'Date du consentement']];
  for (const p of players) rows.push([p.firstName, p.lastName, p.email, p.phone, p.gamesPlayed, p.highScore, p.consentMarketing ? 'Oui' : 'Non', p.consentGame ? 'Oui' : 'Non', p.consentTimestamp ? new Date(p.consentTimestamp).toISOString() : '']);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
