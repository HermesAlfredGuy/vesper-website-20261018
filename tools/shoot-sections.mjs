/* One browser, every section: captures the real page at desktop and mobile,
   and reports console/page errors once. Usage:
   node tools/shoot-sections.mjs <url> <outDir> [width] [height] [prefix]
*/
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const outDir = process.argv[3] || 'refs';
const W = Number(process.argv[4] || 1440);
const H = Number(process.argv[5] || 900);
const prefix = process.argv[6] || 'sec';

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1500);
// the live stage is loaded lazily, after the first paint: wait for it on every device
try {
  await page.waitForFunction(() => document.getElementById('stage').classList.contains('is-live') && window.__stage, { timeout: 180000, polling: 500 });
} catch (e) {
  console.log('PROBLEMS ' + JSON.stringify(['stage did not go live']));
}
await page.waitForTimeout(3000);

const ids = await page.$$eval('.sec', (els) => els.map((e) => e.id));
const boxes = [];
for (const id of ids) {
  await page.evaluate((i) => {
    const el = document.getElementById(i);
    window.scrollTo({ top: el.offsetTop + Math.max(0, (el.offsetHeight - window.innerHeight) / 2), behavior: 'instant' });
  }, id);
  await page.waitForTimeout(4200);
  await page.evaluate(() => { if (window.__stage && window.__stage.settle) window.__stage.settle(); });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { if (window.__stage && window.__stage.settle) window.__stage.settle(); });
  await page.waitForTimeout(1200);
  const out = path.join(outDir, `${prefix}-${id}.png`);
  await page.screenshot({ path: out, timeout: 120000 });
  const box = await page.evaluate((i) => {
    const el = document.getElementById(i);
    const r = el.getBoundingClientRect();
    const s = window.__stage;
    const obj = s && s.objectRect ? s.objectRect() : null;
    let textRight = 0;
    el.querySelectorAll('h1,h2,p,li,th,td,dt,dd,figcaption,button,a').forEach((n) => {
      const b = n.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < window.innerHeight) textRight = Math.max(textRight, b.right);
    });
    return { id: i, top: el.offsetTop, h: el.offsetHeight, rectTop: Math.round(r.top), rectH: Math.round(r.height),
             scrollY: Math.round(window.scrollY), tone: document.body.className,
             mood: s ? Number(s.state.mood.toFixed(3)) : null, inten: s ? Number(s.state.intensity.toFixed(3)) : null,
             phase: s ? Number(s.state.phase.toFixed(3)) : null,
             object: obj, textRight: Math.round(textRight),
             clearOfObject: obj ? textRight < obj.left + 6 : null };
  }, id);
  boxes.push(box);
}

const info = await page.evaluate(() => ({
  docH: document.documentElement.scrollHeight,
  canvases: document.querySelectorAll('canvas').length,
  ready: document.body.dataset.ready,
  gl: (() => { const c = document.getElementById('gl'); const g = c && (c.getContext('webgl2') || c.getContext('webgl')); return g ? String(g.getParameter(g.VERSION)) : 'none'; })(),
  fonts: document.fonts ? document.fonts.status : 'n/a',
}));

console.log(JSON.stringify({ url, viewport: `${W}x${H}`, info, sections: boxes, problems: [...new Set(problems)] }, null, 2));
console.log('SUMMARY ' + boxes.map((b) => `${b.id}@${b.scrollY} ${b.tone} mood=${b.mood} int=${b.inten} obj=[${b.object ? b.object.left + '..' + b.object.right : '?'}] textRight=${b.textRight} clear=${b.clearOfObject}`).join(' | '));
console.log('PROBLEMS ' + JSON.stringify([...new Set(problems)]));
await browser.close();
