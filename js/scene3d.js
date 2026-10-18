/* VESPER — realtime stage.
   One object, one room, one light seam. Everything procedural, no external assets. */

import * as THREE from '../vendor/three.module.js';
import { FINISHES, ATMOSPHERES } from './data.js';

export { FINISHES, ATMOSPHERES };

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
  t.repeat.set(9, 5);
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
   reflections, not a smooth gradient, or they read as glazed ceramic. */
function studioEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(12, 8, 12),
    new THREE.MeshBasicMaterial({ color: 0x14161a, side: THREE.BackSide })
  );
  s.add(room);
  const panel = (w, h, color, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    s.add(m);
    return m;
  };
  // key softbox overhead-front (the strongest single shape the metal mirrors)
  panel(6, 4, new THREE.Color(5.2, 5.2, 5.0), [0, 3.6, 0.6], [Math.PI / 2, 0, 0]);
  // narrow bright strip on the right, cooler
  panel(1.1, 3.4, new THREE.Color(1.9, 2.1, 2.4), [3.4, 1.5, 1.4], [0, -Math.PI / 2, 0]);
  // warm strip on the left at slot height
  panel(0.8, 2.6, new THREE.Color(3.4, 1.9, 0.85), [-3.4, 1.4, 0.9], [0, Math.PI / 2, 0]);
  // dark floor bounce
  panel(12, 12, new THREE.Color(0.06, 0.055, 0.05), [0, -4, 0], [-Math.PI / 2, 0, 0]);
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

function bodyProfile() {
  const inset = 0.0072;
  const inner = OUTER.slice().reverse().map(([y, r]) => [y - inset, Math.max(0, r - inset)]);
  return OUTER.concat(inner).concat([[OUTER[0][0], OUTER[0][1]]]);
}

const BODY_TOP = OUTER[OUTER.length - 1][0];

/* ---------- seam shader: two wraps, cut straight out of the shell ---------- */

const SEAM = {
  uPhase: { value: -1.15 },
  uTurns: { value: 1.16 },
  uWidth: { value: 0.050 },
  uYMin: { value: 0.038 },
  uYMax: { value: 0.286 },
  uEdge: { value: 0.026 },
  uPhase2: { value: 1.99 },
  uWidth2: { value: 0.034 },
  uYMin2: { value: 0.150 },
  uYMax2: { value: 0.300 },
  uGlowColor: { value: new THREE.Color(0xffa955) },
  uGlow: { value: 1 },
};

/* where the slot points at half height, in object space: drives the raking light */
export function slotAngle(phase) {
  return phase + 0.5 * SEAM.uTurns.value * Math.PI * 2;
}
export const SLOT_Y = 0.5 * (0.038 + 0.286);
export const SLOT_RADIUS = 0.104;

/* One helical start only: a single continuous channel, so nothing can cross itself
   in projection. The groove is shaded, not cut away: a lit floor inside the channel,
   walls whose normals tilt, and a soft machined shoulder. */
const SEAM_GLSL = /* glsl */`
  float vAngle = atan(vObjPos.z, vObjPos.x);
  float vT = clamp((vObjPos.y - uYMin) / (uYMax - uYMin), 0.0, 1.0);
  float vC = uPhase + vT * uTurns * 6.2831853;
  float vDa = mod(vAngle - vC + 3.14159265, 6.2831853) - 3.14159265;
  float vWa = uWidth * (0.70 + 0.50 * (1.0 - vT));
  float vSeam = abs(vDa) - vWa;
  float vSide = vDa < 0.0 ? -1.0 : 1.0;
  float vSlot = 1.0 - smoothstep(0.0, 0.011, vSeam);
  float vWall = exp(-pow(vSeam / 0.016, 2.0)) * vSide;
  float vShoulder = 1.0 - smoothstep(0.006, 0.050, abs(vSeam));
  float vBleed = exp(-pow(max(vSeam, 0.0) / 0.105, 2.0)) * (1.0 - vShoulder * 0.4);
  vec3 vTangent = normalize(vec3(-vObjPos.z, 0.0, vObjPos.x));
`;

function seamify(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SEAM);
    shader.vertexShader = 'varying vec3 vObjPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vObjPos = position;'
    );
    shader.fragmentShader = [
      'varying vec3 vObjPos;',
      'uniform float uPhase; uniform float uTurns; uniform float uWidth; uniform float uYMin; uniform float uYMax; uniform float uEdge;',
      'uniform float uPhase2; uniform float uWidth2; uniform float uYMin2; uniform float uYMax2;',
      'uniform vec3 uGlowColor; uniform float uGlow;',
      shader.fragmentShader
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
          ${SEAM_GLSL}
          diffuseColor.rgb *= mix(1.0, 0.52, vShoulder);
          diffuseColor.rgb *= mix(1.0, 0.70, vSlot);
        `)
        .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.24, vShoulder * 0.8);
        `)
        .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
          normal = normalize(normal + vTangent * vWall * 0.34);
        `)
        .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
          // light inside the channel, plus the warm bleed it puts on the metal either side:
          // this is what makes it read as a source rather than a painted stripe
          totalEmissiveRadiance += uGlowColor * uGlow * pow(vSlot, 1.35);
          totalEmissiveRadiance += uGlowColor * uGlow * vBleed * 0.45;
          totalEmissiveRadiance *= mix(1.0, 0.30, vShoulder);
        `),
    ].join('\n');
  };
  material.customProgramCacheKey = () => 'vesper-seam-v3';
  return material;
}

/* ---------- spill shaders ---------- */

const spillVert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const wallSpillFrag = /* glsl */`
uniform vec3 uColor;
uniform float uPower;
uniform float uSway;
uniform float uAspect;
uniform float uScale;
uniform sampler2D uGrain;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // the plane is 3.4 x 2.2 anchored at world y = 1.02, so the floor line sits at v = 0.036
  float x = (vUv.x - 0.5) * 3.4;
  float y = vUv.y;

  // one patch, centred behind the object: whatever it does, it does because the
  // object is standing there. It only leans a little the way the slot faces.
  float lean = uSway * 0.06;
  float cx = lean * (0.35 + 0.65 * y);
  float halfw = 0.08 + 0.28 * pow(max(y - 0.03, 0.0), 1.05);
  float spread = smoothstep(halfw, halfw * 0.04, abs(x - cx));

  // the helix shows up as a narrow bright diagonal — the slit's own projection —
  // inside a wider, much weaker wash, plus a compact halo that hugs the object
  float s = 0.20 * sin((y - 0.06) * 4.6 + uSway * 0.8);
  float coreW = 0.045 + 0.03 * y;
  float core = smoothstep(coreW, 0.0, abs(x - cx - s));
  float hug = 1.0 / (1.0 + pow(abs(x - cx) / 0.26, 2.2));

  // the patch lives at the height of the channel, so it reads as light leaving the
  // object rather than as a wash painted on the whole wall
  float lift = smoothstep(0.02, 0.06, y) * (1.0 - smoothstep(0.10, 0.22, y));

  float grain = texture2D(uGrain, vUv * vec2(uAspect * 1.7, 2.0)).r;
  float reveal = mix(0.93, 1.07, grain);

  // the structured projection of the channel dominates; the diffuse terms are only
  // there to keep the patch from looking cut out
  float energy = (core * 1.30 + hug * 0.16 + spread * 0.08) * lift * reveal * uPower;
  vec3 col = uColor * energy;
  col += (hash(vUv * 2048.0) - 0.5) * (1.6 / 255.0) * step(0.002, energy);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const floorPoolFrag = /* glsl */`
uniform vec3 uColor;
uniform float uPower;
uniform float uSway;
uniform float uAspect;
uniform float uScale;
uniform sampler2D uGrain;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // PlaneGeometry(3,3) rotated -90° about x and placed at z = +0.30: world z = 1.8 - 3*uv.y
  // and world x = 3*(uv.x - 0.5). The object's base is therefore at uv = (0.5, 0.60),
  // and p.y > 0 points towards the viewer.
  vec2 p = vec2((vUv.x - 0.5) * 3.0, (0.60 - vUv.y) * 3.0);
  float r = length(p * vec2(1.0, 0.74));
  float halo = smoothstep(0.20, 0.012, r);          // tight, hugs the plinth
  float pool = smoothstep(0.52, 0.03, r);           // fall-off around it, kept near the object
  float fy = max(p.y, 0.0);
  float sx = abs(p.x) / (0.20 + 0.42 * fy);
  float streak = exp(-sx * sx) * smoothstep(0.02, 0.22, fy) * (1.0 - smoothstep(0.45, 1.25, fy));
  float grain = texture2D(uGrain, vUv * vec2(uAspect * 2.4, 2.4)).r;
  float energy = (halo * 2.30 + pool * 0.30 + streak * 0.20) * mix(0.92, 1.08, grain) * uPower;
  vec3 col = uColor * energy;
  col += (hash(vUv * 2048.0) - 0.5) * (1.6 / 255.0);
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
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
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

  /* contact grounding so the object does not float */
  const contactTex = radialTexture(1, 0.62);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({
      map: contactTex, color: 0x000000, transparent: true, opacity: 0.62,
      depthWrite: false, blending: THREE.NormalBlending,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0.012, 0.0016, 0.004);
  scene.add(contact);

  /* spill planes */
  const grainTex = plaster.bumpMap;
  const wallSpillMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffb464) },
      uPower: { value: 1 }, uSway: { value: 0 },
      uAspect: { value: 1.55 }, uScale: { value: 1 },
      uGrain: { value: grainTex },
    },
    vertexShader: spillVert, fragmentShader: wallSpillFrag,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const wallSpill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), wallSpillMat);
  wallSpill.position.set(0, 1.02, -0.712);
  scene.add(wallSpill);

  const floorPoolMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffb464) },
      uPower: { value: 1 }, uSway: { value: 0 },
      uAspect: { value: 1 }, uScale: { value: 1 },
      uGrain: { value: grainTex },
    },
    vertexShader: spillVert, fragmentShader: floorPoolFrag,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const floorPool = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), floorPoolMat);
  floorPool.rotation.x = -Math.PI / 2;
  floorPool.position.set(0, 0.0032, 0.30);
  scene.add(floorPool);

  /* lights */
  const hemi = new THREE.HemisphereLight(0xb9c3cc, 0x2a231d, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xf2f4f6, 1.25);
  key.position.set(-1.25, 1.95, 1.15);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.3;
  key.shadow.camera.right = 1.3;
  key.shadow.camera.top = 2.0;
  key.shadow.camera.bottom = -0.4;
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 6;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.014;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc7d2da, 0.5);
  rim.position.set(1.5, 1.1, -1.2);
  scene.add(rim);

  const seamLight = new THREE.PointLight(0xffb464, 2.2, 0.95, 2);
  seamLight.position.set(0, 0.16, 0);
  scene.add(seamLight);
  /* the object */
  const group = new THREE.Group();
  scene.add(group);

  const profilePts = bodyProfile().map(([y, r]) => new THREE.Vector2(r, y));
  const bodyGeo = new THREE.LatheGeometry(profilePts, 200, 0, Math.PI * 2);
  bodyGeo.computeVertexNormals();

  const blast = blastMap();
  blast.repeat.set(11, 11);
  const bodyMat = seamify(new THREE.MeshStandardMaterial({
    color: 0x3a3d41, metalness: 0.72, roughness: 0.46,
    envMapIntensity: 1.35,
    bumpMap: blast, bumpScale: 0.05,
    side: THREE.DoubleSide,
  }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  /* plinth */
  const plinthProfile = [
    [0.0, 0.0000], [0.0, 0.0968], [0.0042, 0.0982], [0.0146, 0.0980],
    [0.0178, 0.0962], [0.0194, 0.0898], [0.0200, 0.0790], [0.0194, 0.0712],
    [0.0, 0.0],
  ].map(([y, r]) => new THREE.Vector2(r, y));
  const plinthGeo = new THREE.LatheGeometry(plinthProfile, 180);
  const plinthMat = seamify(bodyMat.clone());
  plinthMat.onBeforeCompile = bodyMat.onBeforeCompile;
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0986, 0.0986, 0.0090, 140, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x8b867e, metalness: 0.94, roughness: 0.30, envMapIntensity: 1.7 })
  );
  dial.position.y = 0.0094;
  group.add(dial);

  /* the light that escapes the slot: sits just outside the shell, follows the seam.
     This is what makes the object read as the source instead of a backlit prop. */
  const slotLight = new THREE.PointLight(0xffb464, 2.4, 0.80, 2);
  slotLight.position.set(0, SLOT_Y, 0);
  group.add(slotLight);

  const slotLightLow = new THREE.PointLight(0xffb464, 1.0, 0.75, 2);
  slotLightLow.position.set(0, 0.075, 0);
  group.add(slotLightLow);

  /* the diffuser core is now expressed in the shader (the groove floor emits),
     so this material is only a holder for the emitted colour and level */
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xfff4e4, emissive: new THREE.Color(0xffb464), emissiveIntensity: 2.6,
    roughness: 0.95, metalness: 0.0,
  });

  // oval plan
  group.scale.set(1.24, 1, 1);

  /* glow — one small contact glow only. A large screen-space bloom sprite reads as
   haze floating in front of the wall; the wall spill and floor pool are the real
   light cues, and they are anchored in world space. */
  const glowTex = radialTexture(1, 0.5);
  const glowBase = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffb464, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0.12,
  }));
  glowBase.scale.set(0.24, 0.13, 1);
  glowBase.position.set(0, 0.035, 0.06);
  scene.add(glowBase);

  /* ---------- state ---------- */
  const state = {
    finish: FINISHES[2],
    finishTarget: FINISHES[2],
    atmosphere: ATMOSPHERES[1],
    atmoTarget: ATMOSPHERES[1],
    phase: SEAM.uPhase.value,
    targetPhase: SEAM.uPhase.value,
    intensity: 0.72,
    targetIntensity: 0.72,
    mood: 0.85,
    targetMood: 0.85,
    orbit: 0,
    targetOrbit: 0,
    camera: { pos: new THREE.Vector3(0, 0.25, 0.98), target: new THREE.Vector3(-0.03, 0.2, 0), fov: 33 },
    targetCam: {
      pos: new THREE.Vector3(0, 0.25, 0.98),
      target: new THREE.Vector3(-0.03, 0.2, 0),
      fov: 33,
    },
  };

  const DAY = {
    bg: new THREE.Color(0xc7bfb1), wall: new THREE.Color(0xd6cec0), floor: new THREE.Color(0xc2bbad),
    hemi: 1.5, key: 2.4, rim: 1.1, exposure: 0.93, fogNear: 2.4, fogFar: 6.8,
    keyColor: new THREE.Color(0xfff6ea), envInt: 1.0,
  };
  const NIGHT = {
    bg: new THREE.Color(0x0d0b0a), wall: new THREE.Color(0x2a2521), floor: new THREE.Color(0x1f1b18),
    hemi: 0.14, key: 0.62, rim: 0.62, exposure: 1.06, fogNear: 1.05, fogFar: 3.6,
    keyColor: new THREE.Color(0x9fb4c6), envInt: 0.30,
  };
  const tmp = new THREE.Color();

  function setFinish(id) { state.finishTarget = FINISHES.find((f) => f.id === id) || FINISHES[0]; }
  function setAtmosphere(id) { state.atmoTarget = ATMOSPHERES.find((a) => a.id === id) || ATMOSPHERES[1]; }
  function setPhase(rad) { state.targetPhase = rad; }
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

  let t = 0;
  let instant = false;
  function settle() { instant = true; }      // jump every damped value to its target (tests, deep links)
  function update(dtIn, reduced = false) {
    // a bad frame delta (negative, NaN, long stall) must never blow up the damping
    let dt = Number.isFinite(dtIn) ? Math.max(0, Math.min(0.05, dtIn)) : 0;
    if (dt === 0) dt = 0.0001;
    t += dt;
    const k = (tau) => (instant ? 1 : Math.min(1, Math.max(0, 1 - Math.exp(-dt / tau))));

    state.phase += (state.targetPhase - state.phase) * k(0.16);
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
    glowBase.material.color.lerp(tmp.set(at.color), al);

    const i = state.intensity;
    coreMat.emissiveIntensity = 0.9 + i * 2.6;
    SEAM.uGlowColor.value.copy(coreMat.emissive);
    SEAM.uGlow.value = 0.9 + i * 3.6;
    seamLight.intensity = 0.25 + i * 1.35;
    glowBase.material.opacity = 0.04 + i * 0.10;
    slotLight.intensity = 0.15 + i * 0.85;
    slotLight.color.copy(coreMat.emissive);
    slotLightLow.intensity = 0.1 + i * 0.5;
    slotLightLow.color.copy(coreMat.emissive);

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
    contact.material.opacity = (0.30 + 0.42 * m) * (1 - 0.35 * i);

    // emitted light reads in both moods: the room is never lit by anything else at night
    const ember = 0.55 + 0.45 * m;
    wallSpillMat.uniforms.uPower.value = (0.42 + i * 0.95) * ember;
    floorPoolMat.uniforms.uPower.value = (0.34 + i * 0.88) * ember;

    const sway = Math.sin(state.phase) * 0.85 + Math.sin(state.orbit) * 0.3;
    wallSpillMat.uniforms.uSway.value = sway;
    floorPoolMat.uniforms.uSway.value = sway;

    // a soft source just outside the shell: it pools on the floor and wall without
    // blasting the metal (the metal's warm bleed is shaded, not lit)
    const sa = slotAngle(state.phase);
    const rOut = SLOT_RADIUS * (1.5 + 1.1 * state.intensity);
    slotLight.position.set(Math.cos(sa) * rOut, SLOT_Y, Math.sin(sa) * rOut);
    slotLightLow.position.set(Math.cos(sa - 1.1) * rOut * 0.86, 0.075, Math.sin(sa - 1.1) * rOut * 0.86);

    group.rotation.y = state.orbit;
    SEAM.uPhase.value = state.phase;

    if (!reduced) group.position.y = Math.sin(t * 0.5) * 0.0009;

    renderer.render(scene, camera);
    instant = false;
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wallSpillMat.uniforms.uAspect.value = 3.4 / 2.2;
    floorPoolMat.uniforms.uAspect.value = 1;
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

  return {
    scene, camera, renderer, group, body, bodyMat, coreMat, state,
    update, resize, compile, dispose: () => renderer.dispose(),
    setFinish, setAtmosphere, setPhase, setOrbit, setIntensity, setMood, paceCamera, snapCamera, settle, objectRect,
  };
}
