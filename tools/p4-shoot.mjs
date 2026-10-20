import { chromium } from 'playwright-core';

/* Pass 4 shooter — the pass-8 one, with the two things pass 4 added.
   1. It waits for the boot panel to be gone, not just for the stage to be live: the panel
      covers the canvas, and a shot taken after is-live but before the reveal is a
      photograph of the loading screen.
   2. It pins the multisampling, so an edge comparison is taken at a known setting instead
      of at whatever the adaptive step had settled on after 45 slow software frames.

   Everything else is pass 8's, unchanged, so a pass-4 frame and a pass-8 frame share the
   same camera, the same rest pose and the same settle sequence — which is what makes the
   before/after crops a comparison of sampling and not of framing.

   node tools/p4-shoot.mjs <url> <out.png> [w] [h] [dpr] [turnDeg] [samples]
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const w = +(args[2] || 1440), h = +(args[3] || 900), dpr = +(args[4] || 1);
const turn = args[5] !== undefined ? Number(args[5]) : null;
const samples = args[6] !== undefined ? Number(args[6]) : 4;

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 900, isMobile: w < 900 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });

const ready = await page.waitForFunction(() => {
  const s = window.__stage;
  const el = document.querySelector('.stage');
  return !!(s && s.emitterProbe && s.emitterProbe().loaded && el && el.classList.contains('is-live'));
}, null, { timeout: 90000, polling: 250 }).then(() => true).catch(() => false);

/* the panel is opaque; wait for the reveal, then for the poster dissolve */
await page.waitForFunction(() => {
  const b = document.getElementById('boot');
  return !b || b.hidden || b.classList.contains('is-out');
}, null, { timeout: 40000, polling: 120 }).catch(() => {});
await page.waitForFunction(() => {
  const p = document.getElementById('stagePoster'), g = document.getElementById('gl');
  if (!p || !g) return true;
  const cs = getComputedStyle;
  return cs(p).opacity === '0' && cs(g).opacity === '1';
}, null, { timeout: 40000, polling: 100 }).catch(() => {});

await page.evaluate(({ t, n }) => {
  const s = window.__stage;
  if (!s) return;
  if (s.setSampling) s.setSampling(n);
  s.setOrbit((t * Math.PI) / 180);
  s.settle();
  s.update(0.016);
}, { t: turn, n: samples });
await page.waitForTimeout(700);
await page.evaluate(() => { const s = window.__stage; if (s) { s.settle(); s.update(0.016); } });
await page.waitForTimeout(500);

await page.screenshot({ path: out, timeout: 180000 });

const info = await page.evaluate(() => {
  const s = window.__stage;
  return {
    live: document.querySelector('.stage').classList.contains('is-live'),
    boot: document.getElementById('boot').hidden,
    output: s.output(),
    orbit: s.state.orbit,
    rect: s.objectRect(),
    dpr: window.devicePixelRatio,
    buffer: [s.renderer.domElement.width, s.renderer.domElement.height],
  };
});
console.log(JSON.stringify({ ready, out, info, errors: errors.slice(0, 8) }, null, 1));
await browser.close();
