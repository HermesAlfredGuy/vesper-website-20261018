import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
/* Ablate the light pipe at the hero framing. Pixels are read out of the canvas in the same
   task as the draw (toDataURL), so nothing depends on the compositor: a frozen WebGL
   drawing buffer is what made the previous version photograph black frames. */
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:9311/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => {
  const s = window.__stage; const el = document.querySelector('.stage');
  return !!(s && s.emitterProbe().loaded && el.classList.contains('is-live'));
}, null, { timeout: 90000, polling: 250 });
await page.waitForFunction(() => {
  const p = document.getElementById('stagePoster'), g = document.getElementById('gl');
  return !p || (getComputedStyle(p).opacity === '0' && getComputedStyle(g).opacity === '1');
}, null, { timeout: 30000, polling: 100 }).catch(() => {});
await page.evaluate(() => { window.__stage.settle(); window.__stage.update(0.016); });
const grab = async (name, js) => {
  const url = await page.evaluate(js);
  writeFileSync(`docs/pass7/shots/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
};
const shoot = (visible) => `(() => {
  const s = window.__stage;
  s.opal.visible = ${visible};
  s.settle(); s.update(0.016);
  const c = document.querySelector('#gl canvas') || document.querySelector('canvas');
  return c.toDataURL('image/png');
})()`;
await grab('_a_with', shoot(true));
await grab('_a_without', shoot(false));
await grab('_a_with2', shoot(true));
console.log(JSON.stringify({ errs: errs.slice(0, 5) }));
await browser.close();
