// The accretion disk's layout and its turbulence texture.
import { fbm, vnoise } from './physics.mjs';

export const R0 = 2.3; // polar textures cover r ∈ [R0, R1]
export const R1 = 17;
export const RIM = 13.5; // ambient gas fades out past here
export const ISCO = 3; // innermost stable circular orbit
export const NR = 640;
export const NPHI = 2048;
const TAU = Math.PI * 2;

/** The site's disk noise in (r, φ), sampled with a flow map at render time so the gas visibly orbits. */
export function turbulence() {
  const N = new Float32Array(new SharedArrayBuffer(NR * NPHI * 4));
  for (let i = 0; i < NR; i++) {
    const r = R0 + ((i + 0.5) / NR) * (R1 - R0);
    for (let j = 0; j < NPHI; j++) {
      const p = ((j + 0.5) / NPHI) * TAU - Math.PI;
      const c = Math.cos(p), s = Math.sin(p);
      const n = fbm(c * 1.6, s * 1.6, r * 2.3);
      const fine = vnoise(c * 5, s * 5, r * 11);
      const rings = 0.5 + 0.5 * Math.sin(r * 9 + n * 6);
      N[i * NPHI + j] = n * (0.55 + 0.6 * fine) * (0.6 + 0.6 * rings);
    }
  }
  return N;
}
