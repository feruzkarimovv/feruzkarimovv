// Builds the SVG rows in ../assets and writes ../README.md. The hero (assets/hero.*) comes from
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
  ['caption', (t, mode) => caption(t, content.tagline, { mode }), L.hero, content.tagline],
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
const heroBytes = fs.statSync(path.join(ASSETS, 'hero.wide.dark.avif')).size;

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
// The hero is an AVIF loop (AV1 predicts motion between frames; a field of moving points would be ~13 MB
// as WebP), in four cuts: desktop/phone x dark/light, each on GitHub's own page colour so it sits on the
// page with no panel. Reduced-motion visitors get the still (the first frame: the name), and browsers
// without AVIF fall back to the same stills. Sources that pair a theme with another condition use the
// no-space spelling so GitHub's <themed-picture> leaves them alone (see above).
const H = (cut, theme, ext) => `assets/hero.${cut}.${theme}.${ext}`;
const RM = '(prefers-reduced-motion: reduce)';
const hero = `<picture>` +
  `<source media="${RM} and ${NARROW} and (prefers-color-scheme:light)" srcset="${H('compact', 'light', 'webp')}">` +
  `<source media="${RM} and ${NARROW}" srcset="${H('compact', 'dark', 'webp')}">` +
  `<source media="${RM} and (prefers-color-scheme:light)" srcset="${H('wide', 'light', 'webp')}">` +
  `<source media="${RM}" srcset="${H('wide', 'dark', 'webp')}">` +
  `<source media="${NARROW} and (prefers-color-scheme:light)" type="image/avif" srcset="${H('compact', 'light', 'avif')}">` +
  `<source media="${NARROW}" type="image/avif" srcset="${H('compact', 'dark', 'avif')}">` +
  `<source media="(prefers-color-scheme: light)" type="image/avif" srcset="${H('wide', 'light', 'avif')}">` +
  `<source type="image/avif" srcset="${H('wide', 'dark', 'avif')}">` +
  `<source media="${NARROW} and (prefers-color-scheme:light)" srcset="${H('compact', 'light', 'webp')}">` +
  `<source media="${NARROW}" srcset="${H('compact', 'dark', 'webp')}">` +
  `<source media="(prefers-color-scheme: light)" srcset="${H('wide', 'light', 'webp')}">` +
  `<img src="${H('wide', 'dark', 'webp')}" width="100%" align="top" alt="${esc(`${content.name}, written in particles: dust flowing in ribbons of light gathers into the name, holds, then drifts away.`)}"></picture>`;

const readme = `<div>\n<a href="${L.hero}">${hero}</a>\n${rows.map(([name, , href, alt]) => `<a href="${href}">${pic(name, alt)}</a>`).join('\n')}\n</div>\n`;
fs.writeFileSync(path.join(ROOT, 'README.md'), readme);
console.log(`${rows.length} rows × 2 layouts × 2 themes · per visit: hero ${(heroBytes / 1024).toFixed(0)} KB + rows ${(wideBytes / 1024).toFixed(0)} KB (desktop), ${(compactBytes / 1024).toFixed(0)} KB (mobile)`);
