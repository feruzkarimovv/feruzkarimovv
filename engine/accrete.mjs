#!/usr/bin/env node
// FK-1: renders the last year of my GitHub activity as the accretion disk of a black hole,
// then writes the observatory log into the README. Runs nightly in GitHub Actions, CPU only.
//
//   GITHUB_TOKEN=… node engine/accrete.mjs [--out out] [--readme README.md] [--frames 240] [--data cache.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { camera, allocMap, mapBuffers } from './physics.mjs';
import { buildDisk, daysAgo } from './disk.mjs';
import { buildIndex, planNotes, starAnchors, layout, reservedBoxes } from './plate.mjs';
import { fetchActivity } from './data.mjs';
import { writeLog } from './log.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const DEG = Math.PI / 180;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s]`, ...a);

const LOGIN = process.env.FK1_LOGIN || process.env.GITHUB_REPOSITORY_OWNER || 'feruzkarimovv';
const OUT = path.resolve(arg('out', 'out'));
const FRAMES = +arg('frames', 240), FPS = +arg('fps', 20);
const OW = +arg('width', 1280), OH = OW / 2, SS = +arg('ss', 2);
// The gas drifts slowly, so it only needs a new position every few frames; stars and labels move every frame.
// Holding the gas still in between lets the encoder update just the small regions that changed.
const GAS_STEP = +arg('gas-step', 4);
const THREADS = Math.max(1, Math.min(+arg('threads', os.availableParallelism()), 16));
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- data
const cache = arg('data');
let data;
if (cache && fs.existsSync(cache)) data = JSON.parse(fs.readFileSync(cache, 'utf8'));
else {
  const token = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();
  data = await fetchActivity(LOGIN, token);
  if (cache) fs.writeFileSync(cache, JSON.stringify(data));
}
log(`${data.login}: ${data.total} contributions, ${data.repos.length} public repos, ${data.prs.length} public merged PRs, ${data.releases.length} releases`);

// ---------------------------------------------------------------- spacetime
// Camera: 30 r_s out, 18° above the disk. Everything below is geometry; the data comes later.
const VIEW = { r: 30, elev: 18 * DEG, az: 0.6, roll: -6 * DEG, fov: 38 };
const cam = camera({ w: OW * SS, h: OH * SS, ...VIEW });
const map = allocMap(cam.w * cam.h);
const bufs = mapBuffers(map);

const pool = Array.from({ length: THREADS }, () => new Worker(path.join(here, 'worker.mjs')));
const run = (worker, msg, onFrame) =>
  new Promise((resolve, reject) => {
    const onMsg = (m) => {
      if (m.type === 'frame') onFrame?.();
      if (m.type === 'done') {
        worker.off('message', onMsg);
        resolve();
      }
    };
    worker.on('message', onMsg);
    worker.once('error', reject);
    worker.postMessage(msg);
  });

await Promise.all(pool.map((wk, k) => run(wk, { type: 'trace', cam, bufs, first: k, stride: THREADS, opts: { escape: cam.r * 1.35 + 6 } })));
log(`traced ${cam.w * cam.h} geodesics on ${THREADS} threads`);

// ---------------------------------------------------------------- matter
const disk = buildDisk(data);
const release = data.releases[0];
const releaseAge = release ? daysAgo(data.today, release.date) : Infinity;
const jets = releaseAge <= 60 ? Math.exp(-releaseAge / 21) : 0; // a release fires the jets; they fade over weeks
const week = data.days.slice(-7).reduce((a, d) => a + d.count, 0);
const stats = {
  login: data.login,
  from: data.days[0].date,
  to: data.today,
  rays: cam.w * cam.h,
  mass: 10 + data.total / 1000, // 10 M☉ to start, +0.001 M☉ per contribution
  total: data.total,
  week,
  repos: disk.stars.length,
  az: VIEW.az,
  jets,
  jetLine: release
    ? [jets > 0 ? 'RELATIVISTIC JETS · FIRING' : 'JETS · QUIET', `${release.repo} ${release.tag} · ${releaseAge} d ago`]
    : ['JETS · QUIET', 'no releases yet'],
};
log(`disk: ${disk.stars.length} stars, ${disk.tdes.length} tidal disruptions, jets ${jets.toFixed(2)}`);

// ---------------------------------------------------------------- annotations, laid out frame by frame
const index = buildIndex(map);
const { center, notes } = planNotes({ cam, ss: SS, index, map, data, disk, stats });
const reserved = reservedBoxes(OW, OH);
const memory = new Map();
const frames = [];
for (let i = 0; i < FRAMES; i++) {
  const f = i / FRAMES;
  const anchors = starAnchors({ index, map, cam, ss: SS, stars: disk.stars, f });
  const items = [...notes];
  anchors.forEach((a, k) => {
    if (!a) return;
    const edge = Math.min(a.x, OW - a.x, a.y, OH - a.y);
    const alpha = Math.min(1, a.weight / 3) * Math.max(0, Math.min(1, (edge - 30) / 40));
    if (alpha < 0.05) return;
    const dx = a.x - center[0], dy = a.y - center[1], l = Math.hypot(dx, dy) || 1;
    items.push({ id: `star:${disk.stars[k].name}`, p: a, dir: [dx / l, dy / l], len: 28, lines: [disk.stars[k].name], alpha: alpha * 0.9 });
  });
  // Two passes so the loop's first frame remembers where its last frame put things.
  const obstacles = anchors.flatMap((a, k) => (a ? [{ id: `star:${disk.stars[k].name}`, box: [a.x - 12, a.y - 10, a.x + 12, a.y + 10] }] : []));
  frames.push({ i, f, items, obstacles });
}
for (const pass of [0, 1]) for (const fr of frames) fr.callouts = layout(fr.items, OW, OH, reserved, memory, fr.obstacles);
log('annotations placed');

// ---------------------------------------------------------------- frames
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk1-'));
const tex = Object.fromEntries(Object.entries(disk.tex).map(([k, v]) => [k, v.buffer]));
const opts = { w: cam.w, h: cam.h, ss: SS, cyc: 16, gain: 1, jet: jets, stars: disk.stars };
let done = 0;
await Promise.all(
  pool.map((wk, k) =>
    run(
      wk,
      {
        type: 'shade',
        bufs,
        tex,
        opts,
        ow: OW,
        oh: OH,
        radius: 12,
        stats,
        dir,
        // Contiguous runs, so each worker can reuse the gas bloom across a step.
        frames: frames
          .filter((fr) => Math.floor((fr.i / FRAMES) * THREADS) === k)
          .map(({ i, f, callouts }) => ({ i, f, fGas: (Math.floor(i / GAS_STEP) * GAS_STEP) / FRAMES, callouts })),
      },
      () => ++done % 40 === 0 && log(`  ${done}/${FRAMES} frames`),
    ),
  ),
);
await Promise.all(pool.map((wk) => wk.terminate()));
log(`painted ${FRAMES} frames`);

const files = fs.readdirSync(dir).sort().map((f) => path.join(dir, f));
const webp = path.join(OUT, 'fk1.webp');
// Keyframes every ~2 s stop lossy error from piling up across sub-frame updates (blocky drift in the glow).
execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', arg('q', '80'), '-m', '4', '-kmin', '20', '-kmax', '40', '-d', String(Math.round(1000 / FPS)), ...files, '-o', webp], { stdio: 'ignore' });
fs.copyFileSync(files[0], path.join(OUT, 'fk1.png'));
if (!argv.includes('--keep')) fs.rmSync(dir, { recursive: true, force: true });
else log(`frames kept in ${dir}`);
log(`${path.relative(process.cwd(), webp)}: ${(fs.statSync(webp).size / 1048576).toFixed(2)} MB`);

// ---------------------------------------------------------------- README
const readme = arg('readme');
if (readme) {
  writeLog(readme, { data, disk, stats, release });
  log(`updated ${readme}`);
}
