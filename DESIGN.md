# VESPER — art direction

**Concept.** A sculptural portable light, presented as an object you *carry a room inside*:
one machined column with a helical seam that throws atmosphere onto whatever surface is near it.
The page is a dusk walk through one room: you watch an object become the only light in it.

Personality: **quiet, exacting, tactile.** Anti-reference: **not** a dark cinematic product
launch with glow-orbs and ambient particles (and not a SaaS hero with a centred badge stack).

## References (inspected, principles only — no assets copied)
1. **Awwwards / Igloo Inc. case study** (image inspected at
   `refs/reference-igloo.jpg`): one monumental object, atmospheric perspective gained from haze,
   a brand colour that exists *only* as emitted light, UI kept to the margins.
   → Borrow: monolith framing, fogged depth, light-as-only-accent, marginal mono UI.
   → Reject: monochrome blue-grey coldness, corner-manifesto layout.
2. **oryzo.ai (Lusion)** — captured `refs/oryzo-*.png`: a single product at the centre of every
   frame, a technical/callout layer (dashed guides, measured handles) used as *information*, and
   huge editorial type that overlaps the render rather than sitting beside it. Four-colour palette.
   → Borrow: object permanence across the whole scroll, callouts as real spec annotation,
   sharp/soft type contrast, seamless scene-to-scene continuity.
   → Reject: green+orange palette, joke framing, particles.
3. **iyo.ai / products/iyo-one** — captured `refs/iyo-0_02.png`: a configurator that stays legible
   (dark translucent summary card, explicit "YOUR CONFIGURATION", honest `$0` deposit) while the
   product is cropped at the frame edge for scale.
   → Borrow: config summary card pattern, cropped-object scale drama, honest reservation language.

## Type
- **Display — Instrument Serif** (400 + italic). Editorial, high contrast, slightly condensed.
  Hero 9.4vw→ clamp; section display 4.2–6.6vw; leading 0.88–0.95; tracking −0.015em.
  One italic word per headline carries the emotional beat ("different", "as you *carry* it").
- **Text/UI — Instrument Sans** (variable 400–600). Body 17–19px / 1.6; labels uppercase
  10–11px, tracking 0.18em.
- **Technical — IBM Plex Mono** 400. Only numerals, dimensions, kelvin, callout indexes.
  This is the "instrument" voice: it makes spec claims read as measurements, not marketing.
- Never more than these three. No second display face, no gradient text.

## Colour (roles)
| role | value | use |
|---|---|---|
| ink | `#14110E` | text on plaster, night ground |
| bone | `#EFE7D9` | plaster daylight ground, text at night |
| stone | `#9A9184` | secondary text, hairline rules |
| graphite | `#2A2521` | surfaces, card, night panels |
| **emission** | *from the scene only* | `#FFB464` hearth, `#FF8A3D` ember, `#FFD7AE` vesper, `#BBD4E4` meridian |

Rule: **the only warm colour on the page is light the product emits.** UI accent is bone/ink
and hairlines — never orange chrome. This is what keeps it out of the "black + orange" default.

## Composition
- 12-column editorial grid, generous outer margins (clamp 20px → 72px), asymmetric content:
  type occupies the left 5–6 columns, the object owns the right, mono annotations sit in the
  far-right margin attached by hairlines. Nothing is centred except one deliberate moment.
- **Signature layout move:** the object is *continuous* — one fixed WebGL stage behind every
  section, re-framed like a camera operator following a sculpture. Text columns pass in front of it.
- Rhythm by tone: dusk (hero) → dark (seam) → night (atmosphere) → **plaster daylight**
  (materials — the only place finishes read true) → daylight (specs/drawing) → night (reserve).
- Type wins on the left, luminosity wins on the right. Exactly one winner per viewport.

## Imagery / 3D
All real-time Three.js, no stock renders:
- Body: closed-shell lathe (cast aluminium, 348 mm) with a real helical **slot cut by shader
  discard**, revealing an emissive diffuser core inside. The slot is geometry-honest: light
  comes out of a gap, not a decal.
- Oval plan (x-scale 1.24) so the silhouette is a sculpture, not a tin can.
- Plaster wall + floor with procedural grain/bump; raking key light to reveal it.
- Atmospheric depth via `THREE.Fog` matched to the mood, so the room dissolves instead of ending.
- Wall/floor light **spill is a purpose-built shader plane** driven by the same seam phase as the
  slot: turning the object sweeps the pool of light, changing atmosphere re-colours it.
- Glow from two additive radial sprites — no postprocessing pass (chosen deliberately: it is
  cheaper, works on software GL, and has no unverifiable "high tier" path).

## Motion language
Tone: **slow, weighted, like moving a lit object in a dark room.** One timeline owner: a single
`requestAnimationFrame` scroll/ease driver (`js/stage.js`). No Lenis, no second smoothing engine.
- Durations 0.6–1.6 s; ease `cubic-bezier(.16,1,.3,1)`; damped follow `1-exp(-dt/τ)`, τ = 90–260 ms.
- **Signature motion — "the sweep":** dragging the object winds the seam; the wall spill follows
  with real lag, and the slot's own brightness pulses slightly as it comes round to face you.
- Scroll moves the **camera through Z** (dolly + arc), never a 2D parallax of the object.
- Scene transition: the room's mood lerps dusk→night→plaster-daylight between sections, with the
  plaster grain sharpening as light rakes across it. This is a story beat, not a filter.
- Type: per-line clip-path masks with 80 ms stagger; hairline callouts draw with SVG dash offset.
- Reduced motion: no camera travel, no idle drift, no sweep animation on scroll; direct cuts,
  gentle opacity only. Drag-to-inspect and the configurator remain fully functional.

## Accessibility
- Body text ≥ 4.5:1 on its own ground (each section owns an explicit ink/bone pairing).
- Visible focus ring (2px bone/ink offset 3px); skip link; modal is a real `<dialog>` with focus
  trap + Esc + return focus; all controls ≥ 44px on touch; `aria-live` for config readout.
- Product state is announced (`aria-pressed` on swatches), never colour-only.
- Canvas is decorative-with-equivalent: the poster image + the spec table carry the content.
