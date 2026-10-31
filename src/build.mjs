// Builds the SVG rows in ../assets and writes ../README.md. The hero (assets/hero*.webp) comes from
// render/build-hero.mjs, which needs a GPU; run it again only when the hero itself changes.
//   node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from './lib/svg.mjs';
import { THEMES } from './lib/theme.mjs';
import { header, caption, workRow, listRow, now, footer } from './sections/blocks.mjs';
import * as content from './content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const ASSETS = path.join(ROOT, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

const { work, also, contact, links: L } = content;
const lastOf = (arr, i) => i === arr.length - 1;

// Rows top to bottom: [file name, (theme, mode) => svg, link, alt text].
const rows = [
  ['caption', (t, mode) => caption(t, content.tagline, content.heroNote, { mode }), L.hero, `${content.tagline} ${content.heroNote}`],
  ['h-work', (t, mode) => header(t, 'Selected work', { mode }), L.work, 'Selected work'],
  ...work.map((w, i) => [`work-${w.id}`, (t, mode) => workRow(t, w, i, { mode, last: lastOf(work, i) }), w.href, `${w.title}. ${w.blurb} ${w.metric}.`]),
  ['h-also', (t, mode) => header(t, 'Also', { mode }), L.also, 'Also'],
  ...also.map((a, i) => [`also-${a.id}`, (t, mode) => listRow(t, a, { mode, last: lastOf(also, i) }), a.href, `${a.title}. ${a.blurb}`]),
  ['h-now', (t, mode) => header(t, 'Now', { mode }), L.now, 'Now'],
  ['now', (t, mode) => now(t, content.now, { mode }), L.now, `Now: ${content.now.line} ${content.now.aside}.`],
  ['h-contact', (t, mode) => header(t, 'Contact', { mode }), L.contact, 'Contact'],
  ...contact.map((c, i) => [`contact-${c.id}`, (t, mode) => listRow(t, c, { mode, kind: 'contact', last: lastOf(contact, i) }), c.href, `${c.label}: ${c.value}`]),
  ['footer', (t, mode) => footer(t, content.colophon, { mode }), L.footer, content.colophon.join('. ')],
];

const file = (name, mode, theme) => `${name}${mode === 'compact' ? '.compact' : ''}.${theme}.svg`;
const keep = new Set();
let wideBytes = 0, compactBytes = 0;
for (const [name, make] of rows) {
  for (const mode of ['wide', 'compact']) {
    for (const t of Object.values(THEMES)) {
      const out = make(t, mode);
      if (t.name === 'dark') mode === 'wide' ? (wideBytes += out.length) : (compactBytes += out.length);
      fs.writeFileSync(path.join(ASSETS, file(name, mode, t.name)), out);
      keep.add(file(name, mode, t.name));
    }
  }
}
for (const f of fs.readdirSync(ASSETS)) if (f.endsWith('.svg') && !keep.has(f)) fs.rmSync(path.join(ASSETS, f));
const heroBytes = fs.statSync(path.join(ASSETS, 'hero.webp')).size + 0;

// Source order matters and is shaped by GitHub's <themed-picture>: when someone picks light or dark in
// their GitHub settings it rewrites any media containing "prefers-color-scheme: light|dark" to match.
// The desktop light source uses that spelling on purpose. The narrow-screen sources write
// "prefers-color-scheme:light" without the space, which GitHub's matcher skips, so their width
// condition survives (those follow the phone's own theme and carry an opaque background).
const NARROW = '(max-width: 1011px)';
const pic = (name, alt) => `<picture>` +
  `<source media="${NARROW} and (prefers-color-scheme:light)" srcset="assets/${file(name, 'compact', 'light')}">` +
  `<source media="${NARROW}" srcset="assets/${file(name, 'compact', 'dark')}">` +
  `<source media="(prefers-color-scheme: light)" srcset="assets/${file(name, 'wide', 'light')}">` +
  `<img src="assets/${file(name, 'wide', 'dark')}" width="100%" align="top" alt="${esc(alt)}"></picture>`;
// The hero is one dark film in both themes; it only swaps for phones, and for a still when the visitor
// has asked for reduced motion (GitHub doesn't pause animated WebP on its own).
const hero = `<picture>` +
  `<source media="(prefers-reduced-motion: reduce) and ${NARROW}" srcset="assets/hero.compact.still.webp">` +
  `<source media="(prefers-reduced-motion: reduce)" srcset="assets/hero.still.webp">` +
  `<source media="${NARROW}" srcset="assets/hero.compact.webp">` +
  `<img src="assets/hero.webp" width="100%" align="top" alt="${esc(`${content.name}: the name written in light on a dark table, refracted by a floating pane of glass whose surface was solved so its light spells it.`)}"></picture>`;

const readme = `<div>\n<a href="${L.hero}">${hero}</a>\n${rows.map(([name, , href, alt]) => `<a href="${href}">${pic(name, alt)}</a>`).join('\n')}\n</div>\n`;
fs.writeFileSync(path.join(ROOT, 'README.md'), readme);
console.log(`${rows.length} rows × 2 layouts × 2 themes · per visit: hero ${(heroBytes / 1024).toFixed(0)} KB + rows ${(wideBytes / 1024).toFixed(0)} KB (desktop), ${(compactBytes / 1024).toFixed(0)} KB (mobile)`);
