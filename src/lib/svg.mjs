// SVG helpers: font metrics (opentype.js), text elements that remember which glyphs they used,
// and @font-face blocks with only those glyphs embedded (pyftsubset -> woff2 -> base64).
// GitHub serves README images as <img>, so an SVG can't load anything external: fonts travel inside it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(here, '../fonts');
const CACHE = path.join(os.tmpdir(), 'profile-font-cache');
fs.mkdirSync(CACHE, { recursive: true });

export const FONTS = {
  display: { file: 'InterDisplay-Medium.ttf', features: 'kern,calt,ss01,cv11,tnum,case' },
  displaySemi: { file: 'InterDisplay-SemiBold.ttf', features: 'kern,calt,ss01,cv11,tnum,case' },
  displayReg: { file: 'InterDisplay-Regular.ttf', features: 'kern,calt,ss01,cv11,tnum,case' },
  text: { file: 'Inter-Regular.ttf', features: 'kern,calt,cv11,tnum,case' },
  textMed: { file: 'Inter-Medium.ttf', features: 'kern,calt,cv11,tnum,case' },
  mono: { file: 'GeistMono-Regular.ttf', features: 'kern,ss01' },
  monoMed: { file: 'GeistMono-Medium.ttf', features: 'kern,ss01' },
};

const parsed = {};
const font = (key) => (parsed[key] ??= opentype.loadSync(path.join(FONT_DIR, FONTS[key].file)));

// Advance width of a run in px, with kerning; tracking is in em and, like CSS letter-spacing,
// lands after every glyph (we drop the trailing one so widths match what the eye sees).
export function measure(key, text, size, tracking = 0) {
  const f = font(key);
  const glyphs = f.stringToGlyphs(text);
  let w = 0;
  for (let i = 0; i < glyphs.length; i++) {
    w += glyphs[i].advanceWidth;
    if (i < glyphs.length - 1) w += f.getKerningValue(glyphs[i], glyphs[i + 1]);
  }
  return (w / f.unitsPerEm) * size + tracking * size * Math.max(0, glyphs.length - 1);
}

// Word wrap against real glyph widths. Finds the fewest lines greedily, then re-breaks two- and
// three-line runs so the lines come out even (no single word stranded on the last line).
export function wrap(key, text, size, maxW, tracking = 0) {
  const words = text.split(/\s+/);
  const w = (a, b) => measure(key, words.slice(a, b).join(' '), size, tracking);
  const greedy = [];
  let start = 0;
  for (let i = 1; i <= words.length; i++) {
    if (i < words.length && w(start, i + 1) > maxW) { greedy.push([start, i]); start = i; }
  }
  greedy.push([start, words.length]);
  const n = greedy.length;
  if (n < 2 || n > 3) return greedy.map(([a, b]) => words.slice(a, b).join(' '));
  let best = null, bestCost = Infinity;
  const consider = (cuts) => {
    const spans = cuts.map((c, k) => [k ? cuts[k - 1] : 0, c]).concat([[cuts.at(-1), words.length]]);
    const widths = spans.map(([a, b]) => w(a, b));
    if (widths.some((x) => x > maxW)) return;
    const cost = Math.max(...widths) - Math.min(...widths);
    if (cost < bestCost) { bestCost = cost; best = spans; }
  };
  for (let i = 1; i < words.length; i++) {
    if (n === 2) consider([i]);
    else for (let j = i + 1; j < words.length; j++) consider([i, j]);
  }
  return (best ?? greedy).map(([a, b]) => words.slice(a, b).join(' '));
}

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// One per SVG: collects characters per font so only those glyphs get embedded.
export class Doc {
  constructor() { this.used = {}; }
  use(key, text) { (this.used[key] ??= new Set()); for (const ch of text) this.used[key].add(ch); }
  // <text> with family set to the font key; tracking in em; anchor start|middle|end.
  text(key, x, y, size, str, { fill = '#fff', tracking = 0, anchor = 'start', opacity, cls, extra = '' } = {}) {
    this.use(key, str);
    const a = [`x="${r(x)}"`, `y="${r(y)}"`, `font-family="${key}"`, `font-size="${size}"`, `fill="${fill}"`];
    if (tracking) a.push(`letter-spacing="${r(tracking * size, 3)}"`);
    // letter-spacing trails the last glyph; shift end/middle anchored runs back by it.
    if (anchor !== 'start') {
      a.push(`text-anchor="${anchor}"`);
      if (tracking) a[0] = `x="${r(x + (anchor === 'end' ? tracking * size : tracking * size / 2))}"`;
    }
    if (opacity != null) a.push(`opacity="${opacity}"`);
    if (cls) a.push(`class="${cls}"`);
    return `<text ${a.join(' ')}${extra ? ' ' + extra : ''}>${esc(str)}</text>`;
  }
  fontFaces() {
    return Object.entries(this.used).map(([key, set]) => {
      const b64 = subset(key, [...set].join(''));
      return `@font-face{font-family:${key};src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
    }).join('');
  }
}

function subset(key, chars) {
  const { file, features } = FONTS[key];
  const sig = crypto.createHash('sha1').update(file + features + chars).digest('hex').slice(0, 16);
  const out = path.join(CACHE, `${sig}.woff2`);
  if (!fs.existsSync(out)) {
    const txt = path.join(CACHE, `${sig}.txt`);
    fs.writeFileSync(txt, chars + ' ');
    execFileSync('pyftsubset', [path.join(FONT_DIR, file), `--text-file=${txt}`, `--layout-features=${features}`,
      '--flavor=woff2', `--output-file=${out}`, '--no-hinting', '--desubroutinize']);
  }
  return fs.readFileSync(out).toString('base64');
}

export const r = (n, d = 2) => +(+n).toFixed(d);

// Wraps body in an <svg> with embedded fonts, a reduced-motion guard and optional extra CSS.
export function svg(doc, w, h, body, { css = '', title = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">` +
    (title ? `<title>${esc(title)}</title>` : '') +
    `<style>${doc.fontFaces()}text{font-kerning:normal;font-feature-settings:"ss01","cv11"}${css}` +
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>${body}</svg>`;
}

export function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return `${path.basename(file)} ${(content.length / 1024).toFixed(1)} KB`;
}
