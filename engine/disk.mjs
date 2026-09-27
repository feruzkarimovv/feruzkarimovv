// Turns a year of GitHub activity into matter in FK-1's accretion disk.
//
// Every day of the contribution calendar is a clump of gas. Age sets its orbit: today's work
// lands at the rim, last year's has spiralled in to the ISCO (r = 3) and is about to fall in.
// Age also sets its shape: fresh days are compact knots, older ones have been sheared by
// differential rotation into arcs and then full rings. Busier days are denser and hotter.
import { fbm, vnoise } from './physics.mjs';

export const R0 = 2.3; // texture covers r ∈ [R0, R1]
export const R1 = 17;
export const RIM = 13.5; // where today's matter lands
export const ISCO = 3;
export const NR = 640;
export const NPHI = 2048;
const TAU = Math.PI * 2;
export const TDE_LINES = 300; // a merged PR this big counts as a tidal disruption

/** Radius of a day that is `age` days old (0 = today, 365 = crossing the ISCO). */
export const orbitOf = (age) => ISCO + (RIM - ISCO) * Math.pow(Math.max(0, 1 - age / 365), 1.6);

/** Deterministic angle from a string, so a day's clump stays put from one night to the next. */
export function angleOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) / 4294967296) * TAU - Math.PI;
}

const sab = (n) => new Float32Array(new SharedArrayBuffer(n * 4));

/** Adds a sheared clump to channel `ch` (and heat), using a von Mises profile in angle so old clumps wrap into rings. */
function deposit(tex, { r, phi, sr, sphi, amp, heat = 0, ch = 'E' }) {
  const i0 = Math.max(0, Math.floor(((r - 4 * sr - R0) / (R1 - R0)) * NR));
  const i1 = Math.min(NR - 1, Math.ceil(((r + 4 * sr - R0) / (R1 - R0)) * NR));
  const kappa = 1 / (sphi * sphi);
  const out = tex[ch];
  for (let i = i0; i <= i1; i++) {
    const rr = R0 + ((i + 0.5) / NR) * (R1 - R0);
    const wr = Math.exp(-((rr - r) ** 2) / (2 * sr * sr));
    if (wr < 1e-3) continue;
    for (let j = 0; j < NPHI; j++) {
      const p = ((j + 0.5) / NPHI) * TAU - Math.PI;
      const w = amp * wr * Math.exp((Math.cos(p - phi) - 1) * kappa);
      if (w < 1e-4) continue;
      out[i * NPHI + j] += w;
      if (ch === 'E') tex.H[i * NPHI + j] += w * heat;
    }
  }
}

/**
 * Build the disk's static textures from activity data.
 * Returns shared buffers (E: density of days, H: heat, B: tidal-disruption streams, N: turbulence)
 * plus the moving objects (stars) and a summary used by the HUD.
 */
export function buildDisk(data) {
  const tex = { E: sab(NR * NPHI), H: sab(NR * NPHI), B: sab(NR * NPHI), N: sab(NR * NPHI) };
  const days = data.days; // oldest → newest, last is today
  const counts = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  const ref = Math.max(8, counts[Math.floor(counts.length * 0.9)] || 8); // a "busy day"

  days.forEach((d, k) => {
    if (!d.count) return;
    const age = days.length - 1 - k;
    const r = orbitOf(age);
    const dr = Math.abs(orbitOf(age + 0.5) - orbitOf(age - 0.5));
    const sphi = Math.min(3.2, 0.09 + 0.05 * age); // shear: knot → arc → ring over ~2 months
    const x = d.count / ref;
    deposit(tex, {
      r,
      phi: angleOf(d.date),
      sr: Math.max(0.035, age < 14 ? 0.11 : 0.6 * dr),
      sphi,
      amp: Math.min(2.2, Math.pow(x, 0.55)) * Math.pow(0.09 / sphi, 0.3),
      heat: Math.min(1.5, x),
    });
  });
  for (let i = 0; i < NR * NPHI; i++) if (tex.E[i] > 1e-6) tex.H[i] /= tex.E[i];

  // Big merged public PRs: a star torn apart, drawn out into a thin hot stream at that day's orbit.
  const tdes = data.prs.filter((p) => p.additions + p.deletions >= TDE_LINES && daysAgo(data.today, p.date) <= 364);
  for (const pr of tdes) {
    const age = daysAgo(data.today, pr.date);
    const size = Math.log10(pr.additions + pr.deletions) - Math.log10(TDE_LINES); // 0 … ~2
    deposit(tex, {
      ch: 'B',
      r: orbitOf(age) + 0.08,
      phi: angleOf(pr.url),
      sr: 0.025,
      sphi: Math.min(0.6, 0.18 + 0.008 * age),
      amp: 0.18 + 0.2 * size,
    });
  }

  // Turbulence, sampled with a flow map at render time so the gas visibly orbits.
  for (let i = 0; i < NR; i++) {
    const r = R0 + ((i + 0.5) / NR) * (R1 - R0);
    for (let j = 0; j < NPHI; j++) {
      const p = ((j + 0.5) / NPHI) * TAU - Math.PI;
      const c = Math.cos(p), s = Math.sin(p);
      const n = fbm(c * 1.6, s * 1.6, r * 2.3);
      const fine = vnoise(c * 5, s * 5, r * 11);
      const rings = 0.5 + 0.5 * Math.sin(r * 9 + n * 6);
      tex.N[i * NPHI + j] = n * (0.55 + 0.6 * fine) * (0.6 + 0.6 * rings);
    }
  }

  // New public repos: stars captured into orbit at the radius of the day they were created.
  const stars = data.repos
    .map((repo) => ({ ...repo, age: daysAgo(data.today, repo.createdAt) }))
    .filter((s) => s.age <= 364 && s.name !== data.login)
    .map((s) => ({
      name: s.name,
      r: orbitOf(s.age),
      phi0: angleOf(s.name),
      turns: orbitOf(s.age) < 8 ? 2 : 1, // whole turns per loop, so the animation is seamless
      amp: 1,
    }));

  return { tex, stars, tdes, ref };
}

export function daysAgo(today, date) {
  return Math.round((Date.parse(today) - Date.parse(date.slice(0, 10))) / 86400000);
}
