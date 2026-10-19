/* shot.mjs — one frame plus the probes, so a capture is never just a picture.
   node tools/shot.mjs <url> <out.png> [w] [h] [waitMs] [extraEvalJs] */
import { chromium } from 'playwright-core';
const [url, out, w = '1440', h = '900', waitMs = '9000'] = process.argv.slice(2);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__stage && window.__stage.scene, null, { timeout: 30000 });
await page.waitForTimeout(+waitMs);
await page.evaluate(() => window.__stage.settle && window.__stage.settle());
await page.waitForTimeout(700);
const probes = await page.evaluate(() => {
  const s = window.__stage;
  const o = { emit: s.emitterProbe ? s.emitterProbe() : null, ringRows: s.ringCount ? s.ringCount() : null };
  o.groove = [0.11, 0.17, 0.24].map((y) => s.grooveProbe(y));
  o.spill = s.spillProbe();
  o.canvas = [s.renderer.domElement.width, s.renderer.domElement.height];
  o.info = { calls: s.renderer.info.render.calls, tris: s.renderer.info.render.triangles };
  return o;
});
await page.screenshot({ path: out });
console.log(JSON.stringify({ errs: errs.slice(0, 4), probes }, null, 1));
await browser.close();
