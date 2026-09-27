// Annotations drawn over the final 8-bit frame: a pre-rasterised JetBrains Mono, hairlines, rings.
import fs from 'node:fs';

const atlas = JSON.parse(fs.readFileSync(new URL('./font.json', import.meta.url)));
const glyphCache = {};
function glyph(size, ch) {
  const key = size + ch;
  if (glyphCache[key]) return glyphCache[key];
  const f = atlas[size];
  const b64 = f.glyphs[ch] ?? f.glyphs['?'];
  return (glyphCache[key] = Uint8Array.from(Buffer.from(b64, 'base64')));
}

export const CREAM = [239, 232, 220];
export const ACCENT = [255, 162, 92];
export const COOL = [166, 204, 255];
export const LINE = 20; // callout line height

function blend(img, w, h, x, y, rgb, a) {
  if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
  const o = (y * w + x) * 4;
  img[o] += (rgb[0] - img[o]) * a;
  img[o + 1] += (rgb[1] - img[o + 1]) * a;
  img[o + 2] += (rgb[2] - img[o + 2]) * a;
}

/** Width in px of `str` at `size` with `track` extra px between letters. */
export const measure = (str, size = 15, track = 0) => [...str].length * (atlas[size].advance + track);

/** Draws text with its baseline at y. align: left | right | center. */
export function text(img, w, h, str, x, y, { size = 15, color = CREAM, alpha = 1, track = 0, align = 'left', shadow = true } = {}) {
  const f = atlas[size];
  const width = measure(str, size, track);
  let x0 = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  const top = Math.round(y - f.baseline);
  const chars = [...str];
  // A soft dark halo keeps small type legible over bright gas.
  for (const pass of shadow ? [0, 1] : [1]) {
    chars.forEach((ch, i) => {
      const g = glyph(size, ch);
      const gx = Math.round(x0 + i * (f.advance + track)) - f.ox;
      for (let yy = 0; yy < f.h; yy++)
        for (let xx = 0; xx < f.w; xx++) {
          const c = g[yy * f.w + xx];
          if (!c) continue;
          if (pass === 0) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) blend(img, w, h, gx + xx + dx, top + yy + dy, [0, 0, 0], (c / 255) * 0.45 * alpha);
          } else blend(img, w, h, gx + xx, top + yy, color, (c / 255) * alpha);
        }
    });
  }
  return width;
}

/** Anti-aliased hairline (Xiaolin Wu–ish via distance to segment). */
export function line(img, w, h, x0, y0, x1, y1, { color = CREAM, alpha = 0.6, width = 1 } = {}) {
  const minx = Math.floor(Math.min(x0, x1) - 2), maxx = Math.ceil(Math.max(x0, x1) + 2);
  const miny = Math.floor(Math.min(y0, y1) - 2), maxy = Math.ceil(Math.max(y0, y1) + 2);
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  for (let y = miny; y <= maxy; y++)
    for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
      const d = Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
      blend(img, w, h, x, y, color, Math.max(0, Math.min(1, width / 2 + 0.5 - d)) * alpha);
    }
}

/** Thin circle outline. */
export function ring(img, w, h, cx, cy, r, { color = CREAM, alpha = 0.7 } = {}) {
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r);
      blend(img, w, h, x, y, color, Math.max(0, 1 - d) * alpha);
    }
}

/**
 * A callout: small ring on the object, a leader pushed away from the hole, then the label.
 * `dir` is the unit direction to push the label; lines of text are stacked under the first.
 */
export function callout(img, w, h, ax, ay, dir, lines, { alpha = 1, color = CREAM, len = 26, marker = true } = {}) {
  const ex = ax + dir[0] * len, ey = ay + dir[1] * len;
  const right = dir[0] >= 0;
  if (marker) ring(img, w, h, ax, ay, 7, { color, alpha: 0.75 * alpha });
  line(img, w, h, ax + dir[0] * 10, ay + dir[1] * 10, ex, ey, { color, alpha: 0.55 * alpha, width: 1.3 });
  line(img, w, h, ex, ey, ex + (right ? 14 : -14), ey, { color, alpha: 0.55 * alpha, width: 1.3 });
  const tx = ex + (right ? 20 : -20);
  lines.forEach((l, i) => {
    const s = typeof l === 'string' ? { str: l } : l;
    text(img, w, h, s.str, tx, ey + 6 + i * LINE, { size: s.size ?? (i ? 15 : 17), color: s.color ?? color, alpha: (s.alpha ?? 1) * alpha, track: 0.6, align: right ? 'left' : 'right' });
  });
}
