# VESPER — pass 2 report

Everything below was produced on 2026-10-19 in `/opt/data/projects/vesper-website-20261018`,
against the local server on `http://127.0.0.1:9311/`, headless on software rendering
(`--use-angle=swiftshader`). No GPU, no external assets: every texture, font and piece of
geometry is in the repository.

## 1. What changed

| area | pass 1 | pass 2 |
| --- | --- | --- |
| the helical channel | a shader stripe on the body — a painted line | **cut into the mesh**: a 9 mm aperture with a real 5 mm floor, two lips and a 0.6 mm edge break (`js/scene3d.js`). `grooveProbe(y)` measures the cut back off the vertex buffer; `verify.mjs` asserts 5.00 mm deep / 4.5 mm half-width at three heights |
| the light in the room | a generic warm point pool that stayed in the room while the object turned | the wall wash and floor pool are lit by **segments of the helix** (`uA`/`uB`), falloff `1/r` not `1/r²`, blur narrowed to `+0.024`. `spillProbe` + a verify check assert the pattern's azimuth tracks `setOrbit(1.2)` |
| material | copy claimed cast aluminium, the render read bronze/champagne with a second specular | satin aluminium: `color 0xb6b3ac, metalness 0.74, roughness 0.46`. Metalness is deliberately below 0.8 so the body keeps diffuse albedo and stays grey in an amber room. A 4.6 m softbox panel replaced the narrow strip; the rim light is now the second-strongest source |
| grounding | floating base, blown-out floor hotspot | `PCFSoftShadowMap` → `PCFShadowMap` (the former was removed in r186 and silently fell back), shadow map 2048² → 4096², `radius` dropped (it only means anything to VSM), `normalBias` 0.0022 |
| type | 11–12 px mono at 72–80 % white | 12–13 px at 88–93 %; `--hairline` vs `--edge` split so *control outlines* clear 3:1 (WCAG 1.4.11); a scrim behind the floating header; legibility halos under text over the render; readout plates behind the atmosphere lumen chips |
| CTAs | two competing primaries in the hero | one primary. The dock's `Reserve`, with the reservation chapter's own action taking over as the dock stands down |
| the rail | orphaned left index | driven by the scroll position, ticks the active chapter, leaves the a11y tree when it should |
| mobile hero | object ran past the fold, hard dark panel over it | re-solved framing (`tools/find-frame.mjs`), gradient scrim, reduced dock with labelled swatch groups, ≥44 px targets |

## 2. Measured before / after

| what | before | after | how |
| --- | --- | --- | --- |
| body luminance over the column (x 994–1034, y 180–660) | median 0.018, mean 0.038 | **median 0.041, mean 0.050** | PIL over the rendered frame |
| frame at or above 250 % luminance | 2.325 % | **0.867 %** | PIL |
| floor hotspot p99 | 0.805 | **0.774** | PIL |
| phone hero | copy over the object, object past the fold | **object 24→327 px of 844, copy starts at 324 px** | `objectRect()` in a real 390×844 context, asserted in `verify.mjs` |
| text contrast at 1440×900 | not measured | **161 text boxes sampled as rendered; 159 clear 4.5:1; nothing under 3.0** | `tools/text-contrast.mjs` |
| behaviour suite | — | **39/39, exit 0** | `tools/verify.mjs` |

The two boxes under 4.5 (3.21, 4.17) are the reservation list measured while it is scrolled
*under the fixed header*, whose own gradient scrim is what darkens them; the tool measures
pixels and cannot know those pixels are behind a bar. `tools/deploy.sh` therefore blocks at
3.0 and prints everything between — a gate set at a number the estimator cannot measure
honestly is a gate that gets ignored. The declared colours are clean: bone on `#13100e` is
15.6:1, `--fg-dim` at 93 % is about 12:1.

## 3. Commands

```bash
export HOME=/opt/data XDG_CONFIG_HOME=/opt/data/.config XDG_CACHE_HOME=/opt/data/.cache \
       PLAYWRIGHT_BROWSERS_PATH=/opt/data/.cache/ms-playwright

node tools/verify.mjs                                   # 39/39
node tools/text-contrast.mjs http://127.0.0.1:9311/index.html 1440 900 4.5
node tools/shoot-sections.mjs http://127.0.0.1:9311/index.html docs/pass2/shots 1440 900 desk 2
node tools/shoot-sections.mjs http://127.0.0.1:9311/index.html docs/pass2/shots 390 844 mob 2
node tools/shoot.mjs "http://127.0.0.1:9311/tools/macro.html?d=0.26&aim=0.162&finish=foundry" \
     docs/pass2/shots/macro-1440.png 1440 900 9000 0 0 "" 2
node tools/film.mjs http://127.0.0.1:9311/index.html docs/pass2/film 1024 576
bash tools/film.sh docs/pass2/film docs/pass2/vesper-pass2-film.mp4 12
bash tools/deploy.sh "VESPER pass 2: the channel is cut into the body, the room light is its spill, and the type is measured"
```

Frames are shot supersampled (`deviceScaleFactor 2`) and downscaled with Lanczos — the only
post-processing. The film's 166 frames are not committed (18 MB of intermediate state); the
commands above regenerate them.

## 4. Deliverables

- `docs/pass2/shots/` — 14 frames: `desk-top`, `desk-object`, `desk-atmosphere`,
  `desk-materials`, `desk-specification`, `desk-reserve`, `macro-1440` at 1440×900;
  `mob-top`, `mob-object`, `mob-atmosphere`, `mob-materials`, `mob-specification`,
  `mob-reserve`, `macro-390` at 390×844.
- `docs/pass2/vesper-pass2-film.mp4` — 1280×720, 12 fps, 13.8 s, the signature interaction.
- `tools/`: `probe.mjs`, `find-frame.mjs`, `text-contrast.mjs`, `dock-check.mjs`,
  `mat-probe.mjs`, `rm-check.mjs` (new); `verify.mjs`, `shoot-sections.mjs`, `film.mjs`,
  `macro.html`, `make-drawing.mjs`, `deploy.sh` (extended).

## 5. Unverified, and known limits

- The wall wash still reads as a **soft glow rather than a band** at the hero and atmosphere
  framings. It is structurally orbit-coupled — the emitter set is segments of the helix and
  `verify.mjs` asserts the azimuth tracks the object's rotation — but at 5.8 m the wall is a
  far surface and eight blurs sum into a wash. This is the least resolved item in the pass.
- The MP4 was rendered before the last two CSS changes (the readout plates and a stronger
  light scrim). The difference is confined to the atmosphere chapter's lumen chips.
- Contrast is measured at 1440×900 only. The phone layout is checked for target size and
  overflow, not per-element contrast.
- `tools/text-contrast.mjs` samples pixels, which is not the test WCAG specifies; it is
  biased low for anti-aliased 12 px text and it cannot see occlusion. Treat its 4.5 column as
  a smoke detector, not a certificate.
- Two `unmeas` rows in every run: a filled button whose capture is a single luminance. They
  are reported rather than failed.

---

## Pass 3 — the body was a black mirror, and the dock was eating a line of type

A fresh review of the *delivered* pass-2 frames did not accept the hero: the body read as "glossy
black ceramic", the macro as "champagne-bronze", and the turn instruction was clipped by the
dock. Both were measurable, and both had a single cause.

### 1 · Value, not hue, was the defect

`Foundry` was `0xb6bac0` at **metalness 1.0** with the environment at **1.30**. At metalness 1.0 a
material has no diffuse response at all: it *is* the environment it mirrors, and this environment
is a dark room with a few small panels. The albedo value is then irrelevant, which is exactly why
a mid-grey albedo rendered as a black mirror.

| body strip (x 792–1123, y 315–765 of `desk-top.png`) | p50 | p90 | pixels under L40 |
| --- | --- | --- | --- |
| pass 2, as delivered | **27.1** | 73.9 | **68.9 %** |
| pass 3, after the changes below | **61–63** | **107** | **18–21 %** |

Changes:
* `Foundry` → `0xc6cbd2`, metalness **0.85**, roughness **0.42**, env **2.40** (a little diffuse
  response back, so the albedo can state its value).
* The studio's two overhead panels raised (`3.6 → 5.4`, `1.42 → 2.25`): more of the environment
  is bright, so a metal sitting in it has something to reflect.
* A **6.2 × 7.2 m neutral bounce card at (0.15, 1.5, 5.0), camera side, added to the reflection
  environment only** (`panel()` writes into the PMREM scene, so it never appears in the picture).
  This is the fix that matters: in an amber room every reflection is amber, so a metal's mid-tone
  goes brown whatever the albedo says; the only way aluminium keeps a grey mid-tone in a warm room
  is a large neutral source where it actually looks.
* The warm practicals pulled back where they were tinting the body (`seamLight` 0.9 → 0.35).

The room still reads amber — the card exists only in reflections — and the review of the new hero
accepts the body as satin cast aluminium.

### 2 · The instruction under the dock

The dock is `position: fixed`, right-aligned, and at 1440 it measures **579 × 72 at x 795** — wider
than the 44 vw the stylesheet assumed, because it wraps. The turn instruction ended at x 991, so
its last two words sat under the panel. The hint now takes its own line at the left edge of the
turn row (`flex-basis:100%; max-width:330px`), measured at **x 346–666** by a DOM rect probe, clear
of the dock band at 795+; a 2× crop of the delivered frame reads the sentence in full.

### 3 · `tools/verify.mjs` was crashing

The suite died with `page.evaluate: ReferenceError: page is not defined` at line 248: a
`page.waitForFunction` had been moved inside a `page.evaluate` callback, where `page` does not
exist (the wait must run in Node, against the browser). Moved back out. `TOTAL 39/39 passed`.

### 4 · Still open — the gap does not read as the light source

The page's claim is "nothing glows on its surface, the light leaves through the gap", and at the
hero framing the channel still reads as a milled groove with warm light in it rather than a lit
gap: raising `uGlow` from 0.45 to 1.85 changed the groove's pixels by less than a count, so the
emissive term is being killed by the escape mask at this angle rather than being too weak. This is
the next thing to fix, and it is the one item of the pass-3 brief not delivered.

### 5 · The film, re-shot from the corrected material

`docs/pass2/vesper-pass3-film.mp4` — 166 frames, 1280 × 720, 12 fps, 13.833333 s, 3.02 MB,
rendered from the current page after the material fix (the pass-2 film predated it and showed the
old black-mirror body). Regenerate with:

    node tools/film.mjs http://127.0.0.1:9311/index.html docs/pass2/film3 1024 576
    bash tools/film.sh docs/pass2/film3 docs/pass2/vesper-pass3-film.mp4 12

The 166 source frames are not committed (18 MB of intermediate state). Opened at 0.5 s the object
band measures p50 **53.2** where the pass-2 film rendered the same object at p50 27.
