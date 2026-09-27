// Worker thread: traces rows of the geodesic map, or paints frames from it.
import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import { trace, mapViews } from './physics.mjs';
import { renderFrame, bloomLayer, glowLayer, post, roundedMask } from './shade.mjs';
import { drawPlate } from './plate.mjs';
import { writePng } from './png.mjs';

parentPort.on('message', (msg) => {
  if (msg.type === 'trace') {
    const map = mapViews(msg.bufs);
    for (let y = msg.first; y < msg.cam.h; y += msg.stride) trace(msg.cam, map, y, y + 1, msg.opts);
    parentPort.postMessage({ type: 'done' });
  }

  if (msg.type === 'shade') {
    const map = mapViews(msg.bufs);
    const tex = Object.fromEntries(Object.entries(msg.tex).map(([k, b]) => [k, new Float32Array(b)]));
    const { ow, oh } = msg;
    const hdr = new Float32Array(ow * oh * 3);
    const stars = new Float32Array(ow * oh * 3);
    const rgba = new Uint8Array(ow * oh * 4);
    const mask = roundedMask(ow, oh, msg.radius);
    let gasBloom = null, gasAt = -1;
    for (const fr of msg.frames) {
      renderFrame(map, tex, msg.opts, fr.f, hdr, fr.fGas, stars);
      // Bloom the gas only when the gas has moved; reuse it otherwise so still frames stay byte-identical.
      if (fr.fGas !== gasAt) {
        gasBloom = bloomLayer(hdr, ow, oh);
        gasAt = fr.fGas;
      }
      const glow = glowLayer(stars, ow, oh);
      for (let i = 0; i < hdr.length; i++) hdr[i] += gasBloom[i] + stars[i] + glow[i];
      post(hdr, ow, oh, rgba, mask);
      drawPlate(rgba, ow, oh, fr.callouts, msg.stats);
      writePng(path.join(msg.dir, `f${String(fr.i).padStart(4, '0')}.png`), rgba, ow, oh);
      parentPort.postMessage({ type: 'frame' });
    }
    parentPort.postMessage({ type: 'done' });
  }
});
