import { chromium } from 'playwright-core';

/* Shoot the hero at a series of rest angles, so "which section of the helix faces the
   lens" is answered by frames and not by a projection. One browser, one page, N shots.

  node tools/pass8_sweep.mjs <url> <outPrefix> <deg,deg,...>
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const [url, prefix, degs = '0'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => {
  const s = window.__stage, el = document.querySelector('.stage');
  return !!(s && s.emitterProbe && s.emitterProbe().loaded && el && el.classList.contains('is-live'));
}, null, { timeout: 90000, polling: 250 });
await page.waitForFunction(() => {
  const p = document.getElementById('stagePoster'), g = document.getElementById('gl');
  if (!p || !g) return true;
  const cs = getComputedStyle;
  return cs(p).opacity === '0' && cs(g).opacity === '1';
}, null, { timeout: 30000, polling: 100 }).catch(() => {});

for (const d of degs.split(',').map(Number)) {
  await page.evaluate((t) => {
    const s = window.__stage;
    s.setOrbit(t); s.settle(); s.update(0.016);
  }, (d * Math.PI) / 180);
  await page.waitForTimeout(900);
  const out = `${prefix}${d >= 0 ? '+' : ''}${d}.png`;
  await page.screenshot({ path: out });
  console.log('shot', out, 'errors', errors.length);
}
await browser.close();
