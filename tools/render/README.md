# tools/render

Renders the profile's moving images with the ray tracer from [feruz-karimov.dev](https://feruz-karimov.dev). The shaders and name texture are imported straight from the website repo, so the README and the site can't drift apart. Time is driven frame by frame instead of by `requestAnimationFrame`, so every frame can be reproduced.

| Scene | Output | What it is |
| --- | --- | --- |
| `banner` | `assets/event-horizon.webp` | The site's hero with the lensed name. The disk's flow map repeats every 16 s of shader time, so the loop has no seam. |
| `orbits` | `assets/orbit-0{1..4}.webp` | One section divider per orbit, seen from that section's camera on the site, with the HUD telemetry for that radius. |
| `feed` | `assets/feed.webp` | The <kbd>F</kbd> key, replayed on the name itself. |
| `footer` | `assets/horizon.webp` | Past the event horizon. |

## Run

This needs the website checkout next to this repo at `../23-web` (or set `EH_SRC=/path/to/23-web/src`), plus `ffmpeg` and `img2webp`/`cwebp` (`brew install ffmpeg webp`).

```bash
cd tools/render
npm install
node capture.mjs banner   # or: orbits, feed, footer
node capture.mjs still --view '{"r": 9, "text": 0}'   # quick look at any camera → .out/still.png
```

Frames are rendered at 2× and downscaled with lanczos. Grain and star twinkle are switched off, and the sky is locked to the camera, so that between frames only the disk changes. That keeps a 10-second, 24 fps banner around 1.3 MB.
