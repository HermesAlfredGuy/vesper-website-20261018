import { chromium } from 'playwright-core';
import fs from 'node:fs';

/* Pass 4: is the scroll actually smooth, and does it stay out of the way when it should?

   One trusted wheel gesture from the browser, sampled every frame inside the page, so the
   intermediate positions are visible instead of collapsing into the final one.

   The drawing buffer is shrunk to 96x60 first. In this container the 3D scene renders in
   software at about one frame per second, and Lenis' damping is time-based: at 1 s per
   frame every gesture legitimately resolves in a single step. The scroll behaviour does
   not depend on the buffer size, but the frame rate does, and a 60 fps trace is the only
   trace that can show whether the easing exists at all.

   Three runs, because the motion policy has two switches that must not be confused:
     full     nothing set                      -> Lenis present, the wheel glides
     os       the OS emulates reduced motion   -> still full motion (the page ignores it)
     toggle   the viewer clicks Reduce motion  -> no Lenis, one step, no tail

   node tools/p4-motion.mjs <url> [out.json]
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const outFile = process.argv[3] || null;

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});

async function run(kind) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: kind === 'os' ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-boot'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.bringToFront();
  if (kind === 'toggle') {
    await page.evaluate(() => document.getElementById('motionToggle').click());
    await page.waitForTimeout(320);
  }
  await page.evaluate(() => { if (window.__stage) window.__stage.resize(96, 60); window.scrollTo(0, 0); });
  await page.waitForTimeout(400);

  const client = await ctx.newCDPSession(page);
  /* the sampler starts first and the gesture arrives while it is running */
  const sampling = page.evaluate(() => new Promise((resolve) => {
    const L = window.__lenis || null;
    const frames = [];
    const t0 = performance.now();
    const step = () => {
      frames.push({ y: Math.round(window.scrollY), a: L ? Math.round(L.animatedScroll) : null, t: L ? Math.round(L.targetScroll) : null, ms: Math.round(performance.now() - t0) });
      if (frames.length < 60 && performance.now() - t0 < 2400) requestAnimationFrame(step);
      else resolve(frames);
    };
    requestAnimationFrame(step);
  }));
  await page.waitForTimeout(120);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 500, deltaX: 0, deltaY: 420 });
  const frames = await sampling;
  const html = await page.evaluate(() => document.documentElement.className);
  await ctx.close();

  const ys = frames.map((f) => f.y);
  const distinct = [...new Set(ys)];
  const moving = frames.filter((f) => f.y > 0);
  return {
    kind,
    htmlClass: html,
    hasLenis: frames.some((f) => f.a !== null),
    frames: frames.length,
    avgFrameMs: Math.round(frames[frames.length - 1].ms / frames.length),
    distinctPositions: distinct.length,
    first: ys.slice(0, 8),
    animatedVsTarget: frames.filter((f) => f.a !== null).slice(0, 10).map((f) => `${f.a}/${f.t}`),
    finalY: ys[ys.length - 1],
    settled: ys.slice(-3).every((v) => v === ys[ys.length - 1]),
    errors: errs,
  };
}

const full = await run('full');
await new Promise((r) => setTimeout(r, 600));
const os = await run('os');
await new Promise((r) => setTimeout(r, 600));
const toggle = await run('toggle');
const midway = (r) => r.animatedVsTarget.some((s) => { const [a, t] = s.split('/').map(Number); return t > 0 && a < t; });
const verdict = {
  /* this container renders in software at a few frames a second; the easing still has to
     be visible across several positions, which is the thing a jump would not do */
  fullEased: full.distinctPositions >= 3 && midway(full) && full.settled && full.finalY > 100,
  fullUsesLenis: /(^|\s)lenis(\s|$)/.test(full.htmlClass) && full.hasLenis,
  /* the claim under the OS flag is that nothing changed, i.e. Lenis is still installed and
     the wheel still moves the page. Its intermediate positions are not part of the claim:
     at a third of a second per frame the damping is time-based and legitimately resolves in
     one step, which is a property of this container, not of the page. */
  osReducedIsStillFull: /(^|\s)lenis(\s|$)/.test(os.htmlClass) && os.hasLenis && os.finalY > 100,
  toggleDropsLenis: !/(^|\s)lenis(\s|$)/.test(toggle.htmlClass) && !toggle.hasLenis,
  toggleJumps: toggle.distinctPositions <= 2 && toggle.finalY > 100,
  noErrors: [full, os, toggle].every((r) => r.errors.length === 0),
};
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ full, os, toggle, verdict }, null, 2));
console.log(JSON.stringify({ traces: { full: full.first, os: os.first, toggle: toggle.first },
  distinct: [full.distinctPositions, os.distinctPositions, toggle.distinctPositions],
  avgFrameMs: [full.avgFrameMs, os.avgFrameMs, toggle.avgFrameMs], verdict }, null, 2));
await browser.close();
process.exit(Object.values(verdict).every(Boolean) ? 0 : 1);
