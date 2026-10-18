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

- `tools/shoot.mjs` — single headless screenshot with console capture.
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
- The **helical channel is a shader effect on the body**, not a painted line: a lit floor inside
  the channel, walls whose normals tilt, a machined shoulder, and a warm bleed onto the metal either
  side. It is lit by its own emissive term, so it survives being seen at any distance.
- The wall wash and the floor pool are separate meshes whose patterns are anchored to the object's
  world position, so the light on the room always reads as caused by the object. The wash is
  dominated by the *structured* projection of the channel — a narrow bright arc inside a weak
  diffuse halo — rather than by a broad gradient, and its vertical extent is limited to the height
  of the channel so it cannot read as a wash painted across the whole wall.
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
- If WebGL is missing the still stays, a short note at the foot of the page says why, and everything
  else keeps working: the readouts, the finish and atmosphere controls, the drawing and the
  reservation preview.
- The object can be turned with mouse drag, with a keyboard-focusable slider (touch users use the
  slider, so vertical scrolling is never hijacked), and every control is a real button, radio or
  range input with a label.
- Narrow screens are treated as their own layout, not a shrunk desktop one. Two defects were found
  by inspecting real 390 px renders and fixed: the fixed dock covered the end-of-page buttons (the
  last chapter and the footer now reserve room for it), and body copy sat over the lit object with
  too little contrast (below 900 px the copy, the table and the two option lists carry their own
  translucent scrim). The rotate hint also changes wording on touch, where dragging the object is
  not the gesture — the slider is.

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

## Honest limits

- Frame rates measured in the container's software renderer are not a claim about real hardware.
- The light on the wall is a deliberately authored approximation, not a physically simulated
  global-illumination solve.
- Vesper is fictional. No part of this page represents a real product, company or offer.
