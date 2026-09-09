import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { DEFAULT_GAME, participantCsv } from '/shared/game-config.mjs';

const app = initializeApp({ apiKey: 'AIzaSyAGu61hEih85vRpKUN0zXOrVmOFXR-WQls', authDomain: 'crousty-game-b9c17.firebaseapp.com', projectId: 'crousty-game-b9c17', appId: '1:1032243559819:web:2d547412cee8932087038e' });
const auth = getAuth(app);
const $ = id => document.getElementById(id);
const form = $('gameForm');
let games = [];
let current = null;
let participants = [];
let emailReady = false;
let gameOrigin = 'https://crousty-game.vercel.app';
let dirty = false;
let activeTab = 'general';
let loading = false;
let uploadCount = 0;
let authGeneration = 0;

function status(message, error = false) {
  $('globalStatus').textContent = message;
  $('globalStatus').classList.toggle('error', error);
  $('globalStatus').hidden = !message;
}
async function api(action, { id, method = 'GET', data, participant } = {}) {
  if (!auth.currentUser) throw new Error('Connectez-vous pour continuer.');
  const token = await auth.currentUser.getIdToken();
  const query = new URLSearchParams({ action });
  if (id) query.set('id', id);
  if (participant) query.set('participant', participant);
  const response = await fetch('/api/admin?' + query, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Une erreur est survenue.');
  return result;
}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssUrl = value => value ? `url(${JSON.stringify(value)})` : '';
function loginError(error) {
  const messages = { 'auth/invalid-credential': 'Email ou mot de passe incorrect.', 'auth/user-disabled': 'Ce compte est désactivé.', 'auth/operation-not-allowed': 'Ce mode de connexion doit être activé dans Firebase.', 'auth/unauthorized-domain': 'Ce domaine doit être autorisé dans Firebase Authentication.', 'auth/popup-closed-by-user': 'La connexion a été annulée.', 'auth/too-many-requests': 'Trop de tentatives. Réessayez dans un instant.' };
  $('loginStatus').textContent = messages[error.code] || error.message || 'Connexion impossible.';
}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('loginStatus').textContent = 'Connexion…';
  try { await signInWithEmailAndPassword(auth, $('adminEmail').value.trim(), $('adminPassword').value); }
  catch (error) { loginError(error); }
  finally { button.disabled = false; }
});
$('googleLogin').addEventListener('click', async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { loginError(error); }
});
onAuthStateChanged(auth, async user => {
  const generation = ++authGeneration;
  if (!user) {
    games = []; participants = []; current = null; dirty = false;
    $('gameGrid').replaceChildren(); $('participantsBody').replaceChildren(); form.reset();
    $('studio').hidden = true; $('login').hidden = false;
    return;
  }
  try {
    const result = await api('games');
    if (generation !== authGeneration) return;
    games = result.games;
    emailReady = result.emailReady;
    gameOrigin = result.gameOrigin;
    $('accountEmail').textContent = result.email;
    $('adminPassword').value = '';
    $('login').hidden = true; $('studio').hidden = false;
    showDashboard();
  } catch (error) {
    if (generation !== authGeneration) return;
    await signOut(auth);
    loginError(error);
  }
});
$('logout').addEventListener('click', async () => { if (canLeave()) await signOut(auth); });
function canLeave() { return !dirty || confirm('Quitter sans enregistrer les modifications ?'); }
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
function showDashboard() {
  $('dashboard').hidden = false; $('editor').hidden = true;
  $('navGames').classList.add('active'); $('navLegacy').classList.remove('active');
  current = null; dirty = false; status(''); renderGames();
}
for (const id of ['navGames', 'backGames']) $(id).addEventListener('click', () => { if (canLeave()) showDashboard(); });
function renderGames() {
  $('totalGames').textContent = games.length;
  $('publishedGames').textContent = games.filter(g => g.status === 'published').length;
  $('draftGames').textContent = games.filter(g => g.status === 'draft').length;
  $('gameCount').textContent = String(games.length).padStart(2, '0');
  const search = $('gameSearch').value.trim().toLowerCase();
  const filtered = games.filter(g => (g.name + ' ' + g.company).toLowerCase().includes(search));
  $('gameGrid').replaceChildren(); $('emptyState').hidden = games.length > 0;
  for (const game of filtered) {
    const article = document.createElement('article');
    article.className = 'game-card';
    article.innerHTML = `<div class="card-cover"><span class="badge ${escapeHtml(game.status)}">${({ draft: 'BROUILLON', published: 'EN LIGNE', paused: 'EN PAUSE' })[game.status] || 'BROUILLON'}</span><img alt=""></div><div class="card-body"><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.company || 'Société à compléter')} · Flappy Bird</p><div class="card-footer"><span>${game.maxGames} parties / email</span><button>Gérer le jeu →</button></div></div>`;
    article.querySelector('.card-cover').style.backgroundColor = game.accent || '#e3eccb';
    if (game.backgroundUrl) article.querySelector('.card-cover').style.backgroundImage = cssUrl(game.backgroundUrl);
    article.querySelector('img').src = game.birdUrl || '/img/logo.png';
    article.querySelector('button').addEventListener('click', () => openEditor(game));
    $('gameGrid').appendChild(article);
  }
  if (games.length && !filtered.length) $('gameGrid').textContent = 'Aucun jeu ne correspond à votre recherche.';
}
$('gameSearch').addEventListener('input', renderGames);
for (const id of ['newGame', 'emptyNewGame']) $(id).addEventListener('click', () => { $('createStatus').textContent = ''; $('newGameDialog').showModal(); $('newGameName').focus(); });
$('closeNewGame').addEventListener('click', () => $('newGameDialog').close());
$('createGameForm').addEventListener('submit', async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try {
    const { game } = await api('save', { method: 'POST', data: { ...DEFAULT_GAME, name: $('newGameName').value, company: $('newGameCompany').value } });
    games.unshift(game); $('newGameDialog').close(); $('createGameForm').reset(); openEditor(game);
  } catch (error) { $('createStatus').textContent = error.message; }
  finally { event.submitter.disabled = false; }
});

const uploadFields = [
  ['logoUrl', 'Logo de la marque', 'brandUploads', false],
  ['birdUrl', 'Personnage', 'brandUploads', false],
  ['backgroundUrl', 'Fond du jeu', 'brandUploads', false],
  ['pipeUrl', 'Texture des obstacles', 'brandUploads', false],
  ['termsUrl', 'Règlement / conditions du jeu', 'legalUploads', true],
  ['privacyUrl', 'Politique de confidentialité', 'legalUploads', true]
];
for (const [name, title, container, documentFile] of uploadFields) {
  const box = document.createElement('div'); box.className = 'upload-box';
  box.innerHTML = `<label for="${name}">${title}</label><input type="url" name="${name}" id="${name}" placeholder="Lien HTTPS ou import ci-dessous"><input type="file" accept="${documentFile ? 'application/pdf' : 'image/png,image/jpeg,image/webp'}" aria-label="Importer : ${title}"><small>${documentFile ? 'PDF' : 'PNG, JPG, WebP'} · 3 Mo maximum</small><a target="_blank" rel="noopener noreferrer" hidden>Voir le fichier ↗</a>`;
  $(container).appendChild(box);
  box.querySelector('input[type=file]').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { status('Le fichier dépasse la limite de 3 Mo.', true); event.target.value = ''; return; }
    uploadCount++; $('saveGame').disabled = true; event.target.disabled = true; status('Import du fichier…');
    const editingId = current?.id;
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const response = await fetch('/api/assets', { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await auth.currentUser.getIdToken() }, body: JSON.stringify({ type: file.type, data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Import impossible.');
      if (current?.id !== editingId) return;
      form.elements[name].value = result.url; dirty = true; refreshPreview(); refreshUploadLinks(); status('Fichier importé. Enregistrez le jeu pour appliquer la modification.');
    } catch (error) { status(error.message || 'Import impossible.', true); }
    finally { uploadCount--; $('saveGame').disabled = uploadCount > 0; event.target.disabled = false; event.target.value = ''; }
  });
}
function refreshUploadLinks() {
  for (const [name] of uploadFields) {
    const input = form.elements[name]; const a = input.closest('.upload-box').querySelector('a');
    a.hidden = !input.value.startsWith('https://'); if (!a.hidden) a.href = input.value;
  }
}
function values() {
  const result = Object.fromEntries(new FormData(form));
  result.maxGames = Number(result.maxGames); result.countdownSeconds = Number(result.countdownSeconds);
  result.emailsEnabled = form.elements.emailsEnabled.checked;
  return result;
}
function openEditor(game) {
  current = { ...game }; participants = []; dirty = false;
  $('dashboard').hidden = true; $('editor').hidden = false;
  $('editorTitle').textContent = game.name;
  $('duplicateGame').hidden = false; $('openGame').hidden = game.status !== 'published';
  $('saveGame').hidden = false; document.querySelector('.preview-aside').hidden = false;
  document.querySelectorAll('[data-tab]').forEach(button => button.hidden = false);
  for (const [key, defaultValue] of Object.entries(DEFAULT_GAME)) {
    const input = form.elements[key]; if (!input) continue;
    let value = game[key] ?? defaultValue;
    if (input.type === 'checkbox') input.checked = !!value;
    else if (input.type === 'datetime-local' && value) { const date = new Date(value); input.value = new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    else input.value = value;
  }
  $('emailSetup').textContent = emailReady ? 'Le service d’envoi est raccordé. L’email partira après la dernière partie.' : 'Le service d’envoi attend son raccordement. Vous pouvez préparer le message ; la publication avec envoi activé sera disponible une fois le domaine d’envoi configuré.';
  status(''); selectTab('general'); refreshPreview(); refreshUploadLinks();
}
function refreshPreview() {
  const game = values();
  $('previewName').textContent = game.name || 'Votre jeu'; $('previewSubtitle').textContent = game.subtitle;
  $('previewAttempts').textContent = `${game.maxGames || 3} parties pour faire votre meilleur score`;
  $('previewButton').style.backgroundColor = game.accent;
  $('phonePreview').style.backgroundImage = cssUrl(game.backgroundUrl || '/img/background.jpg');
  $('previewBird').src = game.birdUrl || '/img/logo.png';
  $('previewLogo').hidden = !game.logoUrl; if (game.logoUrl) $('previewLogo').src = game.logoUrl;
  const render = text => text.replaceAll('{{prenom}}', 'Camille').replaceAll('{{score}}', '24').replaceAll('{{jeu}}', game.name || 'Votre jeu');
  $('emailPreviewSubject').textContent = render(game.emailSubject); $('emailPreviewBody').textContent = render(game.emailBody);
}
form.addEventListener('input', () => { dirty = true; refreshPreview(); refreshUploadLinks(); });
form.addEventListener('submit', async event => {
  event.preventDefault(); if (loading || uploadCount) return; loading = true; $('saveGame').disabled = true;
  try {
    const { game } = await api('save', { id: current.id, method: 'POST', data: values() });
    games = games.map(g => g.id === game.id ? game : g); current = game; dirty = false;
    $('editorTitle').textContent = game.name; $('openGame').hidden = game.status !== 'published';
    status(game.status === 'published' ? 'Jeu enregistré et publié. Le lien est prêt à être partagé.' : 'Modifications enregistrées.');
  } catch (error) { status(error.message, true); }
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
async function loadParticipants() {
  const id = current.id; participants = []; renderParticipants(); $('dataStatus').textContent = 'Chargement des participants…';
  try {
    const result = await api('participants', { id });
    if (current?.id !== id) return;
    participants = result.participants; renderParticipants();
  } catch (error) { if (current?.id === id) $('dataStatus').textContent = error.message; }
}
function filteredParticipants() {
  const query = $('participantSearch').value.toLowerCase();
  return participants.filter(p => (! $('marketingOnly').checked || p.consentMarketing) && `${p.firstName} ${p.lastName} ${p.email} ${p.phone}`.toLowerCase().includes(query));
}
function renderParticipants() {
  const list = filteredParticipants(); $('participantsBody').replaceChildren();
  $('participantCount').textContent = `${participants.length} participant${participants.length > 1 ? 's' : ''} · ${list.length} affiché${list.length > 1 ? 's' : ''}`;
  $('dataStatus').textContent = list.length ? '' : 'Aucun participant à afficher.'; $('exportCsv').disabled = !list.length;
  for (const p of list) {
    const row = document.createElement('tr');
    row.innerHTML = `<td><strong>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</strong><small>${p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : ''}</small></td><td>${escapeHtml(p.email)}<small>${escapeHtml(p.phone)}</small></td><td>${p.gamesPlayed}</td><td>${p.highScore}</td><td>${p.consentMarketing ? 'Oui' : 'Non'}</td><td></td>`;
    if (current.id !== 'crousty_2026') {
      const button = document.createElement('button'); button.textContent = 'Supprimer';
      button.addEventListener('click', async () => {
        if (!confirm('Supprimer les données et le score de ce participant ? Cette action est définitive et réinitialisera sa limite de parties.')) return;
        button.disabled = true;
        try { await api('participant', { id: current.id, participant: p.id, method: 'DELETE' }); participants = participants.filter(item => item.id !== p.id); renderParticipants(); status('Données du participant supprimées.'); }
        catch (error) { button.disabled = false; status(error.message, true); }
      }); row.lastElementChild.appendChild(button);
    }
    $('participantsBody').appendChild(row);
  }
}
for (const id of ['participantSearch', 'marketingOnly']) $(id).addEventListener('input', renderParticipants);
$('exportCsv').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([participantCsv(filteredParticipants())], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `participants-${current.id}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('navLegacy').addEventListener('click', () => {
  if (!canLeave()) return;
  current = { id: 'crousty_2026', name: 'Crousty · jeu historique' }; dirty = false;
  $('dashboard').hidden = true; $('editor').hidden = false; $('editorTitle').textContent = current.name;
  $('saveGame').hidden = true; $('openGame').hidden = true; $('duplicateGame').hidden = true;
  document.querySelector('.preview-aside').hidden = true;
  document.querySelectorAll('[data-tab]').forEach(button => button.hidden = button.dataset.tab !== 'data');
  $('navLegacy').classList.add('active'); $('navGames').classList.remove('active'); status(''); selectTab('data');
});
