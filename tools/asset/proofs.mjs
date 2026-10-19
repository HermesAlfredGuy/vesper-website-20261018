/* Pass 6 proofs: hero at 1440x900, phone at 390x844, a 1:1 slot crop, and a rotating
   pair that shows the spill following the helix. Every frame waits for the asset (not a
   timer) and settles the damped camera before the shutter.

   usage: node tools/asset/proofs.mjs <baseUrl> <outDir>                                   */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:9311';
const out = process.argv[3] || 'docs/pass6/shots';
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});

async function shot(file, viewport, prep, scale = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, hasTouch: viewport.width < 900 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(base + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__stage && window.__stage.body &&
    window.__stage.body.geometry.getAttribute('position') &&
    window.__stage.body.geometry.getAttribute('position').count > 10000, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  if (prep) await page.evaluate(prep);
  await page.waitForTimeout(1400);
  await page.evaluate(() => { try { window.__stage.settle(); } catch (e) {} });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${file}` });
  const rect = await page.evaluate(() => window.__stage.objectRect());
  await ctx.close();
  console.log(file, JSON.stringify(rect), errs.length ? 'ERR ' + errs.join('|') : '');
  return rect;
}

/* hero, desktop */
const hero = await shot('hero-desktop.png', { width: 1440, height: 900 });

/* phone */
await shot('phone-390.png', { width: 390, height: 844 });

/* a close view of the slot at the hero's own lighting, then cropped 1:1 */
const close = await (async () => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(base + '/tools/macro.html?d=0.62&turn=-0.94&aim=0.166&i=0.8&mood=0.9&finish=foundry',
                  { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__stage && window.__stage.body &&
    window.__stage.body.geometry.getAttribute('position').count > 10000, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { try { window.__stage.settle(); } catch (e) {} });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/p6_close.png' });
  await ctx.close();
  return true;
})();

/* rotating pair: same frame, object turned, spill must follow */
const rotA = await shot('rotate-a.png', { width: 1440, height: 900 }, () => {
  window.__stage.setOrbit(0); window.scrollTo(0, 1200);
});
const rotB = await shot('rotate-b.png', { width: 1440, height: 900 }, () => {
  window.__stage.setOrbit(0.62); window.scrollTo(0, 1200);
});

await browser.close();
console.log('hero rect', JSON.stringify(hero), 'close', close, 'B', JSON.stringify(rotB));
