"""Avatar: the initials written by the same kind of glass as the hero. Solves a square lens for "FK",
traces the light it throws, and lays it on dark slate.

    python3 avatar.py OUT.png [--size 1024]
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import gaussian_filter, zoom
from design import morph, heights, trace

HERE = os.path.dirname(os.path.abspath(__file__))
N = 220


def target():
    im = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(os.path.join(HERE, '../../fonts/InterDisplay-SemiBold.ttf'), 104)
    bb = d.textbbox((0, 0), 'FK', font=f)
    d.text(((N - (bb[2] - bb[0])) / 2 - bb[0], (N - (bb[3] - bb[1])) / 2 - bb[1] - 2), 'FK', fill=255, font=f)
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(0.9)), dtype=np.float64) / 255
    return 0.08 + 0.92 * a


if __name__ == '__main__':
    out = sys.argv[1]
    size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 1024
    T = target()
    X, Y = morph(T, log=False)
    throw = 0.9 * N
    z = heights(X, Y, throw)
    yy, xx = np.mgrid[0:N + 1, 0:N + 1]
    r = np.hypot(xx - N / 2, yy - N / 2) / (N / 2)
    beam = np.clip((1.0 - r) / 0.18, 0, 1)                 # a round spot, soft at the rim
    light = trace(z, throw, samples=4, out_scale=4, blur=0.7, weight=beam)
    light /= np.percentile(light, 99.7)
    light = np.clip((light - 0.09) / 0.91, 0, 1)
    L = zoom(light, size / light.shape[0], order=1)
    glow = gaussian_filter(L, size * 0.02) * 0.28 + gaussian_filter(L, size * 0.005) * 0.22
    rng = np.random.default_rng(3)
    slate = 0.016 + 0.006 * gaussian_filter(rng.random((size, size)), 1.2)
    yy, xx = np.mgrid[0:size, 0:size]
    vign = np.clip(1 - 0.55 * (np.hypot(xx - size / 2, yy - size / 2) / (size / 2)) ** 2, 0, 1)
    lin = (slate * (0.4 + 18 * L) + L * 1.25 + glow * 0.5) * vign
    tone = lin / (1 + lin)                                 # gentle shoulder
    srgb = np.clip(tone ** (1 / 2.2), 0, 1)
    rgb = np.stack([srgb, srgb * 0.985, srgb * 0.96], -1)  # light is a touch warm, like the hero
    Image.fromarray((rgb * 255).astype(np.uint8)).save(out)
    print(f'avatar -> {out}')
