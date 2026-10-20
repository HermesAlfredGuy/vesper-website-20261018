import { chromium } from 'playwright-core';

/* Pass 4: the silhouette, with everything that could hide it switched off.

The hero frame cannot be measured for an edge: the wall spill paints a bright gradient
right up to the column, so "where is the edge" has no answer in that image — which is
also why pass 8's softness was hard to argue about with numbers. This capture hides the
light that lands on the room, the editor's copy and the dock, and leaves the object on
the dark ground: the left silhouette is then a ~150-level step on a ~15-level
background, and p4-edge.py can measure its 10-90 width in device pixels.

Run it against both builds (the pass-8 worktree and the pass-4 tree) for the same camera,
the same rest pose and the same device pixel ratio, and the difference in that width is
the difference in sampling — nothing else in the frame changed.

  node tools/p4-silhouette.mjs <url> <out.png> [w] [h] [dpr]
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const [url, out, w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, hasTouch: false, isMobile: false });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(url, { waitUntil: 'load', timeout: 90000 });
const ready = await page.waitForFunction(() => {
  const s = window.__stage;
  const el = document.querySelector('.stage');
  return !!(s && s.emitterProbe && s.emitterProbe().loaded && el && el.classList.contains('is-live'));
}, null, { timeout: 120000, polling: 250 }).then(() => true).catch(() => false);
/* the boot panel covers the canvas (pass 4 only) and the poster dissolve blends the old
   render in (both): wait for both to be gone */
await page.waitForFunction(() => {
  const b = document.getElementById('boot');
  return !b || b.hidden || b.classList.contains('is-out');
}, null, { timeout: 60000, polling: 120 }).catch(() => {});
await page.waitForFunction(() => {
  const p = document.getElementById('stagePoster'), g = document.getElementById('gl');
  if (!p || !g) return true;
  const cs = getComputedStyle;
  return cs(p).opacity === '0' && cs(g).opacity === '1';
}, null, { timeout: 60000, polling: 100 }).catch(() => {});

await page.evaluate(() => {
  const s = window.__stage;
  if (s.setSampling) s.setSampling(4);
  s.setOrbit(0);
  /* the light that lands on the room, and only that: the pipe and the object stay */
  for (const o of [s.wallSpill, s.floorPool]) if (o) o.visible = false;
  document.querySelectorAll('.copy, .dock, .nav, .herofoot, .rail, .scrim, .boot').forEach((e) => { e.style.visibility = 'hidden'; });
  s.settle();
  s.update(0.016);
});
await page.waitForTimeout(900);
await page.evaluate(() => { const s = window.__stage; s.settle(); s.update(0.016); });
await page.waitForTimeout(700);

await page.screenshot({ path: out, timeout: 180000 });
const info = await page.evaluate(() => {
  const s = window.__stage;
  return { live: true, output: s.output ? s.output() : null, orbit: s.state.orbit, rect: s.objectRect(), dpr: window.devicePixelRatio, buffer: [s.renderer.domElement.width, s.renderer.domElement.height] };
});
console.log(JSON.stringify({ ready, out, info, errors }, null, 1));
await browser.close();
