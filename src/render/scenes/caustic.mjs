// Direction "Caustic": a pane of glass floats in a narrow beam over a dark slate table. Its surface was
// solved (optimal transport, see render/caustic/) so the light it refracts lands as the name. The light on
// the table is precomputed per frame by forward ray tracing (window.SEQ); this scene renders the slate,
// the pane hovering above it (seen from ~75 degrees, so it sits offset by parallax), and the glow.
export async function setup(ctx) {
  const { w, h, gl } = ctx;
  const lens = window.ASSETS_JSON;                         // { w, h, throw, z[], heights[] }
  const LW = 2.0, LD = 2.0 * (lens.h - 1) / (lens.w - 1);  // footprint in world units
  const THROW = 2.0 * lens.throw / (lens.w - 1);

  const zt = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, zt);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, lens.w, lens.h, 0, gl.RED, gl.FLOAT, new Float32Array(lens.z));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const ct = gl.createTexture();
  const upload = (img) => {
    gl.bindTexture(gl.TEXTURE_2D, ct);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  if (window.ASSETS?.still) upload(await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = window.ASSETS.still; }));

  const frag = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform vec2 res; uniform float gy;
uniform sampler2D Z, C;
uniform vec2 ZS;
uniform vec3 uTarget, uCam; uniform float uFocal;
const float PI = 3.14159265;
const vec2 FP = vec2(${(LW / 2).toFixed(4)}, ${(LD / 2).toFixed(4)});
const float THICK = .03;
float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }

// Table (x, z) -> caustic uv (lens row 0 is the far edge, +z).
vec2 fpuv(vec2 xz){ return vec2(xz.x / (2. * FP.x) + .5, .5 - xz.y / (2. * FP.y)); }
float light(vec2 xz, float lod){
  vec2 q = fpuv(xz);
  if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) return 0.;
  float c = textureLod(C, q, lod).r;
  return pow(c, 2.2);                                       // frames carry exposure and black point
}
vec3 table(vec3 p){
  float grain = .6 * n21(p.xz * 160.) + .4 * n21(p.xz * 31.);
  vec3 slate = vec3(.018, .019, .021) * (.8 + .4 * grain);
  float L = light(p.xz, 0.);
  float glow = 0.;
  for (int i = 0; i < 8; i++) { float a = float(i) * .785; glow += light(p.xz + vec2(cos(a), sin(a)) * .03, 3.5); }
  glow /= 8.;
  return slate * (.35 + 26. * L) + vec3(1., .96, .9) * (L * .55 + glow * .22);
}
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

void main(){
  vec2 frag = uv * res;
  vec3 target = uTarget;
  vec3 cam = uCam;
  vec3 fw = normalize(target - cam), rt = normalize(cross(vec3(0, 1, 0), fw)), up = cross(fw, rt);
  float focal = uFocal, focusD = length(vec3(0.) - cam), aperture = .05;
  vec3 col = vec3(0.);
  const int S = 12;
  for (int s = 0; s < S; s++) {
    vec2 j = vec2(h21(frag + float(s) * 1.7), h21(frag.yx + float(s) * 2.9));
    vec2 pix = (frag + j - .5 * res) / res.y;
    vec3 dir = normalize(fw * focal + rt * pix.x + up * pix.y);
    float a = 2. * PI * h21(vec2(float(s), 3.3)), rr = aperture * sqrt(h21(vec2(float(s), 6.1)));
    vec3 ro = cam + (rt * cos(a) + up * sin(a)) * rr;
    vec3 rd = normalize(cam + dir * focusD / dot(dir, fw) - ro);
    float tt = -ro.y / rd.y;
    vec3 c = table(ro + rd * tt);
    // The pane: top face at gy, footprint FP. Seen from above it's nearly invisible except where it
    // bends what's under it, reflects the source, and lights up along its edges.
    float tg = (gy - ro.y) / rd.y;
    vec3 pg = ro + rd * tg;
    vec2 e = FP - abs(pg.xz);
    if (tg > 0. && e.x > 0. && e.y > 0.) {
      vec2 tc = fpuv(pg.xz) * (ZS - 1.);
      ivec2 ic = ivec2(clamp(tc, vec2(1), ZS - 2.));
      float zx = (texelFetch(Z, ic + ivec2(1, 0), 0).r - texelFetch(Z, ic - ivec2(1, 0), 0).r) * .5;
      float zz = (texelFetch(Z, ic + ivec2(0, 1), 0).r - texelFetch(Z, ic - ivec2(0, 1), 0).r) * .5;
      vec3 n = normalize(vec3(-zx * 1.2, 1., zz * 1.2));
      float fres = .04 + .96 * pow(1. - max(dot(-rd, n), 0.), 5.);
      vec3 r2 = refract(refract(rd, n, 1. / 1.49), vec3(0, 1, 0), 1.49);
      vec3 under = table(pg + vec3(0, -THICK, 0) + r2 * (-(pg.y - THICK) / r2.y));
      vec3 rf = reflect(rd, n);
      float src = smoothstep(.985, .999, rf.y) * 2.2 + smoothstep(.9, .99, rf.y) * .08;   // the beam's source, mirrored
      c = under * (1. - fres) * .96 + vec3(1.) * src * fres * 3. + vec3(.004, .0045, .0055);
      float edge = smoothstep(.009, .0, min(e.x, e.y));
      c += vec3(.85, .88, .95) * edge * .9;
    }
    // Faint light in the air under the pane (the beam folding toward the table).
    vec2 pm = (ro + rd * (tt * .55)).xz;
    vec2 em = FP - abs(pm);
    if (em.x > 0. && em.y > 0.) c += vec3(.75, .77, .82) * .006;
    col += c;
  }
  col /= float(S);
  vec2 qv = uv - .5; col *= 1. - .7 * dot(qv * vec2(.95, 1.25), qv * vec2(.95, 1.25));
  col = aces(col * 1.45);
  col = pow(col, vec3(1. / 2.2));
  col += (h21(floor(frag)) - .5) * .008;                    // static grain: same every frame, so it costs nothing
  o = vec4(col, 1.);
}`;
  const sh = ctx.shader(frag);

  // Pure image: the words around it are crisp SVG in the README. Two framings: wide for desktop, and a
  // tighter one for phones where the name has to carry at ~300 px.
  const compact = window.PARAMS?.mode === 'compact';
  const view = compact
    ? { target: [0, 0.3, 0.24], cam: [0, 3.6, -2.2], focal: 1.95 }
    : { target: [0, 0.16, 0.08], cam: [0, 3.75, -2.35], focal: 2.15 };

  const heights = lens.heights || [1];
  return (t, f) => {
    if (window.SEQ) upload(window.SEQ);
    sh.draw({ res: [w, h], gy: THROW * (heights[f % heights.length] ?? 1), Z: { tex: zt }, C: { tex: ct }, ZS: [lens.w, lens.h],
      uTarget: view.target, uCam: view.cam, uFocal: view.focal });
  };
}
