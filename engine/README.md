# engine/

This folder renders the accretion map at the top of my profile. It runs every night in GitHub Actions on a CPU runner with no dependencies: plain Node, plus `img2webp` to pack the frames.

## How a night goes

1. **Data** ([`data.mjs`](data.mjs)). One GraphQL query fetches the year of contributions, my public repos and their releases, and my merged PRs. PRs from private repos are dropped. The calendar already folds private work into anonymous counts.
2. **Spacetime** ([`physics.mjs`](physics.mjs)). 3,276,800 null geodesics, one per sub-pixel at 2×, are integrated through the Schwarzschild metric. This is the same integrator and the same Doppler and redshift model as the shader on [feruz-karimov.dev](https://feruz-karimov.dev), ported to float64. Each ray records up to three places where it crosses the disk plane (radius, azimuth, redshift factor *g*), the starlight it escapes to, how close it came to the photon sphere, and the jet column it passed through. That's pure geometry, done once, split across worker threads.
3. **Matter** ([`disk.mjs`](disk.mjs)). The year is painted into polar textures:
   - Each day is a clump at `r = 3 + 10.5 · (1 − age/365)^1.6`, so today sits at the rim and a year ago sits at the ISCO.
   - A clump's angular width grows with age, like shearing in a Keplerian disk: knot → arc → ring.
   - Merged public PRs over 300 lines become thin, hot tidal-disruption streams. Public repos become stars on circular orbits.
4. **Frames** ([`shade.mjs`](shade.mjs)). Each frame is a lookup, not a ray trace. Every recorded crossing samples the textures, and turbulence flows at the Keplerian rate through a two-phase flow map that loops seamlessly. Crossings are composited front to back with relativistic beaming. Then the site's post chain runs on the CPU: UnrealBloom-style mips, chromatic aberration, ACES and the vignette.
5. **Plate** ([`plate.mjs`](plate.mjs), [`overlay.mjs`](overlay.mjs)). Pixels are bucketed by where their ray first meets the disk. That answers "where on screen, after lensing, is the star at (r, φ)?", so labels follow each repo's *lensed* image. A greedy layout with frame-to-frame memory keeps labels from colliding or flickering. Type is a pre-rasterised JetBrains Mono ([`font.json`](font.json), made by [`tools/font-atlas.mjs`](../tools/font-atlas.mjs)).
6. **Encode.** 240 frames go into an animated WebP. The gas steps every 4th frame, and stars get a local glow instead of full bloom, so most frames differ only around the moving stars. That keeps the file around 3 MB.
7. **Publish** ([`log.mjs`](log.mjs), [`../.github/workflows/fk1.yml`](../.github/workflows/fk1.yml)). The image is force-pushed to the `fk1` branch, so main doesn't grow by megabytes a day. The observatory log is rewritten between markers in the README.

## Run it

```bash
GITHUB_TOKEN=$(gh auth token) node engine/accrete.mjs --out out --readme README.md
```

Other flags: `--frames 240`, `--fps 20`, `--width 1280`, `--ss 2` (supersampling), `--gas-step 4`, `--q 80`, `--threads N`, `--data cache.json` (reuse a fetch), `--keep` (keep the PNG frames). On an M4 Pro the whole run takes about 25 s. On a GitHub runner it takes a few minutes.
