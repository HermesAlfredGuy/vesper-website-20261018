/* find-frame.mjs — solve the camera for a target on-screen box.

   The page frames one object with a camera driven from data-cam attributes. Guessing
   those numbers is how a mobile hero ends up with the lamp cropped off the right edge,
   so this solves them against the real projection instead:

     node tools/find-frame.mjs <url> <w> <h> <topFrac> <bottomFrac> [fov] [dirY] [dirZ]

   topFrac/bottomFrac are where the object's bounding box should land, as fractions of
   the viewport height. Prints a ready-to-paste `pos|target|fov` string plus the measured
   box. The search is bisection on two monotonic quantities — how far back the camera
   sits, and how far below the object it aims — so it converges in a handful of steps.
*/
import { chromium } from 'playwright-core';

const [url, wArg, hArg, topArg, botArg, fovArg, dyArg, dzArg] = process.argv.slice(2);
const W = Number(wArg || 390), H = Number(hArg || 844);
const topF = Number(topArg ?? 0.07), botF = Number(botArg ?? 0.46);
const FOV = Number(fovArg || 30);
const DY = Number(dyArg ?? 0.30), DZ = Number(dzArg ?? 1.0);

const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-features=dbus', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(url || 'http://127.0.0.1:9311/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__stage && window.__stage.objectRect, null, { timeout: 25000 });
await page.waitForTimeout(1500);

const solved = await page.evaluate(({ W, H, topF, botF, FOV, DY, DZ }) => {
  const s = window.__stage, cam = s.camera;
  const targetH = (botF - topF) * H;
  const targetCy = ((topF + botF) / 2) * H;

  // measure with the real projection the page itself uses
  function measure(d, ty, cx) {
    cam.fov = FOV;
    cam.position.set(cx, ty + d * DY, d * DZ);
    cam.lookAt(0, ty, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return s.objectRect();
  }
  const height = (d, ty, cx) => { const r = measure(d, ty, cx); return r.bottom - r.top; };
  const cy = (d, ty, cx) => { const r = measure(d, ty, cx); return (r.top + r.bottom) / 2; };
  const cxx = (d, ty, cx) => measure(d, ty, cx).cx;

  const bisect = (f, lo, hi, goal, iters = 26) => {
    let a = lo, b = hi;
    const fa = f(a) - goal;
    for (let i = 0; i < iters; i++) {
      const m = (a + b) / 2, fm = f(m) - goal;
      if ((fa < 0) === (fm < 0)) a = m; else b = m;
    }
    return (a + b) / 2;
  };

  let ty = -0.02, cx = 0, d = 1.5;
  for (let pass = 0; pass < 4; pass++) {
    d = bisect((v) => height(v, ty, cx), 0.6, 8, targetH);
    // moving the aim point down moves the object up the frame
    ty = bisect((v) => -cy(d, v, cx), -2.0, 0.4, -targetCy);
    cx = bisect((v) => cxx(d, ty, v), -0.6, 0.6, W / 2);
  }
  const r = measure(d, ty, cx);
  const pos = [cx, +(ty + d * DY).toFixed(4), +(d * DZ).toFixed(4)];
  const tgt = [+cx.toFixed(4), +ty.toFixed(4), 0];
  return {
    cam: `${pos.map((v) => +v.toFixed(3)).join(',')}|${tgt.join(',')}|${FOV}`,
    solved: { d: +d.toFixed(4), ty: +ty.toFixed(4), cx: +cx.toFixed(4) },
    rect: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)])),
    frac: { top: +(r.top / H).toFixed(3), bottom: +(r.bottom / H).toFixed(3), widthPx: r.right - r.left },
  };
}, { W, H, topF, botF, FOV, DY, DZ });

console.log(JSON.stringify(solved, null, 1));
await browser.close();
