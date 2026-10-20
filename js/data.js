/* VESPER — product data.

   Pass 3 ─ cast aluminium is a *metal*, so the body is metalness 1.0: its colour is the
   light it mirrors, tinted by a cool, desaturated albedo, and nothing else. Pass 2 kept
   0.74 so the body would hold a diffuse grey under a warm room, which is the wrong trade:
   a metal with 26 % diffuse reads as glazed ceramic — the exact note the director gave.
   The room is now neutral where it hits the body, so the metal can be a metal.

   Kept free of any three.js import so the page's copy, controls and state are fully
   usable the moment the document paints; the WebGL stage loads these same objects
   later, on its own, without blocking the first view. */

export const FINISHES = [
  { id: 'foundry', name: 'Foundry', sub: 'raw cast aluminium', swatch: '#b3b7bc',
    // bead-blasted, unsealed, 0.40 roughness: satin, not mirror. The albedo is a cool
    // grey with almost no chroma, which is what stops a warm room turning it to bronze.
    // Pass 3b ─ env 2.6: at metalness 1.0 the body's value IS the environment it mirrors, and
    // at 1.30 it mirrored a dark neutral room and read as black ceramic. The studio is
    // neutral, so more of it is what makes the metal sit at aluminium's value, not warmer light.
    // 1.72, not 2.40. The soft-edged rig has the same mean energy as the hard-edged one
    // (measured off the ramp: 0.4717 mean, so the cards are scaled by 2.12) but it spreads
    // it, and at roughness 0.42 the metal integrates that spread over a much wider lobe.
    // Held at 2.40 the body's p50 measured 100.9 counts against a brief target of ~69: a
    // light grey column, not the dark cast aluminium the whole page is set around.
    color: 0xc6cbd2, metalness: 0.85, roughness: 0.42, env: 1.72,
    blurb: 'Bead-blasted and left unsealed. It keeps the fingerprints of the room.' },
  { id: 'umber', name: 'Umber', sub: 'burnt bronze', swatch: '#6b4527',
    color: 0x7d5330, metalness: 1.0, roughness: 0.46, env: 1.10,
    blurb: 'Bronze PVD over aluminium, oxidised to the colour of a coal that has gone out.' },
  { id: 'slate', name: 'Slate', sub: 'anodised charcoal', swatch: '#3a3d41',
    color: 0x4a4f55, metalness: 1.0, roughness: 0.60, env: 1.05,
    blurb: 'Deep anodising, fine-blasted. Reads black until light rakes across it.' },
  { id: 'bone', name: 'Bone', sub: 'chalk ceramic', swatch: '#ded5c4',
    color: 0xded5c4, metalness: 0.0, roughness: 0.86, env: 0.62,
    blurb: 'Sprayed ceramic, matte to the touch. The warmest thing in a white room.' },
];

export const ATMOSPHERES = [
  { id: 'ember', name: 'Ember', kelvin: '1 850 K', temp: 1850, color: 0xff7a2e, swatch: '#ff7a2e',
    spill: 0xff7a35, lumen: '34 lm', blurb: 'A coal, not a lamp. Enough light to find a glass.' },
  { id: 'hearth', name: 'Hearth', kelvin: '2 400 K', temp: 2400, color: 0xffa955, swatch: '#ffa955',
    spill: 0xffa053, lumen: '96 lm', blurb: 'The colour of the last hour of a room.' },
  { id: 'lumen', name: 'Lumen', kelvin: '3 000 K', temp: 3000, color: 0xffd2a0, swatch: '#ffd2a0',
    spill: 0xffcb9a, lumen: '190 lm', blurb: 'Neutral warm. It flatters skin, paper and plaster.' },
  { id: 'meridian', name: 'Meridian', kelvin: '4 600 K', temp: 4600, color: 0xbdd6e8, swatch: '#bdd6e8',
    spill: 0xb0cfe2, lumen: '240 lm', blurb: 'Cold, clean, slightly unreal. For working late.' },
];

/* The object's rest orientation, in radians — where the seam sits at load.

   Pass 8 shot seven rest angles and cut square across the channel in each
   (docs/pass8/shots/rot-*.png, tools/pass8_seam.py): at 0 deg the core above L 100 is
   10.0 px wide with a throat 49 below the metal; at -15 deg it is 11.5 px and 46 below,
   with the core at L 137 instead of 131 — a wider facing section for the same recess.
   Past -25 the throat starts to fill with bloom and +10 merges the core into the
   specular flank, so -15 is the widest fully-modulated section. It lives in the data module because both owners
   need it: scene3d.js applies it to the object's rotation, and main.js's slider maps 0 to
   it, so the control's rest pose and the first painted frame cannot disagree. */
export const REST = -0.2618;
