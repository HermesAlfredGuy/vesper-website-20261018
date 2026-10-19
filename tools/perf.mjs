/* Honest load numbers, measured in this container's software-rendered browser
   (SwiftShader). These do NOT describe a machine with a real GPU: shader compile
   and raster here are done on the CPU, so they are a pessimistic upper bound.
   Reports the load-event timeline, first paint, and how long the scene took. */
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
let stageLiveMs = null;
try {
  await page.waitForFunction(() => document.getElementById('stage').classList.contains('is-live'), null, { timeout: 120000, polling: 250 });
  stageLiveMs = Date.now() - t0;
} catch (e) { stageLiveMs = 'did not go live within 120s'; }
const loadMs = Date.now() - t0;
await page.waitForTimeout(1200);

const out = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
  const res = performance.getEntriesByType('resource');
  const bytes = res.reduce((a, r) => a + (r.transferSize || 0), 0);
  const heaviest = res.map((r) => ({ n: r.name.split('/').slice(-1)[0], ms: Math.round(r.duration), kb: Math.round((r.transferSize || 0) / 1024) }))
    .sort((a, b) => b.ms - a.ms).slice(0, 6);
  const marks = Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)]));
  return {
    responseEnd: Math.round(nav.responseEnd || 0),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    loadEvent: Math.round(nav.loadEventEnd || 0),
    paint,
    marks,
    requests: res.length,
    transferKB: Math.round(bytes / 1024),
    heaviest,
    gl: (() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return c ? (d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'gl ok') : 'no webgl'; })(),
  };
});
out.wallClockLoadMs = loadMs;
out.stageLiveMs = stageLiveMs;
out.pageErrors = errors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
