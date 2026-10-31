// Screenshots the README box of the local preview (needs the preview server on :4173).
//   node tools/page-shot.mjs out.png [--light] [--width 1440] [--wait 5000] [--scale 2] [--full]
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const out = argv[0];
const light = argv.includes('--light'), full = argv.includes('--full');
const width = +opt('width', 1440), wait = +opt('wait', 5000), scale = +opt('scale', 2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: scale, colorScheme: light ? 'light' : 'dark', isMobile: width < 700, hasTouch: width < 700 });
await page.goto(`http://localhost:4173/preview/readme.html${light ? '#light' : ''}`);
await page.waitForTimeout(wait);
if (full) await page.screenshot({ path: out, fullPage: true });
else await page.locator('.readme').screenshot({ path: out });
await browser.close();
console.log(out);
