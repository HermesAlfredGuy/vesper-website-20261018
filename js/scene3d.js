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

function blastMap() {
  const S = 256;
  const c = canvas(S);
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  valueNoise(g, S, S, 180, 0.30, 'overlay');
  valueNoise(g, S, S, 380, 0.16, 'overlay');
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(13, 13);
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
  panel(6, 4, new THREE.Color(3.6, 3.62, 3.66), [0, 3.6, 0.6], [Math.PI / 2, 0, 0]);
  // narrow bright strip on the right, cooler — the long vertical specular
  panel(0.9, 3.4, new THREE.Color(1.55, 1.68, 1.86), [3.4, 1.5, 1.4], [0, -Math.PI / 2, 0]);
  // matching strip on the left, neutral and weaker, so the body has two edges
  panel(0.7, 2.6, new THREE.Color(0.62, 0.63, 0.65), [-3.4, 1.4, 0.9], [0, Math.PI / 2, 0]);
  // a broad soft panel overhead — the softbox. A narrow strip reflects into one
  // thin specular; a *large* source is what a matte metal actually returns, and it
  // is the difference between a grey column and a black one.
  panel(4.6, 4.6, new THREE.Color(1.42, 1.44, 1.48), [0.4, 5.0, 0.7], [-Math.PI / 2, 0, 0]);
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
  floorEnd: 0.72,     // of the half-aperture: flat machined floor out to here ..
  wallEnd: 0.92,      // .. then the wall rises back to the outer radius
  break: 0.0006,      // 0.6 mm edge break on each lip
  opalEnd: 0.28,      // of the half-aperture: the diffuser is a line, not a floor
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
/** how far the surface is cut below the outer radius at a given offset */
function slotCut(f) {
  const a = Math.abs(f);
  if (a <= CHANNEL.floorEnd) return CHANNEL.depth;
  if (a <= CHANNEL.wallEnd) {
    const u = (a - CHANNEL.floorEnd) / (CHANNEL.wallEnd - CHANNEL.floorEnd);
    return CHANNEL.depth - (CHANNEL.depth - CHANNEL.break) * (u * u * (3 - 2 * u));
  }
  if (a < 1) {
    const u = (a - CHANNEL.wallEnd) / (1 - CHANNEL.wallEnd);
    return CHANNEL.break * (1 - (u * u * (3 - 2 * u)));
  }
  return 0;
}

/* ---------- the shell ----------
   One ring per height, each ring carrying the same angular samples — but clustered,
   so that wherever the channel is at that height it gets 40 samples across 9 mm and
   the remaining 200 spread over the rest of the circumference. The dense span is the
   same in every ring, so the parametrisation follows the helix and the mesh stays a
   regular grid. */

const RING_DENSE = 40;
const RING_UNIFORM = 200;
const DENSE_HALF = 0.095;    // radians either side of the channel centre

function ringColumns() {
  const u = [];
  for (let k = 0; k < RING_DENSE; k++) u.push(-DENSE_HALF + (2 * DENSE_HALF * k) / (RING_DENSE - 1));
  for (let k = 0; k < RING_UNIFORM; k++) u.push(DENSE_HALF + ((TAU - 2 * DENSE_HALF) * k) / RING_UNIFORM);
  u.push(u[0] + TAU);                       // close the ring
  return u;
}

function ringStack() {
  const rings = [];
  const span = (ya, ra, yb, rb, n, outer) => {
    for (let k = 0; k < n; k++) {
      const u = k / n;
      rings.push({ y: ya + (yb - ya) * u, r: ra + (rb - ra) * u, outer });
    }
  };
  for (let i = 0; i < OUTER.length - 1; i++) span(OUTER[i][0], OUTER[i][1], OUTER[i + 1][0], OUTER[i + 1][1], 3, true);
  rings.push({ y: OUTER[OUTER.length - 1][0], r: OUTER[OUTER.length - 1][1], outer: true });

  const inner = OUTER.slice().reverse().map(([y, r]) => [y - WALL_INSET, Math.max(0, r - WALL_INSET)]);
  for (let i = 0; i < inner.length - 1; i++) span(inner[i][0], inner[i][1], inner[i + 1][0], inner[i + 1][1], 2, false);
  rings.push({ y: inner[inner.length - 1][0], r: inner[inner.length - 1][1], outer: false });

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
      uv[o * 2] = j / (cols - 1);
      uv[o * 2 + 1] = i / (rows - 1);
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
   The diffuser is a source, so it is emission — but it is emission *inside a slot*,
   masked by the offset across the groove that the geometry already carries. No
   aspect of the aperture's shape is decided here. */

const CH = {
  uGlowColor: { value: new THREE.Color(0xffb464) },
  uGlow: { value: 1 },
  uOpalEnd: { value: CHANNEL.opalEnd },
};

function channelify(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowColor = CH.uGlowColor;
    shader.uniforms.uGlow = CH.uGlow;
    shader.uniforms.uOpalEnd = CH.uOpalEnd;
    shader.vertexShader = 'attribute float aGroove;\nvarying float vGroove;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vGroove = aGroove;'
    );
    shader.fragmentShader = [
      'varying float vGroove;',
      'uniform vec3 uGlowColor; uniform float uGlow; uniform float uOpalEnd;',
      shader.fragmentShader
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
          float vAbs = abs(vGroove);
          // Inside the cut the surface is raw machined metal in its own shadow: the
          // outer light cannot reach it. Darkening it is honest, but the *shape* of the
          // darkening is what draws the recess — flat across the floor, ramping up the
          // walls — so this is a profile, not a wash.
          float vIn = smoothstep(0.06, 0.26, vAbs) * (1.0 - smoothstep(0.86, 1.02, vAbs));
          diffuseColor.rgb *= mix(1.0, 0.16, vIn);
          // the lip throws its own shadow onto the body just outside the cut. Without
          // it the shoulders of the channel sit at exactly the same value as the rest
          // of the column and the whole thing flattens into a stripe.
          float vSpill = exp(-pow((vAbs - 1.34) / 0.30, 2.0));
          diffuseColor.rgb *= (1.0 - 0.38 * vSpill);
        `)
        .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
          // machined, not polished: a mirror inside the slot just returns the room again
          roughnessFactor = mix(roughnessFactor, 0.52, vIn);
        `)
        .replace('#include <metalnessmap_fragment>', /* glsl */`#include <metalnessmap_fragment>
          // and it is occluded metal, so it stops mirroring the warm room back out
          metalnessFactor = mix(metalnessFactor, 0.30, vIn);
        `)
        .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
          // the opal diffuser, a line at the bottom of the slot rather than a lit floor:
          // 9 mm of glowing floor reads as a stripe, 1.5 mm of glowing line reads as
          // light inside a gap
          float vOpal = 1.0 - smoothstep(uOpalEnd - 0.13, uOpalEnd + 0.07, vAbs);
          totalEmissiveRadiance += uGlowColor * uGlow * pow(vOpal, 1.0);
          // the 0.6 mm chamfer on each lip, and nothing else: a hairline, not a wash
          float vLip = exp(-pow((vAbs - 1.02) / 0.085, 2.0));
          totalEmissiveRadiance += uGlowColor * uGlow * 0.16 * vLip;
        `),
    ].join('\n');
  };
  material.customProgramCacheKey = () => 'vesper-channel-v1';
  return material;
}

/* ---------- the light the channel throws ----------
   Not a pool centred under the object: a line source. The real world position and
   outward direction of the slot are uploaded for a handful of samples along the
   helix, and the floor plane and the wall integrate those emitters per pixel. The
   pattern on the floor is therefore obliged to be a helix, it turns with the seam
   because the seam turns with the object, and it goes dark directly beneath the
   base because that is where nothing can see the slot. */

const SPILL_SAMPLES = 8;      // one sample per ~52° of the helix: enough to read as a band, cheap enough for a phone

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
uniform vec3 uB[K];            // (segments, not points: eight points make a halo on the
uniform vec3 uNorm[K];         //  wall, eight segments make a band that follows it)
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
    float r = sqrt(d2) + 0.024;            // a frosted line, but a narrow one: a wide
                                            // blur radius turns any line source into a
                                            // smooth pool and throws the helix away
    // a *line* source falls off as 1/r, not 1/r²: that is the difference between a band
    // of light on the wall and a saturated blob, and it is why uPower stays small
    energy += smoothstep(0.05, 0.60, cosE) * max(cosS, 0.0) * uGain[k] / r;
  }

  float grain = texture2D(uGrain, vWorld.xz * 1.6 + vWorld.y * 0.5).r;
  energy *= mix(0.90, 1.07, grain);
  vec3 col = uColor * energy * uPower;
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
     cost; compileAsync does it in chunks and yields between them. */
  async function compile() {
    try {
      const gl = renderer.getContext();
      const parallel = gl && typeof gl.getExtension === 'function' && gl.getExtension('KHR_parallel_shader_compile');
      if (parallel && typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
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
      gain.push(0.55 + 0.45 * ((k + 0.5) / SPILL_SAMPLES));
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

  /* contact: the object is standing on a floor, so it has to sit on one. A tight
     core plus a wider soft ellipse, both drawn over the spill so the light that the
     slot throws at the base is occluded by the thing that is standing there. */
  const contactCore = new THREE.Mesh(
    new THREE.PlaneGeometry(0.30, 0.30),
    new THREE.MeshBasicMaterial({
      map: radialTexture(1, 0.34), color: 0x000000, transparent: true, opacity: 0.66,
      depthWrite: false, blending: THREE.NormalBlending,
    })
  );
  contactCore.rotation.x = -Math.PI / 2;
  contactCore.position.set(0, 0.0040, -0.004);
  contactCore.renderOrder = 2;
  scene.add(contactCore);

  const contactWide = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.60),
    new THREE.MeshBasicMaterial({
      map: radialTexture(0.60, 0.30), color: 0x000000, transparent: true, opacity: 0.30,
      depthWrite: false, blending: THREE.NormalBlending,
    })
  );
  contactWide.rotation.x = -Math.PI / 2;
  contactWide.position.set(0.045, 0.0036, 0.028);
  contactWide.renderOrder = 1;
  scene.add(contactWide);

  /* lights */
  const hemi = new THREE.HemisphereLight(0xb9c3cc, 0x2a231d, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xf2f4f6, 1.25);
  key.position.set(-1.25, 1.95, 1.15);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
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

  const seamLight = new THREE.PointLight(0xffb464, 0.9, 0.85, 2);
  seamLight.position.set(0, 0.16, 0);
  scene.add(seamLight);
  /* the object */
  const group = new THREE.Group();
  scene.add(group);

  const bodyGeo = shellGeometry();
  const blast = blastMap();
  const bodyMat = channelify(new THREE.MeshStandardMaterial({
    color: 0x3a3d41, metalness: 0.78, roughness: 0.56,
    envMapIntensity: 0.95,
    bumpMap: blast, bumpScale: 0.10,
    side: THREE.DoubleSide,
  }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  /* plinth — no channel in it, so it takes the same finish without the slot shader */
  const plinthProfile = [
    [0.0, 0.0000], [0.0, 0.0968], [0.0042, 0.0982], [0.0146, 0.0980],
    [0.0178, 0.0962], [0.0194, 0.0898], [0.0200, 0.0790], [0.0194, 0.0712],
    [0.0, 0.0],
  ].map(([y, r]) => new THREE.Vector2(r, y));
  const plinthGeo = new THREE.LatheGeometry(plinthProfile, 180);
  const plinthMat = bodyMat.clone();
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0986, 0.0986, 0.0090, 140, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x8b867e, metalness: 0.94, roughness: 0.34, envMapIntensity: 1.35 })
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
    keyColor: new THREE.Color(0xfff6ea), envInt: 1.0,
  };
  const NIGHT = {
    bg: new THREE.Color(0x0d0b0a), wall: new THREE.Color(0x2a2521), floor: new THREE.Color(0x1f1b18),
    hemi: 0.22, key: 0.86, rim: 1.30, exposure: 0.98, fogNear: 1.05, fogFar: 3.6,
    keyColor: new THREE.Color(0x9fb4c6), envInt: 0.78,
  };
  const tmp = new THREE.Color();

  function setFinish(id) { state.finishTarget = FINISHES.find((f) => f.id === id) || FINISHES[0]; }
  function setAtmosphere(id) { state.atmoTarget = ATMOSPHERES.find((a) => a.id === id) || ATMOSPHERES[1]; }
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
    const r = Math.max(0.01, outerRadius(y) - CHANNEL.depth * 0.5);
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

  let t = 0;
  let instant = false;
  function settle() { instant = true; }      // jump every damped value to its target (tests, deep links)
  function update(dtIn, reduced = false) {
    // a bad frame delta (negative, NaN, long stall) must never blow up the damping
    let dt = Number.isFinite(dtIn) ? Math.max(0, Math.min(0.05, dtIn)) : 0;
    if (dt === 0) dt = 0.0001;
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

    /* finish */
    const ft = state.finishTarget;
    const fl = k(0.18);
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
    const al = k(0.2);
    state.atmosphere = at;
    coreMat.emissive.lerp(tmp.set(at.color), al);
    seamLight.color.lerp(tmp.set(at.color), al);
    wallSpillMat.uniforms.uColor.value.lerp(tmp.set(at.spill), al);
    floorPoolMat.uniforms.uColor.value.lerp(tmp.set(at.spill), al);
    slotLight.color.lerp(tmp.set(at.color), al);
    slotLightLow.color.lerp(tmp.set(at.color), al);

    const i = state.intensity;
    coreMat.emissiveIntensity = 0.9 + i * 2.2;
    CH.uGlowColor.value.copy(coreMat.emissive);
    CH.uGlow.value = 0.55 + i * 1.35;
    // the slot's own bounce stays small: a dark anodised body must not be repainted
    // amber by the light that comes out of it
    seamLight.intensity = 0.18 + i * 0.52;
    slotLight.intensity = 0.10 + i * 0.34;
    slotLightLow.intensity = 0.05 + i * 0.16;

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
    // calibrated so the hottest floor patch lands under the seam, and nothing clips
    wallSpillMat.uniforms.uPower.value = (0.064 + i * 0.162) * ember;
    floorPoolMat.uniforms.uPower.value = (0.058 + i * 0.142) * ember;

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

    contactCore.material.opacity = (0.30 + 0.44 * m) * (1 - 0.30 * i);
    contactWide.material.opacity = (0.16 + 0.24 * m) * (1 - 0.20 * i);

    if (!reduced) group.position.y = Math.sin(t * 0.5) * 0.0009;

    renderer.render(scene, camera);
    instant = false;
  }

  function resize(w, h) {
    if (!w || !h) return;
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

  return {
    scene, camera, renderer, group, body, bodyMat, plinthMat, coreMat, state,
    update, resize, compile, dispose: () => renderer.dispose(),
    setFinish, setAtmosphere, setOrbit, setIntensity, setMood, paceCamera, snapCamera, settle,
    objectRect, grooveProbe, spillProbe, CHANNEL, outerRadius,
  };
}
