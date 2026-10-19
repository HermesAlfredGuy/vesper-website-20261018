/* probe-shot.mjs — screenshot the stage after running arbitrary page JS, so a
   hypothesis about the geometry can be confirmed instead of argued.
   node tools/probe-shot.mjs <url> <out.png> <w> <h> <jsFile> */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [url, out, w = '1200', h = '1000', jsFile] = process.argv.slice(2);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stage && window.__stage.scene, null, { timeout: 30000 });
await page.waitForTimeout(8000);
await page.evaluate(() => window.__stage.settle());
if (jsFile) {
  const src = fs.readFileSync(jsFile, 'utf8');
  const r = await page.evaluate(async (s) => {
    try { return String(await (new Function('s', 'return (async () => {' + s + '})()'))(window.__stage)); }
    catch (e) { return 'ERR ' + e.message; }
  }, src);
  console.log('js:', r);
}
await page.waitForTimeout(900);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
