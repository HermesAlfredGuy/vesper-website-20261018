import { chromium } from 'playwright-core';

/* Sweep the rest rotation and report, per angle, the widest on-screen section of the
   channel and how much of the light pipe faces the lens. */
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const w = 1440, h = 900;
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:9311/index.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => {
  const s = window.__stage, el = document.querySelector('.stage');
  return !!(s && s.emitterProbe && s.emitterProbe().loaded && el && el.classList.contains('is-live'));
}, null, { timeout: 90000, polling: 250 });
await page.waitForTimeout(1200);

const out = await page.evaluate(async () => {
  const s = window.__stage;
  const cam = s.camera, pipe = s.opal, g = s.group;
  const W = s.renderer.domElement.clientWidth, H = s.renderer.domElement.clientHeight;
  const p = pipe.geometry.getAttribute('position');
  const v = cam.position.clone();
  const n = cam.position.clone();
  const res = [];
  for (let deg = -40; deg <= 40; deg += 5) {
    const t = (deg * Math.PI) / 180;
    s.setOrbit(t); s.settle(); s.update(0.016);
    g.updateMatrixWorld(true); pipe.updateMatrixWorld(true);
    const rows = new Map();
    let facing = 0, tot = 0;
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(pipe.matrixWorld);
      n.copy(v).sub(cam.position).normalize();
      /* the pipe's outward normal at a vertex is radial */
      const rl = Math.hypot(v.x, v.z) || 1;
      const ndv = -((v.x / rl) * n.x + (v.z / rl) * n.z);
      tot++;
      if (ndv > 0.85) facing++;
      const q = v.clone().project(cam);
      const sx = (q.x * 0.5 + 0.5) * W, sy = (-q.y * 0.5 + 0.5) * H;
      const key = Math.round(sy / 2) * 2;
      let r = rows.get(key);
      if (!r) { r = { y: key, x0: Infinity, x1: -Infinity }; rows.set(key, r); }
      if (sx < r.x0) r.x0 = sx;
      if (sx > r.x1) r.x1 = sx;
    }
    let best = { span: 0 };
    for (const r of rows.values()) {
      const sp = r.x1 - r.x0;
      if (sp > best.span && r.y > 250 && r.y < 620) best = { span: +sp.toFixed(1), y: r.y, x0: +r.x0.toFixed(0), x1: +r.x1.toFixed(0) };
    }
    res.push({ deg, facing: +(facing / tot).toFixed(3), best });
  }
  return res;
});
console.log(JSON.stringify(out, null, 0).replace(/},/g, '},\n'));
await browser.close();
