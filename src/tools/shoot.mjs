// Captures the live products for the "Selected work" frames: 16:10 at 2x, saved as JPEGs in ../shots.
//   node tools/shoot.mjs            all of them
//   node tools/shoot.mjs jonivor    one
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { work } from '../content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../shots');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const scaler = await browser.newPage();
for (const item of work.filter((w) => w.shot && (!only || w.id === only))) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 850 }, deviceScaleFactor: 2 });
  await page.goto(item.shot, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log(item.id, e.message.slice(0, 80)));
  await page.waitForTimeout(1800);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  // Downsample in the browser (high-quality smoothing) to what the frames actually show at 2x.
  const jpg = await scaler.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: 760, height: 475 });
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, 760, 475);
    return c.toDataURL('image/jpeg', 0.86).split(',')[1];
  }, `data:image/png;base64,${png.toString('base64')}`);
  fs.writeFileSync(path.join(OUT, `${item.id}.jpg`), Buffer.from(jpg, 'base64'));
  console.log(`${item.id}.jpg ${(fs.statSync(path.join(OUT, `${item.id}.jpg`)).size / 1024).toFixed(0)} KB`);
}
await browser.close();
