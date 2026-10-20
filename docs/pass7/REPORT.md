# Pass 7 — the seam has to read

Pass 6 shipped a body with a milled slot and a lit seam that measured correct and photographed
as a 2–4 px amber line. This pass changed three things and nothing about the layout, the type,
the chapters, the controls, the orbit or the reduced-motion behaviour.

## What was actually wrong

1. **The emitter's colour was NaN.** `state.atmoTarget.color` is a hex number, not a
   `THREE.Color`; `_coreTint.copy(at.color)` produced `(0, 0, NaN)`, so the pipe's emissive
   was `000NaN` — the light pipe rendered black in every frame taken after that edit.
   Found by reading `opal.material.emissive` out of the live page, not by looking at a picture.
2. **Every "shipped" screenshot was a 50/50 dissolve.** `.stage.is-live` starts a 0.9 s
   cross-fade from `assets/poster.webp`; the shooter waited 1.2 s of *wall time* on a
   software rasteriser whose frames are 300 ms apart, and photographed the poster blended
   over the canvas. Measured: the same frame read through `canvas.toDataURL()` is
   (244,245,246) where `page.screenshot()` gave (157,157,156). `tools/pass7_shoot.mjs` now
   waits for the computed opacity of both layers instead of a number of milliseconds.
3. **Nothing threw light out of the opening.** At 3.27 linear the pipe sat deep in ACES's
   shoulder, which desaturates as it compresses: the face measured (255,224,156), a cream
   stripe. The greys either side of it were 240 — a light source cannot out-read a
   near-white surround.

## Design, as built (`tools/asset/build_vesper.py`)

| | |
|---|---|
| aperture across the untouched surface | **24.0 mm** (target 22–26) |
| outer lip bevel | **2.0 mm at 45°**, polished (roughness 0.20) in the atlas |
| lip land | 0.56 mm |
| throat wall | 8° draft, **finished matte black** (albedo 0.045, metalness 0.08, roughness 0.97) |
| floor below the untouched surface | 7.4 mm |
| light pipe | **11.8 mm wide, crown 1.25 mm below the lip plane** (was 5.4 mm at 1.45 mm) |
| pipe edge to lip land | 3.4 mm of dark throat |

The throat is a *material* decision, not a lighting one: the shell's UV is (arc offset from
the helix centre, height), so the cut's cross-section is a vertical band of the atlas
(`u = (s / 0.0718 + 0.4596) / TAU`). `tools/asset/compose.py` paints two such bands — the
land/throat black, the bevel polished — and the r0 dependence of the mapping drifts the edge
by ≤ 0.13 mm over the object's height, under a third of a pixel at 1:1.

## Presentation

- **Rest rotation**: the slot's camera-facing section sits at azimuth **11.2°**; the hero
  camera is at **10.3°** (atan2(x, z) of its position (0.17, 0.31, 0.94)) — 0.9° off the
  section's normal, so the aperture is seen at ~0.99 of its width. Measured by projecting the
  `LightPipe` primitive's vertices out of the GLB and taking the mean azimuth of the
  front-facing set; the earlier pass-6 value put the slot ~79° off-normal, which is why it
  foreshortened to a line.
- **Light leaves the mouth**: `throwFloor` and `throwWall` spotlights are placed at the slot's
  mouth on the helix azimuth, recomputed from `state.seamPhase` every frame, on top of the
  drawn pool shaders. They are real lights, so they occlude and they rotate with the body.
- **Emitter**: a 128 px cross-section gradient on the blade's own UV (hot core, saturated
  shoulders, dark edges), black albedo and `envMapIntensity 0` so the studio key adds nothing
  neutral to it, and a two-pass quarter-resolution bloom thresholded at 0.92 linear — above
  the body's brightest diffuse, below the pipe.

## Output path

`RGBA16F` scene target at **1.5x** the canvas (supersampling; MSAA on that target came back
empty once two intermediate passes had run, which rendered the bloom over a black scene), then
one pass: exposure → ACES → sRGB → 8×8 ordered dither of ±0.5 LSB → bloom added before ACES.
No grain, no noise, no film emulation.

## Measured, on the shipped frame (`docs/pass7/shots/hero-desktop.png`, 1440×900)

| quantity | value |
|---|---|
| lit core, perpendicular width | **13.5 px** (area ÷ length; 15–17 px on a perpendicular cut) |
| core peak L / chroma | 128 / **+92** (rgb 143,113,63) |
| dark line beside the core | **2–3 px at L 64**, against a body at L 104–141 |
| lip specular | **+14 L** over the body at the hero row (L 140 vs 126); +105 on the canvas before the scrim |
| floor patch | 42,899 px, centroid **(1153.0, 733.7)**, mean r−b **+38** (neutral floor +6.9) |
| wall patch | 14,690 px, centroid (1314.1, 576.3), mean r−b +32 |
| patch movement over 0.42 rad | floor centroid **15.9 px**, wall centroid **9.2 px**, area −4,430 px |
| banding, wall gradient rows | pass 6: median run **41**, p90 78, max 79 · pass 7: median **3**, p90 8, max 48 |
| phone 390×844 (dpr 2) | core **8.6 px** of the delivered 780×1688 frame (4.3 CSS px), same three bands; the phone frames the object at 232 CSS px against 396 on the desktop |

Banding is measured as the longest run of identical code values along rows across the wall's
smooth vertical gradient (x 1240–1430, y 300–640) in both the pass-6 and pass-7 frame: the
plateaus go from 41–79 px to 3–8 px. The 3x crop still shows a 1-code staircase on the body,
which is what an 8-bit frame at 3x looks like; the visible 20–40 px plateaus are gone.

## Evidence

`docs/pass7/shots/`: `hero-desktop.png`, `hero-phone.png`, `crop-1to1.png` and `crop-3x.png`
(the same 120×80 section), `rotate-a.png` / `rotate-b.png` (0 and 0.42 rad), `phone-crop.png`,
`live-hero.png`.

## Gates

- `tools/verify.mjs` — **39/39**.
- `tools/asset/check_asset.py` — all checks pass (GLB now requested as `?v=9`).
- `bash tools/deploy.sh` — commit `169c39a`, Pages built, byte parity on index/css/js.
- Live GLB `sha256 63b57bc4a0a0…` = working tree; the live hero measures the same 13.5 px core
  and differs from the local frame by a mean of 0.29 code values.

## Honest limits

- The page's legibility scrim covers the render by ~48 % at the slot's x. That is the approved
  design and it is not touched, so the emitter's composite peak is ~147/255 rather than 255;
  the seam reads by chroma and by the bloom halo, not by clipping to white.
- The dark throat line is 2–3 px at this azimuth because the throat is foreshortened there;
  at a section nearer the normal it is 5–6 px. The 24 mm aperture is not the limit — the
  hero's viewing angle is.
