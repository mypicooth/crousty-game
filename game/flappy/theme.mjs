import { FONTS, renderText, stageBackground, FIXED_FIELDS } from '../../shared/flappy-config.mjs';
import { getPath } from '../../shared/validate.mjs';

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
const cssUrl = url => `url(${JSON.stringify(url)})`;
export function cssVariables(f) {
  const image = f.obstacles.style === 'image';
  return {
    '--fb-accent': f.brand.accent, '--fb-panel-bg': f.theme.panelBg, '--fb-panel-text': f.theme.panelText,
    '--fb-button-bg': f.theme.buttonBg, '--fb-button-text': f.theme.buttonText, '--fb-hud-text': f.theme.hudText,
    '--fb-overlay': hexToRgba(f.theme.overlayColor, f.theme.overlayOpacity / 100), '--fb-font': FONTS[f.theme.font].family,
    '--fb-bird-size': f.character.size + 'px', '--fb-bird-x': f.character.startX + 'vw', '--fb-bird-y': f.character.startY + 'vh',
    '--fb-pipe-width': f.obstacles.width + 'vw', '--fb-pipe-radius': f.obstacles.radius + 'px',
    '--fb-pipe-a': f.obstacles.colorA, '--fb-pipe-b': f.obstacles.colorB, '--fb-pipe-border': f.obstacles.border,
    '--fb-pipe-top': image ? cssUrl(f.obstacles.topUrl || f.obstacles.bottomUrl) : 'none',
    '--fb-pipe-bottom': image ? cssUrl(f.obstacles.bottomUrl || f.obstacles.topUrl) : 'none'
  };
}
function loadFont(key, doc) {
  const font = FONTS[key]; let link = doc.getElementById('fbFont');
  if (!font.google) { link?.remove(); return; }
  if (!link) { link = doc.createElement('link'); link.id = 'fbFont'; link.rel = 'stylesheet'; doc.head.append(link); }
  const href = 'https://fonts.googleapis.com/css2?family=' + font.google + '&display=swap';
  if (link.getAttribute('href') !== href) link.href = href;
}
export function setBackground(doc, url) { doc.querySelector('.background').style.backgroundImage = cssUrl(url); }
export function readForm(doc = document) {
  const value = id => doc.getElementById(id)?.value?.trim() ?? '';
  const extra = {};
  for (const node of doc.querySelectorAll('[data-custom]')) extra[node.dataset.custom] = node.type === 'checkbox' ? node.checked : node.value.trim();
  return { firstName: value('firstName'), lastName: value('lastName'), email: value('email'), phone: value('phone'), extra };
}
export function buildForm(form, container, doc = document) {
  const previous = readForm(doc);
  container.replaceChildren();
  const types = { firstName: 'text', lastName: 'text', email: 'email', phone: 'tel' };
  const autocomplete = { firstName: 'given-name', lastName: 'family-name', email: 'email', phone: 'tel' };
  for (const key of FIXED_FIELDS) {
    const field = form.fields[key]; if (!field.visible) continue;
    const input = doc.createElement('input');
    input.type = types[key]; input.id = key; input.autocomplete = autocomplete[key]; input.required = field.required;
    input.placeholder = field.label + (field.required ? ' *' : ''); input.value = previous[key] || '';
    container.append(input);
  }
  for (const field of form.customFields) {
    const id = 'cf_' + field.id; const label = field.label + (field.required ? ' *' : '');
    if (field.type === 'checkbox') {
      const wrap = doc.createElement('label'); wrap.className = 'consent-line';
      const box = doc.createElement('input'); box.type = 'checkbox'; box.id = id; box.dataset.custom = field.id; box.checked = previous.extra[field.id] === true;
      const span = doc.createElement('span'); span.textContent = label;
      wrap.append(box, span); container.append(wrap); continue;
    }
    let input;
    if (field.type === 'select') {
      input = doc.createElement('select');
      const empty = doc.createElement('option'); empty.value = ''; empty.textContent = label; input.append(empty);
      for (const option of field.options) { const o = doc.createElement('option'); o.value = option; o.textContent = option; input.append(o); }
    } else { input = doc.createElement('input'); input.type = 'text'; input.placeholder = label; input.maxLength = 200; }
    input.id = id; input.dataset.custom = field.id; input.value = previous.extra[field.id] ?? '';
    container.append(input);
  }
}
function consentTexts(campaign, doc) {
  const consent = doc.getElementById('gameConsentText');
  consent.replaceChildren(doc.createTextNode('J’accepte '));
  [['le règlement du jeu', campaign.termsUrl], ['la politique de confidentialité', campaign.privacyUrl]].forEach(([label, url], index) => {
    if (index) consent.append(doc.createTextNode(' et '));
    if (!url) { consent.append(doc.createTextNode(label)); return; }
    const a = doc.createElement('a'); a.textContent = label; a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; consent.append(a);
  });
  consent.append(doc.createTextNode('.'));
  doc.getElementById('marketingText').textContent = campaign.marketingLabel;
}
export function applyTheme(campaign, vars, doc = document) {
  const f = campaign.flappy;
  for (const [key, value] of Object.entries(cssVariables(f))) doc.documentElement.style.setProperty(key, value);
  loadFont(f.theme.font, doc);
  doc.body.classList.toggle('custom-pipes', f.obstacles.style === 'image');
  doc.title = campaign.name;
  for (const node of doc.querySelectorAll('[data-text]')) {
    const template = getPath(f.screens, node.dataset.text) ?? '';
    node.textContent = renderText(node.dataset.text === 'welcome.title' && !template ? campaign.name : template, vars);
  }
  const logo = doc.querySelector('.game-logo'); logo.querySelector('img')?.remove();
  if (f.brand.logoUrl) { const img = doc.createElement('img'); img.src = f.brand.logoUrl; img.alt = campaign.company || ''; img.className = 'brand-logo'; logo.prepend(img); }
  const bird = doc.querySelector('.bird'); const src = f.character.imageUrl || '/img/logo.png';
  if (bird.getAttribute('src') !== src) bird.src = src;
  setBackground(doc, stageBackground(f.stages, 0));
  buildForm(f.form, doc.getElementById('formFields'), doc);
  consentTexts(campaign, doc);
  const cta = doc.getElementById('rankingCta');
  cta.hidden = !f.screens.ranking.ctaLabel; cta.textContent = f.screens.ranking.ctaLabel; cta.href = f.screens.ranking.ctaUrl || '#';
}
