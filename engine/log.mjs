// Writes the image tag (with a cache-buster) and a plain-language "Lately" list into the README between markers.
import fs from 'node:fs';
import { daysAgo } from './disk.mjs';

const n = (x) => x.toLocaleString('en-US');
const esc = (s) => s.replace(/[|<>*_[\]]/g, (c) => `\\${c}`).replace(/\s+/g, ' ').trim();
const clip = (s, k = 70) => (s.length > k ? s.slice(0, k - 1).trimEnd() + '…' : s);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;

/** The most recent thing of each kind: a new repo, a big merged PR, a release, plus the busiest day. */
export function lately({ data, disk }) {
  const within = (d) => daysAgo(data.today, d) <= 364;
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const items = [];
  const repo = data.repos.filter((r) => r.name !== data.login && within(r.createdAt)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (repo) items.push({ date: repo.createdAt, text: `Started **[${repo.name}](${repo.url})**` });
  const pr = [...disk.tdes].sort(byDate)[0];
  if (pr) items.push({ date: pr.date, text: `Merged **[${pr.repo.split('/')[1]}#${pr.number}](${pr.url})**: ${esc(clip(pr.title))} (${n(pr.additions + pr.deletions)} lines)` });
  const rel = data.releases.find((r) => within(r.date));
  if (rel) items.push({ date: rel.date, text: `Released **[${rel.repo} ${rel.tag}](${rel.url})**` });
  const peak = data.days.reduce((a, d) => (d.count > a.count ? d : a), data.days[0]);
  if (peak.count) items.push({ date: peak.date, text: `Busiest day of the year: **${n(peak.count)} contributions**` });
  return items.sort(byDate);
}

export function writeLog(file, { data, disk, stats }) {
  const repo = process.env.GITHUB_REPOSITORY || `${data.login}/${data.login}`;
  const alt =
    `${stats.name}'s last 12 months on GitHub, drawn as a black hole: ${n(stats.total)} contributions as glowing rings, ` +
    `${disk.stars.length} new repos as orbiting dots, the biggest pull requests as blue streaks. +${stats.week} in the last 7 days.`;
  const img = `<a href="https://feruz-karimov.dev"><img src="https://github.com/${repo}/raw/fk1/fk1.webp?v=${stats.to}" width="100%" alt="${alt}"></a>`;
  const list = ['**Lately**', '', ...lately({ data, disk }).map((e) => `- <samp>${short(e.date)}</samp>&nbsp; ${e.text}`)].join('\n');

  let md = fs.readFileSync(file, 'utf8');
  const put = (name, body) => {
    const re = new RegExp(`(<!-- fk1:${name} -->)[\\s\\S]*?(<!-- /fk1:${name} -->)`);
    if (!re.test(md)) throw new Error(`README is missing <!-- fk1:${name} --> markers`);
    md = md.replace(re, `$1\n${body}\n$2`);
  };
  put('image', img);
  put('recent', list);
  fs.writeFileSync(file, md);
}
