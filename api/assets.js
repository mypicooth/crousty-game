const { randomUUID } = require('node:crypto');
const { getDownloadURL } = require('firebase-admin/storage');
const { services, requireAdmin, HttpError, send, failure, body } = require('../server/platform.cjs');

module.exports = async function handler(req, res) {
  try {
    const { auth, bucket } = services();
    const user = await requireAdmin(req, auth);
    if (req.method !== 'POST') throw new HttpError(405, 'Méthode non prise en charge.');
    const input = body(req);
    const file = Buffer.from(String(input.data || ''), 'base64');
    if (!file.length || file.length > 3 * 1024 * 1024) throw new HttpError(400, 'Le fichier doit peser moins de 3 Mo.');
    let extension;
    if (input.type === 'image/png' && file.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) extension = 'png';
    if (input.type === 'image/jpeg' && file[0] === 255 && file[1] === 216 && file[2] === 255) extension = 'jpg';
    if (input.type === 'image/webp' && file.toString('ascii', 0, 4) === 'RIFF' && file.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
    if (input.type === 'application/pdf' && file.toString('ascii', 0, 5) === '%PDF-') extension = 'pdf';
    if (!extension) throw new HttpError(400, 'Utilise une image PNG, JPG, WebP ou un document PDF valide.');
    const name = `studio-assets/${user.uid}/${randomUUID()}.${extension}`;
    const target = bucket.file(name);
    await target.save(file, {
      resumable: false,
      metadata: { contentType: input.type, contentDisposition: extension === 'pdf' ? 'attachment' : 'inline', metadata: { firebaseStorageDownloadTokens: randomUUID() } }
    });
    send(res, 200, { url: await getDownloadURL(target) });
  } catch (error) { failure(res, error); }
};
