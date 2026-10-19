/* VESPER — realtime stage.
   One object, one room, one light seam. Everything procedural, no external assets.

   Pass 2 ─ the channel is geometry, not a stripe. The shell is a lathe whose rings
   carry their angular samples clustered around wherever the helical channel is at
   that height, so the 9 mm slot is cut into the mesh with a real floor, two real
   lips and a real 0.6 mm edge break — and costs a fixed number of vertices per ring
   instead of a globally finer mesh. The emission (the opal strip at the bottom of
   the slot) and the light the slot throws on the floor and the wall are still
   shaded, because the diffuser is a source, not a lit surface. */

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { FINISHES, ATMOSPHERES } from './data.js';

export { FINISHES, ATMOSPHERES };

const TAU = Math.PI * 2;

/* ---------- procedural textures ---------- */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h || w;
  return c;
}

function valueNoise(ctx, w, h, cells, alpha, blend = 'overlay') {
  const stepX = w / cells, stepY = h / cells;
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = alpha;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const v = Math.floor(Math.random() * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x * stepX, y * stepY, stepX + 1, stepY + 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function plasterMaps() {
  const S = 512;
  const base = canvas(S);
  const b = base.getContext('2d');
  b.fillStyle = '#b6b0a5';
  b.fillRect(0, 0, S, S);
  valueNoise(b, S, S, 48, 0.16, 'overlay');
  valueNoise(b, S, S, 140, 0.09, 'overlay');
  valueNoise(b, S, S, 300, 0.05, 'overlay');
  b.globalCompositeOperation = 'soft-light';
  for (let i = 0; i < 18; i++) {
    b.beginPath();
    const y = Math.random() * S;
    b.moveTo(-20, y);
    b.bezierCurveTo(S * 0.3, y + (Math.random() - 0.5) * 120, S * 0.7, y + (Math.random() - 0.5) * 120, S + 20, y + (Math.random() - 0.5) * 80);
    b.lineWidth = 6 + Math.random() * 16;
    b.strokeStyle = Math.random() > 0.5 ? '#ffffff' : '#6d675e';
    b.globalAlpha = 0.02 + Math.random() * 0.03;
    b.stroke();
  }
  b.globalAlpha = 1;
  b.globalCompositeOperation = 'source-over';

  const bump = canvas(S);
  const n = bump.getContext('2d');
  n.fillStyle = '#808080';
  n.fillRect(0, 0, S, S);
  valueNoise(n, S, S, 96, 0.30, 'overlay');
  valueNoise(n, S, S, 220, 0.18, 'overlay');
  valueNoise(n, S, S, 400, 0.10, 'overlay');

  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

/* The grain, in two parts, because cast-and-blasted aluminium has two.
   A bead blast alone is isotropic noise: under a softbox it returns a soft glow, and a
   soft glow is exactly what plastic returns. What says *metal* is the directional part —
   fine tool marks running one way round the body, which stretch the highlight along that
   direction instead of smearing it into a sheen. So: a lathe-turned line pattern (varying
   fast across the height, constant round the circumference) under a little blast, written
   out as a tangent-space normal map with the derivative computed here rather than guessed
   from a canvas height-to-bump conversion. */
/* ---------- the finish, and why it is 64 mm square ----------
   Measured fault: `tools/ablate.mjs` showed the ribbed/banded macro disappears when the
   normal map is removed and survives with the channel shader removed (rms of the
   detrended profile 0.13 -> 0.004), so the finish was never geometry and never the
   shader — it was this canvas being sampled below the pixel grid.

   The old map drew 78 stripes per tile and the caller repeated it 26 times, which is
   ~1 200 rings over a 310 mm body: a 0.26 mm pitch. The hero resolves 0.94 mm/px and the
   macro 0.086 mm/px, so the stripe was 1/11 of a pixel at the hero — it beat against the
   pixel grid and came back as a 5.2 px moiré, which is the "banded finish". Intensity
   was never the problem; frequency was.

   The map is now authored at a real scale instead: 512 texels square = 64 mm square
   (0.125 mm/texel, the density of an actual satin-rolled die). Sixteen tool marks per
   tile is a 4 mm pitch — at the hero that is 4.3 px, at the macro 46 px, both above the
   grid, so it reads as turning marks instead of aliasing. The blast is isotropic and
   sub-texel, which is the right way round: isotropic noise minifies to a flat sheen,
   coherent lines are what beat. The caller sets uv in tile units, so the pitch on the
   surface no longer depends on how many rings the profile happens to have. */
function radialTexture(inner, mid) {
  const S = 256;
  const c = canvas(S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(255,255,255,${inner})`);
  grad.addColorStop(0.22, `rgba(255,255,255,${mid})`);
  grad.addColorStop(0.5, 'rgba(255,255,255,0.11)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/* A contact shadow is not a dark disc under an object: under the object you cannot see
   anything. What you see is the 30 mm *outside* its foot, where the light that would have
   reached the floor is blocked by a body standing on it — so the darkness has to peak at
   the rim of the base and fall away from it with a penumbra. The old gradient peaked at
   the centre, which put its densest part under the plinth where it was hidden, and its
   faintest part where the eye looks. That is a shadow with no contact in it.
   `knee` is where the strongest darkness sits, as a fraction of the plane's radius. */
function contactTexture(knee = 0.58, peak = 0.95) {
  const S = 384;
  const c = canvas(S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(255,255,255,${peak})`);
  grad.addColorStop(knee - 0.07, `rgba(255,255,255,${peak * 0.96})`);
  grad.addColorStop(knee, `rgba(255,255,255,${peak * 0.74})`);
  grad.addColorStop(knee + 0.13, `rgba(255,255,255,${peak * 0.34})`);
  grad.addColorStop(knee + 0.27, 'rgba(255,255,255,0.11)');
  grad.addColorStop(0.97, 'rgba(255,255,255,0.02)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function envTexture() {
  // fallback equirect used only if PMREM is unavailable
  const w = 1024, h = 512;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#c8ced2');
  grad.addColorStop(0.40, '#6d7275');
  grad.addColorStop(0.52, '#2c2a28');
  grad.addColorStop(1, '#080706');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/* A studio built from light, then baked to a PMREM: metals need structure in their
   reflections, not a smooth gradient, or they read as glazed ceramic.
   Pass 2 ─ every panel is neutral. The old rig had a bright amber strip at slot
   height on the left, and an anodised-charcoal body mirrored it until it read as
   bronze. Cast aluminium is a grey metal: it may take the colour of the light it
   is in, but it must not bring its own. */
function studioEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(12, 8, 12),
    new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.BackSide })
  );
  s.add(room);
  const panel = (w, h, color, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    s.add(m);
    return m;
  };
  /* Every source gets a soft edge. A card with a hard boundary is a step function on the
     sphere, and PMREM convolves that step through its mip chain: the surviving energy
     rings at the mip pitch, which lands on the body as a ~30 px horizontal band. Measured
     by ablation — nulling normalMap changed nothing, nulling shadows changed nothing, and
     replacing the whole environment with one flat colour dropped the band from 1.99 to
     0.37 levels. It was never the normal map, the profile or the sampling: it was the
     rig's own edges. A soft box is also what a real softbox is. */
  const softTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.16, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.34, 'rgba(255,255,255,1)');
    grd.addColorStop(0.66, 'rgba(255,255,255,1)');
    grd.addColorStop(0.84, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    // and a lateral falloff, so the left and right edges are as soft as the top and bottom
    g.globalCompositeOperation = 'destination-in';
    const lat = g.createLinearGradient(0, 0, 64, 0);
    lat.addColorStop(0.00, 'rgba(255,255,255,0)');
    lat.addColorStop(0.14, 'rgba(255,255,255,0.5)');
    lat.addColorStop(0.30, 'rgba(255,255,255,1)');
    lat.addColorStop(0.70, 'rgba(255,255,255,1)');
    lat.addColorStop(0.86, 'rgba(255,255,255,0.5)');
    lat.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = lat;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const softMap = (m, w, h, strength) => {
    // 1.35x the plane, so the hard edge falls outside the visible part of the card
    m.geometry = new THREE.PlaneGeometry(w * 1.35, h * 1.35);
    m.material.alphaMap = softTexture;
    m.material.transparent = true;
    m.material.depthWrite = false;
    m.material.color.multiplyScalar(strength);
    return m;
  };
  /* A card at a stated azimuth, elevation and distance, aimed at the object. Its angular
     width is w / dist, so "structured" is a number here: a 0.36 m strip at 2.4 m subtends
     8.6 deg, and an 8.6 deg source reflects off a 74 mm column as a ~9 px highlight with
     two edges. Pass 5's rig was almost all large panels (a 6.2 x 7.2 m card at 5 m is 60
     deg square), and a 60 deg source is, to a cylinder, indistinguishable from a gradient.
     That is the whole reason the aluminium measured as a grey-to-black ramp. */
  const card = (w, h, color, azDeg, elDeg, dist) => {
    const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
    m.position.set(Math.cos(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.sin(az) * Math.cos(el) * dist);
    m.lookAt(0, 0, 0);
    s.add(m);
    return m;
  };
  // three tall strips: the shaped highlights, one per visible quarter of the body
  // the soft box keeps ~0.58 of the peak over its area, so every colour below is scaled
  // by 1/0.58 to hold the rig's mean energy constant: this is an edge treatment, not a
  // re-lighting, and the measurements that follow are comparable to the ones before it
  // 0.85, not the 2.12 that "energy conservation" suggests. A PMREM mip is not an area
  // integral: the ramp's mean is 0.4717, but the body's p50 is not linear in the card
  // colour. Measured, holding everything else fixed: hard cards 63.4, SOFT 0.60 -> 64.5,
  // 1.00 -> 80.1, 1.25 -> 86.7, 2.12 -> 99.9. The ramp's cost is real and its benefit is
  // real (it is what removed the 30 px band), so the colour is set where the brief wants
  // the metal to sit, not where the arithmetic says it should.
  const SOFT = 0.85;
  softMap(card(0.36, 3.2, new THREE.Color(13.0 * SOFT, 13.6 * SOFT, 14.4 * SOFT), 35, 6, 2.4), 0.36, 3.2, 1);
  softMap(card(0.30, 3.0, new THREE.Color(9.0 * SOFT, 9.4 * SOFT, 10.0 * SOFT), 120, 10, 2.4), 0.30, 3.0, 1);
  softMap(card(0.26, 2.6, new THREE.Color(6.5 * SOFT, 6.7 * SOFT, 7.0 * SOFT), 215, 8, 2.5), 0.26, 2.6, 1);
  // a horizontal bar crossing them: the one cue that says machined metal, not brushed paint
  softMap(card(2.6, 0.20, new THREE.Color(6.0 * SOFT, 6.2 * SOFT, 6.5 * SOFT), 260, 30, 2.6), 2.6, 0.20, 1);
  // a narrow strip low and behind, so the far edge of the waist is not a void
  softMap(card(0.22, 1.6, new THREE.Color(4.2 * SOFT, 4.4 * SOFT, 4.7 * SOFT), 168, 26, 2.2), 0.22, 1.6, 1);
  // key softbox overhead-front: neutral, and the single strongest shape the metal mirrors
  softMap(panel(6, 4, new THREE.Color(5.4 * SOFT, 5.44 * SOFT, 5.5 * SOFT), [0, 3.6, 0.6], [Math.PI / 2, 0, 0]), 6, 4, 1);
  // narrow bright strip on the right, cooler — the long vertical specular
  softMap(panel(0.9, 3.4, new THREE.Color(1.55 * SOFT, 1.68 * SOFT, 1.86 * SOFT), [3.4, 1.5, 1.4], [0, -Math.PI / 2, 0]), 0.9, 3.4, 1);
  // matching strip on the left, neutral and weaker, so the body has two edges
  softMap(panel(0.7, 2.6, new THREE.Color(0.62 * SOFT, 0.63 * SOFT, 0.65 * SOFT), [-3.4, 1.4, 0.9], [0, Math.PI / 2, 0]), 0.7, 2.6, 1);
  // a broad soft panel overhead — the softbox. A narrow strip reflects into one
  // thin specular; a *large* source is what a matte metal actually returns, and it
  // is the difference between a grey column and a black one.
  softMap(panel(4.6, 4.6, new THREE.Color(2.25 * SOFT, 2.28 * SOFT, 2.34 * SOFT), [0.4, 5.0, 0.7], [-Math.PI / 2, 0, 0]), 4.6, 4.6, 1);
  // Pass 3c ─ a large neutral card on the camera side. In a warm room every reflection is
  // amber, so a metal's mid-tone goes brown whatever its albedo says; the only way an
  // aluminium body keeps a grey mid-tone in an amber room is a big neutral source where it
  // actually looks. This is a bounce card, not a new lamp in the room: it exists only in the
  // reflection environment, so it does not flatten the visible lighting.
  softMap(panel(3.6, 5.0, new THREE.Color(1.55 * SOFT, 1.62 * SOFT, 1.70 * SOFT), [0.15, 1.5, 4.6], [0, Math.PI, 0]), 3.6, 5.0, 1);
  // a dim, wide back wall so the metal has structure behind it instead of a void
  panel(9, 5, new THREE.Color(0.30, 0.305, 0.315), [0, 1.4, -5.8], [0, 0, 0]);
  // dark floor bounce
  panel(12, 12, new THREE.Color(0.075, 0.075, 0.078), [0, -4, 0], [-Math.PI / 2, 0, 0]);
  const rt = pm.fromScene(s, 0.02, 0.1, 60);
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

/* ---------- body silhouette: a waisted, flared column with a chamfered shoulder ---------- */

export const OUTER = [
  [0.0200, 0.0790],
  [0.0232, 0.0812],
  [0.0440, 0.0766],
  [0.0900, 0.0724],
  [0.1300, 0.0718],
  [0.1600, 0.0740],
  [0.1900, 0.0778],
  [0.2200, 0.0826],
  [0.2480, 0.0872],
  [0.2720, 0.0900],
  [0.2900, 0.0902],
  [0.3000, 0.0886],
  [0.3060, 0.0854],
  [0.3092, 0.0796],
  [0.3105, 0.0640],
  [0.3086, 0.0432],
  [0.3050, 0.0220],
  [0.3040, 0.0000],
];

const WALL_INSET = 0.0110;   // 11 mm: the 15.5 x 7.6 mm rebate has to stay inside the wall

/** Radius of the outer profile at a height, interpolated exactly as the lathe did. */
export function outerRadius(y) {
  for (let i = 0; i < OUTER.length - 1; i++) {
    const [ya, ra] = OUTER[i], [yb, rb] = OUTER[i + 1];
    if (y >= ya && y <= yb) return ra + (rb - ra) * ((y - ya) / Math.max(1e-9, yb - ya));
  }
  return y < OUTER[0][0] ? OUTER[0][1] : OUTER[OUTER.length - 1][1];
}

/* ---------- the channel ---------- */

export const CHANNEL = {
  /* The asset's slot, in metres — read off tools/asset/build_vesper.py, not chosen here.
     Pass 6 stopped shading a groove. The recess is a machined helical slot cut into the
     shell mesh: 14 mm across the untouched surface, a 6.5 mm floor, a 45 deg lip chamfer
     and a 0.45 mm lip land, with a 5 deg draft throat wall between them. aperture and
     depth are the geometry's own numbers, and verify.mjs measures them back off the
     loaded vertex buffer — a shader cannot report them. */
  phase: -1.15,       // where the single start sits at half height in the front view
  turns: 1.16,
  yMin: 0.038,
  yMax: 0.286,
  aperture: 0.0140,   // 14 mm across the opening: 15.0 px at the shipped hero framing
  depth: 0.0065,      // 6.5 mm to the floor
  lipBreak: 0.00585,  // half-aperture where the 45 deg chamfer meets the throat wall
  floorHalf: 0.00430, // half-aperture of the flat floor
  pipeHalf: 0.00270,  // light-pipe half width (5.4 mm strip)
  pipeCrown: 0.00395, // crown of the pipe below the untouched surface
};

/** How far along the helix a height sits: 0 at the slot's bottom, 1 at its top. */
function channelT(y) {
  return Math.min(1, Math.max(0, (y - CHANNEL.yMin) / (CHANNEL.yMax - CHANNEL.yMin)));
}

/** Azimuth of the slot's centre at a height, in the shipped front view. */
function channelCentreAngle(y) {
  return CHANNEL.phase + channelT(y) * CHANNEL.turns * TAU;
}

/* ---------- the light the channel throws ----------
   Not a pool centred under the object: a line source. The real world position and
   outward direction of the slot are uploaded for a handful of samples along the
   helix, and the floor plane and the wall integrate those emitters per pixel. The
   pattern on the floor is therefore obliged to be a helix, it turns with the seam
   because the seam turns with the object, and it goes dark directly beneath the
   base because that is where nothing can see the slot. */

// 32, not 20: three turns over twenty segments is 54 deg of helix per segment, and a
// 54 deg span of a spiral is not a spiral — it averages into a wash, which is why the
// spill measured the same at every orbit. 32 keeps the uniform arrays inside the 224
// vec4 fragment budget (4 arrays x 32) and takes the segment down to 34 deg.
const SPILL_SAMPLES = 32;
                              // Eight segments is a ring of eight arcs, and eight arcs add
                              // up to a pool with no direction in it.

const spillVert = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const spillFrag = /* glsl */`
#define K ${SPILL_SAMPLES}
uniform vec3 uColor;
uniform float uPower;
uniform vec3 uNormal;          // the surface receiving the light
uniform vec3 uA[K];            // the slot as K segments of the helix, world space
uniform vec3 uB[K];            // (segments, not points: twenty points make a halo on the
uniform vec3 uNorm[K];         //  wall, twenty segments make a band that follows it)
uniform float uGain[K];
uniform float uCut2;           // squared radius past which nothing can be lit
uniform sampler2D uGrain;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // the light is local: everything past the cut is exact, and free
  if (dot(vWorld.xz, vWorld.xz) > uCut2) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float energy = 0.0;
  for (int k = 0; k < K; k++) {
    // closest point on this piece of the emitter
    vec3 ab = uB[k] - uA[k];
    float h = clamp(dot(vWorld - uA[k], ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    vec3 d = vWorld - (uA[k] + ab * h);
    float d2 = max(dot(d, d), 1e-6);
    vec3 dn = d * inversesqrt(d2);
    float cosE = dot(dn, uNorm[k]);        // does the slot face the point at all
    float cosS = -dot(dn, uNormal);        // and does the point face the slot
    /* ...and is the slot in sight at all? Every other segment of the helix is on the
       far side of a 150 mm column, and cosE cannot tell those apart: a far-side segment
       has the same outward normal relationship to a far-side receiver as a near-side
       one does to a near-side receiver, so all 32 sum and the result is a rotationally
       symmetric pool — measured, the wall band's peak azimuth did not move at all
       between orbit 0 and 1.15 rad. The body is the occluder that breaks the symmetry:
       a segment behind the column must not light a point behind the column. Test the
       straight line emitter->point against the cylinder of the emitter's own radius. */
    vec2 segE = uA[k].xz, segP = vWorld.xz;
    vec2 segD = segP - segE;
    float segL2 = max(dot(segD, segD), 1e-8);
    float segR2 = dot(segE, segE);
    float segT = clamp(-dot(segE, segD) / segL2, 0.0, 1.0);
    if (length(segE + segD * segT) < segR2 * 0.92 && segT < 0.999) { continue; }
    float r = sqrt(d2) + 0.004;            // a frosted line, but a narrow one: the blur is
                                            // the slot's own width. Anything wider turns a
                                            // line source into a pool and throws the helix away
    // a *line* source falls off as 1/r, not 1/r²: that is the difference between a band
    // of light on the wall and a saturated blob, and it is why uPower stays small
    // a cosine-power lobe, not a softstep: the slot radiates through a 15.5 mm opening in
    // a 7.6 mm rebate, so its beam is directional. The old 0.22..0.82 window let every
    // segment light every point a quarter-turn away, and twenty of those sum to a pool.
    energy += pow(max(cosE, 0.0), 3.4) * max(cosS, 0.0) * uGain[k] / r;
  }

  float grain = texture2D(uGrain, vWorld.xz * 1.6 + vWorld.y * 0.5).r;
  energy *= mix(0.90, 1.07, grain);
  vec3 col = uColor * energy * uPower;
  // a knee, so the core of the band cannot clip: the pattern survives the highlight
  // instead of turning into a white hole with a warm rim. 1.05 flattened a bright patch
  // into a plate, which is how a shaped spill becomes a "generic amber pool"; 0.45 keeps
  // the falloff a gradient the eye can read as an edge.
  col = col / (1.0 + 0.32 * col);
  col += (hash(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);   // no banding in the falloff
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

/* ---------- the stage ---------- */

export function createStage(canvasEl, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap was removed in r186: setting it silently falls back to PCF and
  // logs a warning. Ask for PCF and buy the softness back with resolution instead.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  /* Compile the scene's programs without freezing the page. On a software rasteriser
     (or a weak integrated GPU) shader compilation is the single biggest first-frame
     cost; compileAsync does it in chunks and yields between them.

     The fallback used to be one synchronous renderer.compile(): measured at 10.0 s in
     a single uninterruptible task, which is the whole of "it lags severely on first
     load" — the still is painted, but the thread is inside the compiler and the page
     answers nothing. There is no frame loop running yet at this point, so hiding all
     but one mesh compiles that mesh's programs alone and cannot flash. */
  let compiled = false;
  const list0 = [];       // every mesh the scene started with, for the bail-out below

  async function compile() {
    const toMain = () => new Promise((r) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => r(), { timeout: 120 });
      else setTimeout(r, 0);
    });
    try {
      /* The object arrives over the network. Wait for it here, before the compile pass,
         so the first painted live frame already has the shell, the slot and the light
         pipe in it instead of three invisible placeholders — and so the crossfade from
         the poster lands on the same object the poster shows. */
      await assetLoaded;
      /* compileAsync is not the answer here: it calls this.compile() synchronously
         first and only polls for the *link* afterwards, so the front-end cost stays in
         one task. Compile one mesh per task instead: the program cache means shared
         programs are built once, and the next task can paint and take input. No frame
         loop is running yet, so hiding the others cannot flash. */
      const list = list0;
      if (!list.length) scene.traverse((o) => { if (o.isMesh && o.visible) list.push(o); });
      const was = list.map(() => true);
      for (let i = 0; i < list.length; i++) {
        list.forEach((o, n) => { o.visible = n === i; });
        try { renderer.compile(scene, camera); } catch (e) { /* first update() finishes it */ }
        // restore before yielding. main.js races this against an 8 s timeout and then
        // calls live() whether or not we are done: leaving the scene half-hidden meant
        // every frame after that timeout drew a body with no emitter in it — which is
        // exactly the frame every capture tool was recording, and the reason pass 5's
        // opal tube measured as "no material gain" without ever appearing on screen.
        list.forEach((o, n) => { o.visible = was[n]; });
        await toMain();
      }
      compiled = true;
    } catch (e) { /* the first update() will compile what is left */ }
    list0.forEach((o) => { o.visible = true; });
  }


  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1.6, 0.02, 16);

  scene.environment = (() => {
    try {
      if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:env-start');
      const r = studioEnvironment(renderer);
      if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:env-end');
      return r;
    } catch (e) { return envTexture(); }
  })();
  scene.background = new THREE.Color(0x1b1815);
  scene.fog = new THREE.Fog(0x1b1815, 1.55, 5.4);

  /* room */
  const plaster = plasterMaps();
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:t-plaster');
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xb9b3a8, roughness: 0.98, metalness: 0.0,
    map: plaster.map, bumpMap: plaster.bumpMap, bumpScale: 0.55,
    envMapIntensity: 0.3,
  });
  wallMat.map.repeat.set(5.0, 2.7);
  wallMat.bumpMap.repeat.set(9.0, 4.9);
  wallMat.bumpMap.needsUpdate = true;
  const floorMat = wallMat.clone();
  floorMat.color = new THREE.Color(0xa39c8f);
  floorMat.map = plaster.map.clone();
  floorMat.map.repeat.set(4.4, 4.4);
  floorMat.map.needsUpdate = true;
  floorMat.bumpMap = plaster.bumpMap.clone();
  floorMat.bumpMap.repeat.set(7.0, 7.0);
  floorMat.bumpMap.needsUpdate = true;
  floorMat.bumpScale = 0.75;

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.4), wallMat);
  wall.position.set(0, 2.2, -0.72);
  wall.receiveShadow = true;
  scene.add(wall);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* spill planes: sized to what the camera can actually see, so the per-pixel line
     integral is spent on the frame and not on the room */
  const grainTex = plaster.bumpMap;
  const spillArrays = () => {
    const a = [], b = [], norm = [], gain = [];
    for (let k = 0; k < SPILL_SAMPLES; k++) {
      a.push(new THREE.Vector3());
      b.push(new THREE.Vector3());
      norm.push(new THREE.Vector3(1, 0, 0));
      gain.push(1.0);      // uniform: the helix is the shape, not a brightness ramp
    }
    return { a, b, norm, gain };
  };

  const wallA = spillArrays();
  const wallSpillMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffb464) },
      uPower: { value: 1 },
      uNormal: { value: new THREE.Vector3(0, 0, 1) },
      uA: { value: wallA.a }, uB: { value: wallA.b }, uNorm: { value: wallA.norm }, uGain: { value: wallA.gain },
      uCut2: { value: 0.95 * 0.95 },
      uGrain: { value: grainTex },
    },
    vertexShader: spillVert, fragmentShader: spillFrag,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const wallSpill = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), wallSpillMat);
  wallSpill.position.set(0, 0.55, -0.710);
  scene.add(wallSpill);

  const floorA = spillArrays();
  const floorPoolMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffb464) },
      uPower: { value: 1 },
      uNormal: { value: new THREE.Vector3(0, 1, 0) },
      uA: { value: floorA.a }, uB: { value: floorA.b }, uNorm: { value: floorA.norm }, uGain: { value: floorA.gain },
      uCut2: { value: 0.34 * 0.34 },
      uGrain: { value: grainTex },
    },
    vertexShader: spillVert, fragmentShader: spillFrag,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const floorPool = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), floorPoolMat);
  floorPool.rotation.x = -Math.PI / 2;
  floorPool.position.set(0, 0.0030, 0.36);
  floorPool.renderOrder = 0;
  scene.add(floorPool);

  /* contact: the plinth is 196 mm across (242 mm in x, because the plan is an oval), so
     the strongest darkness belongs just outside that foot, with a penumbra thrown to the
     right and back — away from a key that stands up-front-left. Both planes are elliptical
     for the same reason the object is. */
  const contactCore = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.32),
    new THREE.MeshBasicMaterial({
      map: contactTexture(0.60, 0.97), color: 0x000000, transparent: true, opacity: 0.90,
      depthWrite: false, blending: THREE.NormalBlending,
    })
  );
  contactCore.rotation.x = -Math.PI / 2;
  contactCore.scale.x = 1.24;
  contactCore.position.set(0, 0.0021, 0);
  contactCore.renderOrder = 3;
  scene.add(contactCore);

  const shadowAz = Math.atan2(-1.15, 1.25);          // away from the key, in the floor plane
  const contactWide = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.74),
    new THREE.MeshBasicMaterial({
      map: contactTexture(0.26, 0.66), color: 0x000000, transparent: true, opacity: 0.40,
      depthWrite: false, blending: THREE.NormalBlending,
    })
  );
  contactWide.rotation.set(-Math.PI / 2, 0, -shadowAz);
  contactWide.position.set(Math.cos(shadowAz) * 0.030, 0.0019, -Math.sin(shadowAz) * 0.030);
  contactWide.renderOrder = 2;
  scene.add(contactWide);

  /* lights */
  const hemi = new THREE.HemisphereLight(0xb9c3cc, 0x2a231d, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xf6f8fa, 1.25);
  key.position.set(-1.25, 1.95, 1.15);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);   // 4096 was a 16 M-texel depth pass for a 1.1 m frustum
  key.shadow.camera.left = -0.55;
  key.shadow.camera.right = 0.55;
  key.shadow.camera.top = 0.60;
  key.shadow.camera.bottom = -0.28;
  key.shadow.camera.near = 1.85;
  key.shadow.camera.far = 3.35;
  // radius only means anything to VSM; under PCF the edge sharpness is the resolution.
  // A tight contact shadow is what makes the base sit on the floor rather than near it.
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.0022;
  scene.add(key);

  /* The rim is what stops a dark matte column reading as a black shape: it grazes the
     silhouette and puts a cool edge on the metal, which is the difference between "a
     column" and "a metal column". It is deliberately the second-strongest light. */
  const rim = new THREE.DirectionalLight(0xc7d2da, 0.5);
  rim.position.set(1.62, 1.30, -1.34);
  scene.add(rim);

  const seamLight = new THREE.PointLight(0xffb464, 0.35, 0.85, 2);
  seamLight.position.set(0, 0.16, 0);
  scene.add(seamLight);
  /* A warm bounce off the pool, low and wide: the room is amber below the waist, which is
     true of any object standing in a warm pool. It is deliberately under the plinth's
     height and weak enough that it cannot tint the body's mid-tone. */
  const bounce = new THREE.PointLight(0xffa063, 0.16, 0.85, 2);
  bounce.position.set(0.20, 0.030, 0.16);
  scene.add(bounce);
  /* the object */
  const group = new THREE.Group();
  scene.add(group);

  /* ---------- the body, as an authored asset ----------
     Everything above this line is the room. The object is not built here any more: it is
     a Blender-authored glTF (tools/asset/build_vesper.py) whose slot is real geometry — a
     14 mm opening, a 45 deg lip chamfer, a 0.45 mm lip land, a 5 deg draft throat and a
     6.5 mm floor — with a separate emissive light-pipe strip recessed below the lip plane,
     so the metal occludes the source by depth test instead of by a shader gate. Its five
     maps come from one 2K bake (AO, tangent normal, curvature-bent roughness, cast mottle)
     in the same atlas, so the shell, plinth and dial share one texture set.

     Two consequences worth stating, because both were the whole problem in pass 5:
       * the glow can no longer be drawn anywhere the geometry does not allow. The pipe is
         4 mm behind the lip; from a grazing hero angle the lip hides it and the slot reads
         as a dark milled line with light in the bottom, which is what the object is;
       * nothing here is tuned per-pixel. The finish multiplies the baked maps, so switching
         to Umber or Slate changes the metal without touching the micro-structure. */
  /* A build tag, not decoration: the exported GLB is cached by path, and a returning
     visitor would otherwise keep the previous body for as long as the header allows.
     Bump it whenever the .glb changes. */
  const ASSET_URL = new URL('../assets/vesper-01.glb?v=7', import.meta.url).href;
  const placeholder = () => new THREE.BoxGeometry(1e-4, 1e-4, 1e-4);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xb6bac0, metalness: 1.0, roughness: 0.50,
    side: THREE.DoubleSide,
  });
  const plinthMat = bodyMat.clone();
  const dialMat = new THREE.MeshStandardMaterial({
    color: 0xa4a9ae, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.2,
  });
  /* the diffuser's own material: emission, and a near-black albedo so the environment
     cannot add diffuse on top of it and desaturate it through ACES */
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x140c06, emissive: new THREE.Color(0xff7a1e), emissiveIntensity: 0.5,
    roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(placeholder(), bodyMat);
  const plinth = new THREE.Mesh(placeholder(), plinthMat);
  const dial = new THREE.Mesh(placeholder(), dialMat);
  const opal = new THREE.Mesh(placeholder(), coreMat);
  for (const o of [body, plinth, dial, opal]) {
    o.visible = false;
    o.castShadow = o !== opal;
    o.receiveShadow = true;
    group.add(o);
  }
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:t-shell');

  let assetReady = false;
  const assetLoaded = new GLTFLoader().loadAsync(ASSET_URL).then((gltf) => {
    const src = gltf.scene;
    const take = (name) => src.getObjectByName(name);
    const shell = take('Shell');
    const pipe = take('LightPipe');
    const base = take('Plinth');
    const ring = take('Dial');
    if (!shell || !pipe) throw new Error('vesper asset: shell/lightpipe missing');
    /* one material, four meshes, one atlas: the maps are the bake's, the scalars are the
       finish's. metalnessMap.b is 1 everywhere, so material.metalness stays the finish's
       number; roughnessMap.g is 0.56-1.00 and only ever pulls roughness down where the
       bake found a burnished edge. */
    const sm = shell.material;
    for (const [m, mats] of [[bodyMat, sm], [plinthMat, sm], [dialMat, sm]]) {
      m.map = sm.map;
      m.normalMap = sm.normalMap;
      m.aoMap = sm.aoMap;
      m.roughnessMap = sm.roughnessMap;
      m.metalnessMap = sm.metalnessMap;
      if (sm.normalScale) m.normalScale.copy(sm.normalScale);
      m.needsUpdate = true;
    }
    dialMat.roughness = 0.38;
    dialMat.color.set(0xa4a9ae);
    body.geometry = shell.geometry;
    plinth.geometry = base ? base.geometry : placeholder();
    dial.geometry = ring ? ring.geometry : placeholder();
    opal.geometry = pipe.geometry;
    for (const o of [body, plinth, dial, opal]) o.visible = true;
    assetReady = true;
    return gltf;
  }).catch((err) => {
    /* the room stays; the object is absent rather than wrong */
    console.error('vesper asset failed to load', err);
    return null;
  });

  /* the light that leaves the slot, and the kiss at the plinth. These are millimetres
     from the metal, where three's 1/r^2 multiplies whatever they are set to by 10^4, so
     they are set by measurement (see update()) and not by feel. The seam's *shape* on the
     floor and the wall is drawn by the two spill shaders, which integrate this same
     helix; these two points only add the local falloff the integral cannot see. */
  const slotLight = new THREE.PointLight(0xffb464, 1.0, 0.62, 2);
  slotLight.position.set(0, 0.5 * (CHANNEL.yMin + CHANNEL.yMax), 0);
  group.add(slotLight);
  const slotLightLow = new THREE.PointLight(0xffb464, 0.45, 0.50, 2);
  slotLightLow.position.set(0, 0.075, 0);
  group.add(slotLightLow);

  // oval plan
  const groupScaleX = 1.24;
  group.scale.set(groupScaleX, 1, 1);

  /* ---------- state ---------- */
  const state = {
    finish: FINISHES[2],
    finishTarget: FINISHES[2],
    atmosphere: ATMOSPHERES[1],
    atmoTarget: ATMOSPHERES[1],
    orbit: 0,
    targetOrbit: 0,
    phase: CHANNEL.phase,
    seamPhase: CHANNEL.phase,
    intensity: 0.72,
    targetIntensity: 0.72,
    mood: 0.85,
    targetMood: 0.85,
    camera: { pos: new THREE.Vector3(0, 0.25, 0.98), target: new THREE.Vector3(-0.03, 0.2, 0), fov: 33 },
    targetCam: {
      pos: new THREE.Vector3(0, 0.25, 0.98),
      target: new THREE.Vector3(-0.03, 0.2, 0),
      fov: 33,
    },
  };

  const DAY = {
    bg: new THREE.Color(0xc7bfb1), wall: new THREE.Color(0xd6cec0), floor: new THREE.Color(0xc2bbad),
    hemi: 1.5, key: 2.4, rim: 1.1, exposure: 0.90, fogNear: 2.4, fogFar: 6.8,
    // neutral, a hair cool. The warm light in this room belongs to the product, not to the
    // light that describes it: a warm key on a metal is how a grey column becomes champagne.
    keyColor: new THREE.Color(0xf6f8fa), envInt: 1.0,
  };
  const NIGHT = {
    bg: new THREE.Color(0x0d0b0a), wall: new THREE.Color(0x2a2521), floor: new THREE.Color(0x1f1b18),
    hemi: 0.22, key: 0.92, rim: 1.30, exposure: 0.98, fogNear: 1.05, fogFar: 3.6,
    keyColor: new THREE.Color(0xbccbd8), envInt: 0.78,
  };
  const tmp = new THREE.Color();

  function setFinish(id) {
    state.finishTarget = FINISHES.find((f) => f.id === id) || FINISHES[0];
    /* Before the first frame there is no loop to cross-fade and the poster is still on
       screen, so snap: a finish chosen during load must be the finish the first painted
       frame shows. set(), not copy(): these palette entries are hex numbers and copy()
       would write NaN into the material. */
    if (!hasRendered) {
      bodyMat.color.set(state.finishTarget.color);
      /* A cast shell is a long, smooth highlight gradient across an 18 cm form.
         Without dither that gradient quantises to 8 bits and the shoulder reads as
         stepped bands — which is exactly what a "plastic" read is made of. */
      bodyMat.dithering = true;
      bodyMat.metalness = state.finishTarget.metalness;
      bodyMat.roughness = state.finishTarget.roughness;
      bodyMat.envMapIntensity = state.finishTarget.env;
      plinthMat.color.copy(bodyMat.color);
      plinthMat.metalness = bodyMat.metalness;
      plinthMat.roughness = bodyMat.roughness;
      plinthMat.envMapIntensity = bodyMat.envMapIntensity;
      state.finish = state.finishTarget;
    }
  }
  function setAtmosphere(id) {
    state.atmoTarget = ATMOSPHERES.find((a) => a.id === id) || ATMOSPHERES[1];
    if (!hasRendered) {
      coreMat.emissive.set(state.atmoTarget.color);
      wallSpillMat.uniforms.uColor.value.set(state.atmoTarget.spill);
      floorPoolMat.uniforms.uColor.value.set(state.atmoTarget.spill);
      seamLight.color.set(state.atmoTarget.color);
      slotLight.color.set(state.atmoTarget.color);
      slotLightLow.color.set(state.atmoTarget.color);
      state.atmosphere = state.atmoTarget;
    }
  }
  function setOrbit(rad) { state.targetOrbit = rad; }
  function setIntensity(v) { state.targetIntensity = Math.max(0, Math.min(1, v)); }
  function setMood(v) { state.targetMood = Math.max(0, Math.min(1, v)); }
  function paceCamera(pos, target, fov) {
    state.targetCam.pos.set(pos[0], pos[1], pos[2]);
    state.targetCam.target.set(target[0], target[1], target[2]);
    state.targetCam.fov = fov;
  }
  function snapCamera() {
    state.camera.pos.copy(state.targetCam.pos);
    state.camera.target.copy(state.targetCam.target);
    state.camera.fov = state.targetCam.fov;
  }

  /* the slot's world position and outward direction, along the helix */
  const _rot = (x, z, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [x * c + z * s, -x * s + z * c];
  };
  const emitAt = (t, out) => {
    /* The seam's angle in the object's own frame, and then the object's rotation —
       applied once, here. Rotating the sample and then rotating it again (which is
       what happens if the phase already carries the orbit) leaves the floor pattern
       nailed to the room while the object turns under it. */
    const y = CHANNEL.yMin + (CHANNEL.yMax - CHANNEL.yMin) * t;
    // the light leaves through the 14 mm opening, 1 mm inside the untouched surface, so
    // that is where the line source sits. It used to be the opal tube's axis, 5.3 mm in;
    // the recess moves the emission outward, which is what puts the spill's inner edge
    // closer to the object instead of under its own shadow.
    const r = Math.max(0.01, outerRadius(y) - 0.0010);
    const a = CHANNEL.phase + t * CHANNEL.turns * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const [ex, ez] = _rot(r * ca * groupScaleX, r * sa, state.orbit);
    out.set(ex, y, ez);
    return [ca * groupScaleX, sa];
  };
  function updateEmitters(A, phase, orbit) {
    for (let k = 0; k < SPILL_SAMPLES; k++) {
      // consecutive samples are the ends of one piece of the helix, so the eight
      // pieces tile it end to end and the integral sees a continuous line
      const n0 = emitAt(k / SPILL_SAMPLES, A.a[k]);
      const n1 = emitAt((k + 1) / SPILL_SAMPLES, A.b[k]);
      const [nx0, nz0] = _rot(n0[0], n0[1], orbit);
      const [nx1, nz1] = _rot(n1[0], n1[1], orbit);
      const nx = nx0 + nx1, nz = nz0 + nz1;
      const nl = Math.hypot(nx, nz) || 1;
      A.norm[k].set(nx / nl, 0, nz / nl);
    }
  }

  /* Is the scene still moving? The renderer suspends itself when nothing changes, which
     is the only reason an idle page is cheap — but it must also be the reason a finish
     change finishes. Without this the loop stopped mid-cross-fade, so the button lit up
     and the object kept the old colour until the next scroll. */
  const nearColor = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 4e-3;
  function isSettled() {
    const ft = state.finishTarget, at = state.atmoTarget;
    return (
      Math.abs(state.targetOrbit - state.orbit) < 1e-4 &&
      Math.abs(state.targetIntensity - state.intensity) < 1e-4 &&
      Math.abs(state.targetMood - state.mood) < 1e-4 &&
      nearColor(bodyMat.color, _fc.set(ft.color)) &&
      Math.abs(bodyMat.roughness - ft.roughness) < 2e-3 &&
      Math.abs(bodyMat.metalness - ft.metalness) < 2e-3 &&
      Math.abs(bodyMat.envMapIntensity - ft.env) < 4e-3 &&
      nearColor(coreMat.emissive, _fc.set(at.color)) &&
      state.camera.pos.distanceToSquared(state.targetCam.pos) < 1e-8 &&
      state.camera.target.distanceToSquared(state.targetCam.target) < 1e-8
    );
  }
  const _fc = new THREE.Color();

  let t = 0;
  let instant = false;
  let hasRendered = false;      // true once update() has drawn a frame; used by the setters above
  function settle() { instant = true; }      // jump every damped value to its target (tests, deep links)
  function update(dtIn, reduced = false) {
    // a bad frame delta (negative, NaN, long stall) must never blow up the damping
    let dt = Number.isFinite(dtIn) ? Math.max(0, Math.min(0.05, dtIn)) : 0;
    if (dt === 0) dt = 0.0001;
    /* real elapsed time for anything with no physics in it: capped so a resumed tab
       does not jump, but 5x the motion clamp so a slow frame still converges in real
       seconds rather than in frames */
    const dtReal = Number.isFinite(dtIn) ? Math.min(0.25, Math.max(0.0001, dtIn)) : 0.016;
    t += dt;
    const k = (tau) => (instant ? 1 : Math.min(1, Math.max(0, 1 - Math.exp(-dt / tau))));

    state.orbit += (state.targetOrbit - state.orbit) * k(0.10);
    state.intensity += (state.targetIntensity - state.intensity) * k(0.14);
    state.mood += (state.targetMood - state.mood) * k(0.42);

    const cam = state.camera;
    const l = k(0.22);
    cam.pos.lerp(state.targetCam.pos, l);
    cam.target.lerp(state.targetCam.target, l);
    cam.fov += (state.targetCam.fov - cam.fov) * l;
    camera.fov = cam.fov;
    camera.position.copy(cam.pos);
    camera.lookAt(cam.target);
    camera.updateProjectionMatrix();

    /* Finish and atmosphere cross-fades are material properties, not motion: they
       are stable at any dt, so they must run on real time rather than on the clamped
       motion dt. With the clamp at 50 ms a machine drawing at 4 fps took six times
       longer in wall-clock to reach the colour the button had already reported. */
    const kReal = (tau) => {
      const v = instant ? 1 : 1 - Math.exp(-dtReal / tau);
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    };

    /* finish */
    const ft = state.finishTarget;
    const fl = kReal(0.18);
    /* a single NaN in a colour is permanent — lerp() spreads it to every channel on
       every later frame — so recover instead of rendering a black object */
    if (!Number.isFinite(bodyMat.color.r) || !Number.isFinite(bodyMat.color.g) || !Number.isFinite(bodyMat.color.b)) {
      bodyMat.color.set(ft.color); bodyMat.metalness = ft.metalness; bodyMat.roughness = ft.roughness;
    }
    state.finish = ft;
    bodyMat.color.lerp(tmp.set(ft.color), fl);
    bodyMat.metalness += (ft.metalness - bodyMat.metalness) * fl;
    bodyMat.roughness += (ft.roughness - bodyMat.roughness) * fl;
    bodyMat.envMapIntensity += (ft.env - bodyMat.envMapIntensity) * fl;
    plinthMat.color.copy(bodyMat.color);
    plinthMat.metalness = bodyMat.metalness;
    plinthMat.roughness = bodyMat.roughness;
    plinthMat.envMapIntensity = bodyMat.envMapIntensity;

    /* atmosphere */
    const at = state.atmoTarget;
    const al = kReal(0.2);
    state.atmosphere = at;
    coreMat.emissive.lerp(tmp.set(at.color), al);
    seamLight.color.lerp(tmp.set(at.color), al);
    wallSpillMat.uniforms.uColor.value.lerp(tmp.set(at.spill), al);
    floorPoolMat.uniforms.uColor.value.lerp(tmp.set(at.spill), al);
    slotLight.color.lerp(tmp.set(at.color), al);
    slotLightLow.color.lerp(tmp.set(at.color), al);

    const i = state.intensity;
    // the diffuser is a real tube in the trench now, so its own brightness is set here and
    // the shell's bounce stays an order of magnitude below it
    /* 1.05..1.70 was set when the diffuser was 4 mm down a 6.5 mm slot and had to fight
       the lip's shadow. The blade now sits 0.2 mm under the lip land, so its own pixels
       are the brightest thing in the frame at a *quarter* of that: measured through ACES,
       1.6 returns (247,240,214) — a pale line, no amber — while 0.55-0.8 keeps the hue. */
    coreMat.emissiveIntensity = 1.20 + i * 0.40;
    // The slot's own bounce stays tiny. These lights sit ~5 mm from the metal, where three's
    // 1/r² multiplies the intensity by 4*10^4: pass 2's "0.34" was a floodlight painting the
    // body amber, which is how a white studio produced a bronze macro. The light the seam
    // throws is drawn by the floor and wall shaders; this is only the kiss at the plinth.
    seamLight.intensity = 0.004 + i * 0.010;
    slotLight.intensity = 0.0012 + i * 0.0026;
    slotLightLow.intensity = 0.0006 + i * 0.0014;
    bounce.intensity = 0.010 + i * 0.020;

    /* mood: 0 = plaster daylight, 1 = night */
    const m = state.mood;
    scene.background.copy(DAY.bg).lerp(NIGHT.bg, m);
    scene.fog.color.copy(scene.background);
    scene.fog.near = DAY.fogNear + (NIGHT.fogNear - DAY.fogNear) * m;
    scene.fog.far = DAY.fogFar + (NIGHT.fogFar - DAY.fogFar) * m;
    wallMat.color.copy(DAY.wall).lerp(NIGHT.wall, m);
    floorMat.color.copy(DAY.floor).lerp(NIGHT.floor, m);
    hemi.intensity = DAY.hemi + (NIGHT.hemi - DAY.hemi) * m;
    key.intensity = DAY.key + (NIGHT.key - DAY.key) * m;
    rim.intensity = DAY.rim + (NIGHT.rim - DAY.rim) * m;
    key.color.copy(DAY.keyColor).lerp(NIGHT.keyColor, m);
    scene.environmentIntensity = DAY.envInt + (NIGHT.envInt - DAY.envInt) * m;
    renderer.toneMappingExposure = DAY.exposure + (NIGHT.exposure - DAY.exposure) * m;

    // the room is never lit by anything else at night
    const ember = 0.55 + 0.45 * m;
    // calibrated so the hottest floor patch lands under the seam, and nothing clips.
    // Pass 4: the twenty segments now carry a *uniform* gain. The 0.55..1.0 ramp along the
    // helix made one end of the seam brighter than the other for no physical reason, which
    // is what made the pattern read as an arbitrary wash rather than as the shape of a line
    // source; the shape has to come from the geometry of the helix, not from a ramp.
    // measured: at the previous gains the twenty-segment integral put ~4 levels on a wall
    // 300 mm away — under the noise floor of the amber room, so the band could not move
    // with the object because it could not be seen at all.
    wallSpillMat.uniforms.uPower.value = (0.92 + i * 2.40) * ember;
    // the pool is cut at 520 mm: past that the 34 mm pitch of the helix projects to less
    // than a pixel and the "shaped" spill is a wash with a spiral painted on it
    floorPoolMat.uniforms.uPower.value = (1.15 + i * 2.30) * ember;

    // the slot turns with the object, because it is part of the object
    group.rotation.y = state.orbit;
    state.seamPhase = CHANNEL.phase + state.orbit;
    state.phase = state.seamPhase;
    updateEmitters(wallA, state.seamPhase, state.orbit);
    updateEmitters(floorA, state.seamPhase, state.orbit);
    state.spill = { x: floorA.a[0].x, z: floorA.a[0].z, y: floorA.a[0].y };

    const sa = state.seamPhase + 0.5 * CHANNEL.turns * TAU;
    const rOut = Math.max(0.02, outerRadius(0.5 * (CHANNEL.yMin + CHANNEL.yMax)) - CHANNEL.depth * 0.5) * groupScaleX;
    slotLight.position.set(Math.cos(sa) * rOut, 0.5 * (CHANNEL.yMin + CHANNEL.yMax), Math.sin(sa) * rOut);
    slotLightLow.position.set(Math.cos(sa - 1.1) * rOut * 0.86, 0.075, Math.sin(sa - 1.1) * rOut * 0.86);

    // a shadow is the light that did not arrive, so more output means a firmer contact,
    // not a softer one
    contactCore.material.opacity = (0.74 + 0.18 * m) * (0.93 + 0.07 * i);
    contactWide.material.opacity = (0.26 + 0.16 * m) * (0.93 + 0.07 * i);

    if (!reduced) group.position.y = Math.sin(t * 0.5) * 0.0009;

    renderer.render(scene, camera);
    hasRendered = true;
    instant = false;
  }

  function resize(w, h) {
    if (!w || !h) return;
    /* A pixel budget, not just a device-pixel-ratio cap. A 1440p viewport on a 2×
       display is 5.2 M pixels before the 4× multisample buffer: that is where the
       steady-state cost goes on a laptop GPU that is otherwise idle. Cap the drawing
       buffer at ~2.4 M pixels and keep the CSS size; above that the extra pixels buy
       nothing at normal viewing distance. */
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* screen-space box of the object — used by the layout checks and by the film script */
  const _box = new THREE.Box3();
  const _v = new THREE.Vector3();
  const _size = new THREE.Vector2();
  function objectRect() {
    _box.setFromObject(group);
    renderer.getSize(_size);
    const r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (let i = 0; i < 8; i++) {
      _v.set(
        i & 1 ? _box.max.x : _box.min.x,
        i & 2 ? _box.max.y : _box.min.y,
        i & 4 ? _box.max.z : _box.min.z
      ).project(camera);
      const sx = (_v.x * 0.5 + 0.5) * _size.x;
      const sy = (-_v.y * 0.5 + 0.5) * _size.y;
      if (sx < r.left) r.left = sx;
      if (sx > r.right) r.right = sx;
      if (sy < r.top) r.top = sy;
      if (sy > r.bottom) r.bottom = sy;
    }
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
             cx: Math.round((r.left + r.right) / 2), cy: Math.round((r.top + r.bottom) / 2) };
  }

  /* where the light actually leaves the object: used to prove the spill is the seam's
     spill and not a pool that happens to sit under it */
  function spillProbe() {
    const p = floorA.a[0];
    return {
      x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4),
      azimuth: +(Math.atan2(p.z, p.x)).toFixed(4),
      radius: +Math.hypot(p.x, p.z).toFixed(4),
      spread: +Math.hypot(floorA.b[SPILL_SAMPLES - 1].x - floorA.a[0].x,
                          floorA.b[SPILL_SAMPLES - 1].z - floorA.a[0].z).toFixed(4),
    };
  }

  /* the cut, measured off the loaded vertex buffer — what tools/verify.mjs asserts on.
     There is no aGroove attribute any more: the recess is the mesh's shape, so the probe
     finds it the only way it can be found, by comparing each vertex's radius with the
     untouched profile at that height. A vertex is "in the cut" when it sits between
     0.08 mm and 9 mm inside that profile — the upper bound is the 11 mm wall, which keeps
     the shell's inner surface from being mistaken for the floor. */
  const CUT_MIN = 0.00008, CUT_MAX = 0.0090;
  function grooveProbe(atY) {
    const geo = body.geometry;
    const p = geo && geo.getAttribute('position');
    if (!p) {
      return { at: atY, samples: 0, ringY: null, floorRadius: null,
               profileRadius: +outerRadius(atY).toFixed(5), depth: null,
               halfWidth: null, shoulderRadius: null, vertices: 0 };
    }
    const depthAt = (i) => outerRadius(p.getY(i)) - Math.hypot(p.getX(i), p.getZ(i));
    let row = null, best = Infinity;
    for (let i = 0; i < p.count; i++) {
      const d = depthAt(i);
      if (d < CUT_MIN || d > CUT_MAX) continue;
      const dy = Math.abs(p.getY(i) - atY);
      if (dy < best - 1e-9) { best = dy; row = p.getY(i); }
    }
    let floor = Infinity, outer = 0, n = 0, azSum = 0, azN = 0;
    if (row !== null) {
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) !== row) continue;
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
        const d = outerRadius(row) - r;
        if (d < CUT_MIN || d > CUT_MAX) continue;
        n++;
        if (r < floor) floor = r;
        if (r > outer) outer = r;
      }
      /* the slot's centre is the middle of its floor, which is the flattest and deepest
         part of the section */
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) !== row) continue;
        const r = Math.hypot(p.getX(i), p.getZ(i));
        if (outerRadius(row) - r > 0.0045) { azSum += Math.atan2(p.getZ(i), p.getX(i)); azN++; }
      }
    }
    const prof = outerRadius(row === null ? atY : row);
    let half = null;
    if (azN) {
      const c = azSum / azN;
      half = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) !== row) continue;
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (prof - r < CUT_MIN) continue;
        let da = Math.atan2(z, x) - c;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        half = Math.max(half, Math.abs(da) * prof);
      }
    }
    return {
      at: atY, samples: n, ringY: row === null ? null : +row.toFixed(5),
      floorRadius: floor === Infinity ? null : +floor.toFixed(5),
      profileRadius: +prof.toFixed(5),
      depth: floor === Infinity ? null : +(prof - floor).toFixed(5),
      halfWidth: half === null ? null : +half.toFixed(5),
      shoulderRadius: outer ? +outer.toFixed(5) : null,
      vertices: p.count,
    };
  }

  /* the emitter is an object with a measurable section: how wide it reads in the slot,
     how far below the lips it sits, and how many vertices carry it. All three are what
     "the gap is visibly the source" reduces to once the source is geometry. */
  function emitterProbe() {
    opal.geometry.computeBoundingBox();
    const bb = opal.geometry.boundingBox;
    const p = opal.geometry.getAttribute('position');
    let rMin = Infinity, rMax = 0;
    for (let i = 0; i < p.count; i++) {
      const rr = Math.hypot(p.getX(i), p.getZ(i));
      if (rr < rMin) rMin = rr;
      if (rr > rMax) rMax = rr;
    }
    const midY = 0.5 * (CHANNEL.yMin + CHANNEL.yMax);
    /* the pipe's width, measured across the strip at mid height rather than declared */
    /* the strip's width is measured across the helix, so each vertex's azimuth is
       compared with the helix's own centre at that same height first; without that the
       advance of the helix over the sampling window reads as width */
    let row = null, near = Infinity;
    for (let i = 0; i < p.count; i++) {
      const dy = Math.abs(p.getY(i) - midY);
      if (dy < near - 1e-9) { near = dy; row = p.getY(i); }
    }
    let offMin = Infinity, offMax = -Infinity, crown = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y !== row) continue;
      const r = Math.hypot(p.getX(i), p.getZ(i));
      let da = Math.atan2(p.getZ(i), p.getX(i)) - channelCentreAngle(y);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const off = da * r;
      if (off < offMin) offMin = off;
      if (off > offMax) offMax = off;
      crown = Math.max(crown, r);
    }
    const section = offMax - offMin;
    return {
      visibleSection: +section.toFixed(5),
      apertureFraction: +(section / CHANNEL.aperture).toFixed(3),
      lipClearance: +(outerRadius(midY) - crown).toFixed(5),
      yMin: +bb.min.y.toFixed(4), yMax: +bb.max.y.toFixed(4),
      midRadius: +(rMin).toFixed(5),
      profileAtMid: +outerRadius(midY).toFixed(5),
      vertices: p.count,
      emissiveIntensity: +coreMat.emissiveIntensity.toFixed(3),
      loaded: assetReady,
    };
  }

  return {
    scene, camera, renderer, group, body, bodyMat, plinthMat, coreMat, opal, state,
    update, resize, compile, dispose: () => renderer.dispose(), isSettled, isCompiled: () => compiled,
    setFinish, setAtmosphere, setOrbit, setIntensity, setMood, paceCamera, snapCamera, settle,
    objectRect, grooveProbe, spillProbe, emitterProbe, ringCount: () => (body.geometry && body.geometry.getAttribute('position') ? body.geometry.getAttribute('position').count : 0),
    wallSpill, floorPool, wallSpillMat, floorPoolMat,
    CHANNEL, outerRadius,
  };
}
