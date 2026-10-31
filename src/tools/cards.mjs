// Social preview cards (1280x640) for the public repos: the repo name in the hero's particles, with the
// owner/repo and one line under it. Upload each in the repo's Settings -> Social preview (no API for it).
//   node tools/cards.mjs            -> ../preview/cards/<repo>.png (or .jpg when a PNG would pass 1 MB)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../preview/cards');
fs.mkdirSync(OUT, { recursive: true });
const owner = 'feruzkarimovv';
const cards = [
  { repo: 'vannaris', title: 'Vannaris', blurb: 'Independent benchmark of the web-search APIs AI agents rely on.' },
  { repo: 'gha-graph', title: 'gha-graph', blurb: 'See and lint GitHub Actions workflows before you push.' },
  { repo: 'vibeduel', title: 'VibeDuel', blurb: 'Race a friend to build an app with Claude. Real-time arena, AI judge, ELO.' },
  { repo: 'vibecheck', title: 'VibeCheck', blurb: 'Finds the security bugs AI coding tools tend to write.' },
  { repo: 'between-visits', title: 'Between Visits', blurb: 'Voice agent that checks on cancer-trial patients between visits, in their language.' },
  { repo: 'fgsm-mnist-reproduction', title: 'FGSM, reproduced', blurb: 'A small, auditable reproduction of FGSM adversarial examples on MNIST, in PyTorch.' },
  { repo: 'feruzkarimovv', title: 'Feruz Karimov', blurb: 'Builds products, and the models behind them.' },
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
for (const c of cards) {
  const json = path.join(tmp, `${c.repo}.json`);
  fs.writeFileSync(json, JSON.stringify({ owner, ...c }));
  const png = path.join(OUT, `${c.repo}.png`);
  execFileSync('node', ['render/render.mjs', 'render/scenes/particles.mjs', 'x', '--w', '1280', '--h', '640', '--frames', '160',
    '--at', '0', '--still', png, '--json', json, '--param', 'mode=card,theme=dark'], { cwd: path.resolve(here, '..'), stdio: 'ignore' });
  let file = png;
  if (fs.statSync(png).size > 1024 * 1024) {           // GitHub's social preview limit is 1 MB
    file = png.replace(/\.png$/, '.jpg');
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', png, '--out', file], { stdio: 'ignore' });
    fs.rmSync(png);
  }
  console.log(`${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
fs.rmSync(tmp, { recursive: true });
