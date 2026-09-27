// Paints one frame: looks up every pixel's recorded disk crossings, lights them with this
// year's matter, then runs the site's post chain (bloom → aberration → ACES → vignette) on the CPU.
import { MAX_HITS, blackbody, smoothstep } from './physics.mjs';
import { R0, R1, NR, NPHI, ISCO, RIM } from './disk.mjs';

const TAU = Math.PI * 2;
const DOPPLER = 0.55;

/** Bilinear lookup in a polar (r, φ) texture, wrapping in φ. */
function samplePolar(tex, r, phi) {
  let fr = ((r - R0) / (R1 - R0)) * NR - 0.5;
  let fp = ((phi + Math.PI) / TAU) * NPHI - 0.5;
  if (fr < 0) fr = 0;
  else if (fr > NR - 1.001) fr = NR - 1.001;
  fp -= Math.floor(fp / NPHI) * NPHI;
  const i = fr | 0, j = fp | 0;
  const a = fr - i, b = fp - j;
  const j1 = j + 1 === NPHI ? 0 : j + 1;
  const o0 = i * NPHI, o1 = o0 + NPHI;
  return (tex[o0 + j] * (1 - b) + tex[o0 + j1] * b) * (1 - a) + (tex[o1 + j] * (1 - b) + tex[o1 + j1] * b) * a;
}

/**
 * HDR render of frame `f` ∈ [0, 1) at the map's resolution, box-filtered down by `ss`.
 * `out` is Float32 RGB at (w/ss) × (h/ss).
 */
export function renderFrame(map, disk, opts, f, out, fGas = f, starOut = out) {
  const { w, h, ss, cyc, gain, jet, stars } = opts;
  const { E, H, B, N } = disk;
  const ow = w / ss;
  out.fill(0);
  if (starOut !== out) starOut.fill(0);
  const f1 = fGas, f2 = (fGas + 0.5) % 1, w1 = 1 - Math.abs(2 * f1 - 1);
  const knotPhase = TAU * 3 * f;
  const starPhi = stars.map((s) => s.phi0 + TAU * s.turns * f);
  const bb = [0, 0, 0];
  const hot = blackbody(1.85, [0, 0, 0]);
  const inv = 1 / (ss * ss);

  for (let py = 0; py < h; py++) {
    const orow = ((py / ss) | 0) * ow;
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      let cr = 0, cg = 0, cb = 0, T = 1;
      let sr = 0, sg = 0, sb = 0; // starlight goes to its own layer (it moves every frame; the gas doesn't)

      // Jets in front of the disk.
      const jy = map.jet[i * 3 + 2];
      const knots = 0.35 + 1.5 * Math.pow(0.5 + 0.5 * Math.sin(Math.abs(jy) * 2.4 - knotPhase), 4);
      if (jet > 0) {
        const j0 = map.jet[i * 3] * jet * knots;
        cr += j0 * 0.55;
        cg += j0 * 0.72;
        cb += j0 * 1.0;
      }

      const nh = map.hits[i];
      for (let k = 0; k < nh; k++) {
        const o = i * MAX_HITS + k;
        const r = map.hr[o], phi = map.hphi[o], g = map.hg[o];
        const prof = smoothstep(ISCO - 0.35, ISCO + 0.9, r) * (1 - smoothstep(15.5, 16.8, r));
        if (prof <= 0) continue;
        const om = 1.25 / (r * Math.sqrt(r));
        const n = samplePolar(N, r, phi - om * f2 * cyc + 2.3) * (1 - w1) + samplePolar(N, r, phi - om * f1 * cyc) * w1;
        const e0 = samplePolar(E, r, phi);
        const e = (1.6 * e0) / (0.6 + e0); // soft cap, so a pile-up of busy days can't blow out
        const heat = e0 > 1e-4 ? samplePolar(H, r, phi) : 0;
        // Faint ambient gas so the disk still reads during quiet weeks, plus the days themselves.
        const amb = 0.05 * Math.pow(ISCO / r, 1.35) * (0.4 + 1.6 * n * n) * (1 - smoothstep(RIM * 0.8, RIM + 1.5, r));
        let dens = prof * (amb + 0.2 * e * Math.pow(ISCO / r, 0.35) * (0.25 + 1.2 * n * n));
        const boost = 1 + (g * g * g - 1) * DOPPLER;
        const temp = Math.pow(2.9 / r, 0.75) * (1 + (g - 1) * 0.7 * DOPPLER) * (1 + 0.22 * heat);
        blackbody(temp, bb);
        let er = bb[0] * dens, eg = bb[1] * dens, eb = bb[2] * dens;

        // Tidal-disruption streams (merged PRs): thin and hot.
        const s0 = samplePolar(B, r, phi);
        if (s0 > 1e-4) {
          const d = ((0.6 * s0) / (0.6 + s0)) * prof * (0.5 + 0.9 * n) * 0.3;
          er += hot[0] * d;
          eg += hot[1] * d;
          eb += hot[2] * d;
          dens += d * 0.5;
        }

        // Captured stars (repos) orbiting through.
        let qr = 0, qg = 0, qb = 0;
        for (let q = 0; q < stars.length; q++) {
          const st = stars[q];
          const dr = r - st.r;
          if (dr > 0.6 || dr < -0.6) continue;
          let dp = phi - starPhi[q];
          dp -= Math.round(dp / TAU) * TAU;
          const dd = dr * dr + st.r * st.r * dp * dp;
          const wgt = st.amp * Math.exp(-dd / 0.012);
          if (wgt < 1e-4) continue;
          qr += 0.9 * wgt * hot[0];
          qg += 0.9 * wgt * hot[1];
          qb += 0.9 * wgt * hot[2];
          dens += wgt * 0.6;
        }

        const k2 = boost * 2.4 * gain * T;
        cr += er * k2;
        cg += eg * k2;
        cb += eb * k2;
        sr += qr * k2;
        sg += qg * k2;
        sb += qb * k2;
        T *= 1 - Math.min(0.9, dens * 1.5);
      }

      if (jet > 0) {
        const j1 = map.jet[i * 3 + 1] * jet * knots * T;
        cr += j1 * 0.55;
        cg += j1 * 0.72;
        cb += j1 * 1.0;
      }

      const ring = map.ring[i] * T * gain;
      cr += T * map.sky[i * 3] + ring;
      cg += T * map.sky[i * 3 + 1] + ring * 0.72;
      cb += T * map.sky[i * 3 + 2] + ring * 0.45;

      const oi = (orow + ((px / ss) | 0)) * 3;
      out[oi] += cr * inv;
      out[oi + 1] += cg * inv;
      out[oi + 2] += cb * inv;
      starOut[oi] += sr * inv;
      starOut[oi + 1] += sg * inv;
      starOut[oi + 2] += sb * inv;
    }
  }
  return out;
}

// ---------------------------------------------------------------- bloom (UnrealBloomPass, approximately)

function downsample(src, w, h) {
  const nw = w >> 1, nh = h >> 1;
  const dst = new Float32Array(nw * nh * 3);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++)
      for (let c = 0; c < 3; c++) {
        const a = ((2 * y) * w + 2 * x) * 3 + c, b = a + w * 3;
        dst[(y * nw + x) * 3 + c] = (src[a] + src[a + 3] + src[b] + src[b + 3]) * 0.25;
      }
  return { d: dst, w: nw, h: nh };
}

function blur(img, w, h, sigma) {
  const rad = Math.ceil(sigma * 2);
  const k = [];
  let sum = 0;
  for (let i = -rad; i <= rad; i++) sum += k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(img.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = -rad; i <= rad; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        const o = (y * w + xx) * 3, kk = k[i + rad];
        r += img[o] * kk;
        g += img[o + 1] * kk;
        b += img[o + 2] * kk;
      }
      const o = (y * w + x) * 3;
      tmp[o] = r;
      tmp[o + 1] = g;
      tmp[o + 2] = b;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = -rad; i <= rad; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        const o = (yy * w + x) * 3, kk = k[i + rad];
        r += tmp[o] * kk;
        g += tmp[o + 1] * kk;
        b += tmp[o + 2] * kk;
      }
      const o = (y * w + x) * 3;
      img[o] = r;
      img[o + 1] = g;
      img[o + 2] = b;
    }
  return img;
}

function sampleBilinear(img, w, h, x, y, c) {
  x = Math.min(w - 1.001, Math.max(0, x));
  y = Math.min(h - 1.001, Math.max(0, y));
  const i = x | 0, j = y | 0, a = x - i, b = y - j;
  const o = (j * w + i) * 3 + c, o2 = o + w * 3;
  return (img[o] * (1 - a) + img[o + 3] * a) * (1 - b) + (img[o2] * (1 - a) + img[o2 + 3] * a) * b;
}

/** Adds bloom in place: luminosity high-pass, five blurred mips, weighted like the site's UnrealBloomPass. */
export function bloom(img, w, h, opts) {
  const layer = bloomLayer(img, w, h, opts);
  for (let i = 0; i < img.length; i++) img[i] += layer[i];
  return img;
}

/** Just the bloom, as a layer to add. */
export function bloomLayer(img, w, h, { strength = 0.55, threshold = 0.9 } = {}) {
  const bright = new Float32Array(img.length);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    const l = 0.2126 * img[o] + 0.7152 * img[o + 1] + 0.0722 * img[o + 2];
    const a = smoothstep(threshold, threshold + 0.01, l);
    bright[o] = img[o] * a;
    bright[o + 1] = img[o + 1] * a;
    bright[o + 2] = img[o + 2] * a;
  }
  const weights = [1.0, 0.8, 0.6, 0.4, 0.2].map((f) => f + (1.2 - 2 * f) * 0.35);
  const sigmas = [3, 5, 7, 9, 11].map((s) => s * 0.55);
  let cur = { d: bright, w, h };
  const mips = [];
  for (let m = 0; m < 5; m++) {
    cur = downsample(cur.d, cur.w, cur.h);
    blur(cur.d, cur.w, cur.h, sigmas[m]);
    mips.push(cur);
  }
  const layer = new Float32Array(img.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let m = 0; m < 5; m++) {
        const mp = mips[m], s = mp.w / w;
        const sx = (x + 0.5) * s - 0.5, sy = (y + 0.5) * s - 0.5;
        const k = strength * weights[m];
        layer[o] += k * sampleBilinear(mp.d, mp.w, mp.h, sx, sy, 0);
        layer[o + 1] += k * sampleBilinear(mp.d, mp.w, mp.h, sx, sy, 1);
        layer[o + 2] += k * sampleBilinear(mp.d, mp.w, mp.h, sx, sy, 2);
      }
    }
  return layer;
}

/** A tight glow for point-like sources: stays local, so a moving star only changes pixels near it. */
export function glowLayer(img, w, h, sigma = 3.5, strength = 0.9) {
  const g = Float32Array.from(img);
  blur(g, w, h, sigma);
  for (let i = 0; i < g.length; i++) g[i] *= strength;
  return g;
}

// ---------------------------------------------------------------- post (the site's postFrag)

const aces = (x) => {
  const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

/** HDR → sRGB bytes: chromatic aberration, ACES, vignette, gamma. Alpha comes from `mask`. */
export function post(img, w, h, rgba, mask) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5, v = (y + 0.5) / h - 0.5;
      const k = 0.02 * (u * u + v * v + 0.02);
      const o = (y * w + x) * 3;
      let r = sampleBilinear(img, w, h, x - u * k * w, y - v * k * h, 0);
      let g = img[o + 1];
      let b = sampleBilinear(img, w, h, x + u * k * w, y + v * k * h, 2);
      const vig = 1 - (u * u + v * v) * 0.75;
      r = Math.pow(aces(r) * vig, 1 / 2.2);
      g = Math.pow(aces(g) * vig, 1 / 2.2);
      b = Math.pow(aces(b) * vig, 1 / 2.2);
      const q = (y * w + x) * 4;
      rgba[q] = Math.round(Math.min(1, r) * 255);
      rgba[q + 1] = Math.round(Math.min(1, g) * 255);
      rgba[q + 2] = Math.round(Math.min(1, b) * 255);
      rgba[q + 3] = mask ? mask[y * w + x] : 255;
    }
  return rgba;
}

/** Anti-aliased rounded-rectangle alpha, so the dark plate sits softly on GitHub's light theme. */
export function roundedMask(w, h, rad) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = Math.max(0, Math.abs(x + 0.5 - w / 2) - (w / 2 - rad));
      const dy = Math.max(0, Math.abs(y + 0.5 - h / 2) - (h / 2 - rad));
      m[y * w + x] = Math.round(255 * Math.min(1, Math.max(0, rad + 0.5 - Math.hypot(dx, dy))));
    }
  return m;
}
