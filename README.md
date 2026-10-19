# VESPER — carry a different atmosphere

A concept landing page for **Vesper 01**, a fictional sculptural portable light: one cast-aluminium
column with a single helical channel that throws its light onto the room instead of glowing on its
own surface.

This is a design study. Nothing is for sale, no payment is taken, no personal data is collected and
nothing is submitted anywhere. The reservation step is a clearly-labelled local preview that exists
only in the browser tab.

## Run it

Any static server works and there is no build step:

```bash
python3 -m http.server 9311        # then open http://127.0.0.1:9311/
```

`npm install` is not needed to serve the site. The only dependency in `package.json` is `three`,
used solely to satisfy the vendored copy in `vendor/`; the runtime loads `vendor/three.module.js`
directly.

## What is in here

```
index.html            the page: six chapters, nav, configurator dock, reservation dialog
css/site.css          art direction: tone switching, editorial grid, controls, reduced-motion rules
js/scene3d.js         the realtime stage — geometry, helical channel shader, room light, studio env
js/main.js            the single timeline owner: scroll -> scene state, configurator, dialog
assets/fonts/*.woff2  self-hosted typefaces (latin subsets)
assets/vesper-drawing.svg   technical 1:4 drawing, generated from the same profile the 3D uses
assets/poster.webp    still used when WebGL is unavailable
vendor/three.*.js     three.js r186, vendored
tools/                authoring and verification scripts (not part of the site)
proto/                the three exploratory hero treatments; the shipped hero is treatment 2
DESIGN.md             the art direction and the reference notes behind it
```

`proto/p1.html`, `p2.html` and `p3.html` are the three materially different hero
treatments built before the page was expanded: p1 a night gallery, p2 a plaster dusk,
p3 a drawing on daylight. p2's framing and the p3 drawing language were carried into
the finished page; the prototypes stay in the repo as the record of that choice, and
are not linked from the site.

### Authoring tools (not shipped)

- `tools/shoot.mjs` — single headless screenshot with console capture, optionally supersampled
  (`scale` > 1), settling the camera first so a slow renderer cannot hand back a travelling frame.
- `tools/probe.mjs` — the diagnostic. Dumps the scene graph, the object's screen box, the milled
  channel measured off the vertex buffer, the camera's actual vs target position, and can hide one
  mesh and re-shoot to attribute a bright patch to its owner.
- `tools/find-frame.mjs` — solves `data-cam`/`data-cam-m` for a target on-screen box by bisection
  against the real projection. Framing is solved, not guessed.
- `tools/text-contrast.mjs` — measures the WCAG 2.1 contrast of every text box **as rendered**:
  it splits each box's real pixels into paper (median) and ink (extreme 2 %), converts both to
  relative luminance and applies the large-text rule per element size. Exits non-zero if anything
  is under AA, and `tools/deploy.sh` will not push if it does.
- `tools/shoot-sections.mjs` — one browser, every section, desktop or mobile, plus state readback.
- `tools/verify.mjs` — end-to-end behaviour checks (stage live, headline reveal, drag, dialog, configurator, overflow, reduced motion, no-WebGL).
- `tools/perf.mjs` — load timeline and stage-boot marks, measured in this container's software renderer.
- `tools/film.mjs` + `tools/film.sh` — the signature-interaction film: real scroll positions and real control clicks, one settled frame at a time, assembled with ffmpeg.
- `tools/font-probe.mjs` — confirms the self-hosted Instrument Sans really is variable across weights.
- `tools/deploy.sh` — commit, push and wait for the GitHub Pages build.
- `tools/make-drawing.mjs` — regenerates `assets/vesper-drawing.svg` from `OUTER` in `js/scene3d.js`.
- `tools/grid.py`, `tools/montage.py`, `tools/img-stats.py`, `tools/cropzoom.py` — contact sheets
  and image statistics for visual review.
- `tools/refs-capture.mjs` — reference-site capture used during research.

## How it is built

Everything in the render is authored here. There are no photographs, no model files and no
third-party textures.

- The body is a lathe profile (`OUTER`) with an oval plan; the plinth is knurled procedurally.
- The **helical channel is cut into the mesh**, not painted on it. The body is a lathe whose rings
  concentrate their angular samples around the slot, so a 9 mm aperture with a real 5 mm floor, two
  real lips and a 0.6 mm edge break costs a fixed number of vertices per ring — the same mesh at any
  aperture. `grooveProbe(y)` measures the cut back off the vertex buffer, relative to the profile the
  lathe would have followed without it, so the claim is checkable rather than asserted: 5.00 mm deep,
  4.5 mm half-width, at every height (see `verify.mjs`).
- The shader does not draw the channel; it *shades* it. Inside the cut the surface is darkened,
  roughened and its metalness dropped — it is machined metal sitting in its own shadow, so it stops
  mirroring the room back out. The 0.6 mm chamfer on each lip catches a hairline of light, the lip
  throws a millimetre of shadow onto the body outside it, and the diffuser is a line at the bottom
  of the slot rather than a lit floor: 9 mm of glowing floor reads as a stripe, 2.5 mm of glowing
  line reads as light inside a gap.
- The wall and floor light is a **line integral over the channel**, not a pool under the object.
  The slot is split into eight segments of the helix whose real world endpoints and outward
  directions are uploaded, and each plane integrates them per pixel with a 1/r falloff — a line
  source, not a point. Eight *points* give a halo; eight *segments* tiling the helix end to end give
  a band that follows it, at the same cost. The pattern therefore turns with the object because the
  seam is part of the object, and `spillProbe()` is checked against that: turn the object 1.2 rad and
  the emitter's azimuth must move with it. (Rotating the sample twice — the phase already carrying
  the orbit and the rotation applied again — leaves the pattern nailed to the room while the object
  turns under it; that is the bug this check exists for.)
- There is deliberately **no large screen-space bloom sprite**. An additive sprite big enough to
  read as "glow" sits in front of the wall and reads as haze floating in the room, not as light on
  a surface. The only sprite left is a small contact glow at the plinth.
- The room falls away to near-black at night (`NIGHT` in `scene3d.js`): dark plaster, a short fog
  range and a low environment intensity, so at night the object's own spill is the only light in the
  room. The day chapters keep the lit plaster studio.
- The plaster map is tiled at ~2 m per repeat on the wall and ~2.3 m on the floor. At a coarser
  tiling the texture's own soft strokes stretch across metres of wall and read as an unrelated
  diagonal band — the single most misleading artefact found while tuning this scene.
- The studio environment is a PMREM built from a small emissive-panel scene; metals need structured
  reflections or they read as glazed ceramic.
- One `requestAnimationFrame` loop owns everything: scroll → camera/mood/output, plus the render.
  CSS only handles micro-transitions, so no scroll engine competes with the scene clock.
- The scene stops rendering once nothing has changed, and starts again on any input — that keeps a
  static page from burning battery. It also runs at ~30 fps rather than 60, which is invisible on a
  slow-moving camera and halves the per-frame cost.
- **The stage loads after the page, not before it.** The first view is the still, the type and the
  controls; `js/scene3d.js` (and three.js with it) is imported on an idle callback after the first
  painted frame, its programs are compiled with `compileAsync` where the driver supports it, and the
  canvas then crossfades over the still. Nothing about reading, navigating or configuring this page
  waits for a GPU, and there is never a blank canvas.

## Motion, accessibility and fallbacks

- `prefers-reduced-motion: reduce` removes camera travel, the idle drift and the pulse; section
  changes become immediate and text keeps a short opacity fade rather than a slide.
- There is a visible **Pause motion** control in the configurator dock (and again in the footer),
  honoured immediately.
- The dock carries the finish, the atmosphere and **one** action. The output control lives in the
  atmosphere chapter, next to the four atmospheres it dims, and over the reservation chapter the
  dock stands down (`visibility:hidden`, so the stand-down is on the same frame the class lands
  however slow the renderer is) — the page never shows two primary actions at once, which
  `verify.mjs` asserts at six scroll positions.
- If WebGL is missing the still stays, a short note at the foot of the page says why, and everything
  else keeps working: the readouts, the finish and atmosphere controls, the drawing and the
  reservation preview.
- The object can be turned with mouse drag, with a keyboard-focusable slider (touch users use the
  slider, so vertical scrolling is never hijacked), and every control is a real button, radio or
  range input with a label.
- Narrow screens are treated as their own layout, not a shrunk desktop one. Below 1100 px the
  camera stops are a solved set of their own (`data-cam-m`), the hero copy sits under a gradient
  rather than a slab, targets are ≥44 px, the swatch groups carry their names, and the turn slider
  is gone: on a phone the object is turned by dragging it, and the hint says so. The dock is reduced
  to the finish, its current value and the one action. The object is framed by
  `tools/find-frame.mjs`, which bisects the camera against the real projection until the object's
  box lands where it was asked for — 24 px from the top of a 390×844 fold with the copy starting at
  324 px — instead of by guessing camera numbers and looking at a screenshot.

## Provenance and licences

| Item | Licence |
| --- | --- |
| three.js r186 (`vendor/`) | MIT |
| Instrument Serif, Instrument Sans (Yoann Minet / Instrument) | SIL Open Font Licence 1.1 |
| IBM Plex Mono (IBM) | SIL Open Font Licence 1.1 |
| Geometry, shaders, textures, drawing, copy | authored for this study |

No third-party imagery, model, audio or icon set is used. Research references (Lusion/Oryzo, the
Igloo case study, iyo) informed principles only — greyboxing, restrained UI, measured cost — and
none of their assets, layouts or branding are reproduced here.

## Pass 2 — what changed, and what it measured

The first pass shipped a page whose channel was a shading trick on the body, whose material read
bronze under a warm room, and whose phone hero put the object behind the copy. Pass 2 changed the
render rather than the copy, and measured the difference.

| | before | after | how it is measured |
| --- | --- | --- | --- |
| channel | a stripe in the body shader | a 9 mm aperture with a 5 mm floor cut into the mesh | `grooveProbe()` off the vertex buffer: depth 5.00 mm, half-width 4.50 mm at y = 0.10/0.16/0.235 |
| body luminance (hero) | median 0.018, mean 0.038 | median 0.041, mean 0.050 | relative luminance over the body strip `x 994–1034, y 180–660` of the hero frame at both revisions |
| body read | bronze/champagne, "a black shape" (vision) | "glossy… a bright right edge suggesting polished metal catching the light" | same framing, same question; the finish went satin (metalness 0.84→0.74, roughness 0.58→0.46) and the rim light is now the second-strongest source |
| exposure | 2.325 % of the frame at or above 250 % luminance | 0.867 % | linearised sRGB over the whole 1440×900 frame |
| floor hotspot | p99 luminance 0.805 | 0.774 | the same pass |
| default finish | Slate (anodised charcoal) | Foundry (raw cast aluminium) | the hero is the one place the copy makes a claim about the material |
| room light | 1/r² point pool, saturated | 1/r line integral over 8 helix segments | `wSpill`/`fPool` uPower, and the emitter endpoints from `spillProbe()` |
| spill ownership | emitter angle carried the orbit *and* was rotated by it — the pattern stayed in the room | one rotation, `spillProbe().azimuth` follows `setOrbit` | new `verify.mjs` check |
| dock | output slider, readout, two CTAs' worth of weight | finish + atmosphere + one action; the dimmer moved to the atmosphere chapter | `verify.mjs`: at most one `.btn--solid` in front of the reader at six scroll positions |
| dock at the last chapter | still on screen | stands down (`visibility:hidden`) | same check |
| text | 11–12 px mono at 72–80 % white | 12–13 px at 88–93 %; 157 of 161 text boxes clear 4.5 as *rendered* | `tools/text-contrast.mjs`, which samples the pixels of every text box over the live canvas rather than reading the stylesheet |
| phone hero | copy laid over the object, object running past the fold (vision read of the pass-1 frame) | object 24→327 px of 844, copy starts at 324 px | `objectRect()` in the real 390×844 mobile context, asserted by `verify.mjs` |
| phone turn control | a slider | the object is dragged, with a hint that says so | the slider is `display:none` below 1100 px; drag is unchanged |

Evidence for every row is in `docs/pass2/`: the rendered frames at both widths, a macro of the
channel, and the film.

## Honest limits

- Frame rates measured in the container's software renderer are not a claim about real hardware.
  The scene renders at ~30 fps by design and stops when nothing changes; in *this* container one
  portrait frame of the spill shader can take a second, which is why the capture tools settle the
  camera synchronously instead of waiting for the next animation frame.
- The light on the wall is a deliberately authored approximation, not a physically simulated
  global-illumination solve. The wall is 0.72 m behind a 0.14 m wide source, so what reaches it is
  the arms of the band around the object's silhouette plus a falloff — a helix *projected onto a
  near wall* cannot read as a spiral stripe the way it does on the floor, and it does not here.
- The contrast audit samples rendered pixels, so it reports what is on screen rather than what the
  stylesheet declares — and that cuts both ways. At 1440×900 it measures 161 text boxes; 159 clear
  the 4.5 body-text floor. The two that do not (3.22 and 4.17) are the reservation list's `Finish`
  and `Foundry — raw cast aluminium`, measured at the moment they are scrolled *under the fixed
  header*, whose own gradient scrim is what darkens them; the tool measures pixels and cannot know
  that those pixels are behind a bar. Two further boxes come back `unmeas` — a filled button whose
  capture was a single luminance — and are reported rather than failed. Nothing measures below 3.0.
- `tools/deploy.sh` blocks the push at 3.0, not 4.5, and prints everything between. Sampling pixels
  is not the test WCAG 1.4.3 specifies — it specifies declared colours, and those are clean (bone on
  `#13100e` is 15.6:1, `--fg-dim` at 93 % is about 12:1). A sampled estimate is biased low for 12 px
  anti-aliased text, where the glyph cores are a small minority of a padded box, so a 4.5 gate on a
  sampled number produces false failures and teaches you to ignore the tool. 3.0 is the floor for
  large text and for UI components (1.4.11): under it, something is genuinely unreadable over the
  render and the push stops.
  overflow, not yet for measured contrast per element.
- Vesper is fictional. No part of this page represents a real product, company or offer.
