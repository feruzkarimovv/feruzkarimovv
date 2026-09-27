// Writes the observatory log (and the image tag, with a cache-buster) into the README between markers.
import fs from 'node:fs';
import { orbitOf, daysAgo } from './disk.mjs';

const n = (x) => x.toLocaleString('en-US');
const esc = (s) => s.replace(/[|<>]/g, (c) => ({ '|': '\\|', '<': '&lt;', '>': '&gt;' })[c]).replace(/\s+/g, ' ').trim();
const clip = (s, k = 64) => (s.length > k ? s.slice(0, k - 1).trimEnd() + '…' : s);

/** A curated mix, newest first: recent stars, the latest and the biggest disruptions, jets, the peak day. */
export function events({ data, disk }) {
  const within = (d) => daysAgo(data.today, d) <= 364;
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const ev = [];
  data.repos
    .filter((r) => r.name !== data.login && within(r.createdAt))
    .map((r) => ({ ...r, date: r.createdAt }))
    .sort(byDate)
    .slice(0, 3)
    .forEach((r) => ev.push({ date: r.date, kind: '★ Star captured', what: `[${r.name}](${r.url}) entered orbit at ${orbitOf(daysAgo(data.today, r.date)).toFixed(1)} r<sub>s</sub>` }));
  const size = (p) => p.additions + p.deletions;
  const tde = [...disk.tdes].sort(byDate).slice(0, 3);
  const biggest = [...disk.tdes].sort((a, b) => size(b) - size(a))[0];
  if (biggest && !tde.includes(biggest)) tde.push(biggest);
  for (const p of tde)
    ev.push({ date: p.date, kind: '✦ Tidal disruption', what: `[${p.repo.split('/')[1]}#${p.number}](${p.url}) “${esc(clip(p.title))}” · ${n(size(p))} lines torn apart` });
  const rel = data.releases.find((r) => within(r.date));
  if (rel) ev.push({ date: rel.date, kind: '⇅ Relativistic jets', what: `[${rel.repo} ${rel.tag}](${rel.url}) fired the jets` });
  const peak = data.days.reduce((a, d) => (d.count > a.count ? d : a), data.days[0]);
  if (peak.count) ev.push({ date: peak.date, kind: '▲ Peak accretion', what: `${n(peak.count)} contributions in one day, the brightest knot on record` });
  return ev.sort(byDate);
}

// Non-breaking hyphens and spaces keep the first two columns from wrapping in a narrow README.
const row = (date, kind, what) => `| <samp>${date.replaceAll('-', '&#8209;')}</samp> | ${kind.replaceAll(' ', '&nbsp;')} | ${what} |`;

export function writeLog(file, { data, disk, stats }) {
  const repo = process.env.GITHUB_REPOSITORY || `${data.login}/${data.login}`;
  const alt =
    `FK-1 accretion map, ${stats.from} to ${stats.to}: ${n(stats.total)} contributions as gas spiralling into a ray-traced black hole, ` +
    `${disk.stars.length} public repos as orbiting stars, ${disk.tdes.length} large merged PRs as tidal-disruption streams. ` +
    `Mass ${stats.mass.toFixed(3)} solar masses, +${stats.week} in the last 7 days.`;
  const img = `<a href="https://feruz-karimov.dev"><img src="https://github.com/${repo}/raw/fk1/fk1.webp?v=${stats.to}" width="100%" alt="${alt}"></a>`;

  const oldest = data.days[0];
  const rows = [
    row(stats.to, '⊘ Crossed the ISCO', `${oldest.date}, a year old today, fell in (${n(oldest.count)} contribution${oldest.count === 1 ? '' : 's'})`),
    ...events({ data, disk })
      .slice(0, 9)
      .map((e) => row(e.date.slice(0, 10), e.kind, e.what)),
  ];
  const table = ['| Date | Event | |', '| --- | --- | --- |', ...rows].join('\n');

  let md = fs.readFileSync(file, 'utf8');
  const put = (name, body) => {
    const re = new RegExp(`(<!-- fk1:${name} -->)[\\s\\S]*?(<!-- /fk1:${name} -->)`);
    if (!re.test(md)) throw new Error(`README is missing <!-- fk1:${name} --> markers`);
    md = md.replace(re, `$1\n${body}\n$2`);
  };
  put('image', img);
  put('log', table);
  fs.writeFileSync(file, md);
}
