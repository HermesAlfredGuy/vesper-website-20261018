/* perf-one.mjs — where the time actually goes, in one page load.

   Reports: boot marks, the size of the longest main-thread task, and the cost of a
   single scene update measured in isolation (10 sequential renders, minus the loop).
   Software GL again: read the *ratios*, not the absolute milliseconds.

   node tools/perf-one.mjs [url] [label] [--phone] */
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
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });

await page.addInitScript(() => {
  window.__long = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); })
      .observe({ entryTypes: ['longtask'] });
  } catch (e) {}
});

await page.goto(url, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(14000);

const out = await page.evaluate(async () => {
  const marks = Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)]));
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
  const s = window.__stage;
  const info = s ? { tris: s.renderer.info.render.triangles, calls: s.renderer.info.render.calls,
    programs: s.renderer.info.programs.length, canvas: [s.renderer.domElement.width, s.renderer.domElement.height],
    shadow: s.renderer.shadowMap.enabled, pr: s.renderer.getPixelRatio() } : null;
  // isolated render cost
  let per = [];
  if (s) {
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      s.update(0.016);
      per.push(+(performance.now() - t).toFixed(1));
    }
  }
  // a frame with the object rotated, to include the shadow re-render
  let turned = [];
  if (s) {
    for (let i = 0; i < 4; i++) {
      const t = performance.now();
      s.setOrbit(0.4 + i * 0.05);
      s.update(0.016);
      turned.push(+(performance.now() - t).toFixed(1));
    }
  }
  return { marks, paint, info, per, turned, long: window.__long.slice() };
});

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(JSON.stringify({
  label, viewport: `${W}x${H}`,
  fcp: out.paint['first-contentful-paint'], marks: out.marks,
  longestTask: out.long.sort((a, b) => b[1] - a[1])[0] || null,
  longTasks: out.long.length, longMs: out.long.reduce((a, b) => a + b[1], 0),
  info: out.info, renderMs: med(out.per), renderTurnedMs: med(out.turned),
}, null, 0));
await browser.close();
