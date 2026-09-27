<!-- fk1:image -->
<a href="https://feruz-karimov.dev"><img src="https://github.com/feruzkarimovv/feruzkarimovv/raw/fk1/fk1.webp?v=2026-09-27" width="100%" alt="FK-1 accretion map, 2025-09-28 to 2026-09-27: 1,131 contributions as gas spiralling into a ray-traced black hole, 8 public repos as orbiting stars, 16 large merged PRs as tidal-disruption streams. Mass 11.131 solar masses, +17 in the last 7 days."></a>
<!-- /fk1:image -->

<p align="center"><sub>My last year on GitHub, falling into a black hole. Re-rendered every night by a ray tracer that runs in <a href="https://github.com/feruzkarimovv/feruzkarimovv/blob/main/.github/workflows/fk1.yml">GitHub Actions</a>.</sub></p>

**How to read it.** Every pixel is a light ray traced back through the Schwarzschild metric, so the far side of the disk shows up bent over the top of the shadow.

- **Gas is days.** Each day of my contribution calendar is matter in the disk. Today's lands at the rim. A year later it reaches the ISCO and falls in. Fresh days are tight knots. Older ones have been sheared by differential rotation into arcs, then rings. Busier days are denser and hotter.
- **Stars are repos.** Each public repo I made this year was captured into orbit at the radius of the day it was born.
- **Blue streams are big PRs.** A merged public PR over 300 lines is a tidal disruption: a star torn into a thin, hot stream.
- **Jets are releases.** Shipping a release fires relativistic jets along the spin axis. They fade over a few weeks.
- **Mass** starts at 10 M<sub>☉</sub> and gains 0.001 M<sub>☉</sub> per contribution.

### Observatory log

<!-- fk1:log -->
| Date | Event | |
| --- | --- | --- |
| <samp>2026&#8209;09&#8209;27</samp> | ⊘&nbsp;Crossed&nbsp;the&nbsp;ISCO | 2025-09-28, a year old today, fell in (0 contributions) |
| <samp>2026&#8209;09&#8209;26</samp> | ★&nbsp;Star&nbsp;captured | [repolens-eval-fixture](https://github.com/feruzkarimovv/repolens-eval-fixture) entered orbit at 13.5 r<sub>s</sub> |
| <samp>2026&#8209;08&#8209;20</samp> | ✦&nbsp;Tidal&nbsp;disruption | [vannaris#34](https://github.com/feruzkarimovv/vannaris/pull/34) “Restore the research record instead of re-deriving it” · 5,935 lines torn apart |
| <samp>2026&#8209;08&#8209;16</samp> | ✦&nbsp;Tidal&nbsp;disruption | [vannaris#32](https://github.com/feruzkarimovv/vannaris/pull/32) “Keep the labels that the export was throwing away” · 3,649 lines torn apart |
| <samp>2026&#8209;08&#8209;14</samp> | ✦&nbsp;Tidal&nbsp;disruption | [vannaris#29](https://github.com/feruzkarimovv/vannaris/pull/29) “Restore a drawn calibration set instead of drawing a new one” · 457 lines torn apart |
| <samp>2026&#8209;08&#8209;01</samp> | ✦&nbsp;Tidal&nbsp;disruption | [vannaris#1](https://github.com/feruzkarimovv/vannaris/pull/1) “Weekly scheduled run, public export, and static site” · 29,202 lines torn apart |
| <samp>2026&#8209;07&#8209;31</samp> | ★&nbsp;Star&nbsp;captured | [vannaris](https://github.com/feruzkarimovv/vannaris) entered orbit at 11.0 r<sub>s</sub> |
| <samp>2026&#8209;07&#8209;16</samp> | ⇅&nbsp;Relativistic&nbsp;jets | [gha-graph v0.3.0](https://github.com/feruzkarimovv/gha-graph/releases/tag/v0.3.0) fired the jets |
| <samp>2026&#8209;07&#8209;01</samp> | ★&nbsp;Star&nbsp;captured | [fgsm-mnist-reproduction](https://github.com/feruzkarimovv/fgsm-mnist-reproduction) entered orbit at 9.8 r<sub>s</sub> |
| <samp>2026&#8209;04&#8209;20</samp> | ▲&nbsp;Peak&nbsp;accretion | 81 contributions in one day, the brightest knot on record |
<!-- /fk1:log -->

<sub>Private work only ever appears as counts, the calendar's own anonymised numbers. Anything named here is public. The renderer is dependency-free JavaScript in <a href="https://github.com/feruzkarimovv/feruzkarimovv/tree/main/engine">engine/</a>: geodesics are traced once per night on the CPU, then each frame is painted from that map.</sub>

<br>

### Feruz Karimov

CS + Data Science at Rutgers, co-founder of [Jonivor](https://jonivor.com.uz). I ship things people actually use: a pet-care marketplace with ***1,000+ accounts***, an export that went from crashing at 50k rows to streaming ***200k in 12 seconds***, and open benchmarks that ***show their work***.

<table>
  <tr>
    <td><samp>01</samp>&nbsp; <a href="https://jonivor.com.uz"><b>Jonivor</b></a>&nbsp;↗</td>
    <td>Pet-care marketplace, built solo in 10 weeks, <i>1,000+ accounts</i><br><sub>Next.js · SwiftUI · Telegram Mini App · Postgres · 2026</sub></td>
  </tr>
  <tr>
    <td><samp>02</samp>&nbsp; <a href="https://vannaris.com"><b>Vannaris</b></a>&nbsp;↗</td>
    <td>Independent benchmark of web-search APIs for AI agents<br><sub>Python · 3-lab LLM judges · Bootstrap CIs · 2026 · <a href="https://github.com/feruzkarimovv/vannaris">source</a></sub></td>
  </tr>
  <tr>
    <td><samp>03</samp>&nbsp; <a href="https://github.com/feruzkarimovv/gha-graph"><b>gha-graph</b></a>&nbsp;↗</td>
    <td>See and lint GitHub Actions workflows before you push<br><sub>TypeScript · npm CLI · SARIF · 2026</sub></td>
  </tr>
  <tr>
    <td><samp>04</samp>&nbsp; <a href="https://vibeduel-peach.vercel.app"><b>VibeDuel</b></a>&nbsp;↗</td>
    <td>Multiplayer arena: race to build an app with Claude, AI judge, ELO<br><sub>Next.js · Supabase Realtime · Claude · 2026 · <a href="https://github.com/feruzkarimovv/vibeduel">source</a></sub></td>
  </tr>
  <tr>
    <td><samp>05</samp>&nbsp; <b>RepoLens</b></td>
    <td>Change-impact analysis: what a PR might break, to the <i>exact line</i><br><sub>FastAPI · pgvector · Hybrid retrieval</sub></td>
  </tr>
  <tr>
    <td><samp>06</samp>&nbsp; <a href="https://github.com/feruzkarimovv/vibecheck"><b>VibeCheck</b></a>&nbsp;↗</td>
    <td>Security scanner for the bugs AI coding tools introduce<br><sub>TypeScript · AST · CLI · 2026</sub></td>
  </tr>
</table>

<samp>NOW</samp> Co-founder & Engineer @ Jonivor &nbsp;·&nbsp; <samp>BEFORE</samp> SDE Intern @ EPAM Systems, SWE Resident @ Headstarter &nbsp;·&nbsp; <samp>STUDYING</samp> Rutgers ’28

<samp>WORKS IN</samp> TypeScript · Python · Java · SwiftUI · Spring Boot · FastAPI · Postgres · LLM evaluation · retrieval

<img src="assets/pulse.svg" width="12" height="12" alt=""> <samp>OPEN TO SUMMER & WINTER 2027</samp>, for the right team; semesters are negotiable. **[feruz.karimov@rutgers.edu](mailto:feruz.karimov@rutgers.edu)** · [X](https://x.com/feruzkrm) · [LinkedIn](https://www.linkedin.com/in/feruzlkarimov) · [feruz-karimov.dev](https://feruz-karimov.dev)
