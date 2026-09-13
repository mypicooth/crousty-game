const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const platform = require('../server/platform.cjs');
process.env.STUDIO_ADMIN_EMAILS = 'contact@mypicbooth.com';
process.env.STUDIO_SESSION_SECRET = 'test-only-session-secret-32-characters-long';
const root = path.resolve(__dirname, '..');
const data = {};
const read = key => key.split('/').filter(Boolean).reduce((v, part) => v?.[part], data);
function write(key, value) {
  const parts = key.split('/').filter(Boolean), last = parts.pop(); let node = data;
  for (const part of parts) node = node[part] ||= {};
  if (value === null) delete node[last]; else node[last] = structuredClone(value);
}
const snap = value => ({ val: () => structuredClone(value ?? null) });
platform.services = () => ({
  auth: { async verifyIdToken(token) { if (token !== 'test-admin-token') throw Error('Unauthorized'); return { email: 'contact@mypicbooth.com', email_verified: true, uid: 'admin' }; } },
  db: { ref(key = '') { return {
    async get() { return snap(read(key)); },
    async set(value) { write(key, value); },
    async update(values) { for (const [part, value] of Object.entries(values)) write([key, part].filter(Boolean).join('/'), value); },
    async transaction(fn) { const next = fn(structuredClone(read(key) ?? null)); if (next === undefined) return { committed: false, snapshot: snap(read(key)) }; write(key, next); return { committed: true, snapshot: snap(next) }; }
  }; } }
});
const handlers = { '/api/admin': require('../api/admin.js'), '/api/game': require('../api/game.js') };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const authMock = `
const auth = {currentUser:null}; let callback;
export const getAuth = () => auth;
export function onAuthStateChanged(_, cb) { callback=cb; queueMicrotask(()=>cb(null)); }
export async function signInWithEmailAndPassword() { auth.currentUser={getIdToken:async()=>'test-admin-token'}; await callback(auth.currentUser); }
export const signInWithPopup = signInWithEmailAndPassword;
export class GoogleAuthProvider {}
export async function signOut() { auth.currentUser=null; await callback(null); }
`;
async function routeServices(context) {
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType: 'text/javascript', body: route.request().url().endsWith('firebase-auth.js') ? authMock : route.request().url().endsWith('firebase-app.js') ? 'export const initializeApp=()=>({});' : 'export const getDatabase=()=>({}); export const ref=()=>({}); export const get=async()=>({val:()=>({})}); export const update=async()=>{};' }));
  await context.route('https://assets.example/**', route => route.fulfill({ contentType: 'image/png', body: png }));
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/assets') {
      assert.equal(request.headers().authorization, 'Bearer test-admin-token');
      return route.fulfill({ json: { url: 'https://assets.example/brand.png' } });
    }
    let status = 200, body;
    await handlers[url.pathname]({ method: request.method(), query: Object.fromEntries(url.searchParams), body: request.postData() ? JSON.parse(request.postData()) : undefined, headers: request.headers() }, { setHeader() {}, status(value) { status=value; return this; }, json(value) { body=value; } });
    await route.fulfill({ status, json: body });
  });
}

(async () => {
  const server = spawn(process.execPath, ['scripts/dev.cjs'], { cwd: root, env: { ...process.env, PORT: '3088' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error('Server exited ' + code))); });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await routeServices(context);
    const page = await context.newPage(), errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    page.on('dialog', dialog=>dialog.accept());
    await page.goto('http://127.0.0.1:3088/admin/');
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'admin-login.png') });
    await page.locator('#adminPassword').fill('test-only-password');
    await page.locator('#loginForm button[type=submit]').click();
    await page.locator('#studio').waitFor({ state: 'visible' });
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
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path:path.join(process.env.SCREENSHOT_DIR,'admin-editor.png'),fullPage:true });

    const playerPage = await context.newPage();
    playerPage.on('pageerror', e=>errors.push(e.message));
    playerPage.on('dialog', d=>{errors.push('Unexpected player alert: '+d.message());d.accept();});
    await playerPage.goto(`http://127.0.0.1:3088/?game=${gameId}`);
    await playerPage.locator('#firstName').fill('Camille'); await playerPage.locator('#lastName').fill('Test');
    await playerPage.locator('#email').fill('camille@example.invalid'); await playerPage.locator('#phone').fill('0000');
    await playerPage.locator('#cf_magasin').selectOption('Lyon');
    await playerPage.locator('#consentGame').check();
    assert.equal(await playerPage.locator('#gameConsentText a').count(),2);
    await playerPage.locator('#loginBtn').click();
    for (let i=1;i<=2;i++) {
      await playerPage.locator('#countdown').waitFor({state:'visible'});
      assert.equal(await playerPage.locator('#countdownValue').textContent(),'1');
      await playerPage.locator('#countdown').waitFor({state:'hidden'});
      await playerPage.locator('.score_val').evaluate((el,value)=>el.textContent=value,i===1?8:3);
      await playerPage.locator('#replayBtn').waitFor({state:'visible'});
      await playerPage.locator('#replayBtn').click();
    }
    await playerPage.waitForFunction(()=>document.querySelectorAll('.ranking li').length===1);
    assert.equal(await playerPage.locator('#bestScore').textContent(),'Ton meilleur score : 8 pts');
    await playerPage.reload();
    await playerPage.locator('#firstName').fill('Camille'); await playerPage.locator('#lastName').fill('Test');
    await playerPage.locator('#email').fill('CAMILLE@example.invalid'); await playerPage.locator('#phone').fill('0000');
    await playerPage.locator('#cf_magasin').selectOption('Lyon');
    await playerPage.locator('#consentGame').check(); await playerPage.locator('#loginBtn').click();
    await playerPage.locator('#rankingScreen').waitFor({state:'visible'});
    assert.equal(await playerPage.locator('#countdown').isVisible(),false);

    await page.locator('[data-tab=data]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#participantsBody tr').length===1);
    const downloadPromise=page.waitForEvent('download'); await page.locator('#exportCsv').click();
    const download=await downloadPromise; const csv=fs.readFileSync(await download.path(),'utf8');
    assert.match(csv,/camille@example.invalid/);
    assert.match(csv, /"Magasin"/); assert.match(csv, /"Lyon"/); assert.match(csv, /"8"/);
    await page.locator('#marketingOnly').check(); assert.equal(await page.locator('#participantsBody tr').count(),0);
    await page.locator('#marketingOnly').uncheck();
    if(process.env.SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'admin-participants.png'),fullPage:true});
    assert.equal(await page.locator('#participantsHead th').nth(2).textContent(), 'Magasin');
    await page.locator('#backGames').click();
    if(process.env.SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'admin-dashboard.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'admin-mobile.png'),fullPage:true});
    await page.locator('#logout').click(); await page.locator('#login').waitFor({state:'visible'});
    assert.equal(await page.locator('#participantsBody tr').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS admin: login, create, upload, publish, preview iframe, custom field, stage validation, 2-part game, reload limit, participants, CSV, consent filter, mobile, logout');
    // The real local API is closed with no credentials, independently of UI mocks.
    const closed = await fetch('http://127.0.0.1:3088/api/admin');
    assert.equal(closed.status,503);
    console.log('PASS real unconfigured API: fails closed (503)');
  } finally { if(browser) await browser.close(); server.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
