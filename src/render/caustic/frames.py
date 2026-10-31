"""Builds everything the caustic scene needs: solves the lens for the name, then traces the light it throws
at a range of heights (the glass drifting up and down through focus), one frame per animation frame.

    python3 frames.py OUT_DIR [--frames 120] [--still]

Writes OUT_DIR/lens.json (height field for the glass's surface normals) and OUT_DIR/c0000.png... (light
on the table). The target is stretched in depth so the name reads true from the camera's ~35 degree view.
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from design import morph, heights, trace

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, '../../fonts/InterDisplay-SemiBold.ttf')
W, H = 420, 160            # lens cells
STRETCH = 1.0
THROW = 0.7 * W            # glass-to-table distance at focus, in cells


def target():
    im = Image.new('L', (W, int(H / STRETCH)), 0)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 56)
    txt = 'Feruz Karimov'
    bb = d.textbbox((0, 0), txt, font=f)
    d.text(((im.width - (bb[2] - bb[0])) / 2 - bb[0], (im.height - (bb[3] - bb[1])) / 2 - bb[1]), txt, fill=255, font=f)
    im = im.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
    a = np.asarray(im, dtype=np.float64) / 255
    return 0.08 + 0.92 * a


def height_at(phase):
    """Glass height as a fraction of the focus throw over one loop: rises into focus, holds, overshoots."""
    # Ease between keyframes: (phase, k)
    keys = [(0.0, 0.62), (0.3, 1.0), (0.66, 1.0), (0.84, 1.55), (1.0, 0.62)]
    for (p0, k0), (p1, k1) in zip(keys, keys[1:]):
        if p0 <= phase <= p1:
            u = (phase - p0) / (p1 - p0)
            u = u * u * (3 - 2 * u)
            return k0 + (k1 - k0) * u
    return 1.0


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    n = int(sys.argv[sys.argv.index('--frames') + 1]) if '--frames' in sys.argv else 120
    T = target()
    Image.fromarray((T * 255).astype(np.uint8)).save(os.path.join(out, 'target.png'))
    X, Y = morph(T)
    z = heights(X, Y, THROW)
    json.dump({'w': W + 1, 'h': H + 1, 'throw': THROW, 'z': np.round(z, 4).ravel().tolist()}, open(os.path.join(out, 'lens.json'), 'w'))
    phases = [0.45] if '--still' in sys.argv else [i / n for i in range(n)]
    # The beam is a soft-edged spot, not a hard rectangle, so out-of-focus light pools instead of boxing.
    yy, xx = np.mgrid[0:H + 1, 0:W + 1]
    edge = np.minimum(np.minimum(xx, W - xx) / (0.07 * W), np.minimum(yy, H - yy) / (0.12 * H))
    beam = np.clip(edge, 0, 1) ** 2 * (3 - 2 * np.clip(edge, 0, 1))
    # One exposure for every frame (set by the in-focus image), and a black point that removes the
    # design's 8% floor, so focus reads as light gathering rather than as a box changing brightness.
    ref = np.percentile(trace(z, THROW, samples=3, out_scale=2, blur=0.9, weight=beam), 99.8)
    for i, ph in enumerate(phases):
        img = trace(z, THROW * height_at(ph), samples=3, out_scale=2, blur=0.9, weight=beam) / ref
        img = np.clip((img - 0.09) / 0.91, 0, 1)
        Image.fromarray((img ** (1 / 2.2) * 255).astype(np.uint8)).save(os.path.join(out, f'c{i:04d}.png'))
    json.dump({'heights': [height_at(p) for p in phases]}, open(os.path.join(out, 'heights.json'), 'w'))
    print(f'lens {W}x{H}, throw {THROW:.0f} cells, {len(phases)} frame(s) -> {out}')
