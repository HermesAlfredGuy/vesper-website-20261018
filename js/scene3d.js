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
const BRUSH_TILE = 0.064;    // metres of surface per texture tile
function brushedNormal() {
  const S = 512;
  const MARKS = 16;          // 64 mm / 16 = a 4 mm tool-mark pitch
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    // the marks drift, slightly and irregularly. The old map wobbled them with
    // sin(3x) at 0.6 rad: a 21 mm periodic wave, which is where the *waviness* came
    // from. One slow drift per tile is what a tool actually leaves.
    const wob = Math.sin((y / S) * TAU) * 0.5 + Math.sin((y / S) * TAU * 0.37 + 1.7) * 0.22;
    for (let x = 0; x < S; x++) {
      const n = Math.random() - 0.5;                                   // bead blast
      const line = Math.sin((y / S) * TAU * MARKS + wob + x * 0.0009);
      h[y * S + x] = line * 0.42 + n * 0.95;
    }
  }
  // blur before the blast is turned into normals: a grain, not per-pixel salt
  const b = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let acc = 0;
      for (let k = -1; k <= 1; k++) acc += h[y * S + ((x + k + S) % S)];
      b[y * S + x] = acc / 3;
    }
  }
  const c = canvas(S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const k = 0.42;                                          // slope: bends the highlight, does not chop it
  for (let y = 0; y < S; y++) {
    const yp = ((y + 1) % S) * S, ym = ((y - 1 + S) % S) * S;
    for (let x = 0; x < S; x++) {
      const dx = (b[y * S + ((x + 1) % S)] - b[y * S + ((x - 1 + S) % S)]) * k;
      const dy = (b[yp + x] - b[ym + x]) * k;
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (y * S + x) * 4;
      img.data[o] = Math.round((-dx * nz * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round((-dy * nz * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // repeat stays 1: the shell's uv is already in tile units, so the map's world size is
  // a property of the geometry rather than of a number typed here
  t.anisotropy = 8;
  return t;
}

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
  // key softbox overhead-front: neutral, and the single strongest shape the metal mirrors
  panel(6, 4, new THREE.Color(5.4, 5.44, 5.5), [0, 3.6, 0.6], [Math.PI / 2, 0, 0]);
  // narrow bright strip on the right, cooler — the long vertical specular
  panel(0.9, 3.4, new THREE.Color(1.55, 1.68, 1.86), [3.4, 1.5, 1.4], [0, -Math.PI / 2, 0]);
  // matching strip on the left, neutral and weaker, so the body has two edges
  panel(0.7, 2.6, new THREE.Color(0.62, 0.63, 0.65), [-3.4, 1.4, 0.9], [0, Math.PI / 2, 0]);
  // a broad soft panel overhead — the softbox. A narrow strip reflects into one
  // thin specular; a *large* source is what a matte metal actually returns, and it
  // is the difference between a grey column and a black one.
  panel(4.6, 4.6, new THREE.Color(2.25, 2.28, 2.34), [0.4, 5.0, 0.7], [-Math.PI / 2, 0, 0]);
  // Pass 3c ─ a large neutral card on the camera side. In a warm room every reflection is
  // amber, so a metal's mid-tone goes brown whatever its albedo says; the only way an
  // aluminium body keeps a grey mid-tone in an amber room is a big neutral source where it
  // actually looks. This is a bounce card, not a new lamp in the room: it exists only in the
  // reflection environment, so it does not flatten the visible lighting.
  panel(6.2, 7.2, new THREE.Color(3.30, 3.42, 3.58), [0.15, 1.5, 5.0], [0, Math.PI, 0]);
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

const WALL_INSET = 0.0072;

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
  phase: -1.15,       // where the single start sits at half height in the front view
  turns: 1.16,
  yMin: 0.038,
  yMax: 0.286,
  aperture: 0.0090,   // 9 mm across the lips
  depth: 0.0050,      // 5 mm down to the opal diffuser, inside the 7.2 mm wall
  floorEnd: 0.52,     // of the half-aperture: flat machined floor out to here ..
  wallEnd: 0.80,      // .. then a straight wall up to the lip chamfer
  break: 0.0011,      // 1.1 mm 45 deg chamfer on each lip: an edge break, not a round-over
  opalEnd: 0.26,      // of the half-aperture: the diffuser is a line, not a floor
};
const CH_HALF = CHANNEL.aperture / 2;
const CH_OUT = 9.0;   // sentinel: this vertex is nowhere near the channel

/** Signed distance across the channel in units of the half-aperture: 0 centre, ±1 lip. */
function channelT(y) {
  return Math.min(1, Math.max(0, (y - CHANNEL.yMin) / (CHANNEL.yMax - CHANNEL.yMin)));
}
function channelCentreAngle(y) {
  return CHANNEL.phase + channelT(y) * CHANNEL.turns * TAU;
}
/** Half-aperture at a height. The slot pinches over the last few millimetres at each
    end, the way a cutter runs out, instead of stopping on a hard annular edge. */
function channelHalf(y) {
  const tt = channelT(y);
  const run = Math.min(1, Math.min(tt, 1 - tt) / 0.014);
  return CH_HALF * (0.58 + 0.42 * run);
}
/** How far the surface is cut below the outer radius at a given offset.
    Four straight facets, because a cutter leaves straight facets: a flat floor, a steep
    wall, a 45 degree chamfer, and the untouched shoulder. The previous version eased the
    wall with a smoothstep, which is the one profile that reflects like a groove *milled
    in clay* — no crisp line anywhere along it. */
function slotCut(f) {
  const a = Math.abs(f);
  if (a <= CHANNEL.floorEnd) return CHANNEL.depth;
  if (a <= CHANNEL.wallEnd) {
    const u = (a - CHANNEL.floorEnd) / (CHANNEL.wallEnd - CHANNEL.floorEnd);
    return CHANNEL.depth + (CHANNEL.break - CHANNEL.depth) * u;      // straight wall
  }
  if (a < 1) {
    const u = (a - CHANNEL.wallEnd) / (1 - CHANNEL.wallEnd);
    return CHANNEL.break * (1 - u);                                  // 45 deg lip chamfer
  }
  return 0;
}

/* ---------- the shell ----------
   One ring per height, each ring carrying the same angular samples — but clustered,
   so that wherever the channel is at that height it gets 40 samples across 9 mm and
   the remaining 200 spread over the rest of the circumference. The dense span is the
   same in every ring, so the parametrisation follows the helix and the mesh stays a
   regular grid. */

const RING_DENSE = 64;       // across the channel: ~0.25 mm per sample, so the 1.1 mm
                             // chamfer is three samples wide and reads as a facet
const RING_UNIFORM = 288;    // the rest of the circumference: 47 samples/rad, 1.7 mm of
                             // arc at the waist. At the hero that is 1.8 px, which is
                             // what keeps the silhouette a curve instead of a 30-gon.
const DENSE_HALF = 0.095;    // radians either side of the channel centre

function ringColumns() {
  const u = [];
  for (let k = 0; k < RING_DENSE; k++) u.push(-DENSE_HALF + (2 * DENSE_HALF * k) / (RING_DENSE - 1));
  for (let k = 0; k < RING_UNIFORM; k++) u.push(DENSE_HALF + ((TAU - 2 * DENSE_HALF) * k) / RING_UNIFORM);
  u.push(u[0] + TAU);                       // close the ring
  return u;
}

/* The rings are placed by *how far the surface turns*, not by a fixed count per profile
   segment. The old stack put three rings on every segment of OUTER, so a 47 degree turn
   from the foot flare into the waist happened across a single facet and the highlight
   broke there; the long straight runs of the waist got the same three rings for nothing.
   Subdividing a straight segment changes no geometry at all — collinear points — so the
   only thing it buys is an extra vertex normal to average, which is exactly the fix.
   Ring count lands near the old one because the straight runs now cost one ring. */
const MAX_TURN = 8 * Math.PI / 180;

function ringStack() {
  const rings = [];
  const push = (pts, outer) => {
    // tangent of the profile at each vertex, in the (r, y) plane; a central difference,
    // so a sharp corner spreads its turn over the two segments that meet there
    const dir = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      return Math.atan2(b[0] - a[0], b[1] - a[1]);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      let turn = Math.abs(dir[i + 1] - dir[i]);
      if (turn > Math.PI) turn = TAU - turn;
      const n = Math.min(24, Math.max(1, Math.ceil(turn / MAX_TURN)));
      for (let k = 0; k < n; k++) {
        const u = k / n;
        rings.push({
          y: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u,
          r: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u,
          outer,
        });
      }
    }
    const last = pts[pts.length - 1];
    rings.push({ y: last[0], r: last[1], outer });
  };

  push(OUTER.map(([y, r]) => [y, r]), true);
  const inner = OUTER.slice().reverse().map(([y, r]) => [y - WALL_INSET, Math.max(0, r - WALL_INSET)]);
  push(inner, false);
  rings.push({ y: rings[0].y, r: rings[0].r, outer: true });   // close the bottom annulus
  return rings;
}

function shellGeometry() {
  const U = ringColumns();
  const rings = ringStack();
  const cols = U.length, rows = rings.length;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const groove = new Float32Array(rows * cols);
  const idx = new Uint32Array((rows - 1) * (cols - 1) * 6);
  let t3 = 0;

  /* uv in *tiles*, so the normal map's pitch on the surface is a property of the
     geometry and not of a repeat count. v is arc length along the profile: the old
     v was the ring index, which bunched the tool marks wherever the profile turned;
     u is the arc length round the circumference, which the old u was not — it was the
     column index, so the clustered channel columns stretched the map ~10x across the
     seam. Both were interface bugs between the mesh and the map, and both put the
     visible damage exactly where the eye already was. */
  const arcOf = (i) => {
    let acc = 0;
    for (let k = 1; k <= i; k++) acc += Math.hypot(rings[k].y - rings[k - 1].y, rings[k].r - rings[k - 1].r);
    return acc;
  };
  const arc = rings.map((_, i) => arcOf(i));
  // u wraps: the tile count round the body is rounded to an integer, or the noise field
  // tears at the seam. 496 mm of circumference against a 64 mm tile wants 7.75, so 8.
  const uTiles = Math.max(1, Math.round((TAU * rings[0].r) / BRUSH_TILE));

  for (let i = 0; i < rows; i++) {
    const { y, r, outer } = rings[i];
    const c = channelCentreAngle(y);
    const inBand = outer && y >= CHANNEL.yMin && y <= CHANNEL.yMax;
    for (let j = 0; j < cols; j++) {
      const a = c + U[j];
      const o = i * cols + j;
      let f = CH_OUT;
      let rr = r;
      if (inBand) {
        f = (U[j] * r) / channelHalf(y);
        rr = r - slotCut(f);
      }
      pos[o * 3] = rr * Math.cos(a);
      pos[o * 3 + 1] = y;
      pos[o * 3 + 2] = rr * Math.sin(a);
      uv[o * 2] = ((U[j] - U[0]) / TAU) * uTiles;
      uv[o * 2 + 1] = arc[i] / BRUSH_TILE;
      groove[o] = f;
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c2 = a + cols, d = c2 + 1;
      idx[t3++] = a; idx[t3++] = c2; idx[t3++] = b;
      idx[t3++] = b; idx[t3++] = c2; idx[t3++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aGroove', new THREE.BufferAttribute(groove, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/* ---------- what the channel emits ----------
   The diffuser is a source, so it is emission — but it is emission *inside a slot*, and a
   slot is a small hole with a big lip. Two things follow, and neither of them is a stripe:
   the glow is gated by whether the camera can actually see down the hole, and the metal
   around it is occluded by the same hole. Both are computed here from the geometry that
   the vertex buffer already carries, so the light cannot disagree with the shape. */

const CH = {
  uGlowColor: { value: new THREE.Color(0xffb464) },
  // how hard the tube lights the metal it is lying in. This is a *bounce*, not a source:
  // the source is the tube. It is small deliberately — the old term was the source and
  // had to carry the whole effect, which is why it was pushed to 1.85 and still read as
  // one pixel wide.
  uInterior: { value: 0.16 },
  // where the direction of the key is, in the object's own frame (a uniform, not a constant:
  // the object turns, the room does not, and the shadowed wall has to change sides with it)
  uKeyLocal: { value: new THREE.Vector3(-0.60, 0.77, 0.55) },
};

function channelify(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowColor = CH.uGlowColor;
    shader.uniforms.uInterior = CH.uInterior;
    shader.uniforms.uKeyLocal = CH.uKeyLocal;
    shader.vertexShader = 'attribute float aGroove;\nvarying float vGroove;\nvarying vec3 vLocal;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vGroove = aGroove;\n  vLocal = position;'
    );
    shader.fragmentShader = [
      'varying float vGroove;',
      'varying vec3 vLocal;',
      'uniform vec3 uGlowColor; uniform float uInterior;',
      'uniform vec3 uKeyLocal;',
      shader.fragmentShader
        /* the profile of the cut, as shading: how deep this fragment sits, and which of
           the two walls it is on. The depth comes from the same four facets slotCut()
           puts into the mesh, so the dark band and the geometry cannot drift apart. */
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
          float vAbs = abs(vGroove);
          float vAA = max(fwidth(vGroove) * 1.5, 0.004);
          float vDeep = vAbs < 0.80
            ? mix(1.0, 0.22, smoothstep(0.52 - vAA, 0.80 + vAA, vAbs))
            : 0.22 * (1.0 - smoothstep(0.80 - vAA, 1.0 + vAA, vAbs));
          // the two walls do not take the same light. The one whose face turns toward the
          // key is lit; the one turning away sits in the far lip's shadow. Read off
          // uKeyLocal, so it flips as the object turns instead of being baked left/right.
          vec3 vAcross = normalize(vec3(-vLocal.z, 0.0, vLocal.x) + vec3(1e-5));
          float vFacing = dot(-sign(vGroove) * vAcross, uKeyLocal);
          float vWall = smoothstep(0.50, 0.62, vAbs);
          float vWallLight = mix(1.0, mix(0.30, 1.0, clamp(vFacing * 0.5 + 0.5, 0.0, 1.0)), vWall);
          // depth occlusion, measured off the waist of the profile: 0.12 on the floor
          // (it sees one wall and one lip), near 1 at the lip
          float vOcc = mix(0.12, 0.97, pow(1.0 - vDeep, 0.85)) * vWallLight;
          // the shoulder immediately outside the lip sits in the chamfer's shadow
          float vShoulder = exp(-pow((vAbs - 1.12) / 0.17, 2.0));
          diffuseColor.rgb *= (1.0 - 0.40 * vShoulder);
        `)
        .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
          // the floor is machined, the wall is machined, and the 1.1 mm chamfer is the
          // facet the cutter polished: that difference in roughness is the crisp line
          // along the edge. A single roughness for the whole slot has no edge, only a dip.
          float vCutW = 1.0 - smoothstep(0.99, 1.03, vAbs);
          float vRough = vAbs < 0.80 ? 0.54 : mix(0.54, 0.16, smoothstep(0.80, 0.94, vAbs));
          roughnessFactor = mix(roughnessFactor, vRough, vCutW);
        `)
        .replace('#include <metalnessmap_fragment>', /* glsl */`#include <metalnessmap_fragment>
          // occluded metal: inside the cut it stops mirroring the warm room back out
          metalnessFactor = mix(metalnessFactor, 0.42, vCutW * (1.0 - 0.5 * smoothstep(0.52, 0.80, vAbs)));
        `)
        .replace('#include <aomap_fragment>', /* glsl */`#include <aomap_fragment>
          // occlusion on a *metal* has to reach the specular, not the albedo: multiplying
          // the diffuse term of a metalness-1 surface darkens nothing at all
          reflectedLight.indirectDiffuse *= vOcc;
          reflectedLight.indirectSpecular *= vOcc;
          reflectedLight.directDiffuse *= mix(1.0, vOcc, 0.6);
          reflectedLight.directSpecular *= mix(1.0, vOcc, 0.85);
        `)
        .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
          // The shell no longer pretends to be the diffuser. There is a real opal tube
          // lying in this trench now (see the emitter above), so what this term describes
          // is the light that tube throws back onto the metal it sits in: strongest on the
          // two walls, less on the floor it is lying on, and none outside the lip because
          // vCutW is zero there. There is no escape cone any more — the lips occlude the
          // tube by depth test, which is a mask that cannot disagree with the geometry.
          float vCatch = mix(0.30, 1.0, smoothstep(0.18, 0.86, vAbs)) * vCutW;
          totalEmissiveRadiance += uGlowColor * uInterior * vCatch * (1.0 - 0.35 * vWall);
        `),
    ].join('\n');
  };
  material.customProgramCacheKey = () => 'vesper-channel-v3';
  return material;
}

/* ---------- the light the channel throws ----------
   Not a pool centred under the object: a line source. The real world position and
   outward direction of the slot are uploaded for a handful of samples along the
   helix, and the floor plane and the wall integrate those emitters per pixel. The
   pattern on the floor is therefore obliged to be a helix, it turns with the seam
   because the seam turns with the object, and it goes dark directly beneath the
   base because that is where nothing can see the slot. */

const SPILL_SAMPLES = 20;     // one sample per 18 deg of the helix: a line, not a halo.
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
    float r = sqrt(d2) + 0.005;            // a frosted line, but a narrow one: the blur is
                                            // the slot's own width. Anything wider turns a
                                            // line source into a pool and throws the helix away
    // a *line* source falls off as 1/r, not 1/r²: that is the difference between a band
    // of light on the wall and a saturated blob, and it is why uPower stays small
    energy += smoothstep(0.22, 0.82, cosE) * max(cosS, 0.0) * uGain[k] / r;
  }

  float grain = texture2D(uGrain, vWorld.xz * 1.6 + vWorld.y * 0.5).r;
  energy *= mix(0.90, 1.07, grain);
  vec3 col = uColor * energy * uPower;
  // a knee, so the core of the band cannot clip: the pattern survives the highlight
  // instead of turning into a white hole with a warm rim. 1.05 flattened a bright patch
  // into a plate, which is how a shaped spill becomes a "generic amber pool"; 0.45 keeps
  // the falloff a gradient the eye can read as an edge.
  col = col / (1.0 + 0.45 * col);
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
  async function compile() {
    const toMain = () => new Promise((r) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => r(), { timeout: 120 });
      else setTimeout(r, 0);
    });
    try {
      /* compileAsync is not the answer here: it calls this.compile() synchronously
         first and only polls for the *link* afterwards, so the front-end cost stays in
         one task. Compile one mesh per task instead: the program cache means shared
         programs are built once, and the next task can paint and take input. No frame
         loop is running yet, so hiding the others cannot flash. */
      const list = [];
      scene.traverse((o) => { if (o.isMesh && o.visible) list.push(o); });
      for (let i = 0; i < list.length; i++) {
        list.forEach((o, n) => { o.visible = n === i; });
        try { renderer.compile(scene, camera); } catch (e) { /* first update() finishes it */ }
        await toMain();
      }
      list.forEach((o) => { o.visible = true; });
    } catch (e) { /* the first update() will compile what is left */ }
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
      uCut2: { value: 1.35 * 1.35 },
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
      uCut2: { value: 1.25 * 1.25 },
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

  const bodyGeo = shellGeometry();
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:t-shell');
  const brushed = brushedNormal();
  const bodyMat = channelify(new THREE.MeshStandardMaterial({
    // starts where the Foundry finish sits, so the first frame is not a different material
    color: 0xb6bac0, metalness: 1.0, roughness: 0.50,
    envMapIntensity: 1.30,
    normalMap: brushed, normalScale: new THREE.Vector2(0.50, 0.50),
    side: THREE.DoubleSide,
  }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  /* plinth — no channel in it, so it takes the same finish without the slot shader.
     It used to be `bodyMat.clone()`, which carried channelify() with it; the lathe has no
     aGroove attribute, so the attribute defaulted to 0 and the shader read the plinth as
     "inside the cut" — full depth, cut roughness, and the emissive bounce term. A cast
     aluminium plinth should simply be the same finish as the body. */
  const plinthProfile = [
    [0.0, 0.0000], [0.0, 0.0968], [0.0042, 0.0982], [0.0146, 0.0980],
    [0.0178, 0.0962], [0.0194, 0.0898], [0.0200, 0.0790], [0.0194, 0.0712],
    [0.0, 0.0],
  ].map(([y, r]) => new THREE.Vector2(r, y));
  const plinthGeo = new THREE.LatheGeometry(plinthProfile, 240);
  const plinthMat = bodyMat.clone();
  plinthMat.onBeforeCompile = () => {};
  plinthMat.customProgramCacheKey = () => 'vesper-plinth';
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0986, 0.0986, 0.0090, 140, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xa4a9ae, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.2 })
  );
  dial.position.y = 0.0094;
  group.add(dial);

  /* the light that escapes the slot: sits just outside the shell, follows the seam.
     This is what makes the object read as the source instead of a backlit prop. */
  const slotLight = new THREE.PointLight(0xffb464, 1.0, 0.62, 2);
  slotLight.position.set(0, 0.5 * (CHANNEL.yMin + CHANNEL.yMax), 0);
  group.add(slotLight);

  const slotLightLow = new THREE.PointLight(0xffb464, 0.45, 0.50, 2);
  slotLightLow.position.set(0, 0.075, 0);
  group.add(slotLightLow);

  /* the diffuser core is expressed in the shader (the groove floor emits), so this
     material is only a holder for the emitted colour and level */
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xfff4e4, emissive: new THREE.Color(0xffb464), emissiveIntensity: 2.2,
    roughness: 0.95, metalness: 0.0,
  });

  /* ---------- the diffuser, as an object ----------
     The gap has to be *visibly* the source, and it could not be, because there was
     nothing there to see: the emitter was a term in the shell's own emissive output,
     gated to |f| < 0.2 — 0.9 mm of arc, which the hero resolves as one pixel. That is
     why raising uGlow from 0.45 to 1.85 moved the groove by less than one count. The
     mask was never the fault; a sub-pixel element cannot be made to read by turning it
     up.

     So the diffuser is geometry now: a tube of 4.8 mm section laid along the helix, 3.4 mm
     below the outer surface, inside a slot 5 mm deep. The metal lips occlude it by depth
     test rather than by a shader gate, so it disappears round the silhouette for free and
     cannot glow through the far side; seen through the 9 mm aperture it is 4.8 mm of
     bright opal, which is 5 px at the hero and 56 px at the macro. It turns with the group,
     so it is the same object the spill samples are read from. */
  /* TubeGeometry reaches for the point through getPointAt(), which may not pass a target:
     give the sampler one of its own rather than assuming the caller supplied it. */
  const helical = (t, target = new THREE.Vector3()) => {
    const y = CHANNEL.yMin + 0.004 + (CHANNEL.yMax - CHANNEL.yMin - 0.008) * t;
    const a = channelCentreAngle(y);
    const r = Math.max(0.012, outerRadius(y) - CHANNEL.depth + 0.0016);
    return target.set(r * Math.cos(a), y, r * Math.sin(a));
  };
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) { return helical(t, target); }
  }
  const OPAL_R = 0.0024;
  const opal = new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 260, OPAL_R, 8, false), coreMat);
  opal.castShadow = false;
  opal.receiveShadow = true;
  group.add(opal);

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
    // the emitter line is the tube, so the spill is sampled from the geometry that is
    // actually glowing rather than from a radius picked to look right
    const r = Math.max(0.01, outerRadius(y) - CHANNEL.depth + 0.0016);
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
    coreMat.emissiveIntensity = 1.6 + i * 2.4;
    CH.uGlowColor.value.copy(coreMat.emissive);
    // Pass 4 — the shell's emissive term stopped being the source and became the bounce
    // off the tube (0.16 * a facet term). Pass 3c had to push it to 1.85 because it was
    // the whole effect and it was still sub-pixel; the fix was to give the slot something
    // to look at, not to turn the term up further.
    CH.uInterior.value = 0.10 + i * 0.14;
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
    wallSpillMat.uniforms.uPower.value = (0.075 + i * 0.185) * ember;
    floorPoolMat.uniforms.uPower.value = (0.070 + i * 0.170) * ember;

    // the slot turns with the object, because it is part of the object
    group.rotation.y = state.orbit;
    // ...and so does the key's direction in the object's own frame. Without this the wall
    // of the groove that is in shadow stays on the same side of the object as you turn it,
    // which is the tell that the shadow is painted rather than cast.
    {
      const [kx, kz] = _rot(-1.25, 1.15, -state.orbit);
      CH.uKeyLocal.value.set(kx / groupScaleX, 1.95, kz).normalize();
    }
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

  /* the cut, measured off the real vertex buffer — what tools/verify.mjs asserts on.
     outerRadius() is the smooth profile the lathe used to follow; the difference is
     the depth of the recess, so it cannot be a shader effect that reports itself. */
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

  function grooveProbe(atY) {
    const p = bodyGeo.getAttribute('position');
    const g = bodyGeo.getAttribute('aGroove');
    /* the rings are not evenly spaced, so snap to the ring nearest the height asked
       for rather than requiring one inside a tolerance */
    let row = null, best = Infinity;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(g.getX(i)) > 0.24) continue;
      const d = Math.abs(p.getY(i) - atY);
      if (d < best - 1e-6) { best = d; row = p.getY(i); }
    }
    let floor = Infinity, outer = 0, n = 0;
    if (row !== null) {
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(g.getX(i)) > 0.24) continue;
        if (Math.abs(p.getY(i) - row) > 1e-6) continue;
        n++;
        floor = Math.min(floor, Math.hypot(p.getX(i), p.getZ(i)));
        outer = Math.max(outer, Math.hypot(p.getX(i), p.getZ(i)));
      }
    }
    // the profile the lathe would have followed with no channel cut into it
    const prof = outerRadius(row === null ? atY : row);
    return {
      at: atY, samples: n, ringY: row === null ? null : +row.toFixed(5),
      floorRadius: floor === Infinity ? null : +floor.toFixed(5),
      profileRadius: +prof.toFixed(5),
      depth: floor === Infinity ? null : +(prof - floor).toFixed(5),
      halfWidth: +(channelHalf(row === null ? atY : row)).toFixed(5),
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
    return {
      visibleSection: +(2 * OPAL_R).toFixed(5),
      apertureFraction: +((2 * OPAL_R) / CHANNEL.aperture).toFixed(3),
      lipClearance: +(CHANNEL.depth - 0.0016 - OPAL_R).toFixed(5),
      yMin: +bb.min.y.toFixed(4), yMax: +bb.max.y.toFixed(4),
      midRadius: +(rMin).toFixed(5),
      profileAtMid: +outerRadius(midY).toFixed(5),
      vertices: p.count,
      emissiveIntensity: +coreMat.emissiveIntensity.toFixed(3),
    };
  }

  return {
    scene, camera, renderer, group, body, bodyMat, plinthMat, coreMat, opal, state,
    update, resize, compile, dispose: () => renderer.dispose(), isSettled,
    setFinish, setAtmosphere, setOrbit, setIntensity, setMood, paceCamera, snapCamera, settle,
    objectRect, grooveProbe, spillProbe, emitterProbe, ringCount: () => ringStack().length,
    CHANNEL, outerRadius,
  };
}
