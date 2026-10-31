# How this profile is made

**The hero is particles, not type.** About 31,000 motes (16,000 on phones) flow in ribbons of light, condense into the name, hold, then a gust sweeps them back into the flow.

- **The loop closes exactly.** Every mote's position is a periodic function of the loop phase: ribbons advance one lap per loop, and the drift is curl noise sampled on a circle.
- **Rendering** (`render/scenes/particles.mjs`) draws GPU points into a float buffer:
  - depth of field (out-of-focus motes become bokeh discs)
  - motion blur, with a long shutter while the dust is in flight so it streaks
  - a bloom pass
  - toning onto GitHub's exact page colour, so the image sits on the page with no panel
- **Encoding** (`render/build-hero.mjs`) is animated AVIF. AV1 predicts motion between frames, so a field of moving points costs about 1 MB, against about 13 MB as animated WebP. There are four cuts (desktop and phone, dark and light), plus first-frame stills for reduced motion and for browsers without AVIF.

**Below the hero** are SVG rows: real captures of the products (`tools/shoot.mjs`), and a figure for kestrel-4b, which has no screen yet.

**Fitting into a README:**
- Every row is its own `<picture>`, top-aligned in a single HTML block, so the slices stack with no gaps.
- Every row is wrapped in a real link. GitHub wraps unlinked images in a link to the raw file, which breaks the `<picture>`.
- Each SVG row comes in four files: wide (846 px) and compact (340 px, for windows under 1012 px), each in dark and light.
- Sources that only switch theme spell `prefers-color-scheme: light` exactly as GitHub's `<themed-picture>` expects, so they follow your GitHub theme.
- Sources that pair a theme with another condition (width, reduced motion) drop the space (`prefers-color-scheme:light`). GitHub's matcher skips those, so their other condition survives.
- Fonts travel inside each SVG as subsets (Inter and Geist Mono, both under the OFL).

**Running it:**

```sh
cd src
npm install && pip install fonttools brotli   # plus ffmpeg (with libsvtav1) and cwebp
node render/build-hero.mjs   # the hero: 4 loops + stills, rendered on the GPU, into ../assets
node tools/shoot.mjs         # refresh product captures
npm run preview              # SVG rows + README, and a GitHub-like mock at ../preview/readme.html
```

Copy and links live in [`content.mjs`](content.mjs).
