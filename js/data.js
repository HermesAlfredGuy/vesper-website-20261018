/* VESPER — product data.

   Pass 2 ─ the numbers here are what the material actually does, and cast aluminium is
   a grey metal: the finishes no longer carry a high-gloss specular (a roughness of 0.38
   on a metalness of 0.86 is polished, not bead-blasted) and they no longer mirror a warm
   environment into a champagne highlight that competes with the channel.

   Kept free of any three.js import so the page's copy, controls and state are fully
   usable the moment the document paints; the WebGL stage loads these same objects
   later, on its own, without blocking the first view. */

export const FINISHES = [
  { id: 'foundry', name: 'Foundry', sub: 'raw cast aluminium', swatch: '#b3afa6',
    // a satin metal, not a mirror: metalness 0.74 leaves just enough diffuse albedo for
    // the body to keep its own neutral grey when the room is entirely amber, which is
    // what stops raw aluminium reading as bronze
    color: 0xb6b3ac, metalness: 0.74, roughness: 0.46, env: 1.85,
    blurb: 'Bead-blasted and left unsealed. It keeps the fingerprints of the room.' },
  { id: 'umber', name: 'Umber', sub: 'burnt bronze', swatch: '#6b4527',
    color: 0x6b4527, metalness: 0.90, roughness: 0.42, env: 1.20,
    blurb: 'Bronze PVD over aluminium, oxidised to the colour of a coal that has gone out.' },
  { id: 'slate', name: 'Slate', sub: 'anodised charcoal', swatch: '#3a3d41',
    color: 0x393c40, metalness: 0.78, roughness: 0.56, env: 0.95,
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
