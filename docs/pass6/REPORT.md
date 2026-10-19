# Pass 6 — the body is an asset

Three passes tried to make a milled slot out of a shader: material, then normal maps, then a
wider rebate. Each moved a number; none changed what a person sees. This pass stopped tuning
pixels and authored the object.

## Geometry — `tools/asset/build_vesper.py`

The approved silhouette is untouched: `OUTER` is the same metre table, so every check the site
makes about the object's shape still holds.

The slot is cut into the shell as a real cross-section, not a texture:

| | |
|---|---|
| aperture | 14.0 mm |
| depth | 6.5 mm |
| lip chamfer | 45°, 1.1 mm |
| lip land | 0.45 mm flat |
| throat | 4.7 mm at 5° draft |
| floor | 8.6 mm wide, filleted 0.25 mm |
| edge breaks | 0.10–0.18 mm |

Read back off the shipped vertex buffer (in-page probe, not the design table): depth
**6.50 mm**, half-width **6.87 mm**, floor radius 0.0687 m against a 0.0752 m profile.

The light-pipe is a separate mesh — a 5.4 mm blade standing in the slot whose crown stops
**1.35 mm** under the lip land and whose body reaches the floor, tapered over its last 90 mm
so the ends die into the metal. Because the crown sits that high, the lip shades it past 78°
incidence: it cannot be seen from behind, through the silhouette, or from a low three-quarter
where a real lamp would not show it. The earlier version put the diffuser on the floor, 3.95 mm
down; measurement showed it was contributing nothing at the hero angle at all (hiding it
changed 1.5 % of the frame, none of it at the slot). A recess you cannot see into is not a
recess, it is a line.

## Shading — `tools/asset/bake_tex.py`, `compose.py`

One 2048² set, one non-overlapping UV island per object:

- **AO**, 96 spp, cage 0.9 mm / 2.0 mm max ray.
- **Normal**, from a subdivided hipoly displaced by object-space micro-structure: directional
  stretches 60×4 mm, 26×2 mm, 11×1.1 mm at 55/30/14 % weight, plus isotropic grain at 2.60 /
  1.20 / 0.75 mm, amplitudes 120 µm and 16 µm. No two octaves share a period, so there is no
  ring to beat against the pixel grid — the earlier build read as lathe rings at hero scale and
  the long stretches were cut back for that reason. Across-slope rms 0.0559 ≈ 3.2°.
- **Roughness**, bent by baked curvature (edges polish, the throat stays matte), packed with AO
  and metallic into ORM.
- **Base colour**, normalised, no seam, no gradient.

Packing happens in PIL outside Blender: doing it inside Blender's Python was killing the
process. Export is glTF with WebP q92 — **6.0 MB**, 107,789 tris, 16-bit indices per mesh.

## Integration — `js/scene3d.js`

The procedural lathe, `channelify`, the brushed-normal tile and the shader-drawn glow are all
deleted. The page loads `assets/vesper-01.glb?v=7` through a vendored `GLTFLoader`, binds base /
ORM / normal to the finish, and keeps the approved camera, chapters, finishes, PMREM studio and
light rig. `compile()` awaits the load so the first live frame is the frame the poster shows.
The query tag is load-bearing: without it a returning visitor keeps the previous body for as
long as the cache header allows.

`bodyMat.dithering = true` — the shoulder is a long smooth gradient across an 18 cm form, and
without dither it quantised to 8-bit steps that read as banding (plateau fraction on a vertical
cut: 0.40 → 0.36, and the steps stop being flat).

## Proof — `docs/pass6/shots/`

- **hero-desktop.png** (1440×900): the object occupies 470×560 px, i.e. 0.509 mm/px, so the
  14 mm aperture is **27.5 px wide at hero framing**.
- **phone-390.png** (390×844).
- **slot-1to1.png** — native pixels, no resampling — and **slot-3x.png**. Lip chamfer, throat
  wall, filleted floor and the blade are all legible; the blind read of the 3× crop returns
  "clearly machined with visible depth… a warm, pale yellow glow inside the recess".
- **rotate-a.png / rotate-b.png**: the same frame with the object turned 0.62 rad; the spill
  pattern turns with the helix. `verify.mjs` asserts the same thing numerically ("the spill
  turns with the object").
- Slot luminance 27–48 against a 144 shoulder — a 3–5× drop, i.e. a recess, not a decal.

`node tools/verify.mjs` → **39/39 passed**, including "the channel is milled into the mesh, not
drawn on it".

## Limits, stated plainly

- At hero framing the slot reads as a **dark milled seam with a pale amber core**, not a neon
  strip: 269 px above warm>25 in the 1:1 crop, peak 38. That is the geometry telling the truth.
  The camera sits 4.6° above the slot, which is ~70° off the slot's normal where the helix
  crosses the body, and the lip shadows most of the blade there. Face-on it is continuous. The
  site's own copy promises the surface does not glow — this is that promise, kept.
- All numbers above were taken under SwiftShader (ANGLE/SwiftShader on this container). They are
  evidence about the asset and the probes, not about the owner's GPU.

## Live

Deployed with `tools/deploy.sh`; Pages build green. Live parity checked by hash on
`assets/vesper-01.glb` (238b8b66774f) and the three vendored modules, and by probe against the
live URL: 51,643 body vertices, slot depth 6.50 mm, blade crown 1.35 mm, baked maps bound.
Frame: `docs/pass6/shots/live-hero.png`.

## Reproducing

```
HOME=/opt/data /opt/data/tools/blender-4.5.9/blender -b --factory-startup -P tools/asset/build_vesper.py
RES=2048 RES_C=2048 AO_SAMPLES=96 /opt/data/tools/blender-4.5.9/blender -b assets/asset/vesper.blend \
  -P tools/asset/bake_tex.py -- hipoly ao norm curv vary
python3 tools/asset/compose.py
/opt/data/tools/blender-4.5.9/blender -b assets/asset/vesper.blend -P tools/asset/bake_tex.py -- export
```

`assets/asset/` (blend + maps, 38 MB) is gitignored; the scripts regenerate it.
