// Hero: dust in a beam of light. A few hundred thousand motes drift in a slow 3D flow, stream together
// into the name, hold while a sheen passes over them, then a gust carries them off left to right and
// they drift back. The loop is closed: every particle's position is a periodic function of the phase.
// Drawn as GPU points with depth of field into a float buffer, then toned onto GitHub's own page colour.
// PARAMS: mode=wide|compact, theme=dark|light.
export async function setup(ctx) {
  const { gl, w, h } = ctx;
  const P = window.PARAMS || {};
  const avatar = P.mode === 'avatar', card = P.mode === 'card', compact = P.mode === 'compact' || avatar, light = P.theme === 'light';
  const J = window.ASSETS_JSON || {};                      // card: { owner, repo, title, blurb }
  const N = avatar ? 14000 : card ? 30000 : compact ? 16000 : 31000, LETTER = compact ? 0.88 : 0.84;    // share of motes that become the name

  // --- Where the name lives: sample points inside the glyphs, weighted by coverage.
  const lines = avatar ? ['FK'] : card ? [J.title] : compact ? ['Feruz', 'Karimov'] : ['Feruz Karimov'];
  const cw = 2400, ch = compact ? 1500 : 640;
  const c = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = c.getContext('2d');
  const fs = card ? Math.min(400, 2250 / (0.56 * J.title.length)) : compact ? 520 : 400;
  g.font = `${fs}px InterDisplay-Medium`; g.letterSpacing = `${-fs * 0.03}px`;
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const lh = fs * 1.02, y0 = ch / 2 - (lines.length - 1) * lh / 2 + fs * 0.36;
  lines.forEach((s, i) => g.fillText(s, cw / 2, y0 + i * lh));
  const alpha = g.getImageData(0, 0, cw, ch).data;
  let x0 = cw, x1 = 0, ya = ch, yb = 0;
  for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) if (alpha[(y * cw + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
  const textW = avatar ? 3.4 : card ? Math.min(9, 0.95 * J.title.length) : compact ? 4.6 : 7.4;           // world units the name spans
  const scale = textW / (x1 - x0);
  const cx = (x0 + x1) / 2, cy = (ya + yb) / 2;

  let seed = 1;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const tgt = new Float32Array(N * 4), sd = new Float32Array(N * 4);
  const nLetter = Math.floor(N * LETTER);
  for (let i = 0; i < N; i++) {
    if (i < nLetter) {
      let x, y;
      do { x = x0 + rnd() * (x1 - x0); y = ya + rnd() * (yb - ya); } while (alpha[(Math.floor(y) * cw + Math.floor(x)) * 4 + 3] / 255 < rnd());
      tgt[i * 4] = (x - cx) * scale; tgt[i * 4 + 1] = -(y - cy) * scale + (card ? 0.6 : 0); tgt[i * 4 + 2] = (rnd() - 0.5) * 0.04; tgt[i * 4 + 3] = 1;
    } else tgt[i * 4 + 3] = 0;                             // ambient dust: never settles
    sd[i * 4] = rnd(); sd[i * 4 + 1] = rnd(); sd[i * 4 + 2] = rnd(); sd[i * 4 + 3] = rnd();
  }

  // --- Particle program.
  const vs = `#version 300 es
precision highp float;
in vec4 aT; in vec4 aS;
uniform float uPhase; uniform vec2 uRes; uniform mat4 uView, uProj; uniform float uFocus, uBokeh, uSize, uHalfW, uWeight, uDust;
out float vI; out float vA; out float vSoft;
const float TAU = 6.28318530718;
// Simplex noise (Ashima / Stefan Gustavson, MIT).
vec4 perm(vec4 x){ return mod(((x * 34.) + 1.) * x, 289.); }
float snoise(vec3 v){
  const vec2 C = vec2(1. / 6., 1. / 3.);
  vec3 i = floor(v + dot(v, C.yyy)), x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz), l = 1. - g, i1 = min(g.xyz, l.zxy), i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx, x2 = x0 - i2 + 2. * C.xxx, x3 = x0 - 1. + 3. * C.xxx;
  i = mod(i, 289.);
  vec4 p = perm(perm(perm(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  vec3 ns = vec3(.285714285714, -.928571428571, .142857142857);
  vec4 j = p - 49. * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z), y_ = floor(j - 7. * x_);
  vec4 xx = x_ * ns.x + ns.yyyy, yy = y_ * ns.x + ns.yyyy, hh = 1. - abs(xx) - abs(yy);
  vec4 b0 = vec4(xx.xy, yy.xy), b1 = vec4(xx.zw, yy.zw);
  vec4 s0 = floor(b0) * 2. + 1., s1 = floor(b1) * 2. + 1., sh = -step(hh, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy, a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, hh.x), p1 = vec3(a0.zw, hh.y), p2 = vec3(a1.xy, hh.z), p3 = vec3(a1.zw, hh.w);
  vec4 nrm = 1.79284291400159 - .85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= nrm.x; p1 *= nrm.y; p2 *= nrm.z; p3 *= nrm.w;
  vec4 m = max(.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.); m *= m;
  return 42. * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// Divergence-free flow from three offset noise fields.
vec3 curl(vec3 p){
  const float e = .1;
  vec3 dx = vec3(e, 0, 0), dy = vec3(0, e, 0), dz = vec3(0, 0, e);
  float a = snoise(p + dy + vec3(31.4)) - snoise(p - dy + vec3(31.4)), b = snoise(p + dz + vec3(47.2)) - snoise(p - dz + vec3(47.2));
  float c = snoise(p + dz) - snoise(p - dz), d = snoise(p + dx + vec3(47.2)) - snoise(p - dx + vec3(47.2));
  float f = snoise(p + dx + vec3(31.4)) - snoise(p - dx + vec3(31.4)), k = snoise(p + dy) - snoise(p - dy);
  return vec3(a - b, c - d, f - k) / (2. * e);
}
float ease(float x){ x = clamp(x, 0., 1.); return x * x * x * (x * (x * 6. - 15.) + 10.); }
void main(){
  bool letter = aT.w > .5;
  // Free drift: a home in a wide, shallow volume plus a periodic swirl (noise sampled on a circle in
  // its 4th direction, so the path closes exactly at phase 1).
  // Free dust flows in a few ribbons of light across the frame: each mote rides one ribbon, a lap per
  // loop (so the loop closes), spread across it with a gaussian falloff. The ribbons undulate slowly.
  float R = 5.;
  float ri = floor(aS.w * R);
  float h1 = fract(sin(ri * 12.9898) * 43758.5453), h2 = fract(sin(ri * 78.233) * 12345.6789), h3 = fract(sin(ri * 39.425) * 9876.54);
  float u = fract(aS.x + uPhase);
  vec2 g2 = sqrt(-2. * log(max(aS.y, 1e-4))) * vec2(cos(TAU * aS.z), sin(TAU * aS.z));
  float thick = mix(.08, .22, h2) * (1. + .5 * sin(TAU * (u * .9 + h3)));
  vec3 centre = vec3((u - .5) * uHalfW * 2.7,
                     (h1 - .5) * uHalfW * .5 + mix(.5, 1.05, h2) * sin(TAU * (u * mix(.35, .8, h3) + uPhase + h1)),
                     (h3 - .5) * 3. + .9 * sin(TAU * (u * .5 + h2) + TAU * uPhase));
  vec3 free = centre + vec3(0., g2.x, g2.y * 1.6) * thick;
  free += curl(free * .35 + vec3(cos(TAU * uPhase), sin(TAU * uPhase), 0.) * .5) * .06;
  float ends = smoothstep(0., .14, u) * smoothstep(1., .86, u);   // ribbons fade in and out at the edges
  vec3 pos = free;
  float settled = 0.;
  if (letter) {
    // Arrive between .16 and .40; leave left to right between .62 and .98.
    float xn = clamp(aT.x / (uHalfW * 1.4) + .5, 0., 1.);
    // Arrive over .02-.34 (staggered, a little left first); hold; a quick gust strips it .78-.99.
    float ta = .02 + .12 * fract(aS.w * 7.13) + .04 * xn, td = .78 + .1 * xn + .02 * fract(aS.w * 3.7);
    float inA = ease((uPhase - ta) / .16), outA = ease((uPhase - td) / .09);
    settled = inA * (1. - outA);
    vec3 target = aT.xyz + .008 * vec3(snoise(aT.xyz * 9. + vec3(cos(TAU * uPhase), sin(TAU * uPhase), 0.)), snoise(aT.xyz * 9. + 13.), 0.);
    // Paths bow out on the way (a swirl coming in, the gust going out); the bow is zero at both ends.
    vec3 swirl = curl(aT.xyz * .6 + aS.xyz * 3.) * .9;
    vec3 gust = vec3(1.6 + 2.2 * fract(aS.x * 9.1), (fract(aS.y * 7.7) - .35) * 2.6, (fract(aS.z * 5.3) - .5) * 2.4) + curl(aT.xyz * .9 + aS.xyz * 2. + 5.) * 1.1;
    float bow = 4. * settled * (1. - settled);
    vec3 bowDir = uPhase < (ta + td) * .5 ? swirl : gust;
    pos = mix(free, target, settled) + bowDir * bow * (uPhase < (ta + td) * .5 ? 1.15 : 1.9);
  }
  vec4 vp = uView * vec4(pos, 1.);
  gl_Position = uProj * vp;
  // Depth of field: size grows with distance from focus; brightness is spread over the disc.
  float coc = abs(-vp.z - uFocus) * uBokeh;
  float size = uSize + coc;
  gl_PointSize = size;
  vA = (uSize * uSize) / (size * size);
  vSoft = clamp(coc / 6., 0., 1.);
  // Light: a slanted beam through the middle, plus a sheen that crosses the name while it holds.
  float beam = exp(-pow((pos.x * .34 + pos.y * .94 * .35 - .1) / (uHalfW * .55), 2.));
  float sheen = exp(-pow(pos.x - mix(-uHalfW * 1.3, uHalfW * 1.3, clamp((uPhase - .42) / .3, 0., 1.)), 2.) / .35) * settled;
  float sparkle = .45 + .55 * pow(fract(aS.y * 5.3 + aS.x * 1.7), 2.) + (fract(aS.z * 13.7) > .985 ? 2.5 : 0.);
  vI = uWeight * mix(ends * uDust, 1., settled) * (letter ? mix(1.6, 3.4, settled * settled) : 1.8) * (.55 + .45 * beam) * sparkle * (1. + .8 * sheen);
}`;
  const fsrc = `#version 300 es
precision highp float;
in float vI; in float vA; in float vSoft;
out vec4 o;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  float core = exp(-d * d * 7.);                       // in focus: a crisp point
  float disc = smoothstep(1., .82, d) * .9;            // out of focus: a bokeh disc with a soft rim
  float a = mix(core, disc, vSoft) * vA * vI;
  o = vec4(a, a, a, 1.);
}`;
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsrc)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const attr = (name, data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 0, 0); };
  attr('aT', tgt); attr('aS', sd);
  gl.bindVertexArray(null);
  const U = (n) => gl.getUniformLocation(prog, n);

  // --- Camera: a touch off-axis, so the name has depth and the dust has room.
  const sx = w / (avatar ? 300 : card ? 700 : compact ? 340 : 846);       // pixels per CSS pixel, so points look the same size everywhere
  const aspect = w / h, fov = (compact ? 30 : 24) * Math.PI / 180;
  const eye = compact ? [0.6, 0.2, 10.2] : [1.1, -0.35, 15.2], at = [0, 0, 0];
  const look = (e, t) => {
    const f = norm(sub(t, e)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1];
  };
  const proj = (() => { const fy = 1 / Math.tan(fov / 2), n = 0.1, fa = 100; return [fy / aspect, 0, 0, 0, 0, fy, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0]; })();
  // A slow orbit over the loop (closed, so it loops): parallax between near and far dust.
  const viewAt = (ph) => {
    const a = 2 * Math.PI * ph, e = [eye[0] + 0.9 * Math.sin(a), eye[1] + 0.35 * Math.cos(a), eye[2] + 0.4 * Math.cos(a)];
    return look(e, at);
  };
  const focus = Math.hypot(...sub(at, eye));

  if (card) {
    const ov = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const og = ov.getContext('2d'), k = w / 1280;
    og.fillStyle = '#6E6E6E'; og.font = `${22 * k}px GeistMono-Regular`; og.letterSpacing = `${0.6 * k}px`;
    og.fillText(`${J.owner} / ${J.repo}`, 64 * k, 76 * k);
    og.fillStyle = '#9A9A9A'; og.font = `${34 * k}px Inter-Regular`; og.letterSpacing = '0px';
    // One line if it fits; otherwise the two-line split with the most even lines (no stranded word).
    const words = J.blurb.split(' '), wOf = (a) => og.measureText(a.join(' ')).width;
    let out = [J.blurb];
    if (wOf(words) > 1100 * k) {
      let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const m = Math.max(wOf(words.slice(0, i)), wOf(words.slice(i)));
        if (m < best) { best = m; out = [words.slice(0, i).join(' '), words.slice(i).join(' ')]; }
      }
    }
    out.forEach((l, i) => og.fillText(l, 64 * k, h - (72 + (out.length - 1 - i) * 46) * k));
    ctx.overlay = ov;
  }
  const acc = ctx.target(w, h);
  // Bloom: two blur passes at quarter resolution.
  const bw = Math.round(w / 4), bh = Math.round(h / 4);
  const b1 = ctx.target(bw, bh), b2 = ctx.target(bw, bh);
  const blur = ctx.shader(`#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D S; uniform vec2 dir;
void main(){
  vec4 c = vec4(0.); float wsum = 0.;
  for (int i = -8; i <= 8; i++) { float wt = exp(-float(i * i) / 18.); c += texture(S, uv + dir * float(i)) * wt; wsum += wt; }
  o = c / wsum;
}`);
  const tone = ctx.shader(`#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D A, G; uniform vec2 res; uniform float light; uniform float bloomK;
void main(){
  float d = texture(A, uv).r + (light > .5 ? .12 : bloomK) * texture(G, uv).r;
  float m = 1. - exp(-d * 1.1);                         // soft shoulder: dense letters glow without clipping
  // Exact page colour at the borders and in the faintest dust, so the image has no visible edge and the
  // encoder gets truly flat areas (no faint blocks).
  float edge = smoothstep(0., .07, uv.x) * smoothstep(1., .93, uv.x) * smoothstep(0., .1, uv.y) * smoothstep(1., .9, uv.y);
  m = max(m - .014, 0.) / .986 * edge;
  vec3 page = light > .5 ? vec3(1.) : vec3(13., 17., 23.) / 255.;
  // A faint shaft of the beam itself, so the motes have something to be lit by.
  vec2 p = (uv - .5) * vec2(res.x / res.y, 1.);
  float shaft = exp(-pow((p.x * .94 - p.y * .34 + .04) / .42, 2.)) * smoothstep(-.6, .5, p.y + .1) * edge;
  vec3 col;
  if (light > .5) col = page * (1. - .82 * m) - vec3(.012) * shaft;
  else col = page + vec3(.92, .94, 1.) * m + vec3(.010, .011, .014) * shaft;
  o = vec4(col, 1.);
}`);

  return (t, f) => {
    const phase = ((f % ctx.frames) / ctx.frames + 0.5) % 1;    // frame 0 shows the name
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.uniform2f(U('uRes'), w, h);
    gl.uniformMatrix4fv(U('uView'), false, viewAt(phase)); gl.uniformMatrix4fv(U('uProj'), false, proj);
    gl.uniform1f(U('uFocus'), focus); gl.uniform1f(U('uBokeh'), 1.5 * sx); gl.uniform1f(U('uSize'), 1.15 * sx);
    gl.uniform1f(U('uHalfW'), compact ? 3.0 : 4.6); gl.uniform1f(U('uDust'), compact ? 0.32 : card ? 0.7 : 1.0);
    // Motion blur. While the name holds, a short shutter keeps the letters crisp; while the dust is in
    // flight it opens to ~6 frames (long exposure), so every mote draws its path as a streak of light.
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const flight = 1 - sm(0.18, 0.36, phase) * (1 - sm(0.8, 0.92, phase));
    const K = flight > 0.05 ? 12 : 6, shutter = (1.6 + 4.4 * flight) / ctx.frames;
    gl.uniform1f(U('uWeight'), 1 / K);
    for (let k = 0; k < K; k++) {
      gl.uniform1f(U('uPhase'), (phase - (k / K) * shutter + 1) % 1);
      gl.drawArrays(gl.POINTS, 0, N);
    }
    gl.bindVertexArray(null); gl.disable(gl.BLEND);
    blur.draw({ S: { tex: acc.tex }, dir: [1.5 / bw, 0] }, b1);
    blur.draw({ S: { tex: b1.tex }, dir: [0, 1.5 / bh] }, b2);
    tone.draw({ A: { tex: acc.tex }, G: { tex: b2.tex }, res: [w, h], light: light ? 1 : 0, bloomK: compact ? 0.3 : 0.55 });
  };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
