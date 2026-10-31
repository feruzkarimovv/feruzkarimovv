// Everything around the hero, as full-width rows. Each row is its own image (and its own link), drawn
// twice: `wide` for desktop (846 px, transparent) and `compact` for phones and narrow windows (340 px,
// opaque so it still reads if the phone's theme and GitHub's disagree).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Doc, svg, wrap, measure, r, esc } from '../lib/svg.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WIDE = 846, COMPACT = 340;
const label = (t) => ({ fill: t.fg3, tracking: 0.08 });
const arrow = (doc, t, x, y, size = 14) => doc.text('text', x, y, size, '↗', { fill: t.fg3, anchor: 'end' });
const hair = (t, x1, x2, y, k = 1) => `<line x1="${r(x1)}" x2="${r(x2)}" y1="${y}" y2="${y}" stroke="${t.ink}" stroke-opacity="${r(t.hair * k, 3)}"/>`;
const bg = (t, W, H, mode) => (mode === 'compact' ? `<rect width="${W}" height="${H}" fill="${t.page}"/>` : '');
const make = (doc, t, W, H, mode, body, opts) => svg(doc, W, H, bg(t, W, H, mode) + body, opts);

// Section label with a hairline running to the right edge.
export function header(t, text, { mode = 'wide' } = {}) {
  const c = mode === 'compact';
  const W = c ? COMPACT : WIDE, H = c ? 58 : 76, top = c ? 42 : 58, size = c ? 10 : 10.5;
  const doc = new Doc();
  const s = text.toUpperCase();
  const lw = measure('mono', s, size, 0.08);
  const body = doc.text('mono', 0, top, size, s, label(t)) + hair(t, lw + 12, W, top - 3.5);
  return make(doc, t, W, H, mode, body, { title: text });
}

// Under the hero: the one line about you.
export function caption(t, line, { mode = 'wide' } = {}) {
  const doc = new Doc();
  const c = mode === 'compact';
  const W = c ? COMPACT : WIDE, H = c ? 50 : 52;
  const body = c
    ? doc.text('text', 0, 30, 14.5, line, { fill: t.fg2, tracking: -0.006 })
    : doc.text('text', 0, 33, 15, line, { fill: t.fg2, tracking: -0.006 });
  return make(doc, t, W, H, mode, body, { title: line });
}

// A quiet browser window around a real capture of the product (or a figure, for things without a UI).
function frame(doc, t, item, x, y, w, h) {
  const bar = Math.max(12, Math.round(h * 0.085));
  const id = `f${item.id}`;
  const barFill = t.name === 'dark' ? '#16171a' : '#f1f1f3';
  let inner;
  if (item.shot) {
    const b64 = fs.readFileSync(path.resolve(here, `../shots/${item.id}.jpg`)).toString('base64');
    inner = `<image href="data:image/jpeg;base64,${b64}" x="${r(x)}" y="${r(y + bar)}" width="${r(w)}" height="${r(h - bar)}" preserveAspectRatio="xMidYMin slice"/>`;
  } else inner = chart(doc, t, item.chart, x, y + bar, w, h - bar);
  const dots = [0, 1, 2].map((k) => `<circle cx="${r(x + bar * (0.75 + k * 0.5))}" cy="${r(y + bar / 2)}" r="${r(bar * 0.13)}" fill="${t.ink}" fill-opacity=".18"/>`).join('');
  const dom = item.domain ?? 'kestrel-4b · BFCL v4';
  return `<defs><clipPath id="${id}"><rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="7"/></clipPath></defs>` +
    `<g clip-path="url(#${id})"><rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${t.name === 'dark' ? '#0e0f12' : '#fafafa'}"/>${inner}` +
    `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${bar}" fill="${barFill}"/>${dots}` +
    doc.text('mono', x + w / 2, y + bar / 2 + bar * 0.17, bar * 0.46, dom, { fill: t.fg3, anchor: 'middle' }) +
    `</g><rect x="${r(x + 0.5)}" y="${r(y + 0.5)}" width="${r(w - 1)}" height="${r(h - 1)}" rx="7" stroke="${t.ink}" stroke-opacity="${r(t.hair * 1.6, 3)}"/>`;
}

// kestrel-4b has no screen yet, so its frame holds the scoreboard it's aiming at.
function chart(doc, t, rows, x, y, w, h) {
  const pad = w * 0.075, top = y + h * 0.2, gap = (h * 0.68) / rows.length, max = 55;
  const lw = w * 0.34, bw = w - pad * 2 - lw - w * 0.1;
  let out = doc.text('mono', x + pad, y + h * 0.13, h * 0.055, 'BFCL V4 · OVERALL', { fill: t.fg3, tracking: 0.08 });
  rows.forEach(([name, v, kind], i) => {
    const cy = top + gap * (i + 0.5), bh = Math.max(4, gap * 0.34), len = (v / max) * bw;
    const target = kind === 'target';
    out += doc.text('mono', x + pad, cy + h * 0.02, h * 0.05, name.toUpperCase(), { fill: target ? t.fg : t.fg3, tracking: 0.04 });
    out += target
      ? `<rect x="${r(x + pad + lw)}" y="${r(cy - bh / 2)}" width="${r(len)}" height="${r(bh)}" rx="1.5" stroke="${t.ink}" stroke-opacity=".8" stroke-dasharray="3 2.5" fill="${t.ink}" fill-opacity=".06"/>`
      : `<rect x="${r(x + pad + lw)}" y="${r(cy - bh / 2)}" width="${r(len)}" height="${r(bh)}" rx="1.5" fill="${t.ink}" fill-opacity="${i === rows.length - 2 ? 0.42 : 0.22}"/>`;
    out += doc.text('mono', x + pad + lw + len + w * 0.02, cy + h * 0.02, h * 0.05, (target ? '≥ ' : '') + v.toFixed(1), { fill: target ? t.fg : t.fg3 });
  });
  return out;
}

// Selected work: the product itself, then index and kind, name, one line, and the number that matters.
export function workRow(t, item, i, { mode = 'wide', last = false } = {}) {
  const doc = new Doc();
  const idx = `${String(i + 1).padStart(2, '0')} · ${item.kind.toUpperCase()}`;
  let W, H, body;
  if (mode === 'wide') {
    W = WIDE; H = 196;
    const fx = 0, fy = 22, fw = 272, fh = 170, tx = 306;
    const lines = wrap('text', item.blurb, 13.5, W - tx - 40).slice(0, 2);
    body = hair(t, 0, W, 0.5) + frame(doc, t, item, fx, fy, fw, fh) +
      doc.text('mono', tx, 60, 10, idx, label(t)) +
      doc.text('display', tx - 1, 94, 24, item.title, { fill: t.fg, tracking: -0.022 }) +
      lines.map((l, k) => doc.text('text', tx, 119 + k * 19, 13.5, l, { fill: t.fg2 })).join('') +
      doc.text('mono', tx, 176, 10, item.metric.toUpperCase(), label(t)) +
      (item.href ? arrow(doc, t, W + 1, 61) : '') + (last ? hair(t, 0, W, H - 0.5) : '');
  } else {
    W = COMPACT;
    const fh = Math.round(W * 0.625);
    const lines = wrap('text', item.blurb, 13.5, W - 4);
    H = fh + 132 + (lines.length - 1) * 19;
    const ty = fh + 20;
    body = hair(t, 0, W, 0.5) + frame(doc, t, item, 0, 18, W, fh) +
      doc.text('mono', 0, ty + 24, 10, idx, label(t)) +
      doc.text('display', -1, ty + 54, 22, item.title, { fill: t.fg, tracking: -0.022 }) +
      lines.map((l, k) => doc.text('text', 0, ty + 77 + k * 19, 13.5, l, { fill: t.fg2 })).join('') +
      doc.text('mono', W, ty + 24, 10, item.metric.toUpperCase(), { ...label(t), anchor: 'end' }) +
      (last ? hair(t, 0, W, H - 0.5) : '');
  }
  return make(doc, t, W, H, mode, body, { title: `${item.title}: ${item.blurb}` });
}

// Also / contact: one quiet line each.
export function listRow(t, item, { mode = 'wide', kind = 'also', last = false } = {}) {
  const doc = new Doc();
  const c = mode === 'compact';
  const W = c ? COMPACT : WIDE;
  let H, body = hair(t, 0, W, 0.5);
  if (kind === 'also') {
    if (!c) {
      H = 54;
      body += doc.text('textMed', 0, 33, 14, item.title, { fill: t.fg, tracking: -0.01 }) +
        doc.text('text', 220, 33, 13.5, item.blurb, { fill: t.fg2 }) + arrow(doc, t, W + 1, 34);
    } else {
      const lines = wrap('text', item.blurb, 13, W - 24);
      H = 62 + (lines.length - 1) * 18;
      body += doc.text('textMed', 0, 29, 14, item.title, { fill: t.fg, tracking: -0.01 }) +
        lines.map((l, k) => doc.text('text', 0, 49 + k * 18, 13, l, { fill: t.fg2 })).join('') + arrow(doc, t, W + 1, 30);
    }
  } else {
    H = c ? 50 : 52;
    body += doc.text('mono', 0, c ? 30 : 32, 10, item.label.toUpperCase(), label(t)) +
      doc.text('text', c ? 96 : 220, c ? 31 : 33, 14, item.value, { fill: t.fg, tracking: -0.005 }) + arrow(doc, t, W + 1, c ? 31 : 33);
  }
  if (last) body += hair(t, 0, W, H - 0.5);
  return make(doc, t, W, H, mode, body, { title: item.title ?? `${item.label}: ${item.value}` });
}

// "Now": a breathing point of light and one line.
export function now(t, item, { mode = 'wide' } = {}) {
  const doc = new Doc();
  const c = mode === 'compact';
  const W = c ? COMPACT : WIDE, H = c ? 70 : 60;
  const body = `<circle cx="7" cy="25" r="9" fill="${t.ink}" fill-opacity=".08" class="halo"/><circle cx="7" cy="25" r="3.2" fill="${t.ink}" class="dot"/>` +
    doc.text('display', 26, 32, c ? 19 : 20, item.line, { fill: t.fg, tracking: -0.015 }) +
    (c ? doc.text('mono', 26, 56, 10, item.aside.toUpperCase(), label(t))
      : doc.text('mono', W, 31, 10, item.aside.toUpperCase(), { ...label(t), anchor: 'end' }));
  const css = `.dot{animation:pulse 3.2s ease-in-out infinite}.halo{transform-box:fill-box;transform-origin:center;animation:halo 3.2s ease-in-out infinite}` +
    `@keyframes pulse{50%{opacity:.45}}@keyframes halo{50%{transform:scale(1.5);opacity:.3}}`;
  return make(doc, t, W, H, mode, body, { css, title: `Now: ${item.line}` });
}

export function footer(t, lines, { mode = 'wide' } = {}) {
  const doc = new Doc();
  const c = mode === 'compact';
  const W = c ? COMPACT : WIDE, H = c ? 84 : 76;
  const body = c
    ? doc.text('mono', 0, 46, 9, lines[0].toUpperCase(), label(t)) + doc.text('mono', 0, 62, 9, lines[1].toUpperCase(), label(t))
    : doc.text('mono', 0, 54, 9.5, lines[0].toUpperCase(), label(t)) + doc.text('mono', W, 54, 9.5, lines[1].toUpperCase(), { ...label(t), anchor: 'end' });
  return make(doc, t, W, H, mode, body, { title: lines.join('. ') });
}

export { esc };
