import { chromium } from 'playwright-core';

/* Pass 4: what the first load costs.
   Long tasks are recorded from an init script, so they include the ones that happen
   before any project code runs (three, main.js and the GLB parse all start there).
   Reports: first paint, the page's own marks, the longest single long task, total
   long-task time and total blocking time, plus what actually came over the wire.

   node tools/p4-perf.mjs <url> [w] [h] [dpr]
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const [url, w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({
  viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr,
  hasTouch: false, isMobile: false,
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__long = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration), name: e.name, attribution: (e.attribution || []).map((a) => a.name).slice(0, 2) });
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) { /* no longtask API */ }
});
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });

// the page's own idea of "the realtime stage is live" (vesper:live), whether it is a
// poster-only build or a live one; fall back to load + 6 s so an old build still reports
const live = await page.waitForFunction(() => {
  if (performance.getEntriesByName('vesper:live').length) return true;
  const el = document.querySelector('.stage');
  return !!(el && el.classList.contains('is-live'));
}, null, { timeout: 120000, polling: 200 }).then(() => true).catch(() => false);
const liveAt = Date.now() - t0;
await page.waitForTimeout(2500);

const out = await page.evaluate((liveAtMs) => {
  const long = window.__long || [];
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
  const marks = Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)]));
  const res = performance.getEntriesByType('resource').map((r) => ({
    n: r.name.split('/').slice(-1)[0], kb: Math.round((r.transferSize || 0) / 1024), ms: Math.round(r.duration),
  })).sort((a, b) => b.ms - a.ms);
  const longest = long.slice().sort((a, b) => b.dur - a.dur)[0] || null;
  const blocking = long.reduce((a, e) => a + Math.max(0, e.dur - 50), 0);
  return {
    fcp: paint['first-contentful-paint'] ?? null,
    marks,
    stageLiveAt: liveAtMs,
    longTaskCount: long.length,
    longestTaskMs: longest ? longest.dur : 0,
    longestTaskStart: longest ? longest.start : null,
    longTaskTotalMs: long.reduce((a, e) => a + e.dur, 0),
    totalBlockingMs: Math.round(blocking),
    longTasks: long.map((e) => `${e.start}+${e.dur}`).join(' '),
    transferKB: res.reduce((a, r) => a + r.kb, 0),
    heaviest: res.slice(0, 5),
    jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    responseEnd: Math.round(nav.responseEnd || 0),
  };
}, liveAt);
out.stageLive = live;
out.pageErrors = errors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
