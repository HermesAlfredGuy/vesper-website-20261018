# Pass 2 — evidence

Everything here was captured from the running page at `http://127.0.0.1:9311/`, headless, on
software rendering (`--use-angle=swiftshader`). No frame is a mock-up, a design file or a
re-render from a separate scene: the same `index.html`, the same `js/scene3d.js`, at two real
viewport sizes.

Frame sizes below are the *delivered* sizes; each was shot supersampled at deviceScaleFactor 2
and downscaled with Lanczos, which is the only post-processing applied. Nothing is retouched,
sharpened or colour-graded.

## Screenshots — 1440 × 900

| file | what it shows |
| --- | --- |
| `shots/desk-top.png` | the hero: the object, the channel with its light line, the dock, the left chapter rail |
| `shots/desk-object.png` | the object chapter, close: the milled channel and the lip shadow |
| `shots/desk-atmosphere.png` | the atmosphere chapter with the output control and the four presets |
| `shots/desk-materials.png` | the four finishes, on the object |
| `shots/desk-specification.png` | the drawing, the dimension table and the 1:1 channel macro |
| `shots/desk-reserve.png` | the reservation chapter, with the dock stood down and one action |

## Screenshots — 390 × 844

The same six chapters, in the phone layout: the whole object above the copy in the hero, the
gradient scrim instead of a panel, labelled swatch groups, and the reduced dock.

| file | what it shows |
| --- | --- |
| `shots/mob-top.png` … `shots/mob-reserve.png` | the six chapters at 390 × 844 |

## Macro

| file | what it shows |
| --- | --- |
| `shots/macro-1440.png` | the channel at 1:1: floor, two lips, edge break, the diffuser line, and the light it throws |
| `shots/macro-390.png` | the same, framed for the phone |

## Film

`vesper-pass2-film.mp4` — the signature interaction, rendered frame by frame from the real page
(1280 × 720, 12 fps, 13.8 s). The camera is driven by real scroll positions and the controls are
really clicked; every frame is settled to its final damped value before it is captured, so a slow
renderer cannot leave the scene mid-transition. It shows the object turning and the light pattern
turning *with* it — the thing that was broken in pass 1, where the pattern stayed in the room while
the object rotated under it.

The 166 frames are **not** committed (they are 18 MB of intermediate state). Regenerate and
assemble them with:

    node tools/film.mjs http://127.0.0.1:9311/index.html docs/pass2/film 1024 576
    bash tools/film.sh docs/pass2/film docs/pass2/vesper-pass2-film.mp4 12

The frames are rendered at 1024 × 576 and assembled to 1280 × 720: 166 frames at 1280 × 720 is
about fifty minutes on this container's software renderer, and the difference after Lanczos is not
visible in a dark, slow scene.

## Numbers, and how they were measured

    node tools/probe.mjs  http://127.0.0.1:9311/index.html 1440 900 --settle 6000
    node tools/probe.mjs  http://127.0.0.1:9311/index.html 390 844 --mobile --settle 6000
    node tools/verify.mjs
    node tools/text-contrast.mjs http://127.0.0.1:9311/index.html 1440 900 4.5
    node tools/perf.mjs   http://127.0.0.1:9311/index.html 1440 900

The luminance and exposure figures quoted in `README.md` come from a Python/PIL pass over these
PNGs, not from the browser: sRGB is linearised, then relative luminance is taken as
`0.2126 R + 0.7152 G + 0.0722 B`. The body strip is `x 994–1034, y 180–660` of `desk-top.png`,
which is inside the object and clear of the channel and of the background.
