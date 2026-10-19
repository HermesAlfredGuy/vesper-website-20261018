/* Three frames of the same moment, so a pixel measurement can name what it is looking at.
 *
 *   <out>.frame.png  what the reader gets, UI and all (the A/B and the copy checks)
 *   <out>.scene.png  the render alone: every DOM layer hidden, so nothing measured on
 *                    the floor is a label or the dock
 *   <out>.id.png     the object drawn flat magenta (a hue that appears nowhere in the
 *                    palette) — an exact silhouette, since the channel is a radial cut
 *                    and cannot change the outline
 *   <out>.planes.png floor = red, wall = green, nothing = blue. Every pixel classified by
 *                    intersecting the camera ray with the two planes it actually is,
 *                    so "the floor p99" is the floor's p99 and not the wall's.
 *
 * Also reports the drag instruction as the reader gets it: rect, own-box clipping,
 * viewport fit, and how many px of it the dock covers.
 *
 * usage: node tools/frames.mjs <url> <outPrefix> [w] [h] [waitMs]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [url, out, w = '1440', h = '900', waitMs = '4000'] = process.argv.slice(2);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__stage, null, { timeout: 180000, polling: 500 });
await page.waitForTimeout(+waitMs);
for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__stage.settle && window.__stage.settle()); await page.waitForTimeout(900); }

const state = await page.evaluate(() => {
  const s = window.__stage;
  return { mood: +s.state.mood.toFixed(3), intensity: +s.state.intensity.toFixed(3), orbit: +s.state.orbit.toFixed(3),
           objectRect: s.objectRect(), body: { color: s.bodyMat.color.getHexString(), metalness: +s.bodyMat.metalness.toFixed(3), roughness: +s.bodyMat.roughness.toFixed(3), env: +s.bodyMat.envMapIntensity.toFixed(2), hasNormalMap: !!s.bodyMat.normalMap, hasBumpMap: !!s.bodyMat.bumpMap } };
});

await page.screenshot({ path: out + '.frame.png', timeout: 120000 });

/* render only */
await page.evaluate(() => {
  window.__ui = [...document.querySelectorAll('body > *')].map((el) => [el, el.style.visibility]);
  window.__ui.forEach(([el]) => { if (el.id !== 'gl') el.style.visibility = 'hidden'; });
  document.getElementById('gl').style.visibility = 'visible';
});
await page.waitForTimeout(200);
await page.screenshot({ path: out + '.scene.png', timeout: 120000 });

/* flat magenta object */
const idInfo = await page.evaluate(() => {
  const s = window.__stage;
  const meshes = [];
  s.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  window.__idSaved = meshes.map((m) => [m, m.material]);
  for (const [m] of window.__idSaved) {
    m.material.color.setHex(0x000000);
    if (m.material.emissive) m.material.emissive.setHex(0xff00ff);
    if ('emissiveIntensity' in m.material) m.material.emissiveIntensity = 6;
    m.material.metalness = 0; m.material.roughness = 1;
    m.material.needsUpdate = true;
  }
  s.renderer.render(s.scene, s.camera);
  return { meshes: meshes.length };
});
await page.waitForTimeout(300);
await page.evaluate(() => window.__stage.renderer.render(window.__stage.scene, window.__stage.camera));
await page.screenshot({ path: out + '.id.png', timeout: 120000 });

/* what each pixel is: a camera ray against the two planes that exist */
const dataUrl = await page.evaluate(([W, H]) => {
  const s = window.__stage;
  const V = s.camera.position.constructor;
  const p = new V(), d = new V();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const cam = s.camera;
  cam.updateMatrixWorld();
  const cp = cam.position;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      p.set(((x + 0.5) / W) * 2 - 1, -(((y + 0.5) / H) * 2 - 1), 0.5).unproject(cam);
      d.copy(p).sub(cp).normalize();
      let kind = 2;                       // 2 = neither plane (the scrim / outside the room)
      let best = Infinity;
      if (Math.abs(d.y) > 1e-6) {
        const t = -cp.y / d.y;
        if (t > 0 && t < best) {
          const hx = cp.x + d.x * t, hz = cp.z + d.z * t;
          if (Math.abs(hx) <= 5 && Math.abs(hz) <= 5) { best = t; kind = 0; }   // floor
        }
      }
      if (Math.abs(d.z) > 1e-6) {
        const t = (-0.72 - cp.z) / d.z;
        if (t > 0 && t < best) {
          const hx = cp.x + d.x * t, hy = cp.y + d.y * t;
          if (Math.abs(hx) <= 5 && hy >= -0.5 && hy <= 4.9) { best = t; kind = 1; }   // wall
        }
      }
      const o = (y * W + x) * 4;
      img.data[o] = kind === 0 ? 255 : 0;
      img.data[o + 1] = kind === 1 ? 255 : 0;
      img.data[o + 2] = kind === 2 ? 255 : 0;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}, [+w, +h]);
fs.writeFileSync(out + '.planes.png', Buffer.from(dataUrl.split(',')[1], 'base64'));

/* put the scene back, then measure the instruction the reader actually sees */
const hint = await page.evaluate(() => {
  const s = window.__stage;
  window.__idSaved.forEach(([m, mat]) => { m.material = mat; });
  window.__ui.forEach(([el, v]) => { el.style.visibility = v; });
  s.renderer.render(s.scene, s.camera);
  const el = document.getElementById('turnHint');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const dock = document.getElementById('dock').getBoundingClientRect();
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return {
    text: el.textContent.replace(/\s+/g, ' ').trim(),
    rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) },
    colour: cs.color, fontSize: cs.fontSize,
    inViewport: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5,
    selfClipped: el.scrollWidth > el.clientWidth + 1,
    dockOverlapPx: Math.round(inter(r, dock)),
    dock: { left: Math.round(dock.left), right: Math.round(dock.right), top: Math.round(dock.top), bottom: Math.round(dock.bottom) },
    rightEdgeOfDockLeft: Math.round(dock.left),
  };
});
console.log(JSON.stringify({ url, state, idInfo, hint, errs }, null, 2));
await browser.close();
