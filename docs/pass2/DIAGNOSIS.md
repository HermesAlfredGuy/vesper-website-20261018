# Pass 4 — object finish, seam as light source, mobile overflow

Measured on the live build at commit `e0030cf`, Chromium + SwiftShader, HOME=/opt/data,
PLAYWRIGHT_BROWSERS_PATH=/opt/data/.cache/ms-playwright, `--use-gl=angle --use-angle=swiftshader`.
Every number below comes from a tool in `tools/`; none is estimated.

## 1. The banded/wavy finish is a *texture sampling* fault, not geometry and not the shader

`tools/ablate.mjs` reloads `tools/macro.html?d=0.26&aim=0.162&finish=foundry&mood=0.06`,
applies exactly one change, and screenshots. `python3` then measures the row-luminance
spectrum of a 32 px vertical strip of the body (cubic-detrended, Hann window).

| variant | dominant period | rms of detrended profile |
|---|---|---|
| baseline | **5.2 px** | **0.103 – 0.138** |
| `bodyMat.normalMap = null` | none | **0.004** |
| plain `MeshStandardMaterial` (no channel shader) | none | 0.002 – 0.006 |
| `MeshNormalMaterial` (interviewed vertex normals only) | none | 0.002 |

The entire ribbed/banded/wavy finish disappears when the *normal map* is removed and
survives untouched when the custom channel shader is removed. It is not polygon
faceting: `MeshNormalMaterial` renders the interpolated vertex normals and is flat to
0.002 rms, so the silhouette normals are already smooth across the body.

Cause: `brushedNormal()` draws 78 sinusoidal stripes per tile and the map is repeated
`t.repeat.set(3, 26)` in v. Over the outer profile that is ~1 200 stripes across a 310 mm
body — a **0.26 mm** surface pitch. The macro resolves **0.086 mm/px**, so the stripe is
~3 px and under-sampled; it beats against the pixel grid into a 5.2 px moiré. The `wob`
term (0.6 rad phase wobble, 3 cycles/tile) adds the slow *waviness* on top of the ribs.

Three separate interface faults compound it:
* `uv[o*2+0] = j/(cols-1)` — u is the **column index**, not the angle. The 64 dense
  channel columns span 0.19 rad and the 200 uniform columns span 6.09 rad, so texels are
  stretched ~10× across the seam — the one place a viewer looks.
* `uv[o*2+1] = i/(rows-1)` — v is the **ring index**, not arc length. Stripes bunch at the
  shoulder and thin at the waist, so the pitch steps at every control point.
* profile sampled at 3 rings/segment, so a 45° chamfer is 3 faces and the highlight
  breaks there.

## 2. The seam does not read as the source because the emitter is sub-pixel

`CHANNEL`'s emissive band is `|f| < 0.2`, i.e. **0.9 mm of arc** at r≈78 mm. The hero
resolves ~0.94 mm/px, so the whole emissive element is one pixel wide — raising `uGlow`
from 0.45 to 1.85 lights one pixel and is invisible. The mask is not the bug; the
*element* is too small to exist on screen. Measured: 1 px.

## 3. Mobile overflow: 9 px, owned by the scrim pseudo-elements

Hard 390 px viewport, `isMobile:false` so the layout viewport cannot shrink-to-fit:
`documentElement.scrollWidth = 399`, `innerWidth = 390`.

A child-removal bisect (`tools/overflow-bisect.mjs`) only clears at `main#main`; every
pseudo-element sits outside the DOM, so the bisect cannot see it. Killing all
`::before/::after` drops scrollWidth to **390** (`tools/overflow-pseudo.mjs`).
`tools/overflow-pseudo2.mjs` names the boxes:

* `section#top.sec.sec--hero::before` — `position:absolute; left:-9px; right:-9px; width:408px`
* `div.sec__inner::before` (×5, sections 02–05) — same bleed

The rule is `left:calc(var(--pad) * -0.5); right:calc(var(--pad) * -0.5)` in the
`max-width:900px` block; `--pad` is 18 px so each scrim bleeds 9 px past the viewport.
`body{overflow-x:hidden}` was masking it and is the blanket clip we were asked not to
rely on. The bleed is pointless where the containing block already spans the viewport.
