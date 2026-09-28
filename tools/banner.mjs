// Renders assets/banner.webp: name and one line on the left, a slowly turning black hole on the right.
// The hole is ray-traced on the CPU by engine/ (same physics as feruz-karimov.dev); the type is set by a
// headless browser so it can use the site's fonts. Run:  cd tools && npm install && npm run banner
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { camera, allocMap, trace, smoothstep } from '../engine/physics.mjs';
import { NR, NPHI, R0, R1, turbulence } from '../engine/disk.mjs';
import { renderFrame, bloomLayer, post, roundedMask } from '../engine/shade.mjs';
import { writePng } from '../engine/png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const W = 1600, H = 500, SS = 2, FPS = 20, FRAMES = +arg('frames', 160);
const DEG = Math.PI / 180;
const OUT = path.resolve(here, '..', arg('out', 'assets/banner.webp'));

// ---------------------------------------------------------------- type
const TEXT = /* html */ `
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..900&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; background: transparent; }
  .t { position: absolute; left: 76px; top: 0; height: ${H}px; display: flex; flex-direction: column; justify-content: center; color: #efe8dc; -webkit-font-smoothing: antialiased; }
  .name { font: 800 66px/0.95 'Archivo', sans-serif; font-stretch: 125%; letter-spacing: -0.025em; text-transform: uppercase; }
  .tag { margin-top: 20px; font: italic 400 46px/1.1 'Instrument Serif', serif; }
  .tag b { font-weight: 400; color: #ffb27a; }
  .meta { margin-top: 26px; font: 500 19px 'JetBrains Mono', monospace; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(239, 232, 220, 0.6); }
</style>
<div class="t">
  <div class="name">Feruz Karimov</div>
  <div class="tag">I build products people <b>actually</b> use.</div>
  <div class="meta">Co-founder of Jonivor · CS + Data Science @ Rutgers ’28</div>
</div>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banner-'));
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(TEXT);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(tmp, 'text.png'), omitBackground: true });
  await browser.close();
}
const text = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path.join(tmp, 'text.png'), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 });

// ---------------------------------------------------------------- spacetime
// Hole pushed to the right third with yaw; slightly above the disk plane, like the site's hero.
const cam = camera({ w: W * SS, h: H * SS, r: 34, elev: 7 * DEG, az: 0.6, roll: -5 * DEG, yaw: -18.5 * DEG, fov: 24 });
const map = allocMap(cam.w * cam.h);
trace(cam, map, 0, cam.h, { escape: cam.r * 1.35 + 6 });

// A plain disk (no data): dense near the ISCO, thinning out by r ≈ 10.
const sab = () => new Float32Array(new SharedArrayBuffer(NR * NPHI * 4));
const tex = { E: sab(), H: sab(), B: sab(), N: turbulence() };
for (let i = 0; i < NR; i++) {
  const r = R0 + ((i + 0.5) / NR) * (R1 - R0);
  const e = 2.4 * smoothstep(2.9, 3.5, r) * (1 - smoothstep(6, 9.8, r)) * Math.pow(3 / r, 0.9);
  tex.E.fill(e, i * NPHI, (i + 1) * NPHI);
}

// ---------------------------------------------------------------- frames
const opts = { w: cam.w, h: cam.h, ss: SS, cyc: 16, gain: 1.15, jet: 0, stars: [] };
const hdr = new Float32Array(W * H * 3);
const rgba = new Uint8Array(W * H * 4);
const mask = roundedMask(W, H, 14);
let glow = null;
for (let i = 0; i < FRAMES; i++) {
  renderFrame(map, tex, opts, i / FRAMES, hdr);
  glow ??= bloomLayer(hdr, W, H); // bloom from the first frame only, so the text area never changes between frames
  for (let k = 0; k < hdr.length; k++) hdr[k] += glow[k];
  post(hdr, W, H, rgba, mask);
  for (let p = 0; p < W * H; p++) {
    const a = text[p * 4 + 3] / 255;
    if (!a) continue;
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] += (text[p * 4 + c] - rgba[p * 4 + c]) * a;
  }
  writePng(path.join(tmp, `f${String(i).padStart(4, '0')}.png`), rgba, W, H);
  if (i % 40 === 0) console.log(`frame ${i}/${FRAMES}`);
}

const files = fs.readdirSync(tmp).filter((f) => f.startsWith('f')).sort().map((f) => path.join(tmp, f));
execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', arg('q', '84'), '-m', '6', '-kmin', '20', '-kmax', '40', '-d', String(1000 / FPS), ...files, '-o', OUT], { stdio: 'ignore' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${path.relative(process.cwd(), OUT)}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
