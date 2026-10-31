// Renders SVGs the way GitHub shows them (an <img> on the README background) to PNG for review.
//   node tools/shot.mjs out.png a.svg [b.svg ...] [--scale 2] [--wait 4000] [--light] [--width 846]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (k) => { const i = argv.indexOf(`--${k}`); if (i < 0) return false; argv.splice(i, 1); return true; };
const scale = +opt('scale', 2), wait = +opt('wait', 4000), width = +opt('width', 846), light = flag('light');
const [out, ...files] = argv;

const imgs = files.map((f) => `<img src="data:image/svg+xml;base64,${fs.readFileSync(f).toString('base64')}" style="width:100%;display:block;vertical-align:top">`).join('');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: width + 48, height: 400 }, deviceScaleFactor: scale, colorScheme: light ? 'light' : 'dark' });
await page.setContent(`<body style="margin:0;padding:24px;background:${light ? '#fff' : '#0d1117'}"><div id="c" style="width:${width}px">${imgs}</div></body>`);
await page.waitForTimeout(wait);
await page.locator('#c').screenshot({ path: out });
await browser.close();
console.log(path.basename(out));
