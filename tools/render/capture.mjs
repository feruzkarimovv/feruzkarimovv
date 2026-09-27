// Renders the README's moving images from the real ray tracer (../../../23-web/src/gl).
//
//   node capture.mjs banner    → assets/event-horizon.webp   lensed name, seamless loop
//   node capture.mjs footer    → assets/horizon.webp          past the horizon, with the site's copy
//   node capture.mjs still [--view '{"r":9}'] [--w 1280 --h 640] [--t 3]   quick look, .out/still.png
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '../../assets');
const ehRoot = path.resolve(process.env.EH_SRC ? path.dirname(process.env.EH_SRC) : path.join(here, '../../../23-web'));
const DEG = Math.PI / 180;
const LOOP = 16; // the disk's flow map repeats every 16 s of shader time

const [scene = 'banner', ...rest] = process.argv.slice(2);
const arg = (k, d) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : d;
};
const userView = JSON.parse(arg('view', '{}'));

const vite = await import(pathToFileURL(createRequire(path.join(ehRoot, 'package.json')).resolve('vite')).href);
const server = await vite.createServer({ configFile: path.join(here, 'vite.config.ts') });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });

async function open(w, h, { dpr = 1, ...opts } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto('http://localhost:5199/');
  await page.waitForFunction(() => window.ready);
  console.log(`  renderer: ${await page.evaluate((o) => window.setup(o), opts)}`);
  return page;
}

const savePng = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

/** Canvas readback by default; `shot` screenshots the page instead so DOM overlays are included. */
async function renderFrames(page, name, frames, { shot = false } = {}) {
  const dir = path.join(here, '.out', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // Throwaway first draw: shader compile and first-use uploads otherwise leave frame 0 slightly off.
  await page.evaluate(([t, v]) => window.draw(t, v), [frames[0].t, frames[0].v]);
  const t0 = Date.now();
  for (let i = 0; i < frames.length; i++) {
    const { t, v, css } = frames[i];
    const file = path.join(dir, `f${String(i).padStart(4, '0')}.png`);
    if (shot) {
      await page.evaluate(([t, v, css = {}]) => {
        for (const [k, x] of Object.entries(css)) document.querySelector('#overlay').style.setProperty(`--${k}`, x);
        window.draw(t, v);
      }, [t, v, css]);
      await page.screenshot({ path: file });
    } else {
      savePng(await page.evaluate(([t, v]) => window.frame(t, v), [t, v]), file);
    }
    if (i % 20 === 0) process.stdout.write(`\r  frame ${i + 1}/${frames.length}`);
  }
  process.stdout.write(`\r  ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  return dir;
}

/** Anti-aliased rounded-rectangle alpha mask, so the dark cards sit softly on GitHub's light theme. */
function roundMask(w, h, r) {
  const file = path.join(here, `.out/mask-${w}x${h}-${r}.png`);
  if (fs.existsSync(file)) return file;
  const d = `hypot(max(0,abs(X+0.5-W/2)-(W/2-${r})),max(0,abs(Y+0.5-H/2)-(H/2-${r})))`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `color=white:s=${w}x${h},format=gray`, '-vf', `geq=lum='255*clip(${r}+0.5-${d},0,1)'`, '-frames:v', '1', file]);
  return file;
}

/** Scale to `w` (lanczos) and cut rounded corners out of one or more PNGs. */
function finish(input, output, w, radius) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input.replace('%04d', '0000')]).toString().trim().split(',').map(Number);
  const h = Math.round((probe[1] * w) / probe[0]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input, '-i', roundMask(w, h, radius), '-filter_complex', `[0]scale=${w}:${h}:flags=lanczos,format=rgba[v];[1]format=gray[m];[v][m]alphamerge`, output]);
}

/** Downscale PNG frames and pack them into a looping animated WebP with rounded corners. */
function encodeWebp(dir, out, { w, fps, q, radius = Math.round(w / 128) }) {
  const small = `${dir}-small`;
  fs.rmSync(small, { recursive: true, force: true });
  fs.mkdirSync(small);
  finish(path.join(dir, 'f%04d.png'), path.join(small, 'f%04d.png'), w, radius);
  const files = fs.readdirSync(small).sort().map((f) => path.join(small, f));
  execFileSync('img2webp', ['-loop', '0', '-min_size', '-lossy', '-q', String(q), '-m', '6', '-d', String(Math.round(1000 / fps)), ...files, '-o', out]);
  console.log(`  ${path.relative(process.cwd(), out)}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

/** One full disk cycle, with `fn(phase)` adding per-frame view changes. */
const loop = (fps, secs, fn = () => ({})) =>
  Array.from({ length: fps * secs }, (_, i) => {
    const a = (i / (fps * secs)) * Math.PI * 2;
    return { t: (i / (fps * secs)) * LOOP, v: { ...fn(a), ...userView } };
  });

// ------------------------------------------------------------------ scenes

async function banner() {
  // The site's hero keyframe, a touch wider (fov 50) so both lines clear a 2:1 crop.
  // A slow sway stands in for mouse parallax; the name plane rides with the camera, so only the disk moves.
  const w = +arg('w', 1280), fps = +arg('fps', 24);
  const page = await open(w * 2, w);
  const frames = loop(fps, 10, (a) => ({ fov: 50, elev: (5 + 1.6 * Math.sin(a)) * DEG, az: 0.6 + 0.06 * Math.sin(a + 1.1) }));
  encodeWebp(await renderFrames(page, 'banner', frames), arg('out', path.join(assets, 'event-horizon.webp')), { w, fps, q: +arg('q', 82) });
}

async function footer() {
  // The site's photon-sphere keyframe, half redshifted. Copy sits inside the shadow.
  const fps = +arg('fps', 20), secs = +arg('secs', 8);
  const page = await open(960, 540, { dpr: 2 });
  await page.evaluate((html) => window.overlay(html), FOOTER_HTML);
  const frames = loop(fps, secs, (a) => ({
    text: 0, r: 2.3, elev: 3 * DEG, roll: 0, pitch: 40 * DEG, fov: 92, horizon: 0.38, az: 0.6 + 0.04 * Math.sin(a),
  }));
  encodeWebp(await renderFrames(page, 'footer', frames, { shot: true }), arg('out', path.join(assets, 'horizon.webp')), { w: 1280, fps, q: +arg('q', 80) });
}

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

async function feed() {
  // The site's F key, replayed on the name itself: it spirals into the Einstein ring, the disk flares,
  // relativistic jets fire, and the letters come back as Hawking radiation. Loops on the idle frame.
  const fps = +arg('fps', 24), secs = 8, n = fps * secs;
  const page = await open(640, 320, { dpr: 2 });
  const letters = NAME_TEXT.join('').replace(/[^A-Za-z0-9]/g, '').length;
  await page.evaluate((html) => window.overlay(html), FEED_HTML(letters));
  const frames = Array.from({ length: n }, (_, i) => {
    const t = i / fps;
    const eat = clamp((t - 0.8) / 2.6), back = clamp((t - 5) / 1.6);
    const s = t < 5 ? 1 - eat ** 2.2 : easeOutBack(back);
    const since = Math.max(0, t - 3.4), fired = t >= 3.4;
    const shake = fired ? Math.exp(-since / 0.45) : 0;
    return {
      t: (t / secs) * LOOP,
      v: {
        fov: 50,
        text: s > 0.004 ? 1 : 0,
        nameSX: Math.max(s, 0.004),
        nameSY: Math.max(t < 5 ? s ** 0.75 : s, 0.004), // letters stretch on the way in
        nameSpin: t < 5 ? 2.4 * eat * eat : -1 * (1 - smooth(0, 1, back)),
        feed: 0.45 * smooth(0.8, 3.4, t) * (1 - smooth(5, 7.2, t)),
        jet: smooth(3.4, 3.65, t) * (1 - smooth(5, 6.6, t)),
        flash: fired ? 0.18 * Math.exp(-since / 0.2) : 0,
        roll: -9 * DEG + Math.sin(t * 37) * 0.012 * shake,
        yaw: Math.sin(t * 53) * 0.02 * shake,
        pitch: Math.cos(t * 47) * 0.02 * shake,
      },
      css: { toast: smooth(5.6, 6, t) * (1 - smooth(7.5, 7.9, t)) },
    };
  });
  encodeWebp(await renderFrames(page, 'feed', frames, { shot: true }), arg('out', path.join(assets, 'feed.webp')), { w: +arg('w', 960), fps, q: +arg('q', 74) });
}

// Everything drawn on the name plane (render.ts defaults), for the "letters consumed" count.
const NAME_TEXT = ['Feruz', 'Karimov', 'Software Engineer — feruz-karimov.dev', 'Light bends. So does this name.'];

const FEED_HTML = (letters) => /* html */ `
<style>
  .toast { position: absolute; left: 50%; bottom: 18px; translate: -50% calc((1 - var(--toast, 0)) * 12px); opacity: var(--toast, 0);
    padding: 9px 15px; border-radius: 12px; background: rgba(10, 10, 10, .78); border: 1px solid rgba(239, 232, 220, .2);
    font-size: 12px; line-height: 1.4; white-space: nowrap; }
  .toast b { color: #ffa25c; }
  .toast em { font: italic 400 1.1em 'Instrument Serif', serif; color: #ffcf9e; }
</style>
<div class="toast">FK-1 consumed <b>${letters}</b> letters. <em>It’s still hungry.</em></div>`;

// Section dividers: one per orbit on the site, each seen from that section's camera.
// Telemetry uses the site's HUD formulas (r in Schwarzschild radii, 10 solar masses).
const ORBITS = [
  { n: '01', where: 'Orbit', r: 16, title: 'About', status: 'Mildly spaghettified',
    v: { r: 16, elev: 12 * DEG, roll: -4 * DEG, yaw: -0.42, pitch: 0.03, fov: 30, diskGain: 0.6 } },
  { n: '02', where: 'Selected work', r: 9, title: 'Projects', status: 'Mildly spaghettified',
    v: { r: 9.5, elev: 21 * DEG, roll: 4 * DEG, yaw: -0.45, pitch: 0.02, fov: 38, diskGain: 0.42, horizon: 0.05 } },
  { n: '03', where: 'Inside the ISCO', r: 5, title: 'Craft', status: 'Fully spaghettified',
    v: { r: 5.2, elev: 17 * DEG, roll: -2 * DEG, yaw: -0.5, pitch: 0.05, fov: 48, diskGain: 0.42, horizon: 0.12 } },
  { n: '04', where: 'Photon sphere', r: 1.5, title: 'Contact', status: 'Light is orbiting you',
    v: { r: 2.3, elev: 3 * DEG, roll: 0, yaw: -0.35, pitch: 0.45, fov: 60, diskGain: 1, horizon: 0.22 } },
];
const gaugePos = (r) => Math.min(1, Math.max(0, Math.log(30 / r) / Math.log(30)));

function orbitHtml(o) {
  const dil = Math.sqrt(1 - 1 / o.r);
  const approx = Number.isInteger(o.r) ? '≈' : '=';
  const tick = (r, label) => `<i class="tick" style="left:${gaugePos(r) * 100}%"><b>${label}</b></i>`;
  return /* html */ `
<style>
  .sc { position: absolute; inset: 0; background:
    linear-gradient(0deg, rgba(0,0,0,.9) 0, rgba(0,0,0,.55) 30px, rgba(0,0,0,0) 58px),
    linear-gradient(90deg, #000 0%, rgba(0,0,0,.88) 30%, rgba(0,0,0,.4) 56%, rgba(0,0,0,0) 74%); }
  .tx { position: absolute; left: 28px; top: 20px; }
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; }
  .dim { color: rgba(239, 232, 220, .58); }
  .ac { color: #ffa25c; }
  .lc { text-transform: none; }
  h2 { margin: 7px 0 9px; font-weight: 800; font-stretch: 125%; text-transform: uppercase; font-size: 38px; line-height: .92; letter-spacing: -.035em; }
  .st::before { content: ''; display: inline-block; width: 6px; height: 6px; margin: 0 7px 1px 2px; border-radius: 50%; background: #ffa25c; box-shadow: 0 0 8px #ffa25c; }
  .g { position: absolute; left: 28px; right: 28px; bottom: 18px; height: 1px; background: rgba(239, 232, 220, .2); }
  .g .fill { position: absolute; inset: 0 auto 0 0; width: ${gaugePos(o.r) * 100}%; background: linear-gradient(90deg, rgba(255,162,92,0), #ffa25c); }
  .g .dot { position: absolute; left: ${gaugePos(o.r) * 100}%; top: -4px; width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%; background: #fff3dc; box-shadow: 0 0 0 2px rgba(255,162,92,.35), 0 0 14px 2px #ffa25c; }
  .tick { position: absolute; top: -3px; width: 1px; height: 7px; background: rgba(239, 232, 220, .4); }
  .tick b { position: absolute; bottom: 9px; left: 0; translate: -50% 0; white-space: nowrap; font: 500 8px 'JetBrains Mono', monospace; letter-spacing: .1em; text-transform: uppercase; color: rgba(239, 232, 220, .5); }
  .tick:first-child b { translate: 0 0; }
  .tick:last-of-type b { translate: -100% 0; }
</style>
<div class="sc"></div>
<div class="tx">
  <div class="mono"><span class="ac">${o.n} — ${o.where}</span> <span class="dim">· <span class="lc">r ${approx} ${o.r} r<sub>s</sub></span> · <span class="lc">${Math.round(o.r * 29.53)} km</span></span></div>
  <h2>${o.title}</h2>
  <div class="mono dim">Time dilation ${dil.toFixed(4)}× · Redshift <span class="lc">z</span> = ${(1 / dil - 1).toFixed(4)} · Tidal <span class="lc">${Math.round(1.89e7 / o.r ** 3).toLocaleString('en-US')} g</span></div>
  <div class="mono ac st" style="margin-top:6px">${o.status}</div>
</div>
<div class="g">${tick(30, '<span class="lc">30 r<sub>s</sub></span>')}${tick(3, 'ISCO')}${tick(1.5, 'Photon sphere')}${tick(1, 'Horizon')}<i class="fill"></i><i class="dot"></i></div>`;
}

async function orbits() {
  for (const o of ORBITS) {
    const page = await open(840, 172, { dpr: 2 });
    await page.evaluate((html) => window.overlay(html), orbitHtml(o));
    await page.evaluate(([t, v]) => window.draw(t, v), [3, { text: 0, ...o.v, ...userView }]);
    const png = path.join(here, `.out/orbit-${o.n}.png`);
    await page.screenshot({ path: png });
    const out = path.join(assets, `orbit-${o.n}.webp`);
    finish(png, png.replace('.png', '-r.png'), 1680, 13);
    execFileSync('cwebp', ['-quiet', '-q', '86', '-alpha_q', '100', '-m', '6', png.replace('.png', '-r.png'), '-o', out]);
    console.log(`  ${path.relative(process.cwd(), out)}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    await page.close();
  }
}

async function still() {
  const page = await open(+arg('w', 1280), +arg('h', 640));
  const file = arg('out', path.join(here, '.out/still.png'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  savePng(await page.evaluate(([t, v]) => window.frame(t, v), [+arg('t', 3), { fov: 50, ...userView }]), file);
  console.log(`  ${file}`);
}

const FOOTER_HTML = /* html */ `
<style>
  .hz { position: absolute; inset: var(--top, 184px) 0 0; display: grid; align-content: start; justify-items: center; gap: 14px; text-align: center; }
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  .dim { color: rgba(239, 232, 220, .58); }
  .lc { text-transform: none; }
  .hz h2 { margin: 0; font-weight: 800; font-stretch: 125%; text-transform: uppercase; font-size: 52px; line-height: .92; letter-spacing: -.035em; }
  .hz h2 em { display: block; font: italic 400 1.15em 'Instrument Serif', serif; letter-spacing: 0; text-transform: none; color: #ff7a4a; }
  .hz p { margin: 0; max-width: 520px; font-size: 16px; line-height: 1.4; }
  .btn { margin-top: 6px; padding: 14px 22px; border-radius: 999px; background: #efe8dc; color: #000; }
  .foot { margin-top: 10px; font-size: 10px; }
</style>
<div class="hz">
  <div class="mono dim"><span class="lc">r</span> = 1.000 <span class="lc">r<sub>s</sub></span> · <span class="lc">t</span> → ∞</div>
  <h2>You crossed the <em>event horizon.</em></h2>
  <p class="dim">Nothing gets out from here — not light, not information, not you.<br>There is, theoretically, one exit.</p>
  <div class="btn mono">↺ Escape through a white hole</div>
  <div class="foot mono dim">Earth has aged +13.8 billion years more than you</div>
</div>`;

try {
  await { banner, footer, orbits, feed, still }[scene]();
} finally {
  await browser.close();
  await server.close();
}
