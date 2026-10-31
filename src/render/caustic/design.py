"""Caustic lens design: a glass surface whose refraction throws a target image onto a wall.

Method after Matt Ferraro's "caustics engineering": morph a uniform mesh until every cell's area matches
the target's brightness there (optimal transport, one Poisson solve per step); the morph says where each
point of the lens must send its light. Snell's law turns that into surface normals, and a second Poisson
solve integrates the normals into a height field. `trace` then forward-simulates millions of rays through
the result, so what we show is what the glass would actually do.

    python3 design.py target.png lens.npz        # solve
    python3 design.py --trace lens.npz out.png    # aligned projection, for checking
"""
import sys
import numpy as np
from scipy.fft import dctn, idctn
from PIL import Image

N_GLASS = 1.49


def poisson_neumann(f):
    """Solve lap(u) = f on a cell grid with zero-flux boundaries (f must sum to ~0)."""
    h, w = f.shape
    F = dctn(f, type=2, norm='ortho')
    ky = 2 * (np.cos(np.pi * np.arange(h) / h) - 1)
    kx = 2 * (np.cos(np.pi * np.arange(w) / w) - 1)
    lam = ky[:, None] + kx[None, :]
    lam[0, 0] = 1
    F /= lam
    F[0, 0] = 0
    return idctn(F, type=2, norm='ortho')


def cell_areas(X, Y):
    """Signed areas of the quads of a (H+1, W+1) vertex grid (shoelace, counter-clockwise positive)."""
    x0, y0 = X[:-1, :-1], Y[:-1, :-1]
    x1, y1 = X[:-1, 1:], Y[:-1, 1:]
    x2, y2 = X[1:, 1:], Y[1:, 1:]
    x3, y3 = X[1:, :-1], Y[1:, :-1]
    return 0.5 * ((x0 * y1 - x1 * y0) + (x1 * y2 - x2 * y1) + (x2 * y3 - x3 * y2) + (x3 * y0 - x0 * y3))


def vertex_gradient(phi):
    """Gradient of a cell-centred field, sampled at the vertices (edge cells replicated)."""
    p = np.pad(phi, 1, mode='edge')
    gx = 0.5 * ((p[:-1, 1:] - p[:-1, :-1]) + (p[1:, 1:] - p[1:, :-1]))
    gy = 0.5 * ((p[1:, :-1] - p[:-1, :-1]) + (p[1:, 1:] - p[:-1, 1:]))
    return gx, gy


def morph(target, schedule=(10, 6, 3.5, 2, 1.2, 0.7), iters=400, log=True):
    """Morph in stages against a progressively sharper target (continuation), so cells between bright
    strokes aren't crushed before the solver can correct them."""
    from scipy.ndimage import gaussian_filter
    h, w = target.shape
    Y, X = np.mgrid[0:h + 1, 0:w + 1].astype(np.float64)
    for sigma in schedule:
        T = gaussian_filter(target, sigma, mode='nearest') if sigma else target
        X, Y = morph_stage(T / T.mean(), X, Y, iters, log=log, tag=f'sigma {sigma}')
    return X, Y


def morph_stage(T, X, Y, iters, tol=2e-3, log=True, tag=''):
    step = 0.5
    it = 0
    for it in range(iters):
        A = cell_areas(X, Y)
        loss = A - T
        err = np.abs(loss).max()
        if err < tol:
            break
        phi = poisson_neumann(loss - loss.mean())
        gx, gy = vertex_gradient(phi)
        gx[:, 0] = gx[:, -1] = 0      # boundary vertices slide along their edge only
        gy[0, :] = gy[-1, :] = 0
        # Step downhill, as far as possible without folding or crushing any cell.
        s = step
        while s > 1e-6:
            Xn, Yn = X - s * gx, Y - s * gy
            if (cell_areas(Xn, Yn) > 0.25 * A).all():
                break
            s *= 0.5
        X, Y = Xn, Yn
        step = min(1.0, s * 1.5)
    if log:
        A = cell_areas(X, Y)
        print(f'  {tag:>10}: {it + 1:4d} steps, mean |area - target| {np.abs(A - T).mean():.4f}, max {np.abs(A - T).max():.3f}, min cell {A.min():.3f}')
    return X, Y


def heights(X, Y, d, refine=3):
    """Height field on the regular lens grid.

    After the morph, the morphed mesh lies on the glass (a cell's area = its share of the target's light)
    and the uniform grid lies on the wall: lens point (X, Y) must send its light to wall point (i, j).
    Snell's law gives the slope needed at each lens point; those slopes are resampled onto a regular grid
    and integrated with a Poisson solve.
    """
    from scipy.interpolate import griddata
    hh, ww = X.shape
    gy0, gx0 = np.mgrid[0:hh, 0:ww].astype(np.float64)
    pts = np.stack([X.ravel(), Y.ravel()], -1)
    z = np.zeros_like(X)
    for _ in range(refine):
        zp = griddata(np.stack([gx0.ravel(), gy0.ravel()], -1), z.ravel(), pts, method='linear', fill_value=0).reshape(X.shape)
        ox, oy, oz = gx0 - X, gy0 - Y, d - zp
        n = np.sqrt(ox * ox + oy * oy + oz * oz)
        ox, oy, oz = ox / n, oy / n, oz / n
        # Glass -> air at the top face; light travels straight up inside the slab.
        sx = ox / (N_GLASS - oz)
        sy = oy / (N_GLASS - oz)
        dzdx = griddata(pts, sx.ravel(), (gx0, gy0), method='linear', fill_value=0)
        dzdy = griddata(pts, sy.ravel(), (gx0, gy0), method='linear', fill_value=0)
        div = np.zeros_like(z)
        div[:, 1:-1] += (dzdx[:, 2:] - dzdx[:, :-2]) / 2
        div[1:-1, :] += (dzdy[2:, :] - dzdy[:-2, :]) / 2
        div[:, 0] += dzdx[:, 1] - dzdx[:, 0]
        div[:, -1] += dzdx[:, -1] - dzdx[:, -2]
        div[0, :] += dzdy[1, :] - dzdy[0, :]
        div[-1, :] += dzdy[-1, :] - dzdy[-2, :]
        z = poisson_neumann(div - div.mean())
        z -= z.min()
    return z


def refract(i, n, eta):
    """Refract unit directions i (..., 3) through unit normals n (facing against i), eta = n1/n2."""
    cosi = -np.sum(i * n, axis=-1, keepdims=True)
    k = 1 - eta * eta * (1 - cosi * cosi)
    k = np.maximum(k, 0)
    return eta * i + (eta * cosi - np.sqrt(k)) * n


def trace(z, d, light=(0.0, 0.0), samples=3, out_scale=2, rng=None, blur=0.8, weight=None):
    """Forward-trace a grid of rays through the lens; returns the projected intensity image.

    light: tilt of the incoming collimated beam (radians about x and y). The wall image is the lens
    footprint (same size as the lens) sampled at `out_scale` pixels per cell.
    """
    rng = rng or np.random.default_rng(1)
    hh, ww = z.shape
    H, W = hh - 1, ww - 1
    zy, zx = np.gradient(z)
    ny, nx = H * samples, W * samples
    ys, xs = np.mgrid[0:ny, 0:nx].astype(np.float64)
    xs = (xs + rng.random(xs.shape)) / samples
    ys = (ys + rng.random(ys.shape)) / samples
    # Bilinear sample of the height gradient at the ray positions.
    x0 = np.clip(np.floor(xs).astype(int), 0, W - 1); y0 = np.clip(np.floor(ys).astype(int), 0, H - 1)
    fx, fy = xs - x0, ys - y0

    def bil(a):
        return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy)
                + a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy)
    gx, gy, zz = bil(zx), bil(zy), bil(z)
    wr = bil(weight) if weight is not None else 1.0   # beam profile at each ray
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    tx, ty = light
    L = np.array([np.sin(ty), np.sin(tx), np.cos(tx) * np.cos(ty)])
    L /= np.linalg.norm(L)
    Lg = refract(L[None, None, :] * np.ones_like(n), np.array([0, 0, -1.0]) * np.ones_like(n), 1 / N_GLASS)  # into the slab
    o = refract(Lg, -n, N_GLASS)            # out of the curved top face (normal facing the incoming ray)
    o = -o if False else o
    tt = (d - zz) / np.maximum(o[..., 2], 1e-6)
    px = xs + o[..., 0] * tt
    py = ys + o[..., 1] * tt
    # Splat into the wall image.
    S = out_scale
    img = np.zeros((H * S, W * S))
    u, v = px * S - 0.5, py * S - 0.5
    u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fu, fv = u - u0, v - v0
    for du, dv, wgt in ((0, 0, (1 - fu) * (1 - fv)), (1, 0, fu * (1 - fv)), (0, 1, (1 - fu) * fv), (1, 1, fu * fv)):
        uu, vv = u0 + du, v0 + dv
        ok = (uu >= 0) & (uu < W * S) & (vv >= 0) & (vv < H * S)
        np.add.at(img, (vv[ok], uu[ok]), (wgt * wr)[ok] if weight is not None else wgt[ok])
    if blur:
        from scipy.ndimage import gaussian_filter
        img = gaussian_filter(img, blur)
    return img * (S * S) / (samples * samples)


def target_from_png(path, floor=0.06):
    im = np.asarray(Image.open(path).convert('L'), dtype=np.float64) / 255
    return floor + (1 - floor) * im


if __name__ == '__main__':
    if sys.argv[1] == '--trace':
        lens = np.load(sys.argv[2])
        img = trace(lens['z'], float(lens['d']))
        Image.fromarray((np.clip(img / np.percentile(img, 99.7), 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(sys.argv[3])
    else:
        T = target_from_png(sys.argv[1])
        d = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0 * T.shape[1]
        X, Y = morph(T)
        z = heights(X, Y, d)
        np.savez(sys.argv[2], z=z, X=X, Y=Y, d=d)
        print(f'  lens {T.shape[1]}x{T.shape[0]} cells, wall at d={d:.0f}, relief {z.max():.2f} cells')
