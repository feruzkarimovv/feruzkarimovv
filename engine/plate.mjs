// The observation plate: where things in the disk appear on screen (after lensing), and the
// annotations that say what they are.
import { MAX_HITS, project } from './physics.mjs';
import { R0, R1, RIM, ISCO, orbitOf, angleOf, daysAgo } from './disk.mjs';
import { text, callout, measure, CREAM, ACCENT, COOL, LINE } from './overlay.mjs';

const TAU = Math.PI * 2;

/** Buckets every pixel by where its ray first meets the disk, so we can ask "where on screen is (r, φ)?". */
export function buildIndex(map, { nr = 256, nphi = 1024 } = {}) {
  const bin = new Int32Array(map.n).fill(-1);
  const start = new Int32Array(nr * nphi + 1);
  for (let i = 0; i < map.n; i++) {
    if (!map.hits[i]) continue;
    const r = map.hr[i * MAX_HITS], p = map.hphi[i * MAX_HITS];
    const b = Math.min(nr - 1, Math.max(0, Math.floor(((r - R0) / (R1 - R0)) * nr))) * nphi + Math.min(nphi - 1, Math.floor(((p + Math.PI) / TAU) * nphi));
    bin[i] = b;
    start[b + 1]++;
  }
  for (let b = 0; b < nr * nphi; b++) start[b + 1] += start[b];
  const fill = start.slice(0, -1);
  const idx = new Int32Array(start[nr * nphi]);
  for (let i = 0; i < map.n; i++) if (bin[i] >= 0) idx[fill[bin[i]]++] = i;
  return { nr, nphi, start, idx };
}

/** Screen position (map pixels) of the direct image of disk point (r, φ), or null if it isn't visible. */
export function locate(index, map, w, r, phi, radius = 0.22) {
  const { nr, nphi, start, idx } = index;
  const br = Math.floor(((r - R0) / (R1 - R0)) * nr), dR = Math.ceil((radius / (R1 - R0)) * nr) + 1;
  const bp = Math.floor(((phi + Math.PI) / TAU) * nphi), dP = Math.ceil((radius / r / TAU) * nphi) + 1;
  let sx = 0, sy = 0, sw = 0;
  for (let i = Math.max(0, br - dR); i <= Math.min(nr - 1, br + dR); i++)
    for (let j = bp - dP; j <= bp + dP; j++) {
      const b = i * nphi + (((j % nphi) + nphi) % nphi);
      for (let k = start[b]; k < start[b + 1]; k++) {
        const p = idx[k];
        const pr = map.hr[p * MAX_HITS];
        let dp = map.hphi[p * MAX_HITS] - phi;
        dp -= Math.round(dp / TAU) * TAU;
        const d2 = (pr - r) ** 2 + (r * dp) ** 2;
        if (d2 > radius * radius) continue;
        const wt = Math.exp(-d2 / (radius * radius * 0.25));
        sx += (p % w) * wt;
        sy += Math.floor(p / w) * wt;
        sw += wt;
      }
    }
  return sw > 0.5 ? { x: sx / sw + 0.5, y: sy / sw + 0.5, weight: sw } : null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const fmtDate = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
const n = (x) => x.toLocaleString('en-US');

/** Annotations fixed to the disk (they don't move between frames). */
export function planNotes({ cam, ss, index, map, data, disk, stats }) {
  const w = cam.w, W = cam.w / ss, H = cam.h / ss;
  const center = project(cam, [0, 0, 0]).map((v) => v / ss);
  const near = Math.atan2(Math.cos(stats.az), Math.sin(stats.az)); // disk azimuth closest to the camera
  const at = (r, phi) => {
    const p = locate(index, map, w, r, phi);
    return p && { x: p.x / ss, y: p.y / ss };
  };
  const away = (p, bias = [0, 0]) => {
    const dx = p.x - center[0] + bias[0], dy = p.y - center[1] + bias[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const notes = [];

  // Today's matter, at the rim: the lower-right stretch of the rim, clear of the footer.
  let tp = null;
  for (let k = -12; k <= 12; k++) {
    const p = at(RIM, near + k * 0.13);
    if (p && p.x > W * 0.6 && p.y > H * 0.5 && p.y < H - 140 && (!tp || p.y > tp.y)) tp = p;
  }
  if (tp) notes.push({ id: 'today', p: tp, dir: away(tp, [40, 40]), lines: [{ str: 'TODAY', color: ACCENT }, { str: `${fmtDate(data.today)} · +${data.days.at(-1).count} contributions`, alpha: 0.7 }] });

  // The busiest month, as a band.
  const months = {};
  data.days.forEach((d, k) => {
    const m = d.date.slice(0, 7);
    (months[m] ??= { sum: 0, ages: [] }).sum += d.count;
    months[m].ages.push(data.days.length - 1 - k);
  });
  const [pm, pv] = Object.entries(months).sort((a, b) => b[1].sum - a[1].sum)[0];
  const pp = at(orbitOf(pv.ages[pv.ages.length >> 1]), near - 0.75);
  if (pp) notes.push({ id: 'peak', p: pp, dir: away(pp, [-60, 30]), lines: ['BUSIEST MONTH', { str: `${MONTHS[+pm.slice(5, 7) - 1]} ${pm.slice(0, 4)} · ${n(pv.sum)} contributions`, alpha: 0.7 }] });

  // The biggest tidal disruption.
  const big = [...disk.tdes].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))[0];
  if (big) {
    const bp = at(orbitOf(daysAgo(data.today, big.date)) + 0.08, angleOf(big.url));
    if (bp)
      notes.push({
        id: 'tde',
        p: bp,
        dir: away(bp, [0, -40]),
        color: COOL,
        lines: [{ str: 'BIGGEST PULL REQUEST', color: COOL }, { str: `${big.repo.split('/')[1]}#${big.number} · ${n(big.additions + big.deletions)} lines`, alpha: 0.7 }],
      });
  }

  // What falls in today: the day from a year ago reaches the ISCO.
  const ip = at(ISCO + 0.12, near - 0.25);
  const oldest = data.days[0];
  if (ip) notes.push({ id: 'isco', p: ip, dir: [-0.55, 0.83], len: 52, lines: [{ str: 'A YEAR AGO · FALLING IN', color: ACCENT }, { str: `${fmtDate(oldest.date)} ${oldest.date.slice(0, 4)} · ${n(oldest.count)} contributions`, alpha: 0.7 }] });

  return { center, notes: notes.map((x) => ({ ...x, fixed: true })) };
}

/** Per-frame star positions (repos), located through the lens. */
export function starAnchors({ index, map, cam, ss, stars, f }) {
  return stars.map((s) => {
    const p = locate(index, map, cam.w, s.r, s.phi0 + TAU * s.turns * f, 0.18);
    return p && { x: p.x / ss, y: p.y / ss, weight: p.weight };
  });
}

// ---------------------------------------------------------------- layout

const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function box(c) {
  const x = c.p.x, y = c.p.y;
  const ex = x + c.dir[0] * c.len, ey = y + c.dir[1] * c.len;
  const right = c.dir[0] >= 0;
  const tw = Math.max(...c.lines.map((l, i) => measure(typeof l === 'string' ? l : l.str, i ? 15 : 17, 0.6)));
  const tx = ex + (right ? 20 : -20);
  const x0 = right ? tx : tx - tw, x1 = right ? tx + tw : tx;
  return [Math.min(x0, x - 9, ex), Math.min(ey - 14, y - 9), Math.max(x1, x + 9, ex), Math.max(ey + 7 + LINE * (c.lines.length - 1), y + 9)];
}
const overlaps = (a, b, m = 4) => a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m;

/**
 * Greedy label placement: try the preferred direction, then rotations and mirror images at a few
 * lengths; keep last frame's choice while it still fits so moving labels don't flicker.
 */
export function layout(items, W, H, reserved, memory, obstacles = []) {
  const placed = [...reserved];
  const out = [];
  for (const it of items) {
    // Fixed notes ignore the stars (they drift past underneath); moving labels steer around every other star.
    const avoid = it.fixed ? [] : obstacles.filter((o) => o.id !== it.id).map((o) => o.box);
    const tries = [];
    for (const len of [it.len ?? 32, (it.len ?? 32) + 20, (it.len ?? 32) + 44])
      for (const a of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
        tries.push({ dir: rot(it.dir, a), len });
        tries.push({ dir: rot([-it.dir[0], it.dir[1]], a), len });
      }
    const fits = (t) => {
      const b = box({ ...it, ...t });
      return b[0] > 8 && b[1] > 8 && b[2] < W - 8 && b[3] < H - 8 && !placed.some((p) => overlaps(b, p)) && !avoid.some((p) => overlaps(b, p, 0));
    };
    const prev = memory.get(it.id);
    const choice = prev && fits(prev) ? prev : tries.find(fits);
    if (!choice) continue; // nowhere to put it this frame
    memory.set(it.id, choice);
    placed.push(box({ ...it, ...choice }));
    out.push({ ...it, x: it.p.x, y: it.p.y, dir: choice.dir, len: choice.len });
  }
  return out;
}

/** Areas the header and footer text occupy, so labels stay out of them. */
export function reservedBoxes(W, H) {
  return [
    [0, 0, 560, 82],
    [W - 600, 0, W, 54],
    [0, H - 84, 830, H],
    [W - 470, H - 84, W, H],
  ];
}

/** Draw the plate onto an 8-bit frame. */
export function drawPlate(img, w, h, callouts, stats) {
  const PAD = 30;
  const day = (d) => `${fmtDate(d)} ${d.slice(0, 4)}`;
  text(img, w, h, `${stats.name.toUpperCase()} · A YEAR ON GITHUB`, PAD, PAD + 14, { size: 19, track: 2 });
  text(img, w, h, `github.com/${stats.login} · ${day(stats.from)} → ${day(stats.to)}`, PAD, PAD + 40, { size: 15, alpha: 0.6, track: 0.6 });
  text(img, w, h, `UPDATED ${day(stats.to)}`, w - PAD, PAD + 14, { size: 15, alpha: 0.55, track: 0.8, align: 'right' });

  const foot = [
    ['CONTRIBUTIONS', n(stats.total)],
    ['LAST 7 DAYS', `+${n(stats.week)}`],
    ['NEW REPOS', String(stats.repos)],
  ];
  let x = PAD;
  for (const [k, v] of foot) {
    text(img, w, h, k, x, h - PAD - 24, { size: 15, alpha: 0.5, track: 1 });
    text(img, w, h, v, x, h - PAD, { size: 19, track: 0.4 });
    x += Math.max(measure(k, 15, 1), measure(v, 19, 0.4)) + 40;
  }
  text(img, w, h, stats.jetLine[0], w - PAD, h - PAD - 24, { size: 15, alpha: 0.5, track: 1, align: 'right' });
  text(img, w, h, stats.jetLine[1], w - PAD, h - PAD, { size: 19, track: 0.4, align: 'right', color: stats.jets > 0 ? COOL : CREAM });

  for (const c of callouts) callout(img, w, h, c.x, c.y, c.dir, c.lines, { color: c.color ?? CREAM, len: c.len, alpha: c.alpha ?? 1 });
}
