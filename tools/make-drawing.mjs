/* Generates assets/vesper-drawing.svg from the SAME profile the renderer uses,
   so the technical drawing and the 3D object cannot drift apart. */
import fs from 'node:fs';
import path from 'node:path';
import { OUTER, CHANNEL } from '../js/scene3d.js';

const root = path.resolve(import.meta.dirname, '..');
const INK = '#14110e';
const HALF = '#9a9184';
const GLOW = '#c2793a';

const W = 560, H = 660;
const cx = 262;              // centre line x
const baseY = 556;           // plinth underside
const S = 1180;              // px per metre
const rmax = Math.max(...OUTER.map((p) => p[1]));

const px = (r) => r * S;
const py = (y) => baseY - y * S;

/* front silhouette: right side up, then mirrored back down */
const right = OUTER.map(([y, r]) => [cx + px(r), py(y)]);
const left = OUTER.slice().reverse().map(([y, r]) => [cx - px(r), py(y)]);
const sil = `M${right.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ')} L ${left.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ')} Z`;

/* the helical channel, drawn only where it faces the viewer (sin a >= 0) */
/* every channel number comes from the renderer's own constant, so a change to the
   milled profile cannot leave the drawing lying about it */
const PHASE = CHANNEL.phase, TURNS = CHANNEL.turns, Y0 = CHANNEL.yMin, Y1 = CHANNEL.yMax;
const R = (y) => {
  for (let i = 0; i < OUTER.length - 1; i++) {
    const [ya, ra] = OUTER[i], [yb, rb] = OUTER[i + 1];
    if (y >= ya && y <= yb) return ra + (rb - ra) * ((y - ya) / Math.max(1e-6, yb - ya));
  }
  return OUTER[OUTER.length - 1][1];
};
const seamSegs = [];
let cur = [];
for (let i = 0; i <= 220; i++) {
  const t = i / 220;
  const y = Y0 + (Y1 - Y0) * t;
  const a = PHASE + t * TURNS * Math.PI * 2;
  const front = Math.sin(a) >= 0.02;
  const x = cx + px(R(y) * Math.cos(a)) * 1.24;   // 1.24 = the oval plan scale used in 3D
  if (front) cur.push([x, py(y)]);
  else { if (cur.length > 1) seamSegs.push(cur); cur = []; }
}
if (cur.length > 1) seamSegs.push(cur);

const seamPaths = seamSegs.map((seg) =>
  `M${seg.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ')}`).join(' ');

/* plinth */
const plinthW = px(0.0982);
const plinth = `M${(cx - plinthW).toFixed(2)},${py(0.0).toFixed(2)} L${(cx - plinthW).toFixed(2)},${py(0.0178).toFixed(2)}
  Q${(cx - plinthW).toFixed(2)},${py(0.02).toFixed(2)} ${(cx - px(0.079)).toFixed(2)},${py(0.02).toFixed(2)}
  L${(cx + px(0.079)).toFixed(2)},${py(0.02).toFixed(2)}
  Q${(cx + plinthW).toFixed(2)},${py(0.02).toFixed(2)} ${(cx + plinthW).toFixed(2)},${py(0.0178).toFixed(2)}
  L${(cx + plinthW).toFixed(2)},${py(0.0).toFixed(2)} Z`;

const totalH = 0.347;
const dimLeftX = cx - px(rmax) * 1.24 - 46;
const dimTopY = py(totalH);
const dimBotY = py(0);

/* channel section detail — drawn from CHANNEL, not from a sketch of it.
   1 mm = 1.6 px here; the lips, the flat machined floor and the 0,6 mm edge breaks are
   the same numbers the lathe shell is cut with. */
const dX = 404, dY = 300, dR = 62;
const MM = 1.6;                                   // px per millimetre in the detail
const ap = CHANNEL.aperture * 1000 * MM;          // 9 mm across the lips
const half = ap / 2;
const dep = CHANNEL.depth * 1000 * MM;            // 5 mm to the floor
const brk = CHANNEL.break * 1000 * MM;            // 0,6 mm edge break
const xWall = half * CHANNEL.wallEnd;
const xFloor = half * CHANNEL.floorEnd;
const xOpal = half * CHANNEL.opalEnd;
const ARM = dR * 0.78, DEEP = 27;
const cut = `M${-ARM},0 L${-half},0 L${-xWall},${brk} L${-xFloor},${dep} L${xFloor},${dep} L${xWall},${brk} L${half},0 L${ARM},0 L${ARM},${DEEP} L${-ARM},${DEEP} Z`;
const surface = `M${-ARM},0 L${-half},0 L${-xWall},${brk} L${-xFloor},${dep} L${xFloor},${dep} L${xWall},${brk} L${half},0 L${ARM},0`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
  aria-label="Vesper 01 front elevation and channel section: 348 millimetres tall, 196 millimetres wide at the plinth, with a single helical channel 9 millimetres across, milled 5 millimetres deep and making 1.16 turns.">
<title>Vesper 01 — front elevation and channel section, 1:4</title>
<defs>
  <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="0.6" opacity="0.55"/>
  </pattern>
  <marker id="tick" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
    <line x1="4" y1="1" x2="4" y2="7" stroke="${INK}" stroke-width="0.8"/>
  </marker>
</defs>

<g stroke="${INK}" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <!-- centre line -->
  <line x1="${cx}" y1="${dimTopY - 26}" x2="${cx}" y2="${baseY + 22}" stroke-dasharray="14 4 3 4" stroke-width="0.7" opacity="0.5"/>

  <!-- body + plinth -->
  <path d="${sil}" stroke-width="1.15"/>
  <path d="${plinth}" stroke-width="1.15"/>

  <!-- helical channel, front-facing portions only -->
  <path d="${seamPaths}" stroke="${GLOW}" stroke-width="4.6" opacity="0.95"/>
  <path d="${seamPaths}" stroke="${INK}" stroke-width="0.5" opacity="0.5"/>

  <!-- ground -->
  <line x1="${dimLeftX - 18}" y1="${baseY}" x2="${cx + px(rmax) * 1.24 + 62}" y2="${baseY}" stroke-width="0.9"/>
</g>

<!-- overall height dimension -->
<g stroke="${INK}" fill="none" stroke-width="0.8">
  <line x1="${dimLeftX}" y1="${dimTopY}" x2="${dimLeftX}" y2="${baseY}"/>
  <line x1="${dimLeftX - 9}" y1="${dimTopY}" x2="${dimLeftX + 9}" y2="${dimTopY}"/>
  <line x1="${dimLeftX - 9}" y1="${baseY}" x2="${dimLeftX + 9}" y2="${baseY}"/>
  <line x1="${dimLeftX}" y1="${dimTopY}" x2="${cx - px(rmax) * 1.24 - 6}" y2="${dimTopY}" stroke-dasharray="3 4" opacity="0.6"/>
  <line x1="${dimLeftX}" y1="${baseY}" x2="${cx - plinthW - 6}" y2="${baseY}" stroke-dasharray="3 4" opacity="0.6"/>
</g>

<!-- plinth width dimension -->
<g stroke="${INK}" fill="none" stroke-width="0.8">
  <line x1="${cx - plinthW}" y1="${baseY + 34}" x2="${cx + plinthW}" y2="${baseY + 34}"/>
  <line x1="${cx - plinthW}" y1="${baseY + 28}" x2="${cx - plinthW}" y2="${baseY + 40}"/>
  <line x1="${cx + plinthW}" y1="${baseY + 28}" x2="${cx + plinthW}" y2="${baseY + 40}"/>
</g>

<!-- channel section detail -->
<clipPath id="detclip"><circle cx="${dX}" cy="${dY}" r="${dR - 1}"/></clipPath>
<g transform="translate(${dX} ${dY})">
  <circle r="${dR}" stroke="${INK}" fill="#efe7d9" stroke-width="0.9" opacity="1"/>
  <g clip-path="url(#detclip)">
    <path d="${cut}" fill="url(#hatch)" stroke="none"/>
    <path d="${surface}" fill="none" stroke="${INK}" stroke-width="1"/>
    <line x1="${-xOpal}" y1="${dep}" x2="${xOpal}" y2="${dep}" stroke="${GLOW}" stroke-width="3.2"/>
  </g>
  <!-- aperture, measured across the lips -->
  <g stroke="${INK}" stroke-width="0.8" fill="none">
    <line x1="${-half}" y1="-5" x2="${-half}" y2="-15"/>
    <line x1="${half}" y1="-5" x2="${half}" y2="-15"/>
    <line x1="${-half}" y1="-10" x2="${half}" y2="-10"/>
  </g>
  <text x="0" y="-17" fill="${INK}" font-family="IBM Plex Mono, monospace" font-size="9.5" text-anchor="middle">9</text>
  <!-- depth to the machined floor -->
  <g stroke="${INK}" stroke-width="0.8" fill="none">
    <line x1="${ARM - 2}" y1="0" x2="${ARM + 9}" y2="0"/>
    <line x1="${ARM - 2}" y1="${dep}" x2="${ARM + 9}" y2="${dep}"/>
    <line x1="${ARM + 5}" y1="0" x2="${ARM + 5}" y2="${dep}"/>
  </g>
  <text x="${ARM + 10}" y="${dep / 2 + 3}" fill="${INK}" font-family="IBM Plex Mono, monospace" font-size="8.5">5</text>
</g>

<!-- labels -->
<g fill="${INK}" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="0.6">
  <text x="${dimLeftX - 12}" y="${(dimTopY + baseY) / 2}" text-anchor="end">348</text>
  <text x="${cx}" y="${baseY + 50}" text-anchor="middle">196</text>
  <text x="${dX}" y="${dY + dR + 20}" text-anchor="middle" font-size="9">SECTION A—A · CHANNEL</text>
  <text x="${dX}" y="${dY + dR + 34}" text-anchor="middle" font-size="9" fill="${HALF}">OPAL DIFFUSER ON THE FLOOR · 0,6 LIP BREAK</text>
</g>
<g fill="${HALF}" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4">
  <text x="24" y="30">VESPER 01 · FRONT ELEVATION</text>
  <text x="24" y="46">SCALE 1:4 · DIMENSIONS IN MILLIMETRES</text>
  <text x="${W - 24}" y="${H - 16}" text-anchor="end">FIG. 01</text>
</g>
<g fill="${INK}" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4">
  <text x="24" y="${H - 16}">ALLOY 6063 · CHANNEL 9 × 5 · 1.16 TURNS · MACHINED</text>
</g>
</svg>
`;

fs.writeFileSync(path.join(root, 'assets/vesper-drawing.svg'), svg);
console.log('wrote assets/vesper-drawing.svg', svg.length, 'bytes');
