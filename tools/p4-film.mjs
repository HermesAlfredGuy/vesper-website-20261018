import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/* Pass 4 film: loader -> reveal -> the scroll through every chapter, from the live page.

   The loader is shot when its own progress crosses a step, not on a wall clock: on this
   software renderer a screenshot costs seconds, so a clock-driven loop photographs the
   same 4% twice and then the finished page. Each capture is "the state the page reached",
   and the film replays those states.

   The scroll travel is the positions Lenis itself produced: the move is recorded first
   with no screenshots attached (so the main thread is free and Lenis animates at its own
   pace), then replayed position by position for the camera. No easing is invented here.

   Every frame is rendered again and allowed to composite before the shutter, and a frame
   that comes back suspiciously small is retried once — a cleared WebGL buffer
   photographed mid-frame is a capture bug, not a render.

   usage: node tools/p4-film.mjs <url> <outDir> [w] [h]
*/
const [url, outDir, W = '1280', H = '720'] = process.argv.slice(2);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

if (!process.env.KEEP) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

let n = 0;
const log = [];

async function repaint() {
  await page.evaluate(async () => {
    const s = window.__stage;
    if (s && s.settle) { s.settle(); if (s.update) s.update(0.016); }
    await new Promise((r) => requestAnimationFrame(r));
  });
}

async function shot() {
  const file = path.join(outDir, `f${String(n).padStart(4, '0')}.jpg`);
  await repaint();
  await page.screenshot({ path: file, type: 'jpeg', quality: 92, timeout: 180000 });
  if (fs.statSync(file).size < 20000) {          // a cleared buffer, not a picture
    await page.waitForTimeout(500);
    await repaint();
    await page.screenshot({ path: file, type: 'jpeg', quality: 92, timeout: 180000 });
    log.push(`retry ${path.basename(file)}`);
  }
  n++;
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#boot', { timeout: 30000 });

/* ---------- the loader, at its own progress steps ---------- */
const wanted = [4, 18, 34, 52, 68, 84, 96];
let wi = 0;
const seen = [];
for (let guard = 0; guard < 240 && wi < wanted.length; guard++) {
  const st = await page.evaluate(() => {
    const b = document.getElementById('boot');
    if (!b) return { pct: 0, done: true };
    const p = getComputedStyle(b).getPropertyValue('--boot-p') || '0';
    return { pct: Math.round((parseFloat(p) || 0) * 100), done: b.classList.contains('is-out') };
  });
  if (st.done || st.pct >= 97) { seen.push(st.pct); break; }
  if (st.pct >= wanted[wi]) { seen.push(st.pct); wi++; await shot(); }
  else await page.waitForTimeout(120);
}
for (const phase of ['is-done', 'is-out']) {
  await page.waitForFunction((c) => {
    const b = document.getElementById('boot');
    return b && b.classList.contains(c);
  }, phase, { timeout: 90000, polling: 60 }).catch(() => {});
  await shot();
}
log.push('loader steps ' + JSON.stringify(seen));

/* ---------- the chapters ---------- */
await page.waitForFunction(() => document.querySelector('.stage').classList.contains('is-live'), null, { timeout: 180000, polling: 300 }).catch(() => {});
await page.waitForFunction(() => {
  const p = document.getElementById('stagePoster');
  return !p || getComputedStyle(p).opacity === '0';
}, null, { timeout: 60000, polling: 150 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.ln, .rv').forEach((e) => e.classList.add('is-in')));
await page.waitForTimeout(300);

const top = async (id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  return el ? el.offsetTop + Math.max(0, (el.offsetHeight - window.innerHeight) / 2) : 0;
}, id);
const tops = {};
for (const id of ['top', 'object', 'atmosphere', 'materials', 'specification', 'reserve']) tops[id] = await top(id);

for (let i = 0; i < 4; i++) await shot();

/* record a travel with nothing attached, then replay it for the camera */
async function travel(to, frames) {
  const trace = await page.evaluate(async (target) => {
    const out = [];
    if (!window.__lenis) { window.scrollTo(0, target); return [target]; }
    window.__lenis.scrollTo(target, { duration: 2.4 });
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        out.push(Math.round(window.scrollY));
        if (performance.now() - t0 > 2700 || out.length > 300) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return out;
  }, to);
  const picks = [];
  for (let i = 1; i <= frames; i++) {
    picks.push(trace[Math.min(trace.length - 1, Math.round((i / frames) * (trace.length - 1)))]);
  }
  for (const y of picks) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await shot();
  }
  await page.evaluate((v) => window.scrollTo(0, v), to);
  log.push(`travel -> ${to}: ${trace.length} recorded, replayed ${JSON.stringify(picks)}`);
}

await travel(tops.object, 8);
for (let i = 0; i < 3; i++) await shot();

await travel(tops.atmosphere, 7);
for (const id of ['ember', 'meridian', 'lumen', 'hearth']) {
  await page.evaluate((i) => {
    const el = document.querySelector(`[data-atmo="${i}"]`);
    if (el && el.getAttribute('aria-pressed') !== 'true') el.click();
  }, id);
  for (let i = 0; i < 2; i++) await shot();
}
await page.evaluate(() => { const el = document.querySelector('[data-atmo="ember"]'); if (el) el.click(); });

await travel(tops.materials, 7);
for (const id of ['foundry', 'umber', 'bone', 'slate']) {
  await page.evaluate((i) => {
    const el = document.querySelector(`[data-finish="${i}"]`);
    if (el && el.getAttribute('aria-pressed') !== 'true') el.click();
  }, id);
  for (let i = 0; i < 2; i++) await shot();
}
await page.evaluate(() => { const el = document.querySelector('[data-finish="foundry"]'); if (el) el.click(); });

await travel(tops.specification, 6);
for (let i = 0; i < 3; i++) await shot();

await travel(tops.reserve, 6);
for (let i = 0; i < 3; i++) await shot();

await travel(tops.top, 6);
for (let i = 0; i < 10; i++) {
  await page.evaluate((v) => {
    const r = document.getElementById('turnRange');
    r.value = String(Math.round(v));
    r.dispatchEvent(new Event('input', { bubbles: true }));
  }, 30 + i * 7);
  await shot();
}

const state = await page.evaluate(() => ({
  scrollY: Math.round(window.scrollY),
  lenis: !!window.__lenis,
  output: window.__stage ? window.__stage.output() : null,
}));
console.log(JSON.stringify({ frames: n, log, state, errors: errors.slice(0, 6) }, null, 1));
await browser.close();
