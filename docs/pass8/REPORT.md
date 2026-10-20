# Pass 8 — the channel at the shipped hero

Three edits, each verified (39/39) and deployed. Every number below was read off a
shipped 1440 × 900 frame at dpr 1, not off a caption.

## 1 · Scale — the lamp is 692 px tall

`index.html`, hero `data-cam` only, target (−0.20, 0.105, 0) and 33 mm unchanged:

| | before | after |
|---|---|---|
| camera | (0.17, 0.31, 0.94) | (0.113, 0.279, 0.796) |
| distance to target | 1.031 m | 0.873 m |
| **lamp height** (`objectRect`) | **560 px** | **692 px** |
| right edge / top edge | 1249 / 149 | 1359 / 77 |

The criterion was ≥ 420 px; pass 7 already sat at 560, so the framing was not raised to
clear a floor — it was raised because the channel, not the silhouette, was the thing that
could not read. At 692 px the object still sits fully inside the frame (81 px of margin on
the right, 77 px at the top) and the copy is untouched. `data-cam-m` (portrait) is
unchanged: the phone framing was approved and is a separate composition.

## 2 · Rest rotation — −15° (−0.2618 rad)

Seven rest angles were shot (`docs/pass8/shots/rot-*.png`) and each was cut square across
the channel with `tools/pass8_seam.py`:

| rest | throat dip | core peak | core > L 100 |
|---|---|---|---|
| 0° | 49.2 | 131.3 | 10.0 px |
| −5° | 38.9 | 133.1 | 10.5 px |
| **−15°** | **45.9** | **136.8** | **11.5 px** |
| −25° | 46.8 | 138.2 | 11.5 px |
| −35° | 41.5 | 138.9 | 12.0 px |
| +10° | 42.0 | 149.2 | 36.5 px (core merges into the flank) |
| +20° | 41.7 | 131.5 | 9.5 px |

−15° gives a wider facing section than the old zero pose (11.5 px of core against 10.0,
core at L 137 against 131) with the recess intact; past −25° the throat starts to fill
with bloom, and +10° merges the core into the specular flank and loses the section
altogether. The constant lives in `js/data.js` (`REST`) because two owners need it:
`scene3d.js` applies it to the object's rotation — not to the camera or the lights, so the
slot, the pipe and both spill integrals keep their relationship to the metal — and
`main.js` maps slider 0 to it, with the full 2.6 rad of travel still at the right-hand end.
`verify.mjs`'s invariant (`groupRot === orbit`, `seamPhase − (phase + orbit) = 0`) is
untouched.

## 3 · Surface — brush instead of streaks

Taken from the preserved interrupted pass (`wip/vesper-pass8-interrupted.patch`), with its
front bounce card and its seam exposure **left alone**: the card at FRONT 0.62 had
flattened the seam to metal 99.7 / 86.8 with a core peak of 105.7, which is no contrast
left to protect.

* the baked micro-normal fades as the surface turns away (N·V 0.05 → 0.40). A
  tangent-space map at the silhouette is projected at almost zero width, which is what the
  vertical smears were: filtered noise, not grain;
* a 2.4 mm brush runs up the column in object space, carrying normal tilt and roughness,
  faded by its own `fwidth` so it cannot alias below a pixel;
* the bloom radius drops to 0.34 of the old one. The halo used to reach ~24 px, wider than
  the channel is; it lifted the throat on both sides and erased the second dip.

The body's value is unchanged: metal **121 / 122** at the seam (pass 7: 102 / 127 at its
own cut). No exposure, tone map or emissive value was touched.

## 4 · Acceptance, measured on the shipped frame

`docs/pass8/shots/live-hero-pass8.png` — shot from the live URL, not from the working
tree — cut square across the channel at its widest row (y\* = 425, ridge x = 1071, band
161.1° from +x):

```
bands  metal 120.8 | throat 48.8 | core 137.0 | metal 122.0
throat dip below the lower metal   72.1     (criterion ≥ 6)
core above L 100                   9.0 px   (criterion ≥ 8)
core offsets                       −5.0 .. +4.0 px
```

The same cut on the local frame before deploying reads metal 120.8 / 122.1, throat 46.0,
dip 74.7, core 137.0, 9.0 px — the two differ only by the dither's own ±1 level.

| | pass 7 | pass 8 |
|---|---|---|
| metal L / R | 101.9 / 126.8 | 120.8 / 122.1 |
| throat | 90.7 | 48.8 |
| dip below lower metal | 11.2 | **72.1** |
| core peak | 131.5 | 137.0 |
| core > L 100 | 34 px (halo merged into the flank) | **9.0 px** (the pipe itself) |

Pass 7's 34 px was the bloom halo, not the pipe: it counted the flank as core. With the
halo pulled back the same measurement now counts the light pipe, which is why the width
fell while the recess got deeper.

`docs/pass8/shots/accept-crop-1to1.png` is a 240 × 146 crop at 1:1 (no scaling, no
resampling) around the same point: bright metal, the dark throat, the lit core, three
distinct bands.

## 5 · Verification

* `tools/verify.mjs` — 39/39, before and after each edit.
* `tools/asset/check_asset.py` — all ad-hoc checks pass (milled channel still in the mesh).
* `tools/deploy.sh` — live at https://hermesalfredguy.github.io/vesper-website-20261018/,
  byte parity confirmed on index.html, css, the three scripts, the drawing and the poster.
* `assets/poster.webp` regenerated from the new hero frame, so the poster → live dissolve
  no longer jumps.

## Instruments

* `tools/pass8_probe.mjs` — lamp box, pipe box in pixels, emitter probe, camera.
* `tools/pass8_seam.py` — the acceptance cut: follows the warm ridge and cuts square to it.
  (The older `pass8_measure.profile` fits a PCA axis to a rectangle; against a bright
  specular flank that axis tilts into the flank and the profile comes back flat.)
* `tools/pass8_sweep.mjs` — N rest angles in one browser.
* `tools/pass8_shoot.mjs` — waits for `.stage.is-live` and the poster dissolve before
  capturing; no turn argument means "the page's own rest pose".
