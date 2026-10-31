// GPU renderer for the raster pieces: runs a scene module in headless Chromium on the Mac's GPU
// (ANGLE/Metal; on CI it falls back to SwiftShader), captures every frame, encodes an animated WebP.
//   node render/render.mjs <scene.mjs> <out.webp> [--w 1692] [--h 940] [--frames 120] [--fps 30]
//        [--q 82] [--still out.png] [--at 0.5] [--png-only]
// A scene module exports `async function setup(ctx)` returning `draw(t, frame)`; ctx has
// { gl, canvas, w, h, shader(fragSrc) -> {draw(uniforms)}, texture(canvas2d) }.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const [sceneFile, out] = argv;
const W = +opt('w', 1692), H = +opt('h', 940), FRAMES = +opt('frames', 120), FPS = +opt('fps', 30), Q = +opt('q', 82);
const still = opt('still', null), at = +opt('at', 0.5), pngOnly = argv.includes('--png-only');

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(pathToFileURL(path.join(here, 'host.html')).href);
// Same fonts as the SVGs, for any text a scene draws into a 2D canvas.
const fontDir = path.resolve(here, '../fonts');
const fonts = Object.fromEntries(fs.readdirSync(fontDir).filter((f) => f.endsWith('.ttf'))
  .map((f) => [f.replace('.ttf', ''), `data:font/ttf;base64,${fs.readFileSync(path.join(fontDir, f)).toString('base64')}`]));
await page.evaluate(async (fonts) => {
  for (const [family, url] of Object.entries(fonts)) { const ff = new FontFace(family, `url(${url})`); await ff.load(); document.fonts.add(ff); }
}, fonts);
// Images a scene needs: --assets name=path,name=path -> window.ASSETS[name] as data URLs.
const assets = Object.fromEntries((opt('assets', '') || '').split(',').filter(Boolean).map((kv) => {
  const [k, p] = kv.split('=');
  return [k, `data:image/${path.extname(p).slice(1)};base64,${fs.readFileSync(path.resolve(p)).toString('base64')}`];
}));
await page.evaluate((a) => { window.ASSETS = a; }, assets);
// Data a scene needs: --json path -> window.ASSETS_JSON.
const jsonFile = opt('json', null);
await page.evaluate((j) => { window.ASSETS_JSON = j; }, jsonFile ? JSON.parse(fs.readFileSync(jsonFile, 'utf8')) : null);
// Scene parameters: --param key=value,key=value -> window.PARAMS (strings).
const params = Object.fromEntries((opt('param', '') || '').split(',').filter(Boolean).map((kv) => kv.split('=')));
await page.evaluate((p) => { window.PARAMS = p; }, params);
await page.evaluate(async ({ src, W, H }) => window.boot(src, W, H), { src: fs.readFileSync(sceneFile, 'utf8'), W, H });

// Per-frame images: --seq dir/c%04d.png -> window.SEQ (an Image) is set before each frame is drawn.
const seq = opt('seq', null);
const seqFile = (f) => seq.replace('%04d', String(f).padStart(4, '0'));
const grab = async (t, f) => {
  if (seq) {
    const url = `data:image/png;base64,${fs.readFileSync(seqFile(f)).toString('base64')}`;
    await page.evaluate(async (u) => { window.SEQ = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; }); }, url);
  }
  return page.evaluate(async ({ t, f }) => window.frame(t, f), { t, f });
};
if (still) {
  const b64 = await grab((at * FRAMES) / FPS, Math.round(at * FRAMES));
  fs.writeFileSync(still, Buffer.from(b64, 'base64'));
  console.log('still ->', still);
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  const t0 = Date.now();
  for (let f = 0; f < FRAMES; f++) {
    const b64 = await grab(f / FPS, f);
    fs.writeFileSync(path.join(dir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
  }
  console.log(`${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (!pngOnly) {
    const files = fs.readdirSync(dir).sort().map((f) => path.join(dir, f));
    execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', String(Q), '-m', String(opt('m', 4)), ...(opt('kmax', null) ? ['-kmin', '0', '-kmax', opt('kmax')] : []), '-d', String(Math.round(1000 / FPS)), ...files, '-o', out]);
    console.log(`${path.basename(out)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    fs.rmSync(dir, { recursive: true });
  } else console.log('frames in', dir);
}
await browser.close();
