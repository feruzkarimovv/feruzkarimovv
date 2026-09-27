// FK-1's spacetime: a float64 port of the fragment shader behind feruz-karimov.dev.
// Units: Schwarzschild radius r_s = 1. Photon sphere at 1.5, ISCO at 3.

const fract = (x) => x - Math.floor(x);
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- noise (same hashes as the GLSL)
export function hash13(x, y, z) {
  x = fract(x * 0.1031);
  y = fract(y * 0.1031);
  z = fract(z * 0.1031);
  const d = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32);
  x += d;
  y += d;
  z += d;
  return fract((x + y) * z);
}

function hash33(x, y, z) {
  x = fract(x * 0.1031);
  y = fract(y * 0.103);
  z = fract(z * 0.0973);
  const d = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33);
  x += d;
  y += d;
  z += d;
  return [fract((x + y) * z), fract((x + x) * y), fract((y + x) * x)];
}

export function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash13(ix, iy, iz), b = hash13(ix + 1, iy, iz);
  const c = hash13(ix, iy + 1, iz), d = hash13(ix + 1, iy + 1, iz);
  const e = hash13(ix, iy, iz + 1), g = hash13(ix + 1, iy, iz + 1);
  const h = hash13(ix, iy + 1, iz + 1), k = hash13(ix + 1, iy + 1, iz + 1);
  const l0 = a + (b - a) * fx, l1 = c + (d - c) * fx, l2 = e + (g - e) * fx, l3 = h + (k - h) * fx;
  const m0 = l0 + (l1 - l0) * fy, m1 = l2 + (l3 - l2) * fy;
  return m0 + (m1 - m0) * fz;
}

export function fbm(x, y, z) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 5; i++) {
    s += a * vnoise(x, y, z);
    x = x * 2.03 + 1.7;
    y = y * 2.03 + 9.2;
    z = z * 2.03 + 3.1;
    a *= 0.5;
  }
  return s;
}

// ---------------------------------------------------------------- colour

/** Stylised blackbody ramp; t ~ normalised temperature (1 = inner disk edge). Writes into `out`. */
export function blackbody(t, out) {
  t = clamp(t, 0, 2.2);
  const mix = (k) => {
    out[0] += (cr[k] - out[0]) * s;
    out[1] += (cg[k] - out[1]) * s;
    out[2] += (cb[k] - out[2]) * s;
  };
  let s = smoothstep(0, 0.35, t);
  out[0] = 0.45 + (1 - 0.45) * s;
  out[1] = 0.05 + (0.32 - 0.05) * s;
  out[2] = 0.01 + (0.06 - 0.01) * s;
  s = smoothstep(0.35, 0.7, t);
  mix(0);
  s = smoothstep(0.7, 1.05, t);
  mix(1);
  s = smoothstep(1.1, 1.8, t);
  mix(2);
  const k = 0.18 + 1.5 * t * t;
  out[0] *= k;
  out[1] *= k;
  out[2] *= k;
  return out;
}
const cr = [1.0, 1.0, 0.74], cg = [0.64, 0.92, 0.84], cb = [0.3, 0.8, 1.0];

/** Static sky (the README's stars don't twinkle: every changing pixel costs bytes). */
export function starfield(dx, dy, dz, out) {
  const bx = 0.42, by = 1.0, bz = -0.3, bl = Math.hypot(bx, by, bz);
  const b = (dx * bx + dy * by + dz * bz) / bl;
  const band = Math.exp(-b * b * 10);
  const n1 = fbm(dx * 2.6 + 3, dy * 2.6 + 3, dz * 2.6 + 3);
  const n2 = fbm(dx * 7 - 5, dy * 7 - 5, dz * 7 - 5);
  out[0] = band * (0.2 * n1 * n1 + 0.42 * n2 * n2 * n1) * 0.09 + 0.002 * n1;
  out[1] = band * (0.16 * n1 * n1 + 0.26 * n2 * n2 * n1) * 0.09 + 0.003 * n1;
  out[2] = band * (0.3 * n1 * n1 + 0.18 * n2 * n2 * n1) * 0.09 + 0.006 * n1;
  for (let i = 0; i < 3; i++) {
    const sc = 70 * Math.pow(2.1, i);
    const px = dx * sc, py = dy * sc, pz = dz * sc;
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const h = hash13(ix + i * 17, iy + i * 17, iz + i * 17);
    const thr = 0.955 + i * 0.012;
    if (h <= thr) continue;
    const o = hash33(ix, iy, iz);
    const fx = px - ix - 0.5 - (o[0] - 0.5) * 0.6;
    const fy = py - iy - 0.5 - (o[1] - 0.5) * 0.6;
    const fz = pz - iz - 0.5 - (o[2] - 0.5) * 0.6;
    const size = 0.07 + 0.07 * hash13(ix + 3.1, iy + 3.1, iz + 3.1);
    let s = smoothstep(size, 0, Math.hypot(fx, fy, fz));
    s *= s;
    const tw = 0.75 + 0.25 * Math.sin(h * 60);
    const m = hash13(ix + 7.7, iy + 7.7, iz + 7.7);
    const k = s * tw * ((h - thr) / (1 - thr)) * (5 - i * 1.4);
    out[0] += (1 + (0.62 - 1) * m) * k;
    out[1] += (0.72 + (0.78 - 0.72) * m) * k;
    out[2] += (0.52 + (1 - 0.52) * m) * k;
  }
  return out;
}

// ---------------------------------------------------------------- camera

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Same basis as BlackHole.computeCamera on the site. Angles in radians, fov vertical in degrees. */
export function camera({ w, h, r, elev, az, roll = 0, yaw = 0, pitch = 0, fov }) {
  const ce = Math.cos(elev);
  const pos = [r * ce * Math.sin(az), r * Math.sin(elev), r * ce * Math.cos(az)];
  const toBH = norm(scale(pos, -1));
  const right0 = norm(cross(toBH, [0, 1, 0]));
  const up0 = norm(cross(right0, toBH));
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const rightR = add(scale(right0, cr), up0, sr);
  const upR = add(scale(up0, cr), right0, -sr);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fwd = norm(add(add(scale(toBH, cy * cp), rightR, sy * cp), upR, sp));
  const right = norm(cross(fwd, upR));
  const up = norm(cross(right, fwd));
  return { w, h, pos, fwd, right, up, tanHalf: Math.tan((fov * Math.PI) / 360), aspect: w / h, r };
}

/** Pixel (CSS-style, y down) of a world point, ignoring lensing. */
export function project(cam, p) {
  const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  const z = d[0] * cam.fwd[0] + d[1] * cam.fwd[1] + d[2] * cam.fwd[2];
  const x = (d[0] * cam.right[0] + d[1] * cam.right[1] + d[2] * cam.right[2]) / z / (cam.tanHalf * cam.aspect);
  const y = (d[0] * cam.up[0] + d[1] * cam.up[1] + d[2] * cam.up[2]) / z / cam.tanHalf;
  return [((x + 1) / 2) * cam.w, ((1 - y) / 2) * cam.h];
}

// ---------------------------------------------------------------- the map

export const MAX_HITS = 3;

/** Shared buffers describing where every pixel's light ray has been. Pure geometry: no data, no time. */
export function allocMap(n) {
  const sab = (bytes) => new SharedArrayBuffer(bytes);
  return {
    n,
    hits: new Uint8Array(sab(n)), // disk-plane crossings recorded (≤ MAX_HITS)
    hr: new Float32Array(sab(n * MAX_HITS * 4)), // radius of each crossing
    hphi: new Float32Array(sab(n * MAX_HITS * 4)), // azimuth of each crossing
    hg: new Float32Array(sab(n * MAX_HITS * 4)), // redshift factor g = Doppler × gravitational
    sky: new Float32Array(sab(n * 3 * 4)), // starlight if the ray escaped
    ring: new Float32Array(sab(n * 4)), // photon-ring pile-up for rays that skimmed r = 1.5
    jet: new Float32Array(sab(n * 3 * 4)), // jet column: before first crossing, after, mean |y| (for knots)
  };
}

export const mapBuffers = (m) => ({ n: m.n, hits: m.hits.buffer, hr: m.hr.buffer, hphi: m.hphi.buffer, hg: m.hg.buffer, sky: m.sky.buffer, ring: m.ring.buffer, jet: m.jet.buffer });
export const mapViews = (b) => ({
  n: b.n,
  hits: new Uint8Array(b.hits),
  hr: new Float32Array(b.hr),
  hphi: new Float32Array(b.hphi),
  hg: new Float32Array(b.hg),
  sky: new Float32Array(b.sky),
  ring: new Float32Array(b.ring),
  jet: new Float32Array(b.jet),
});

const MAX_STEPS = 260;

/**
 * Integrate null geodesics for rows [y0, y1). Same scheme as the shader
 * (Binet form, a = -3/2 h² r̂ / r⁴, step ∝ r), but every disk crossing is
 * recorded instead of shaded, so the frames can be painted later.
 */
export function trace(cam, map, y0, y1, { diskIn = 2.9, diskMax = 17, escape = 60 } = {}) {
  const { w, h, pos: cp, fwd, right, up, tanHalf, aspect } = cam;
  const esc2 = escape * escape;
  const sky = [0, 0, 0];
  for (let py = y0; py < y1; py++) {
    const ny = 1 - ((py + 0.5) / h) * 2;
    for (let px = 0; px < w; px++) {
      const nx = ((px + 0.5) / w) * 2 - 1;
      let vx = fwd[0] + nx * aspect * tanHalf * right[0] + ny * tanHalf * up[0];
      let vy = fwd[1] + nx * aspect * tanHalf * right[1] + ny * tanHalf * up[1];
      let vz = fwd[2] + nx * aspect * tanHalf * right[2] + ny * tanHalf * up[2];
      const vl = Math.hypot(vx, vy, vz);
      vx /= vl;
      vy /= vl;
      vz /= vl;
      let x = cp[0], y = cp[1], z = cp[2];
      const hx = y * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - y * vx;
      const h2 = hx * hx + hy * hy + hz * hz;
      const i = py * w + px;
      let minR = 1e9, nh = 0, escaped = false;
      let j0 = 0, j1 = 0, jy = 0, jw = 0;
      for (let s = 0; s < MAX_STEPS; s++) {
        const r2 = x * x + y * y + z * z;
        const r = Math.sqrt(r2);
        if (r < minR) minR = r;
        const dt = r * 0.07 < 0.02 ? 0.02 : r * 0.07 > 3 ? 3 : r * 0.07;
        const px0 = x, py0 = y, pz0 = z;
        const k = ((-1.5 * h2) / (r2 * r2 * r)) * dt;
        vx += k * x;
        vy += k * y;
        vz += k * z;
        x += vx * dt;
        y += vy * dt;
        z += vz * dt;

        if (py0 * y < 0 && nh < MAX_HITS) {
          const t = py0 / (py0 - y);
          const qx = px0 + (x - px0) * t, qz = pz0 + (z - pz0) * t;
          const rr = Math.hypot(qx, qz);
          if (rr >= diskIn * 0.8 && rr <= diskMax) {
            // Relativistic beaming + gravitational redshift (static-observer approximation), as on the site.
            const l = Math.hypot(vx, vy, vz);
            const tx = -qz / rr, tz = qx / rr;
            const beta = Math.min(Math.sqrt(0.5 / Math.max(rr - 1, 0.25)), 0.8);
            const gam = 1 / Math.sqrt(1 - beta * beta);
            const D = 1 / (gam * (1 - beta * (-(tx * vx + tz * vz) / l)));
            const o = i * MAX_HITS + nh;
            map.hr[o] = rr;
            map.hphi[o] = Math.atan2(qz, qx);
            map.hg[o] = D * Math.sqrt(Math.max(1 - 1 / rr, 0.02));
            nh++;
          }
        }

        // Relativistic jets along the spin axis: store the column so frames can light it up (or not).
        const ay = Math.abs(y);
        if (ay > 1.6) {
          const rho2 = x * x + z * z;
          const jw0 = 0.07 + ay * 0.045;
          const along = smoothstep(1.6, 4, ay) * Math.exp(-ay * 0.045) * dt * 0.9;
          const core = Math.exp(-rho2 / (jw0 * jw0)) * along;
          const sheath = Math.exp(-rho2 / (jw0 * jw0 * 9)) * 0.12 * along;
          if (nh === 0) j0 += core + sheath;
          else j1 += core + sheath;
          jy += core * ay * Math.sign(y);
          jw += core;
        }

        const nr2 = x * x + y * y + z * z;
        if (nr2 < 1) break;
        if (nr2 > esc2 && x * vx + y * vy + z * vz > 0) {
          escaped = true;
          break;
        }
      }
      map.hits[i] = nh;
      map.jet[i * 3] = j0;
      map.jet[i * 3 + 1] = j1;
      map.jet[i * 3 + 2] = jw > 0 ? jy / jw : 0;
      if (escaped) {
        const l = Math.hypot(vx, vy, vz);
        starfield(vx / l, vy / l, vz / l, sky);
        map.sky[i * 3] = sky[0];
        map.sky[i * 3 + 1] = sky[1];
        map.sky[i * 3 + 2] = sky[2];
        map.ring[i] = Math.exp(-(minR - 1.5) * 9) * 0.35;
      }
    }
  }
}
