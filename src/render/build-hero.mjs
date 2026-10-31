// Builds the hero: the particle scene rendered on the GPU (render/scenes/particles.mjs) into ../assets.
//   hero.{wide,compact}.{dark,light}.avif     8 s loops (AV1 predicts motion between frames, so a field
//                                             of moving points costs ~1 MB instead of ~13 MB as WebP)
//   hero.{wide,compact}.{dark,light}.webp     the first frame (the name), for reduced motion and for
//                                             browsers without AVIF
// Needs ffmpeg with libsvtav1, cwebp, and a GPU (or patience: SwiftShader works too).
//   node render/build-hero.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../assets');
const FRAMES = 160, FPS = 20;
const variants = [
  { mode: 'wide', w: 1696, h: 880 },
  { mode: 'compact', w: 680, h: 600 },
];
for (const v of variants) {
  for (const theme of ['dark', 'light']) {
    const name = `hero.${v.mode}.${theme}`;
    const log = execFileSync('node', ['render/render.mjs', 'render/scenes/particles.mjs', 'x', '--w', String(v.w), '--h', String(v.h),
      '--frames', String(FRAMES), '--fps', String(FPS), '--png-only', '--param', `mode=${v.mode},theme=${theme}`], { cwd: path.resolve(here, '..') }).toString();
    const dir = log.match(/frames in (\/\S+)/)[1];
    // Explicit BT.709 signalling so every browser decodes the background to GitHub's page colour.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'),
      '-vf', 'scale=out_color_matrix=bt709:out_range=limited,format=yuv420p', '-c:v', 'libsvtav1', '-crf', '36', '-preset', '5',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-color_range', 'tv', '-loop', '0',
      path.join(ASSETS, `${name}.avif`)], { stdio: ['ignore', 'ignore', 'ignore'] });
    execFileSync('cwebp', ['-quiet', '-q', '90', path.join(dir, 'f0000.png'), '-o', path.join(ASSETS, `${name}.webp`)]);
    fs.rmSync(dir, { recursive: true });
    const kb = (f) => (fs.statSync(path.join(ASSETS, f)).size / 1024).toFixed(0);
    console.log(`${name}: loop ${kb(`${name}.avif`)} KB, still ${kb(`${name}.webp`)} KB`);
  }
}
