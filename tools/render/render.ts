// Offline driver for the Event Horizon ray tracer: same shaders, same name texture,
// but time is whatever capture.mjs says it is, so every frame is reproducible.
import { BlackHole, type View } from '@eh/gl/blackhole';
import { drawNameTexture } from '@eh/gl/nameTexture';
import { site } from '@eh/content';
import type { Vector3 } from 'three';

const DEG = Math.PI / 180;
const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
let bh: BlackHole;

// The site's hero keyframe, minus mouse parallax and drift.
const hero: View = {
  r: 26, elev: 5 * DEG, az: 0.6, roll: -9 * DEG, yaw: 0, pitch: 0, fov: 45, text: 1, horizon: 0,
  exposure: 1, hue: 0, feed: 0, jet: 0, flash: 0, diskGain: 1, textOffX: 0, textOffY: 0,
};

// Extra per-frame knobs for the feeding clip: shrink and spin the name plane so it lenses into a ring.
type Name = { nameSX?: number; nameSY?: number; nameSpin?: number };
const name = { sx: 1, sy: 1, spin: 0 };

type Opts = { top?: string; bottom?: string; grain?: number; twinkle?: boolean; heroFov?: number; lockStars?: boolean };

async function setup(o: Opts = {}) {
  await Promise.all([
    document.fonts.load('800 100px "Archivo"'),
    document.fonts.load('500 20px "JetBrains Mono"'),
    document.fonts.load('italic 400 100px "Instrument Serif"'),
  ]);
  bh = new BlackHole(canvas);
  bh.setScale(1);
  bh.heroFov = o.heroFov ?? 45;
  const { canvas: tex, lineFrac } = drawNameTexture(
    [site.first, site.last],
    o.top ?? `${site.role} — feruz-karimov.dev`,
    o.bottom ?? 'Light bends. So does this name.',
    false,
  );
  bh.setNameTexture(tex, lineFrac);

  type Priv = {
    nameHalfSize(r: number): { x: number; y: number };
    composer: { render(): void };
    bh: { uniforms: Record<string, { value: Vector3 }> };
  };
  const priv = bh as unknown as Priv;
  const halfSize = priv.nameHalfSize.bind(bh);
  priv.nameHalfSize = (r) => {
    const h = halfSize(r);
    return { x: h.x * name.sx, y: h.y * name.sy };
  };
  const composerRender = priv.composer.render.bind(priv.composer);
  priv.composer.render = () => {
    if (name.spin) {
      const { uTextU, uTextV } = priv.bh.uniforms;
      const U = uTextU.value.clone(), V = uTextV.value.clone();
      const c = Math.cos(name.spin), s = Math.sin(name.spin);
      uTextU.value.copy(U.clone().multiplyScalar(c).addScaledVector(V, s));
      uTextV.value.copy(V.clone().multiplyScalar(c).addScaledVector(U, -s));
    }
    composerRender();
  };

  // Reach past `private`: grain and star twinkle change every pixel every frame,
  // which is lovely live and ruinous for an animated image's file size.
  const inner = bh as unknown as { bh: { fragmentShader: string; needsUpdate: boolean }; post: { uniforms: { uGrain: { value: number } } } };
  inner.post.uniforms.uGrain.value = o.grain ?? 0;
  if (!o.twinkle) {
    inner.bh.fragmentShader = inner.bh.fragmentShader.replace('sin(uTime * (1.0 + h * 4.0) + h * 60.0)', 'sin(h * 60.0)');
    inner.bh.needsUpdate = true;
  }
  if (o.lockStars ?? true) {
    // Sample the sky in camera space so a swaying camera doesn't drag every star across the frame.
    inner.bh.fragmentShader = inner.bh.fragmentShader.replace(
      'starfield(normalize(vel))',
      'starfield(normalize(vec3(dot(vel, uCamRight), dot(vel, uCamUp), dot(vel, uCamFwd))))',
    );
    inner.bh.needsUpdate = true;
  }
  const gl = bh.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
}

/** Render without readback, for scenes that screenshot the page with DOM on top. */
function draw(t: number, { nameSX = 1, nameSY = 1, nameSpin = 0, ...v }: Partial<View> & Name = {}) {
  Object.assign(name, { sx: nameSX, sy: nameSY, spin: nameSpin });
  bh.render({ ...hero, ...v }, t, 16, 0);
}

/** Render one frame at shader time `t` and read it back in the same task. */
function frame(t: number, v: Partial<View> & Name = {}) {
  draw(t, v);
  return bh.renderer.domElement.toDataURL('image/png');
}

/** Lay HTML over the canvas (typography the shader can't do). */
async function overlay(html: string) {
  document.querySelector('#overlay')!.innerHTML = html;
  await document.fonts.ready;
}

Object.assign(window, { setup, frame, draw, overlay, hero, ready: true });
