# VESPER pass 4/5 — measured record

Every number here comes from a tool in `tools/`. Capture set: `pass4/base` (before) and
`pass4/new` (after) under `/opt/data/director-studio/quality-reset-20261019/`.

## 1. The finish read as rippled clay

**Diagnosis.** `tools/ablate.mjs` renders one variant per reload and measures the macro's
luminance spectrum:

| variant | dominant period | rms |
|---|---|---|
| baseline | 5.2 px | 0.103–0.138 |
| `bodyMat.normalMap = null` | none | **0.004** |
| channel shader removed | 5.2 px | 0.103–0.138 |
| geometry normals only | 5.2 px | 0.09 |

Removing the normal map removes the defect; removing the shader does not. It is **texture
sampling**, not polygon count and not smooth-shading.

The old map was 78 stripes × 26 repeats ≈ 1 200 rings over a 310 mm object — 0.26 mm pitch
against 0.94 mm/px at the hero (a stripe every 1/11 px) and 0.086 mm/px in the macro. That
is a moiré generator, and no amount of smoothing hides it.

**Fix.** Re-authored the map at real scale: a 512² tile = 64 mm (0.125 mm/texel), 16 tool
marks per tile at a 4 mm pitch, isotropic sub-texel blast. Period now stays above the pixel
grid at every framing. Ring layout was rebuilt at the same time so the profile turns are
sampled by **surface angle** rather than by a fixed count per segment: `RING_DENSE = 64`
across the channel (0.25 mm/sample, so the 1.1 mm lip chamfer lands on 3 samples and reads
as a facet), `RING_UNIFORM = 288` elsewhere (1.7 mm arc at the waist = 1.8 px at the hero),
`DENSE_HALF = 0.095` rad.

**Re-measured on the same instrument after the change** (`tools/ablate.mjs`, close macro at
`d=0.26`, same crop): the baseline's dominant vertical period is now **75.6 px** — about
6.5 mm on the surface at this framing, i.e. the 4 mm tool pitch and its harmonic — where the
old build's was **5.2 px**. The sub-pixel beat is gone; what is left is the tooling.

**Silhouette audit.** Because "the outline looks lumpy" is a claim that has to be settled
with geometry, `tools/silhouette.html` renders a flat orthographic silhouette and the ring
table is compared against the `OUTER` profile directly: all 29 outer rings equal their
profile radius (79.0 → 81.2 foot flare → 71.8 waist → 90.2 shoulder → 64.0 → 0.0 dome),
residual 0.00 mm. The outline is the designed profile: one waist, one shoulder. Broad
internal shading patches read as lobes at small scale; the mesh does not wobble.

## 2. The gap was not visibly the light source

**Diagnosis.** Raising `CHANNEL.uGlow` from 0.45 to 1.85 changed the groove's pixels by
less than one count. The escape mask confined the glow to `|f| < 0.2` — 0.9 mm of arc, about
one pixel at the hero angle. A sub-pixel emitter cannot be brightened into legibility, so the
fault was the mask and the geometry, not the intensity.

**Fix.** A real emitter: `TubeGeometry(new Helix(), 260, OPAL_R, 8, false)` with
`OPAL_R = 0.0024` (a 4.8 mm section) laid 3.4 mm below the outer surface inside the 5 mm
slot, so the lips occlude it by depth test — the geometry, not a mask, decides where the
light escapes. The shader emissive term is demoted to a bounce (`uInterior 0.16`) multiplied
by the cut weight, so it lightens the slot walls and nothing else.

Spill: the gain ramp (0.55→1.0) was removed so the helix, not a brightness gradient, shapes
the pattern; blur `r = sqrt(d2) + 0.008 → + 0.005`; the compression knee went `1.05 → 0.45`
(a 1.05 knee flattened the bright band into a plate, which is exactly how a shaped spill
turns into a generic amber pool); power `(0.075 + i*0.185)` wall / `(0.070 + i*0.170)` floor.
The `uKeyLocal` uniform keeps the shadowed wall on the correct side as the object turns.

## 3. The 390 px overflow

`documentElement.scrollWidth` was 399 at a 390 px viewport. Attribution by
`tools/overflow-descent.mjs` → `overflow-bisect.mjs` → `overflow-pseudo.mjs` (desktop
emulation, because `isMobile` lets the layout shrink-to-fit and hides the offender):
`.sec:not(.sec--hero) .sec__inner::before` and `.sec--hero::before` bled
`calc(var(--pad) * -0.5)` — 9 px per side. Pinned to the viewport (`left:0; right:0`) and the
blanket `overflow-x: hidden` was removed from `body`, so the symptom is gone rather than
hidden. At 360 / 390 / 414 px: `scrollWidth == innerWidth`, 0 elements overhanging.

## 4. Performance (addendum)

**These are SwiftShader numbers.** Every timing below is from a CPU rasteriser in this
container; they are useful for finding stalls and for comparing two versions of the same
scene, and they say nothing about an RTX 4070.

Boot marks at 1440×900 (`tools/perf-one.mjs`):

| mark | t (ms) | delta |
|---|---|---|
| `vesper:boot` | 347 | |
| `vesper:imported` | 1 343 | 996 module parse |
| `vesper:env-start/end` | 1 456 → 2 159 | 703 PMREM bake |
| `vesper:t-plaster` | 2 820 | 661 procedural maps |
| `vesper:t-shell` | 2 846 | **26 geometry** |
| `vesper:stage` | 2 880 | |
| `vesper:compiled` | 12 795 | **9 915 shader compile** |
| `vesper:live` | 12 798 | |

Startup was **one 10.5–12.0 s main-thread task** covering import → compile. Profile of the
compile: the *first* program alone is 8.9 s; the remaining twelve are 100–130 ms each once
cached. Geometry is 26 ms — the scene is not expensive to build, it is expensive to compile,
and the compile was uninterruptible.

Fixes, in order of effect:
- **Compile one mesh per task** with an idle yield between, instead of one
  `renderer.compile(scene)`. `compileAsync` was tried first and is not the answer: it calls
  `this.compile()` synchronously and only polls for the *link* afterwards, so the front-end
  cost stays inside one task. No frame loop runs yet, so hiding the other meshes cannot flash.
- **Shadow map 4096 → 2048.** A 16 M-texel depth pass for a 1.1 m frustum. Measured frame
  cost fell 5.7 ms → 1.1 ms (software) — the depth pass dominated the frame.
- **Pixel budget in `resize()`**: drawing buffer capped at 2.4 Mpx with the DPR cap at 2, CSS
  size unchanged. A 1440p viewport on a 2× display was 5.2 Mpx before the multisample buffer.
- **Adaptive frame budget**: 60 fps target, measured frame cost > 18 ms for 45 frames halves
  it to 30, and it recovers when costs drop. The old fixed 30 fps cap was visible on a
  machine that can afford the frame.

Steady state, same container: **0.5 fps at 1280×800 idle, 0.2 fps while scrolling**
(`tools/perf-frames.mjs`, `tools/interaction-film.mjs`). `update()` returns in 1.5 ms because
rasterisation happens after the call — so `update()` timing is *not* a frame time and must not
be quoted as one.

**Disclosure.** No claim of smoothness on real hardware is made here. The container renders
single-digit fps; the interaction film at
`pass4/film/page@*.webm` shows the container's cadence. What it does certify is coherence —
no stalls, no tearing, no state disagreement between the UI and the scene.

**One clock.** There is one `requestAnimationFrame` loop (`js/main.js:frame`); scroll, camera,
mood, intensity, orbit and the material cross-fades all advance from it and nothing else
draws. Lenis was **not** added: the scroll cost here is not in the handler (it is a compare
and a few class toggles), native touch/keyboard scrolling and reduced-motion are already
honoured and verified, and a second clock driving transforms is exactly the competing ticker
the addendum rules out. Motion remains scroll-derived and damped, so it stays synchronised
without one.

## 5. Interaction (addendum)

- **Drag affordance.** `cursor: grab` on the hero and `grabbing` while dragging (was
  `ew-resize`, which promises a resize handle). `touch-action: pan-y` on the canvas is kept,
  so vertical touch scrolling still works — verified by `mobile: turn control is present and
  the drag does not hijack scroll` and `mobile: page still scrolls normally`.
- **Finish reliability** (`tools/finish-test.mjs`): every finish clicked five times in each of
  four phases — pre-load, mid-load, while scrolling, while dragging — checking the pressed
  button, the scene's state and the body material, plus a real pixel sample. **20 checks, 0
  mismatches**; the pixel difference between umber and bone is **71.3/255** mean absolute, so
  the colour genuinely reaches the framebuffer rather than only the button.
- Three real defects found and fixed in the process:
  1. the loop suspended after ~90 idle frames, so a finish chosen while idle moved the
     material a few percent and stopped — added `stage.isSettled()`, which keeps frames
     coming while any damped value is still away from its target;
  2. `dt` was clamped to 0.05 s *before* reaching the scene, so cross-fades converged in
     frames rather than seconds — material fades now use `dtReal` (capped at 0.25 s);
  3. the new snap-on-first-frame used `Color.copy(hexNumber)`, which writes NaN — and NaN
     through additive blending turned the **entire framebuffer black**. Now `Color.set()`,
     with a one-frame NaN recovery guard in `update()`.
- **Background depth** was left as approved. The object, the plaster room and the shaped
  spill already carry the depth, and the brief's constraint is that nothing obscures the
  typography or the product. No new layer was added behind the copy.

## 6. Verification

- `tools/verify.mjs`: **39/39 passed** (desktop, mobile, reduced motion, no-WebGL).
- `tools/finish-test.mjs`: 20/20.
- Overflow: `scrollWidth == innerWidth` at 360 / 390 / 414.
- Deployed with `bash tools/deploy.sh`; the commit is on `origin/main`.
  **Live byte parity is still pending**: GitHub's `pages build and deployment` workflow has
  been stuck in `queued` since the push (two attempts, 27 and 8 minutes at the time of
  writing, nothing running), while the previously deployed build — pass 3 — is still what
  `hermesalfredguy.github.io` serves. `sha256sum` of the live `js/scene3d.js`
  (`5b573fc3…`) differs from the working tree (`13eecbd6…`). This is a queue on GitHub's
  side, not a failing gate: the local gates are green (39/39 and 20/20). Re-run
  `bash tools/deploy.sh` once the queue drains and the byte comparison at the end of that
  script is the confirmation.

Files touched: `js/scene3d.js`, `js/main.js`, `css/site.css`, plus
`tools/{finish-test,perf-one,perf-frames,interaction-film,silhouette.html,shot,probe-shot,ablate,overflow-*}.mjs`
`docs/pass2/DIAGNOSIS.md` (this pass's diagnosis) and this file.
