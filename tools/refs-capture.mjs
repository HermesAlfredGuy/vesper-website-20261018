import { chromium } from 'playwright-core';

// usage: node refs-capture.mjs <url> <prefix> <w> <h> <frac1,frac2,...>
const [url, prefix, w = '1440', h = '900', fracs = '0,0.15,0.3,0.5,0.7'] = process.argv.slice(2);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { errs.push('goto:' + e.message); }
await page.waitForTimeout(9000);

const docH = await page.evaluate(() => document.documentElement.scrollHeight);
const out = [{ docH }];
for (const f of fracs.split(',')) {
  const y = Math.round(+f * (docH - +h));
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(3500);
  const f2 = `${prefix}-${String(f).replace('.', '_')}.png`;
  await page.screenshot({ path: f2 });
  out.push({ frac: f, y, file: f2 });
}
console.log(JSON.stringify({ out, errs: errs.slice(0, 10) }, null, 2));
await browser.close();
