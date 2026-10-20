import { chromium } from 'playwright-core';
import fs from 'node:fs';

/* Pass 7 shooter. Unlike tools/shoot.mjs this one waits for the *live* stage, not for a
   poster: .stage.is-live only appears once the GLB is parsed and the programs are built,
   and on a software rasteriser that is 10-20 s after load, not 2. A capture taken before
   it is a photograph of assets/poster.webp, which is how a pass can "verify" a frame that
   was never rendered.

  node tools/pass7_shoot.mjs <url> <out.png> [w] [h] [dpr] [turnRad] [--clip=x,y,w,h]
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const w = +(args[2] || 1440), h = +(args[3] || 900), dpr = +(args[4] || 1);
const turn = args[5] !== undefined ? Number(args[5]) : 0;
const clipArg = args.find((a) => a.startsWith('--clip='));

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({
  viewport: { width: w, height: h }, deviceScaleFactor: dpr,
  hasTouch: w < 900, isMobile: w < 900,
});
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

/* is-live starts a 0.9 s dissolve from assets/poster.webp to the canvas. A screenshot
   inside it is a 50/50 blend of the new render and a render from an earlier pass — dim,
   desaturated, and easy to mistake for "the slot does not read". Wait for the dissolve to
   finish, not for a number of milliseconds. */
await page.waitForFunction(() => {
  const p = document.getElementById('stagePoster'), g = document.getElementById('gl');
  if (!p || !g) return true;
  const cs = getComputedStyle;
  return cs(p).opacity === '0' && cs(g).opacity === '1';
}, null, { timeout: 30000, polling: 100 }).catch(() => {});

await page.evaluate((t) => {
  const s = window.__stage;
  if (!s) return;
  s.setOrbit(t);
  s.settle();
  s.update(0.016);
}, turn);
// two frames so the damped values are exactly at target and the canvas has the last word
await page.waitForTimeout(700);
await page.evaluate(() => { const s = window.__stage; if (s) { s.settle(); s.update(0.016); } });
await page.waitForTimeout(500);

const opts = { path: out, timeout: 180000 };
if (clipArg) {
  const [x, y, cw, ch] = clipArg.split('=')[1].split(',').map(Number);
  opts.clip = { x, y, width: cw, height: ch };
}
await page.screenshot(opts);

const info = await page.evaluate(() => {
  const s = window.__stage;
  return {
    live: document.querySelector('.stage').classList.contains('is-live'),
    output: s.output(),
    emitter: s.emitterProbe(),
    groove: s.grooveProbe(0.162),
    orbit: s.state.orbit,
  };
});
console.log(JSON.stringify({ ready, out, info, errors: errors.slice(0, 8) }, null, 1));
await browser.close();
