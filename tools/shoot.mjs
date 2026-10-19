import { chromium } from 'playwright-core';
import fs from 'node:fs';

// usage: node shoot.mjs <url> <out.png> [width] [height] [waitMs] [fullPage] [scrollY] [evalFile] [scale]
// scale > 1 renders supersampled — the way a phone or retina laptop shows the page —
// which is the only way a 9 mm slot survives being sampled at 1x.
const [url, out, w = '1440', h = '900', waitMs = '2500', fullPage = '0', scrollY = '0', evalFile, scale = '1'] = process.argv.slice(2);

const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const browser = await chromium.launch({
  executablePath: EXEC,
  chromiumSandbox: false,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-features=dbus',
    '--hide-scrollbars',
  ],
});

const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: +scale,
  hasTouch: +w < 900,
  isMobile: +w < 900,
});
const page = await ctx.newPage();

const errors = [];
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); else logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
} catch (e) {
  errors.push('goto: ' + e.message);
}
await page.waitForTimeout(+waitMs);

let extra = null;
if (evalFile && fs.existsSync(evalFile)) {
  const src = fs.readFileSync(evalFile, 'utf8');
  try { extra = await page.evaluate(src); } catch (e) { extra = 'EVAL_ERR: ' + e.message; }
}

if (+scrollY > 0) {
  await page.evaluate((y) => window.scrollTo(0, y), +scrollY);
  await page.waitForTimeout(1200);
}

/* settle the damped camera before capturing: otherwise a slow renderer hands back a
   frame with the camera still travelling and the composition is not the one the page
   was authored for */
await page.evaluate(() => { if (window.__stage && window.__stage.settle) window.__stage.settle(); });
await page.waitForTimeout(600);

await page.screenshot({ path: out, fullPage: fullPage === '1', timeout: 120000 });
if (fullPage === '2') {
  // full-page via CDP clip
  const m = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  await page.setViewportSize({ width: +w, height: Math.min(m.h, 20000) });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out });
}

const info = await page.evaluate(() => ({
  title: document.title,
  innerW: window.innerWidth,
  innerH: window.innerHeight,
  docH: document.documentElement.scrollHeight,
  canvases: document.querySelectorAll('canvas').length,
  gl: (() => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return 'none'; const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; } catch (e) { return 'err'; } })(),
}));

console.log(JSON.stringify({ ok: true, info, errors: errors.slice(0, 25), extra }, null, 2));
await browser.close();
