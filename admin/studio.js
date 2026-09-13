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
    // The iframe is same-origin: push to it directly too, so a `flappy:ready` missed before this module loaded cannot leave the preview stale.
    const targets = new Set(previewTargets); if (frame.contentWindow) targets.add(frame.contentWindow);
    for (const target of targets) { if (target.closed) { previewTargets.delete(target); continue; } target.postMessage({ type: 'flappy:config', game }, location.origin); }
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
