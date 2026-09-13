export class ConfigError extends Error {
  constructor(message, path = '') { super(message); this.path = path; }
}
export const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
export function assetUrl(value, path = '') {
  if (!value) return '';
  let url;
  try { url = new URL(String(value)); } catch { throw new ConfigError('Lien invalide.', path); }
  if (url.protocol !== 'https:') throw new ConfigError('Les liens doivent utiliser HTTPS.', path);
  return url.href;
}
export const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? String(value).toLowerCase() : fallback;
export function number(value, { min, max, integer = false, fallback, path = '', label = 'Valeur' }) {
  const n = value === '' || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) throw new ConfigError(`${label} : choisis une valeur entre ${min} et ${max}.`, path);
  return n;
}
export const oneOf = (value, options, fallback) => options.includes(value) ? value : fallback;
export const getPath = (obj, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
export function setPath(obj, path, value) {
  const keys = path.split('.'); const last = keys.pop();
  let node = obj;
  for (const key of keys) node = node[key] ??= {};
  node[last] = value;
  return obj;
}
