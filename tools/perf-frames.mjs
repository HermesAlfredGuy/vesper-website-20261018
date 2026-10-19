/* perf-frames.mjs — cold startup and steady scrolling, measured separately.

   Runs Chromium with ANGLE/SwiftShader. Every number is a *software* rasteriser number:
   useful for finding main-thread stalls, for how much work happens before the first
   usable frame, and for comparing two versions of the same scene. It is NOT evidence
   about a machine with a GPU and must not be reported as if it were.

   node tools/perf-frames.mjs [url] [label] [--phone] */
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const label = process.argv[3] || 'run';
const phone = process.argv.includes('--phone');
const W = phone ? 390 : 1440;
const H = phone ? 844 : 900;
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({
  viewport: { width: W, height: H }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone,
});

await page.addInitScript(() => {
  window.__perf = { long: [], frames: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  window.__sampleFrames = (ms) => new Promise((done) => {
    const t = [];
    let last = performance.now();
    const end = last + ms;
    const tick = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else done(t); };
    requestAnimationFrame(tick);
  });
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 90000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(12000);

const boot = await page.evaluate(() => {
  const marks = Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)]));
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return {
    marks, paint,
    dcl: Math.round(nav.domContentLoadedEventEnd || 0),
    load: Math.round(nav.loadEventEnd || 0),
    long: window.__perf.long.slice(),
    stage: !!window.__stage,
    live: !!(document.querySelector('#stage') || {}).classList?.contains('is-live'),
    tris: window.__stage ? window.__stage.renderer.info.render.triangles : 0,
    calls: window.__stage ? window.__stage.renderer.info.render.calls : 0,
    canvas: window.__stage ? [window.__stage.renderer.domElement.width, window.__stage.renderer.domElement.height] : null,
  };
});

const idle = await page.evaluate(() => window.__sampleFrames(3000));

const scrollFrames = await page.evaluate(async () => {
  const t = [];
  window.__end = performance.now() + 4600;
  const p = new Promise((done) => {
    let last = performance.now();
    const tick = (now) => { t.push(now - last); last = now; if (now < window.__end) requestAnimationFrame(tick); else done(); };
    requestAnimationFrame(tick);
  });
  const max = document.documentElement.scrollHeight - innerHeight;
  for (let i = 0; i <= 36; i++) { window.scrollTo(0, (i / 36) * max); await new Promise((r) => setTimeout(r, 90)); }
  for (let i = 36; i >= 0; i--) { window.scrollTo(0, (i / 36) * max); await new Promise((r) => setTimeout(r, 70)); }
  await p;
  return t;
});

function stats(a) {
  if (!a || !a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(1), fps: +(1000 / q(0.5)).toFixed(1) };
}
const longTotal = boot.long.reduce((a, b) => a + b[1], 0);
console.log(JSON.stringify({
  label, viewport: `${W}x${H}`, loadMs,
  fcp: boot.paint['first-contentful-paint'], dcl: boot.dcl, load: boot.load,
  marks: boot.marks,
  longTasks: boot.long.length, longTaskMs: longTotal,
  longest: boot.long.sort((a, b) => b[1] - a[1]).slice(0, 6),
  stage: boot.stage, live: boot.live, tris: boot.tris, calls: boot.calls, canvas: boot.canvas,
  idle: stats(idle), scroll: stats(scrollFrames),
}, null, 1));
await browser.close();
