// Drops ../README.md into a GitHub-like profile mock at ../preview/readme.html.
// The markdown API re-nests <a><picture> differently from the real profile renderer (github.com keeps
// the img inside the picture inside the link), so the page is built from the README as GitHub serves
// it, and the API is only used to check that the sanitizer keeps every attribute we rely on.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

const api = execFileSync('gh', ['api', 'markdown', '-f', 'mode=markdown', '-f', 'context=feruzkarimovv/feruzkarimovv', '-F', `text=@${path.join(ROOT, 'README.md')}`], { encoding: 'utf8' });
const count = (s, re) => (s.match(re) || []).length;
for (const re of [/align="top"/g, /media="\(prefers-color-scheme: light\)"/g, /width="[\d.]+%"/g, /alt="/g, /<a href="(https|mailto)/g]) {
  if (count(md, re) !== count(api, re)) throw new Error(`sanitizer dropped ${re}: ${count(md, re)} in README, ${count(api, re)} after`);
}

const html = md
  .replace(/<picture>/g, '<themed-picture data-catalyst-inline="true"><picture>')
  .replace(/<\/picture>/g, '</picture></themed-picture>')
  .replace(/<img /g, '<img style="max-width: 100%;" ')
  .replace(/<a href="https/g, '<a rel="nofollow" href="https')
  .replace(/(src|srcset)="assets\//g, '$1="/assets/');

const page = fs.readFileSync(path.join(here, 'mock.html'), 'utf8')
  .replace(/<title>.*?<\/title>/, '<title>README preview</title>')
  .replace(/<script>[\s\S]*<\/script>/, `<script>
  const v = Date.now();
  const sw = document.getElementById('switch'), readme = document.getElementById('readme');
  readme.innerHTML = ${JSON.stringify(html)}.replace(/\\.svg"/g, '.svg?v=' + v + '"');
  function theme(light) {
    document.body.classList.toggle('light', light);
    // Same rule as github.com's <themed-picture> with an explicit theme: a source whose media matches
    // "(prefers-color-scheme: light|dark)" (String#match, so the space is required) is switched on or
    // off wholesale; anything else is left to the browser.
    readme.querySelectorAll('source[media]').forEach((s) => {
      s.dataset.media ??= s.getAttribute('media');
      const m = s.dataset.media;
      const k = m.match('(prefers-color-scheme: light)') ? 'light' : m.match('(prefers-color-scheme: dark)') ? 'dark' : null;
      s.setAttribute('media', k === null ? m : (k === 'light') === light ? '(prefers-color-scheme: light),(prefers-color-scheme: dark)' : 'not all');
    });
    bD.setAttribute('aria-pressed', !light); bL.setAttribute('aria-pressed', light);
  }
  const bD = Object.assign(document.createElement('button'), { textContent: 'Dark' }); bD.onclick = () => theme(false);
  const bL = Object.assign(document.createElement('button'), { textContent: 'Light' }); bL.onclick = () => theme(true);
  sw.append(bD, bL);
  theme(location.hash === '#light');
</script>`);
fs.writeFileSync(path.join(ROOT, 'preview/readme.html'), page);
console.log('preview/readme.html (sanitizer check passed)');
