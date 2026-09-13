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
