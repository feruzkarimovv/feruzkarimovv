// Rasterises JetBrains Mono into engine/font.json so the CI renderer can set type without a font stack.
// Run once:  cd tools && npm install && npm run font
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '·→←↗—–×≈≥★✦⊘☉ₛ°…↺';
const SIZES = [15, 17, 19];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=block" rel="stylesheet"><body></body>`,
);
const atlas = await page.evaluate(
  async ({ CHARS, SIZES }) => {
    await document.fonts.load('500 13px "JetBrains Mono"');
    const out = {};
    for (const size of SIZES) {
      const scale = 2; // glyphs are drawn at 2× and read back per sub-pixel for crisp downsampling
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      const font = `500 ${size * scale}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.font = font;
      const adv = ctx.measureText('M').width / scale;
      const cw = Math.ceil(adv * 1.6) * scale, ch = Math.ceil(size * 1.5) * scale;
      c.width = cw * CHARS.length;
      c.height = ch;
      ctx.font = font;
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'alphabetic';
      const base = Math.round(size * 1.1 * scale);
      [...CHARS].forEach((g, i) => ctx.fillText(g, i * cw + Math.round(adv * 0.3 * scale), base));
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      // Downsample 2× → coverage at 1×.
      const w1 = cw / scale, h1 = ch / scale;
      const glyphs = {};
      [...CHARS].forEach((g, i) => {
        const a = new Uint8Array(w1 * h1);
        for (let y = 0; y < h1; y++)
          for (let x = 0; x < w1; x++) {
            let s = 0;
            for (let dy = 0; dy < scale; dy++)
              for (let dx = 0; dx < scale; dx++) s += px[((y * scale + dy) * c.width + i * cw + x * scale + dx) * 4 + 3];
            a[y * w1 + x] = Math.round(s / (scale * scale));
          }
        glyphs[g] = btoa(String.fromCharCode(...a));
      });
      out[size] = { w: w1, h: h1, advance: adv, ox: Math.round(adv * 0.3), baseline: base / scale, glyphs };
    }
    return out;
  },
  { CHARS, SIZES },
);
await browser.close();
fs.writeFileSync(path.join(here, '../engine/font.json'), JSON.stringify(atlas));
console.log('engine/font.json', (fs.statSync(path.join(here, '../engine/font.json')).size / 1024).toFixed(0), 'KB');
