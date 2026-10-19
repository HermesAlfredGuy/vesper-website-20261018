# VESPER — pass 4/5 summary

Measured detail: `docs/pass2/REPORT.md`.

**Finish.** Ablation put the banding in the normal map, not the polygons:
nulling `normalMap` dropped macro rms 0.103→0.004, deleting the channel shader changed
nothing. The map carried 1 200 rings at a 0.26 mm pitch — a stripe every 1/11 px at the hero.
Re-authored at real scale (512² = 64 mm, 4 mm pitch), rings resampled by surface angle. Ring
audit against the profile: residual 0.00 mm, so the outline is the designed curve, not a
lumpy 30-gon.

**Seam.** The glow sat in a 0.9 mm arc — one pixel, which is why intensity 0.45→1.85 moved
the groove less than one count. Replaced with geometry: a 4.8 mm opal tube on the helix,
3.4 mm under the surface, occluded by the lips through the depth test; emissive is now only
a bounce. Spill: gain ramp removed, blur 0.008→0.005, knee 1.05→0.45 so the band keeps an
edge instead of flattening into a pool.

**Overflow.** Two `::before` scrims bleeding `--pad/2`; pinned to the viewport, blanket
`overflow-x: hidden` deleted. 360/390/414 px clean.

**Performance.** All numbers are SwiftShader — not evidence about the owner's 4070. Startup
was one 10.5–12 s uninterruptible task (9.9 s shader compile; geometry 26 ms). Now one mesh
compiled per task with a yield, shadow map 4096→2048 (frame 5.7→1.1 ms), a 2.4 Mpx buffer
budget, an adaptive 60/30 fps budget, one rAF loop.

**Interaction.** grab/grabbing cursor, touch scroll intact. 20 finish checks across
pre-load, mid-load, scrolling and dragging: 0 mismatches, 71.3/255 pixel difference.
`verify.mjs` 39/39. Deploy: pushed; Pages build queued upstream, parity unconfirmed.
