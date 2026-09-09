const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const publicPaths = new Set(['index.html', 'main.js', 'style.css', 'game-loop.mjs', 'managed-game.mjs', 'img', 'font', 'sound', 'admin', 'shared']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (['/api/admin', '/api/game', '/api/assets'].includes(url.pathname)) {
    req.query = Object.fromEntries(url.searchParams);
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 4.3 * 1024 * 1024) { res.status(413).json({ error: 'Fichier trop volumineux.' }); return; } chunks.push(chunk); }
      const raw = Buffer.concat(chunks).toString(); req.body = raw ? JSON.parse(raw) : undefined;
      await require(path.join(root, url.pathname + '.js'))(req, res);
    } catch { if (!res.headersSent) res.status(400).json({ error: 'Requête invalide.' }); }
    return;
  }
  let resource = url.pathname.replace(/^\//, '');
  if (!resource) resource = 'index.html';
  if (resource === 'admin' || resource === 'admin/') resource = 'admin/index.html';
  const file = path.resolve(root, resource);
  if (!file.startsWith(root + path.sep) || !publicPaths.has(resource.split('/')[0]) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
server.listen(port, '127.0.0.1', () => console.log(`Game: http://127.0.0.1:${port}/ | Admin: http://127.0.0.1:${port}/admin/`));
