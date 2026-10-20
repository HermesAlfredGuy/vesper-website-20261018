import { chromium } from 'playwright-core';

/* Pass 8 probe: the numbers the scale decision needs, read out of the live stage.
   objectRect is the lamp's screen box (group AABB corners), pipe is the emitter's own
   projected box, and the widest visible section is measured in millimetres of arc.

   node tools/pass8_probe.mjs <url> [w] [h] [turn]
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const [url, w = '1440', h = '900', turn = '0'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => {
  const s = window.__stage;
  return !!(s && s.emitterProbe && s.emitterProbe().loaded);
}, null, { timeout: 90000, polling: 250 });
await page.evaluate((t) => {
  const s = window.__stage;
  s.setOrbit(t);
  s.settle();
  s.update(0.016);
}, +turn);
await page.waitForTimeout(700);

const out = await page.evaluate(() => {
  const s = window.__stage;
  s.update(0.016);
  const cam = s.camera;
  const v = cam.position.clone();
  const rect = s.objectRect();
  const p = s.opal.geometry.attributes.position;
  const m = s.opal.matrixWorld;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  let front = 0, tot = 0;
  const W = s.renderer.domElement.width, H = s.renderer.domElement.height;
  const pts = [];
  for (let i = 0; i < p.count; i++) {
    const wx = p.getX(i), wy = p.getY(i), wz = p.getZ(i);
    v.set(wx, wy, wz).applyMatrix4(m);
    const wxr = v.x, wyr = v.y, wzr = v.z;
    const sx = (v.clone().project(cam).x * 0.5 + 0.5) * W;
    const sy = (-v.clone().project(cam).y * 0.5 + 0.5) * H;
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
    if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    /* front-facing by the camera's own forward vector: the pipe's normal is radial */
    const nx = Math.cos(Math.atan2(wzr, wxr)), nz = Math.sin(Math.atan2(wzr, wxr));
    const cx = cam.position.x, cz = cam.position.z;
    const dx = cx - wxr, dz = cz - wzr;
    const l = Math.hypot(dx, dz) || 1;
    tot++;
    if ((nx * dx + nz * dz) / l > 0.5) front++;
    pts.push([+sx.toFixed(1), +sy.toFixed(1), +(p.getY(i)).toFixed(4)]);
  }
  /* the widest section: sample the pipe's arc offsets per height row and take max */
  const em = s.emitterProbe();
  return {
    rect,
    lampH: rect.bottom - rect.top,
    lampW: rect.right - rect.left,
    pipeBox: { x0: +x0.toFixed(1), x1: +x1.toFixed(1), y0: +y0.toFixed(1), y1: +y1.toFixed(1),
               w: +(x1 - x0).toFixed(1), h: +(y1 - y0).toFixed(1) },
    pipeFrontFrac: +(front / tot).toFixed(3),
    emitter: em,
    cam: { pos: cam.position.toArray().map((n) => +n.toFixed(3)), fov: +cam.fov.toFixed(2) },
    canvas: [W, H],
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
