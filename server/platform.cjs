const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { getStorage } = require('firebase-admin/storage');
const { createHmac, timingSafeEqual } = require('node:crypto');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function services() {
  if (process.env.STUDIO_ENABLED !== 'true') throw new HttpError(503, 'L’espace de gestion attend son activation. Contacte l’administrateur.');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.STUDIO_SESSION_SECRET || process.env.STUDIO_SESSION_SECRET.length < 32) throw new HttpError(503, 'Configuration du serveur incomplète.');
  if (!getApps().length) initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
  return { auth: getAuth(), db: getDatabase(), bucket: getStorage().bucket() };
}
function bearer(req) { return String(req.headers.authorization || '').replace(/^Bearer /, ''); }
async function requireAdmin(req, auth) {
  let user;
  try { user = await auth.verifyIdToken(bearer(req), true); }
  catch { throw new HttpError(401, 'Connecte-toi pour accéder à l’administration.'); }
  const allowed = (process.env.STUDIO_ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase());
  if (!user.email_verified || !allowed.includes(String(user.email || '').toLowerCase())) throw new HttpError(403, 'Ce compte n’est pas autorisé à administrer les jeux.');
  return user;
}
function sign(value) { return createHmac('sha256', process.env.STUDIO_SESSION_SECRET).update(value).digest('base64url'); }
function participantId(gameId, email) { return sign(`participant:${gameId}:${email.trim().toLowerCase()}`); }
function issueSession(gameId, id) {
  const payload = Buffer.from(JSON.stringify({ gameId, id, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  return payload + '.' + sign(payload);
}
function requireSession(req, gameId) {
  const [payload, signature = ''] = bearer(req).split('.');
  const expected = sign(payload || '');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new HttpError(401, 'Ta session a expiré. Remplis à nouveau le formulaire.');
  let session;
  try { session = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new HttpError(401, 'Session invalide.'); }
  if (session.gameId !== gameId || session.exp < Date.now() || !/^[\w-]{20,80}$/.test(session.id)) throw new HttpError(401, 'Session invalide.');
  return session;
}
function send(res, status, body) { res.setHeader('Cache-Control', 'no-store'); res.status(status).json(body); }
function failure(res, error) {
  if (!error.status) console.error('Studio API error:', error.code || error.name);
  send(res, error.status || 500, { error: error.status ? error.message : 'Le service est momentanément indisponible. Réessaie dans un instant.' });
}
function body(req) {
  const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Requête invalide.');
  return value;
}
module.exports = { services, requireAdmin, requireSession, issueSession, participantId, HttpError, send, failure, body };
