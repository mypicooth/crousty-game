const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
// Only public files are deployed as static assets. Credentials, server source,
// configuration and tests never enter the public output directory.
for (const file of ['index.html', 'main.js', 'style.css', 'game-loop.mjs', 'managed-game.mjs', 'legacy-crousty.mjs', 'game', 'img', 'sound', 'font', 'admin', 'shared']) {
  fs.cpSync(path.join(root, file), path.join(output, file), { recursive: true });
}
console.log('Public game and admin assets built in dist/.');
