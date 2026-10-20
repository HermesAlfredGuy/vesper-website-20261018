# VESPER — pass 4: crisp, smooth, loads like a product

Owner feedback, and what happened to each part of it:

> "its still missing forced smooth scrolling, and the edges of the objects are blurry, idk what its
> called is that called occlusion? … since its really laggy at first, why not add a loading screen?
> and have it be really optimized and smooth, as well as look perfect in terms of graphics, its still
> a little blurry"

| asked for | done | evidence |
|---|---|---|
| not blurry, crisp edges | postprocessing EffectComposer, 4× MSAA, native resolution | `docs/pass4/AA-contact-sheet.png`, `docs/pass4/sil/edges.json` |
| forced smooth scrolling | Lenis, one clock, off under reduced motion | `docs/pass4/after/motion.json`, `docs/pass4/after/checks.json` |
| a loading screen | designed panel, real bytes + linked programs + frames | `docs/pass4/after/boot-*.png` |
| optimised | GLB 6.05 MB → 1.60 MB, transfer halved | `docs/pass4/{before,after}/perf.json` |
| nothing broken | drag, keyboard, touch, finishes, atmospheres, reduced motion | `docs/pass4/after/checks.json` |
| proof | studio-qa, film, numbers | `docs/pass4/qa/`, `docs/pass4/vesper-pass4-film.mp4` |

### The motion policy, as the owner set it

The page does **not** read `prefers-reduced-motion`. Work laptops ship with Windows "Animation
effects" off, and that must not be the difference between a product and a still. Instead there is a
visible **Reduce motion** control in the dock (icon) and the footer (word), which sets
`html.reduced` and remembers itself in `localStorage['site-motion']` — applied by an inline script
before first paint, so a returning reader never sees one frame of the full-motion version. Nothing
flashes more than three times a second in either mode (the only repeated animation is the emitter's
20-second breath).

---

## 1. The blur was the resolve, not occlusion

The consultant's diagnosis was right, and the code said so plainly. `js/scene3d.js` built its own
post chain: a half-float render target with `samples: 0` — no multisampling at all — and it faked
antialiasing by rendering at **1.5×** and reading the result back with **one bilinear tap**
(`git show HEAD:js/scene3d.js`, `const SS = 1.5`). A single bilinear tap at a non-integer ratio is
not a box filter: it samples the 1.5× buffer at whatever positions the output grid lands on, so an
edge comes back smeared where the phase pushes it and stair-stepped where it pins to a texel. Above
DPR 1.5 the supersample was dropped entirely (`const ss = ratio >= 1.5 ? 1 : SS`) — and no
antialiasing replaced it — so on a retina screen the object had hard stair-steps and shimmer on
every curve.

What replaced it:

- **pmndrs `postprocessing`** — vendored as `vendor/postprocessing.module.js` (esbuild ESM bundle of
  the exports the stage uses), so the page still has no build step and no CDN.
- **`EffectComposer` with `multisampling: 4` on a `HalfFloatType` framebuffer** at the device's own
  resolution: the GPU resolves four coverage samples per pixel where the geometry actually is.
- The look is unchanged: same ACES fit, same exposure, same 8×8 ordered dither, moved into a
  `GradeEffect` because the composer owns the buffer now. The renderer is set to
  `NoToneMapping` / `SRGBColorSpace` and the grade shader does the tone curve *and* the encode, so
  there is exactly one place where colour leaves linear space.
- **Bloom stays tight**: threshold 1.02 (above the brightest diffuse the body reaches, below the
  pipe), radius 0.40, mipmap blur. It is the emitter's bleed, not a soft-focus filter.
- **Anisotropic filtering at 8×** on the whole atlas. The column is a cylinder seen at grazing
  angles down its entire height, and at the default 1× the mip chain smears the brushed detail
  exactly along the silhouette the eye is following.

### Measured, on the same rows of the same edge

Captured with `tools/p4-silhouette.mjs` against both builds — the pass-8 tree checked out as a git
worktree, the pass-4 tree as it ships — with the wall spill, the copy and the dock hidden so the
silhouette stands on the dark ground where an edge can be measured at all. `tools/p4-edge.py`:

| edge | metric | pass 8 | pass 4 |
|---|---|---|---|
| emitter slot (diagonal, hot) | row-to-row wander of the edge position | **1.03 px** | **0.70 px** |
| left silhouette (near vertical) | sharpest single-pixel step, as a fraction of the whole rise | 0.33 | 0.33 |

The vertical silhouette is unchanged on purpose: a near-vertical edge lands inside one pixel in both
builds. The diagonals are where pass 8 lost the edge, and 1.03 px of wander *is* a stair-step — one
pixel of jump from row to row. That is what the contact sheet shows at 1:1 and at 5× nearest.

Two things measured on the way, both worth stating because they are not flattering:

- **Surface micro-contrast at DPR 1 is 19.7 % lower** on the densest brushed patch (high-frequency
  energy 7.34 → 5.90). This is not the texture: moving the normal map from lossy WebP to lossless
  WebP did not move the number (5.86 → 5.80). It is pass 8's supersample showing sub-pixel brush
  detail that a 1:1 render correctly band-limits. Blinded comparison of 4× crops
  (`tools/p4-detail.py`, `z-surface` sheet) says the new render reads *slightly crisper*, not
  softer, because the old detail was accompanied by smear.
- **SMAA was tried on top of 4× MSAA and rejected.** It moved the slot's wander from 0.70 to 0.72 px
  — i.e. nothing — while blending edge pixels MSAA had already resolved. It stays wired as the
  fallback for a device that cannot give us a multisampled buffer at all.
- **Shadow map size was not raised.** 2048 over a 1.1 m frustum was already set in pass 3, and an
  ablation in that pass showed shadow resolution was not what made the object soft.

---

## 2. Smooth scrolling that is not a second clock

`vendor/lenis.mjs`, `lerp 0.1`, driven from the page's **existing** `frame()` loop: `lenis.raf(now)`
is the first line, before anything reads `scrollY`, so a frame never mixes this frame's camera with
last frame's position. There is no second requestAnimationFrame loop. Navigation anchors go through
`lenis.scrollTo`, and `resize` forwards to `lenis.resize()`.

- **Full motion by default, even when the OS asks for less.** The page does not read
  `prefers-reduced-motion` at all (owner policy): work laptops ship with Windows "Animation
  effects" off, and that is not a request to be handed a still site. The only thing that calms
  the page is the viewer's own **Reduce motion** control in the dock and the footer.
- **The toggle takes it away and gives it back** — Lenis is destroyed, `html.reduced` is set and
  `localStorage['site-motion'] = 'reduced'` is remembered, so a returning reader never sees one
  frame of the full-motion version; turning it off constructs Lenis again.
- **Touch stays native** — `syncTouch: false`; a finger scroll is the browser's.
- Warmed during the loader, so the first scroll after the reveal does not hitch.

Measured with a real wheel gesture (`tools/p4-motion.mjs`, `docs/pass4/after/motion.json`): the
scroll walks 0 → 293 → 382 → 409 → 417 → 419 → 420 px across frames and settles — an eased approach
to the target, not a jump. With the browser *emulating* `prefers-reduced-motion: reduce` nothing
changes: `html.reduced` is absent, Lenis is present and the wheel still glides. After clicking
Reduce motion the same wheel is **one step of exactly 300 px with no tail** — four consecutive
samples at the same position (`checks.json → motion.calm`).

## 3. A loader with nothing invented in it

`#boot`: the wordmark, one 2 px warm light-line that fills like the milled channel, a lit head on
the line, the stage name in mono, and a percentage. No spinner. The percentage is the sum of things
that actually happened:

1. **GLB bytes** — `GLTFLoader` progress events, weighted 0.72 (it is most of the wait);
2. **linked programs** — `renderer.compile` per part, weighted 0.28;
3. **two live frames** — the panel does not lift until the stage has drawn twice with the loaded
   geometry, the programs linked, and (if it is in use) the SMAA pass built.

So the bar cannot reach 100 % before the picture exists. It fills solid `#ffc078` at 2 px with a
separate glow head — a gradient *inside* a `scaleX` element compresses into a divider as it fills,
which is what the first attempt did. On completion the line sweeps once to its own end, the panel
lifts, and the page is already interactive underneath. A 14 s watchdog reveals regardless, so a
hung request can never leave the site behind a panel.

`poster.webp` is still the no-WebGL fallback and still the first paint.

## 4. Weight

`gltf-transform`: `webp --quality 92` for base colour and ORM, **lossless** WebP for the normal map,
then `meshopt --level high`.

| | pass 8 | pass 4 |
|---|---|---|
| GLB on the wire | 6.05 MB (6,192 KB) | **1.60 MB** (1,637 KB) |
| total transfer, first load | 8,708 KB | **4,391 KB** |
| JS heap after load | 20 MB | **14 MB** |
| first contentful paint | 1,904 ms | 1,532 ms |
| stage live (GLB applied + programs linked + 2 frames) | 25,341 ms | **21,475 ms** |
| longest single task | 12,235 ms | 12,242 ms |
| total long-task time | 20,517 ms | 19,349 ms |

`docs/pass4/{before,after}/perf.json`, same tool (`tools/p4-perf.mjs`), same container.

**The caveat matters:** this container draws with SwiftShader, so the two time columns are software
rasterisation and are only comparable *to each other*. The byte and heap columns are hardware
independent. The longest task is unchanged because it is the GLB parse plus shader compilation, not
the resolve — the composer added one program and took one away.

The compression had one trap worth recording: `meshopt` moves each part's metre scale into its node
transform, and the stage reuses `mesh.geometry` with its own transform stack, so the column rendered
about seven times too large and its channel shader — which measures position in millimetres — went
white. `bakeGeometry()` now bakes the world matrix into a float position attribute at load (and
re-derives normals only when the matrix is non-uniform or mirrored).

Also audited: `assets/` is 29 MB, of which the `.blend`, the 4K source textures and the reference
frames are authoring material. Nothing but the 1.60 MB GLB, the poster, the fonts and the drawing is
requested on first view.

## 5. What was not allowed to break

`tools/p4-checks.mjs` → `docs/pass4/after/checks.json`:

- drag turns the object: orbit −0.26 → −1.22 on a pointer drag over the render;
- arrow keys move the slider: −50 → −49, focus stays on the control;
- a finger turns it too (new): a horizontal touch swipe −0.35 → −0.47 with **zero** scroll;
- a vertical touch swipe scrolls the page (245 px) and leaves the orbit alone;
- finishes, atmospheres, the reservation preview and the dock are untouched;
- mobile: document width 390 = viewport width 390, dock inside the viewport, boot panel full-bleed;
- reduce motion (the toggle): no Lenis, the sweep animation is removed and the panel fades
  instead, masked lines reveal by opacity with no transform, the object stops travelling — but the
  emitter keeps a slow ±3.5 % breath over ~20 s, because "calmer" must not mean "dead". Measured:
  two canvas captures 2.2 s apart still differ (`motion.liveness`), and `qa.sh` no longer reports a
  frozen hero.

---

## Proof

- **Contact sheet** — `docs/pass4/AA-contact-sheet.png`: the same crop of the same frame at DPR 1 and
  DPR 2, before and after, every panel at 1:1 device pixels, plus a 5× nearest-neighbour magnifier of
  the slot edge with its source patch outlined in the panels above it. Nothing rescaled.
- **studio-qa** — `docs/pass4/qa/` (report.json + sheets): axe WCAG AA serious+critical **0**,
  text leaks **0**, line clashes **0**, console errors **0**, failed requests **0**, mobile
  `scrollWidth == width == 390`, no overflow offenders.
- **Film** — `docs/pass4/vesper-pass4-film.mp4`: loader → reveal → the scroll through every chapter,
  captured from the live page.
- **Numbers** — `docs/pass4/{before,after}/perf.json`, `docs/pass4/sil/edges.json`,
  `docs/pass4/after/motion.json`, `docs/pass4/after/checks.json`.
- **Deploy** — committed, pushed and served from the existing GitHub Pages repo; the deploy script
  compares the SHA-256 of the live bytes against the working tree for every shipped file, including
  the three vendored modules and the GLB.

## Tools added

| tool | what it answers |
|---|---|
| `tools/p4-perf.mjs` | long tasks, transfer, marks, heap — before and after |
| `tools/p4-silhouette.mjs` | the object on dark ground, same camera, both builds |
| `tools/p4-edge.py` | edge wander and step fraction, in device pixels |
| `tools/p4-detail.py` | high-frequency energy on fixed patches |
| `tools/p4-crops.py` | the contact sheet, 1:1, no rescaling |
| `tools/p4-shoot.mjs` | hero frames at a pinned sample count |
| `tools/p4-loader.mjs` | the panel at a throttled 90 KB/s |
| `tools/p4-motion.mjs` | the scroll trace, reduced vs normal |
| `tools/p4-checks.mjs` | drag, keyboard, touch, mobile, reduced motion |
| `tools/p4-film.mjs` | the film, from Lenis' own scroll positions |
