export async function loadManagedGame() {
  const id = new URLSearchParams(location.search).get('game');
  if (!id) return null;
  let token = '';
  let runId = '';
  let startRequestId = '';
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
  let config;
  try {
    const result = await request('config');
    config = result.game;
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
  document.title = config.name;
  const logo = document.querySelector('.game-logo'); logo.textContent = config.name;
  if (config.logoUrl) {
    const img = document.createElement('img'); img.src = config.logoUrl; img.alt = config.company; img.className = 'brand-logo'; logo.prepend(img);
  }
  document.querySelector('.game-subtitle').textContent = config.subtitle;
  document.querySelector('.game-info').textContent = `${config.maxGames} partie${config.maxGames > 1 ? 's' : ''} pour réaliser ton meilleur score`;
  document.getElementById('rankingTitle').textContent = '🏆 TOP 10 · ' + config.name;
  document.querySelector('.ranking-caption').textContent = `Tes ${config.maxGames} parties sont terminées. Merci d’avoir joué !`;
  document.querySelector('.bird').src = config.birdUrl || '/img/logo.png';
  document.getElementById('marketingText').textContent = config.marketingLabel;
  const consent = document.getElementById('gameConsentText');
  consent.replaceChildren(document.createTextNode('J’accepte '));
  for (const [index, [label, url]] of [['le règlement du jeu', config.termsUrl], ['la politique de confidentialité', config.privacyUrl]].entries()) {
    if (index) consent.append(document.createTextNode(' et '));
    const a = document.createElement('a'); a.textContent = label; a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; consent.append(a);
  }
  document.documentElement.style.setProperty('--game-accent', config.accent);
  document.body.classList.add('managed-game');
  if (config.backgroundUrl) {
    document.body.classList.add('custom-background');
    document.documentElement.style.setProperty('--game-background', `url(${JSON.stringify(config.backgroundUrl)})`);
  }
  if (config.pipeUrl) {
    document.body.classList.add('custom-pipes');
    document.documentElement.style.setProperty('--game-pipe', `url(${JSON.stringify(config.pipeUrl)})`);
  }
  return {
    ...config,
    speedFactor: ({ easy: 0.8, normal: 1, hard: 1.2 })[config.difficulty] || 1,
    gap: ({ easy: 36, normal: 31, hard: 28 })[config.difficulty] || 31,
    async register(player) { const result = await request('register', player); token = result.token; return result; },
    async start() {
      if (!startRequestId) startRequestId = crypto.randomUUID();
      const result = await request('start', { requestId: startRequestId });
      runId = result.runId; startRequestId = ''; return result;
    },
    finish(score) { return request('finish', { runId, score }); },
    async leaderboard() { return (await request('leaderboard')).players; }
  };
}
