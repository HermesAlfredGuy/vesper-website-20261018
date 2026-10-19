/* interaction-film.mjs — a real-time recording of the finished interaction.

   The browser records what it composites, at the display's own cadence, while the page
   scrolls, turns and changes finish. Alongside the video it logs every rAF interval, so
   the smoothness claim has a number attached and the viewer can see which of the two —
   the recording or the machine — they are judging.

   This runs on SwiftShader: the video therefore shows the *container's* frame rate
   (single-digit fps), not the owner's. It is evidence that the interaction is coherent
   and that nothing stalls or tears; it is not evidence of smoothness on a GPU.

   node tools/interaction-film.mjs [url] [outdir] */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const out = process.argv[3] || '/opt/data/director-studio/quality-reset-20261019/pass4/film';
fs.mkdirSync(out, { recursive: true });
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: out, size: { width: 1280, height: 800 } },
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__iv = [];
  let last = performance.now();
  const tick = (now) => { window.__iv.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

await page.goto(url, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(14000);                       // boot + settle (slow here)
await page.evaluate(() => { window.__iv.length = 0; });
const t0 = Date.now();

const beat = async (label, ms) => { await page.waitForTimeout(ms); return label; };

// 1. hold on the hero
await beat('hero', 1600);
// 2. a controlled scroll down through two chapters and back
await page.evaluate(async () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const run = (from, to, ms) => new Promise((done) => {
    const s = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - s) / ms);
      window.scrollTo(0, from + (to - from) * ease(k));
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  await run(0, max * 0.55, 2600);
  await new Promise((r) => setTimeout(r, 500));
  await run(max * 0.55, max, 1800);
  await new Promise((r) => setTimeout(r, 700));
  await run(max, 0, 2600);
});
// 3. drag the object
await page.mouse.move(760, 470);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(760 + i * 22, 470, { steps: 2 }); await page.waitForTimeout(40); }
await page.mouse.up();
await page.waitForTimeout(900);
// 4. change finish, then atmosphere, and let both settle
for (const f of ['umber', 'slate', 'bone', 'foundry']) {
  await page.evaluate((x) => document.querySelector(`[data-finish="${x}"]`).click(), f);
  await page.waitForTimeout(1200);
}
await page.evaluate(() => { const r = document.querySelector('#turnRange'); if (r) { r.value = 55; r.dispatchEvent(new Event('input', { bubbles: true })); } });
await page.waitForTimeout(1400);
const wall = Date.now() - t0;

const iv = await page.evaluate(() => window.__iv.slice());
const s = [...iv].sort((a, b) => a - b);
const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
const info = await page.evaluate(() => ({
  tris: window.__stage.renderer.info.render.triangles,
  calls: window.__stage.renderer.info.render.calls,
  programs: window.__stage.renderer.info.programs.length,
  buffer: [window.__stage.renderer.domElement.width, window.__stage.renderer.domElement.height],
  finish: window.__stage.state.finish.id,
  settled: window.__stage.isSettled(),
}));

await ctx.close();                                       // finalises the video file
await browser.close();
const video = fs.readdirSync(out).filter((f) => f.endsWith('.webm')).sort().pop();
console.log(JSON.stringify({
  video: `${out}/${video}`, wallSeconds: +(wall / 1000).toFixed(1),
  frames: iv.length, fps: +(1000 / q(0.5)).toFixed(1), p50ms: q(0.5), p95ms: q(0.95), maxMs: +s[s.length - 1].toFixed(1),
  ...info,
}, null, 1));
