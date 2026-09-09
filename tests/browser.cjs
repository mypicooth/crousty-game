// Run with Playwright installed, or PLAYWRIGHT_MODULE pointing to its directory.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

const databaseMock = `
window.testDB = { campaigns: { crousty_2026: { leaderboard: Object.fromEntries(
  Array.from({length: 12}, (_, i) => ['seed' + i, {displayName: 'Joueur ' + i, highScore: i}])
) } } };
window.failRead = false;
window.failWrite = false;
export const getDatabase = () => ({});
export const ref = (_, path = '') => path;
export async function update(base, values) {
  await new Promise(resolve => setTimeout(resolve, 40));
  if (window.failWrite) throw new Error('WRITE_FAILED');
  for (const [key, value] of Object.entries(values)) {
    const parts = (base ? base + '/' + key : key).split('/');
    const last = parts.pop();
    let node = window.testDB;
    for (const part of parts) node = node[part] ||= {};
    node[last] = value;
  }
}
export async function get(key) {
  if (window.failRead) throw new Error('READ_FAILED');
  const value = key.split('/').reduce((node, part) => node?.[part], window.testDB);
  return { val: () => value || null, exists: () => !!value };
}`;

async function run(browser, url, viewport, failure) {
  const context = await browser.newContext({ viewport, hasTouch: true });
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({
    contentType: 'text/javascript',
    body: route.request().url().endsWith('firebase-app.js')
      ? 'export const initializeApp = () => ({});' : databaseMock
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(url);
  await page.locator('#firstName').fill('Test');
  await page.locator('#lastName').fill('Navigateur');
  await page.locator('#email').fill('browser-test@example.invalid');
  await page.locator('#phone').fill('0000000000');
  await page.locator('#consentGame').check();
  await page.locator('#loginBtn').tap();
  await page.waitForFunction(() => document.querySelector('.score_title').textContent === 'PARTIE 1/3');
  assert.equal(await page.locator('.message').isVisible(), false);

  for (let round = 1; round <= 3; round++) {
    await page.locator('#countdown').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#countdownValue').textContent(), '3');
    const initialTop = await page.locator('.bird').evaluate(el => el.getBoundingClientRect().top);
    await page.keyboard.press('Enter');
    await page.touchscreen.tap(20, 200);
    await page.waitForFunction(() => document.querySelector('#countdownValue').textContent === '2');
    assert.equal(await page.locator('.bird').evaluate(el => el.getBoundingClientRect().top), initialTop);
    assert.equal(await page.locator('.pipe_sprite').count(), 0);
    assert.equal(await page.locator('.score_val').textContent(), '0');
    if (round === 1 && process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `countdown-${viewport.width}.png`) });
    }
    await page.waitForFunction(() => document.querySelector('#countdownValue').textContent === '1');
    await page.locator('#countdown').waitFor({ state: 'hidden' });
    // Controlled scores isolate persistence from the player's timing/skill.
    await page.locator('.score_val').evaluate((el, score) => el.textContent = score, [3, 8, 5][round - 1]);
    if (round === 3 && failure === 'write') await page.evaluate(() => window.failWrite = true);
    await page.waitForFunction(() => document.querySelector('#replayBtn').style.display === 'block');
    assert.equal(await page.locator('#replayBtn').textContent(), round < 3 ? 'REJOUER' : 'VOIR LE CLASSEMENT');
    if (round < 3) {
      // A burst of clicks must consume only one new attempt.
      await page.locator('#replayBtn').evaluate(button => { button.click(); button.click(); button.click(); });
      await page.waitForFunction(n => document.querySelector('.score_title').textContent === `PARTIE ${n}/3`, round + 1);
    }
  }
  if (failure === 'read') await page.evaluate(() => window.failRead = true);
  await page.locator('#replayBtn').tap();
  await page.locator('#rankingScreen').waitFor({ state: 'visible' });
  if (failure) {
    await page.locator('#rankingRetry').waitFor({ state: 'visible' });
    assert.match(await page.locator('#rankingStatus').textContent(), failure === 'write' ? /pas encore pu être enregistré/ : /Impossible de charger/);
    await page.evaluate(() => { window.failRead = false; window.failWrite = false; });
    await page.locator('#rankingRetry').tap();
  }
  await page.waitForFunction(() => document.querySelectorAll('.ranking li').length === 10);
  assert.equal(await page.locator('#bestScore').textContent(), 'Ton meilleur score : 8 pts');
  assert.equal(await page.locator('.bird').isVisible(), false);
  assert.equal(await page.locator('.pipe_sprite').count(), 0);
  assert.equal(await page.locator('.message2').textContent(), '');
  const scores = await page.locator('.ranking li').allTextContents();
  assert.match(scores[0], /11 pts$/);
  const saved = await page.evaluate(() => {
    const campaign = window.testDB.campaigns.crousty_2026;
    const [id, player] = Object.entries(campaign.players_private)[0];
    return { player, public: campaign.leaderboard[id] };
  });
  assert.equal(saved.player.gamesPlayed, 3);
  assert.equal(saved.player.highScore, 8);
  assert.equal(saved.public.highScore, 8);
  assert.deepEqual(Object.keys(saved.public).sort(), ['displayName', 'highScore']);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('.ranking li').last().scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.ranking li').last().isVisible(), true);
  const screenshotDir = process.env.SCREENSHOT_DIR;
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.locator('#rankingScreen').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: path.join(screenshotDir, `ranking-${viewport.width}-${failure || 'success'}.png`) });
  }
  // Enter at the end must never reload registration or grant a fourth game.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#rankingStatus').textContent === '');
  assert.equal(await page.locator('.message').isVisible(), false);
  await page.evaluate(() => window.testDB.campaigns.crousty_2026.leaderboard = {});
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#rankingStatus').textContent.includes('Aucun score'));
  assert.equal(await page.locator('.ranking li').count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS ${viewport.width}x${viewport.height}: countdown each round, three games, best score, top 10, empty ranking, ${failure || 'success'}`);
  await context.close();
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    for (const [viewport, failure] of [
      [{ width: 390, height: 844 }, null],
      [{ width: 844, height: 390 }, 'read'],
      [{ width: 1280, height: 800 }, 'write']
    ]) await run(browser, url, viewport, failure);

    if (process.env.CHECK_FIREBASE === '1') {
      const page = await browser.newPage();
      await page.goto(url);
      const result = await page.evaluate(async () => {
        const { getApps } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
        const { getDatabase, ref, get } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js');
        const snapshot = await Promise.race([
          get(ref(getDatabase(getApps()[0]), 'campaigns/crousty_2026/leaderboard')),
          new Promise((_, reject) => setTimeout(() => reject(Error('Firebase read timeout')), 15000))
        ]);
        return { readable: true, entries: Object.keys(snapshot.val() || {}).length };
      });
      console.log('LIVE FIREBASE (read only):', JSON.stringify(result));
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
