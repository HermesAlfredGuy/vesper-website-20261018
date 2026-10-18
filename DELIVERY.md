# VESPER — delivery notes

Concept landing page for a fictional sculptural portable light. Design study only: nothing is for
sale, no payment is taken, no data is collected, nothing is submitted anywhere.

## What is being delivered

| Item | Where |
| --- | --- |
| Live site | https://hermesalfredguy.github.io/vesper-website-20261018/ |
| Source (this repo) | https://github.com/HermesAlfredGuy/vesper-website-20261018 |
| Source archive | `vesper-website-20261018-src.zip` (tracked files only — no node_modules, no caches) |
| Walkthrough film | `vesper-film.mp4`, 20 s, 1280×720, silent — real scroll positions and real control clicks |
| Stills | desktop and mobile section captures, plus the film's contact sheet |

## The object and the page

Six chapters, one continuous camera: **hero → the seam → atmosphere → materials → specification →
reserve**. The same object is in every frame; only the camera, the finish and the light move.

The product is a cast-aluminium column with a single helical channel. The channel does not glow on
the surface of the metal — it is a groove whose floor emits, whose walls are machined, and which
throws a warm bleed onto the metal either side of it. The wall wash and the floor pool are separate
meshes whose patterns are anchored to the object's world position, so the light on the room reads as
*caused* by the object rather than as a background gradient.

## Motion

- One `requestAnimationFrame` loop owns scroll → camera position, target, field of view, mood (time
  of day), output level, and the render. CSS handles micro-transitions only.
- The signature interaction is the object itself: drag it (desktop, anywhere that is not text) or
  use the arrow keys on the slider (keyboard and touch) and the helical channel turns through the
  wall light, so the room changes with the object.
- Chapters change the light, not just the framing: the two light chapters are in a plaster (light)
  tone, the night chapters in a dark tone, and the whole page tone follows.
- Reduced motion removes camera travel, the idle drift and the pulse; reveals keep a short opacity
  fade only. There is a pause control in the dock and in the footer.
- The scene stops rendering when nothing has changed and resumes on any input.

## Build and run

Nothing to install to view it; no build step and no bundler.

```bash
python3 -m http.server 9311     # then open http://127.0.0.1:9311/
```

`npm install` is only needed for the headless check scripts in `tools/` (`playwright-core`).

## Licences and provenance

| Item | Licence |
| --- | --- |
| three.js r186 (`vendor/three.module.js`, `vendor/three.core.js`) | MIT |
| Instrument Serif, Instrument Sans (Instrument / Yoann Minet) | SIL Open Font Licence 1.1 |
| IBM Plex Mono (IBM) | SIL Open Font Licence 1.1 |
| Geometry, shaders, procedural textures, the technical drawing, the poster still, all copy | authored for this study |

No photographs, model files, icon sets, audio or third-party textures are used, and nothing is
fetched from a third-party host at runtime. Research references (Lusion/Oryzo, the published Igloo
case study, iyo) informed principles only — greyboxing and fast in-browser iteration, a dominant
sculptural object, a restrained UI, measured cost — and no reference asset, layout or branding is
reproduced here. The private research image kept at
`/opt/data/reviews/landing-references/igloo-case-reference.jpg` is not included in this repository
and is not part of the site.

## Verification

`tools/verify.mjs` runs against a real browser and covers: no console/page/network errors, the
lazily-loaded WebGL stage becoming live, self-hosted fonts, no horizontal overflow at 1440 and 390,
hero headline actually rendered, anchor offsets, finish and atmosphere controls changing the scene,
turn control rotating the object and moving the seam, mouse drag rotating it while dragging over
text selects instead, keyboard operability, the reservation preview stating no payment, scroll to
the end and back, resize, the dock clearing the editorial column, the pause control, reduced-motion
behaviour, and the no-WebGL path.

`tools/perf.mjs` records the load timeline and the stage-boot marks.

## Honest limits

- All performance numbers in these notes come from this container's **software rasteriser**
  (SwiftShader) and a shared CPU. They are a pessimistic upper bound, not a claim about any real
  device. On this container the first painted frame lands at roughly 3–4 s and the live scene a
  while after that; the page is fully readable, navigable and configurable from the first paint.
- The wall wash and floor pool are deliberately authored approximations, not a physically simulated
  global-illumination solve.
- Frame rate was not measured on physical hardware.
- Vesper is fictional. Nothing here represents a real product, company, price or offer.
