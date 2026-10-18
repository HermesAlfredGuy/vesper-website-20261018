/* Generates assets/vesper-drawing.svg from the SAME profile the renderer uses,
   so the technical drawing and the 3D object cannot drift apart. */
import fs from 'node:fs';
import path from 'node:path';
import { OUTER } from '../js/scene3d.js';

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
const PHASE = -1.15, TURNS = 1.16, Y0 = 0.038, Y1 = 0.286;
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

/* channel section detail */
const dX = 404, dY = 300, dR = 62;
const groove = 12;   // px representing 9 mm at the drawing's magnification

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
  aria-label="Vesper 01 front elevation and channel section: 348 millimetres tall, 196 millimetres wide at the plinth, with a 9 millimetre helical channel making 1.16 turns.">
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
<g transform="translate(${dX} ${dY})">
  <circle r="${dR}" stroke="${INK}" fill="#efe7d9" stroke-width="0.9" opacity="1"/>
  <g stroke="${INK}" fill="none" stroke-width="1">
    <path d="M${-dR * 0.78},${-groove / 2 - 26} L${-groove / 2},${-groove / 2 - 26} L${-groove / 2},${groove / 2 + 26} L${-dR * 0.78},${groove / 2 + 26} Z" fill="url(#hatch)"/>
    <path d="M${groove / 2},${-groove / 2 - 26} L${dR * 0.78},${-groove / 2 - 26} L${dR * 0.78},${groove / 2 + 26} L${groove / 2},${groove / 2 + 26} Z" fill="url(#hatch)"/>
  </g>
  <line x1="${-groove / 2}" y1="${-groove / 2 - 34}" x2="${groove / 2}" y2="${-groove / 2 - 34}" stroke="${INK}" stroke-width="0.8"/>
  <line x1="${-groove / 2}" y1="${-groove / 2 - 39}" x2="${-groove / 2}" y2="${-groove / 2 - 29}" stroke="${INK}" stroke-width="0.8"/>
  <line x1="${groove / 2}" y1="${-groove / 2 - 39}" x2="${groove / 2}" y2="${-groove / 2 - 29}" stroke="${INK}" stroke-width="0.8"/>
  <line x1="${-groove / 2}" y1="${groove / 2 + 30}" x2="${groove / 2}" y2="${groove / 2 + 30}" stroke="${GLOW}" stroke-width="3.4"/>
  <text x="0" y="${-groove / 2 - 44}" fill="${INK}" font-family="IBM Plex Mono, monospace" font-size="9.5" text-anchor="middle">9</text>
</g>
<path d="M${cx - px(rmax) * 1.24 + 8},${py(0.16)} L${dX - dR - 6},${dY}" stroke="${INK}" stroke-width="0.6" fill="none" stroke-dasharray="5 4" opacity="0.6"/>
<circle cx="${cx - px(rmax) * 1.24 + 8}" cy="${py(0.16)}" r="3" fill="${INK}"/>

<!-- labels -->
<g fill="${INK}" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="0.6">
  <text x="${dimLeftX - 12}" y="${(dimTopY + baseY) / 2}" text-anchor="end">348</text>
  <text x="${cx}" y="${baseY + 50}" text-anchor="middle">196</text>
  <text x="${dX}" y="${dY + dR + 20}" text-anchor="middle" font-size="9">SECTION A—A · CHANNEL</text>
  <text x="${dX}" y="${dY + dR + 34}" text-anchor="middle" font-size="9" fill="${HALF}">OPAL DIFFUSER 5 mm BEHIND</text>
</g>
<g fill="${HALF}" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4">
  <text x="24" y="30">VESPER 01 · FRONT ELEVATION</text>
  <text x="24" y="46">SCALE 1:4 · DIMENSIONS IN MILLIMETRES</text>
  <text x="${W - 24}" y="${H - 16}" text-anchor="end">FIG. 01</text>
</g>
<g fill="${INK}" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4">
  <text x="24" y="${H - 16}">FLAT PATTERN · ALLOY 6063 · CHANNEL 1.16 TURNS</text>
</g>
</svg>
`;

fs.writeFileSync(path.join(root, 'assets/vesper-drawing.svg'), svg);
console.log('wrote assets/vesper-drawing.svg', svg.length, 'bytes');
