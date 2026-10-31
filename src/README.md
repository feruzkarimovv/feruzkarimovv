# How this profile is made

**The hero isn't typeset.** It's a pane of glass whose top surface was solved so the light it refracts lands as the name, then ray-traced.

1. Optimal transport (`render/caustic/design.py`, after Matt Ferraro's caustics engineering) morphs a mesh until each cell's area matches the target's brightness. That tells every point of the glass where its light has to go.
2. Snell's law turns those destinations into surface slopes, and a Poisson solve integrates the slopes into a height field.
3. `trace` sends about a million rays through the result for each frame. As the pane drifts through focus, the light gathers, resolves into the name, then collapses into caustics.
4. The scene (`render/scenes/caustic.mjs`) is rendered on the GPU in headless Chromium and encoded as an animated WebP, with a phone crop and still frames for reduced motion.

**Below the hero** are SVG rows: real captures of the products (`tools/shoot.mjs`), and a figure for kestrel-4b, which has no screen yet.

**Fitting into a README:**
- Every row is its own `<picture>`, top-aligned in a single HTML block so the slices stack with no gaps.
- Every row is wrapped in a real link. GitHub wraps unlinked images in a link to the raw file, which breaks the `<picture>`.
- Each SVG row comes in four files: wide (846 px) and compact (340 px, for windows under 1012 px), each in dark and light.
- The desktop light source spells `prefers-color-scheme: light` exactly as GitHub's `<themed-picture>` expects, so it follows your GitHub theme.
- The compact sources drop the space (`prefers-color-scheme:light`), so GitHub's matcher skips them and their width condition survives. They follow the phone's own theme instead.
- Fonts travel inside each SVG as subsets (Inter and Geist Mono, both under the OFL).

**Running it:**

```sh
cd src
npm install && pip install numpy scipy pillow fonttools brotli
node render/build-hero.mjs   # the hero: solve, trace, render (GPU), into ../assets
node tools/shoot.mjs         # refresh product captures
npm run preview              # SVG rows + README, and a GitHub-like mock at ../preview/readme.html
```

Copy and links live in [`content.mjs`](content.mjs).
