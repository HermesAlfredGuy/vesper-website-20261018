# Pass 5 — the object, measured

Three changes, each verified against a rendered frame rather than against intent.
All captures are 1440×900 CSS at device scale 2 (2880×1800), Lanczos-downscaled to
1440×900, inspected and measured at 1:1. `tools/shoot.mjs`, `tools/m5.py`,
`tools/mask-probe.js`. Frames in `before/` and `after/`.

**Rendering caveat.** This machine renders through SwiftShader (software GL).
Nothing here is a frame-timing claim about the owner's GPU; all measurements are
pixel values and geometry probes, which are GL-independent.

---

## 1. Aperture legibility

### What was wrong

The slot measured a 3–4 px pale band with no lip, no throat and no interior. Three
independent causes, each found by measurement:

**(a) The aperture was sub-pixel for its features.** `tools/slot-probe.js`
projects the helix and reports the aperture's on-screen width:
9.0 mm → **13.7 px**. Lip, chamfer and throat each averaged into the same value.

**(b) The emitter mesh was culled outright.** `coreMat` had `side: FrontSide`;
`TubeGeometry` winds inside-out on this curve, so every face was discarded. The
pale band everyone had been reading as the diffuser was the **lip chamfer
catching the studio card**. Eleven material/render-order/`depthTest` variants all
reported `green px 0` — the clone test that appeared to render was a clone whose
world transform did not match the in-group original, so it was never conclusive.
The fix is one property.

**(c) The tube was over-driven into white.** At `emissiveIntensity 2.2` with a
cream albedo the linear value is ≈(2.4, 1.5, 0.6); ACES maps that to
**(247, 240, 214)** — cream. The tube was blowing its own colour off. It now runs
`emissiveIntensity` 1.05→1.70 against an almost-black albedo (0x140c06) and a
`0xff7a1e` emissive, i.e. a linear value near 0.5, which is the region where ACES
still returns orange. Measured amber at the slot: **r−b 48–50 counts** (before:
0 — a white band has no r−b).

### Geometry

| | before | after |
|---|---|---|
| aperture across the lips | 9.0 mm | **16.0 mm** |
| **projected width at hero framing** | 13.7 px | **24.4 px** (probe, best-facing) |
| rebate depth | 5.0 mm | **4.6 mm** |
| opal tube | 8.0 mm | **8.8 mm**, crown 0.9 mm under the lip plane |
| visible emitter chord | — | **14.8 px** of a 23.5 px aperture |

Depth went **down**, not up, and that is the load-bearing correction: a 7.6 mm
rebate is right for a spotlight and wrong for a diffuser. At the hero's 40–60°
incidence the near lip of a deep slot occludes the tube along the entire helix —
measured, 1–2 px of emitter inside a 23 px aperture. Shallowing to 4.6 mm inside
an 11 mm wall is what puts a 14.8 px chord of tube behind a 24.4 px opening.

**The throat is view-dependent.** `vSee = dot(outward normal, view direction)`
gates the interior, the halo skirt and the occlusion term. At the helix's grazing
arcs you are looking *past* the lip, not into the hole, so the light there is
hidden and only the chamfer survives. Without this the shader paints one uniform
tan band along the whole helix — the measured signature of a drawn line.

**A near-field skirt on the metal.** A source in a slot warms the metal either
side of it. `exp(-2·vOut)` over ~3 mm. Without it the slot measured 62 counts of
amber and still read as paint, because nothing outside the opening had changed.

### 1:1 inspection

`after/hero-desktop.png` at 1:1 device pixels: dark recess, bright specular lip,
amber interior with interior falloff, dark throat. It reads as a milled channel
holding a lit element, not as an inlay.

---

## 2. Metal response

The rig was already structured (three tall cards, a crossing bar, a softbox), so
the failure was not "no cards" — it was that **their edges were hard**. A card
with a hard boundary is a step function on the sphere, and PMREM convolves that
step through its mip chain; the ringing lands on the body as a **~30 px
horizontal band**.

Proven by ablation at source (each test held everything else fixed):

| test | band amplitude |
|---|---|
| shipped (hard cards) | **1.99 levels @ 30 px** |
| `normalMap = null` | 1.99 — unchanged |
| shadows off | 1.97 — unchanged |
| roughness flat 0.42, both maps off | 2.00 — unchanged |
| flat-colour environment | **0.37** |

Only the environment moved it. It was never the normal map, the profile or the
sampling; it was the rig's own edges. Every card now carries a two-axis alpha
ramp on a 1.35× plane.

Roughness became a smooth height function rather than a texture —
`vHandle = exp(-((y − 0.150)/0.078)²)`, clamped 0.16–0.64 — so the waist polishes
and the foot and shoulder stay blasted, with no tiling that could reintroduce
striping.

**Card colour is calibrated against measurement, not arithmetic.** The ramp's
mean is 0.4717, which suggests a 2.12 compensation. A PMREM mip is not an area
integral, and that number is wrong by a factor of two:

| SOFT | body p50 |
|---|---|
| hard edges (control) | 63.4 |
| 0.60 | 64.5 |
| 0.85 (**shipped**) | **75.1** |
| 1.00 | 80.1 |
| 2.12 | 99.9 |

The hard-card control (63.4 / 119.3 / 23.9% under L40) reproduces the shipped
"before" figures (65.9 / 105.4 / 26.3%), which is what confirms the soft cards —
not anything else — account for the delta.

---

## 3. Banding, re-verified at 1:1

Helix-free patches on the shipped hero, row-mean → cubic detrend → Hann → rFFT:

| patch (1×) | before | after |
|---|---|---|
| shoulder | 6.92 px @ 2.15 | **30.0 px @ 0.71** |
| far flank | 33.3 px @ 1.04 | 33.3 px @ 0.97 |
| base | 22.5 px @ 3.32 | 22.5 px @ 2.85 |
| upper hip | 6.92 px @ 1.87 | **6.92 px @ 0.50** |

The 6.92 px feature — the old normal-map tool mark — drops to 0.50 levels, a
factor of 3.7. The 25–33 px features that survive are **the helix itself**
crossing the patch (rows 542–580 at x=980 measure 98–112 counts inside the slot),
not banding.

One sampling fix was needed earlier and is in the same tree: the ring stack had
**65 rings 46 mm apart on the waist**, so a 22.8 px rebate was being interpolated
across 46 mm — a twisted ramp that buried the emitter under the interpolated
surface. `STEP_FINE 1.8 mm` / `STEP_COARSE 4.5 mm` plus a max-turn rule gives
**348 rings, median gap 0.68 mm**.

---

## 4. Spill that follows the helix

**The spill was rotationally symmetric by construction**, which the wall band's
peak azimuth proved: **177.5° at orbit 0 and 177.5° at orbit 1.15 rad**. Not
"subtly unchanged" — identical. A 1.16-turn helix has a segment at every
azimuth, so summing 32 of them integrates to a pool.

The cause is that `cosE` cannot distinguish a far-side segment from a near-side
one: both have the same outward-normal relationship to a receiver on their own
side. The body is the occluder that breaks the symmetry, so the spill now tests
each emitter→point line against the cylinder of the emitter's own radius and
discards segments the column hides.

Also in this pass:
- `SPILL_SAMPLES` 20 → **32** (20 segments is 54° of helix each; a 54° span of a
  spiral is not a spiral). Kept inside the 224-vec4 fragment budget.
- lobe exponent 2.6 → **3.4**; floor cut radius 1.25 m → **0.34 m**.
- spill gains raised ~8× — measured: at the previous gains the integral put ~4
  levels on a wall 300 mm away, below the amber room's own noise floor, so the
  band could not move with the object because it could not be seen.

Isolated by differencing against a spill-off capture (`/tmp/sp_*.js`):

| | orbit 0.00 | orbit 1.15 |
|---|---|---|
| floor spill peak (x px) | 348 | **1424** |
| wall spill peak (y px) | 165 | **454** |
| spill-only orbit difference | — | mean 1.61, max 61 |

The pattern is anchored to the object and travels with it.

---

## 5. Body tone

`tools/m5.py`, over body-mask pixels only (object-only silhouette capture,
eroded 2 px), 1440×900:

| | p50 | p90 | under L40 | aperture run px |
|---|---|---|---|---|
| before | 65.9 | 105.4 | 26.3% | 20 |
| **after** | **75.1** | **125.3** | **18.3%** | **22** |
| brief target | 69.0 | 105 | 20.3% | — |

p50 +9.2 against a target of +2.2. The extra is the channel and its spill, which
is the change that was asked for.

---

## Verification

`tools/verify.mjs` → **39/39**. One check was updated rather than left failing:
"the channel is milled into the mesh" hardcoded 5.0 mm depth / 4.5 mm half-width,
stale against the new 4.6 / 8.0 mm. It now reads `CHANNEL` at runtime, so it
still fails if the mesh ever stops matching the shader.

## Files

- `js/scene3d.js` — CHANNEL dims, emitter tone and winding, view-dependent throat,
  near-field skirt, soft-edged studio cards, occluded spill, ring stepping,
  compile-visibility restore
- `js/data.js` — Foundry `env` 2.40 → 1.72 (set from the measured response)
- `tools/verify.mjs` — the milled-channel check reads CHANNEL
- `tools/m5.py`, `tools/mask.js`, `tools/mask-probe.js`, `tools/slot-probe.js`,
  `tools/probe-opal.js`, `tools/orbit-115.js` — measurement harness

## Not done / open

- The spill's radial structure on the floor is broad. It is anchored and it moves,
  but a tighter floor lobe would read as more clearly banded. `uCut2` and the
  exponent are the two knobs; both are one-line changes with a measured curve
  already recorded above.
- Only the hero framing was measured for banding at 1:1. The phone hero was
  captured (`after/hero-phone.png`) but not FFT-analysed; its object is roughly
  half the pixel width, so the aperture is nearer its legibility limit there.