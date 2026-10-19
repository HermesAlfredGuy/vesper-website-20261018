/* Renders the signature-interaction film as a frame sequence, using the real page.
   The camera is driven by real scroll positions and real control clicks, and every
   frame is settled to its final damped value so the software renderer cannot leave
   the scene mid-transition. Assemble with ffmpeg afterwards (see tools/film.sh).

   usage: node tools/film.mjs [url] [outDir] [width] [height]
*/
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const outDir = process.argv[3] || 'refs/film';
const W = Number(process.argv[4] || 1280);
const H = Number(process.argv[5] || 720);

/* A full render starts from an empty directory. A partial render (FROM/TO) must keep
   the frames it is not replacing, so it only creates the directory. */
if (!process.env.FROM && !process.env.TO) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);
try {
  await page.waitForFunction(() => document.getElementById('stage').classList.contains('is-live') && window.__stage, null, { timeout: 180000, polling: 500 });
} catch (e) { console.log('PROBLEMS stage did not go live'); }
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelectorAll('.ln, .rv').forEach((e) => e.classList.add('is-in')));

const stop = async (id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  return el.offsetTop + Math.max(0, (el.offsetHeight - window.innerHeight) / 2);
}, id);
const tops = {};
for (const id of ['top', 'object', 'atmosphere', 'materials', 'specification', 'reserve']) tops[id] = await stop(id);

const frames = [];
const push = (o) => frames.push(o);
const ease = (t) => t * t * (3 - 2 * t);

/* The frame budget is real: every frame is a settled full render, and on a software
   renderer that is seconds rather than milliseconds. The counts below are set so the
   whole film renders in one sitting and still reads at 12 fps. */
/* A — the hero, turning: the signature interaction, on its own */
for (let i = 0; i < 26; i++) {
  const t = i / 25;
  push({ scroll: tops.top, turn: (-0.5 + 1.0 * ease(t)) * 100 });
}
/* B — the scroll story: hero to the seam */
for (let i = 1; i <= 22; i++) {
  const t = ease(i / 22);
  push({ scroll: tops.top + (tops.object - tops.top) * t });
}
/* C — atmosphere: all four, on the room */
const atmoIds = ['ember', 'meridian', 'lumen', 'hearth'];
for (let a = 0; a < atmoIds.length; a++) {
  for (let i = 0; i < 8; i++) push({ scroll: tops.atmosphere, atmo: atmoIds[a] });
}
/* D — finishes montage */
const finIds = ['foundry', 'umber', 'bone', 'slate'];
for (let a = 0; a < finIds.length; a++) {
  for (let i = 0; i < 8; i++) push({ scroll: tops.materials, finish: finIds[a] });
}
/* E — the measured macro */
for (let i = 1; i <= 18; i++) {
  const t = ease(i / 18);
  push({ scroll: tops.materials + (tops.specification - tops.materials) * t, finish: 'foundry', atmo: 'hearth', turn: 30 });
}
/* F — closing on the reservation */
for (let i = 1; i <= 18; i++) {
  const t = ease(i / 18);
  push({ scroll: tops.specification + (tops.reserve - tops.specification) * t });
}
/* G — a last slow turn on the hero framing so the film does not just stop */
for (let i = 0; i < 18; i++) {
  const t = i / 17;
  push({ scroll: tops.reserve, turn: (30 + 25 * ease(t)) * 1 });
}

let n = 0;
const from = Number(process.env.FROM || 0);
const to = Number(process.env.TO || frames.length);
for (const f of frames) {
  const index = n++;
  if (index < from || index >= to) continue;
  await page.evaluate(async (fr) => {
    if (fr.scroll !== undefined) window.scrollTo({ top: fr.scroll, behavior: 'instant' });
    if (fr.turn !== undefined) {
      const r = document.getElementById('turnRange');
      r.value = String(Math.round(fr.turn));
      r.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (fr.atmo) {
      const el = document.querySelector(`[data-atmo="${fr.atmo}"]`);
      if (el && el.getAttribute('aria-pressed') !== 'true') el.click();
    }
    if (fr.finish) {
      const el = document.querySelector(`[data-finish="${fr.finish}"]`);
      if (el && el.getAttribute('aria-pressed') !== 'true') el.click();
    }
    await new Promise((r) => requestAnimationFrame(r));
  }, f);
  await page.waitForTimeout(240);
  await page.evaluate(() => window.__stage && window.__stage.settle && window.__stage.settle());
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(outDir, `f${String(index).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 94, timeout: 120000 });
  if ((index + 1) % 20 === 0) console.log(`frame ${index + 1}/${frames.length}`);
}
console.log(`DONE ${n} frames -> ${outDir}`);
await browser.close();
