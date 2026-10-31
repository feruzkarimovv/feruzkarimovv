// Builds the hero: solves the glass for the name, traces the light it throws for every frame, then
// renders the scene on the GPU into ../assets:
//   hero.webp, hero.compact.webp                 6 s loops (desktop, phones)
//   hero.still.webp, hero.compact.still.webp     in-focus stills for prefers-reduced-motion
// Needs a Mac GPU (or patience: SwiftShader works too) plus python3 with numpy, scipy and Pillow.
//   node render/build-hero.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../assets');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-'));
const FRAMES = 96, FPS = 16, FOCUS = 0.42;               // the loop holds focus around 30-66% of the way

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString().trim();
console.log(run('python3', ['frames.py', work, '--frames', String(FRAMES)], { cwd: path.join(here, 'caustic') }).split('\n').at(-1));
const scene = JSON.parse(fs.readFileSync(path.join(work, 'lens.json')));
scene.heights = JSON.parse(fs.readFileSync(path.join(work, 'heights.json'))).heights;
fs.writeFileSync(path.join(work, 'scene.json'), JSON.stringify(scene));

const variants = [
  { name: 'hero', w: 1269, h: 660, params: 'round=18' },
  { name: 'hero.compact', w: 680, h: 600, params: 'round=16,mode=compact' },
];
const base = ['render/render.mjs', 'render/scenes/caustic.mjs'];
const common = (v) => ['--w', String(v.w), '--h', String(v.h), '--frames', String(FRAMES), '--fps', String(FPS),
  '--json', path.join(work, 'scene.json'), '--seq', path.join(work, 'c%04d.png'), '--param', v.params];
for (const v of variants) {
  const loop = path.join(ASSETS, `${v.name}.webp`);
  // Every frame a keyframe: partial-frame updates leave faint seams in the dark gradients, and the scene
  // changes enough each frame that full frames barely cost more.
  console.log(run('node', [...base, loop, ...common(v), '--q', '80', '--kmax', '1'], { cwd: path.resolve(here, '..') }).split('\n').at(-1));
  const png = path.join(work, `${v.name}.still.png`);
  run('node', [...base, 'x', ...common(v), '--still', png, '--at', String(FOCUS)], { cwd: path.resolve(here, '..') });
  run('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', png, '-o', path.join(ASSETS, `${v.name}.still.webp`)]);
  console.log(`${v.name}.still.webp ${(fs.statSync(path.join(ASSETS, `${v.name}.still.webp`)).size / 1024).toFixed(0)} KB`);
}
fs.rmSync(work, { recursive: true });
