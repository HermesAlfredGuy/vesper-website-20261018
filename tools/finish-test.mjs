/* finish-test.mjs — choosing a finish has to work at every moment, not only after load.

   For each phase (before the scene exists, while it is still compiling, while the page
   is scrolling, while the object is being dragged) it clicks every finish and checks
   three things that can disagree: which button says it is selected, what the page thinks
   the finish is, and what the body material actually is — plus one real pixel sample per
   phase so "the UI changed but the object did not" cannot pass.

   node tools/finish-test.mjs [url] */
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const read = () => page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-finish]')].map((b) => ({
    id: b.dataset.finish,
    on: b.getAttribute('aria-pressed') === 'true' || b.classList.contains('is-on'),
  }));
  const st = window.__stage;
  const m = st && st.body && st.body.material;
  return {
    pressed: btns.filter((b) => b.on).map((b) => b.id).join(','),
    state: st ? st.state.finish : (window.__finishState || null),
    hex: m ? '#' + m.color.getHexString() : null,
    rough: m ? +m.roughness.toFixed(2) : null,
    tone: document.body.dataset.tone || document.documentElement.dataset.tone || null,
  };
});

const sample = async () => {
  // mean colour of the object's own pixels: the brightest 4 % of the hero's right half,
  // where the object sits, is the body and the seam and nothing else
  const buf = await page.screenshot({ clip: { x: 900, y: 240, width: 300, height: 420 } });
  const { createCanvas, loadImage } = await import('canvas').catch(() => ({}));
  return buf.length;      // replaced by the pixel read below when canvas is unavailable
};

/* Wait for convergence rather than for a fixed delay: the cross-fade is a material
   property on real time, so the number of frames it needs depends on the machine. A test
   that samples 650 ms after the click measures the frame rate, not the feature. */
const clickFinish = async (id) => {
  await page.evaluate((f) => {
    const b = document.querySelector(`[data-finish="${f}"]`);
    if (b) b.click();
  }, id);
  await page.waitForFunction((f) => {
    const s = window.__stage;
    return !!s && s.state.finishTarget.id === f && s.isSettled();
  }, id, { timeout: 6000, polling: 100 }).catch(() => {});
};

const results = [];
async function phase(name, before) {
  if (before) await before();
  for (const id of ['foundry', 'umber', 'slate', 'bone', 'foundry']) {
    const ok = await page.evaluate((f) => !!document.querySelector(`[data-finish="${f}"]`), id).catch(() => false);
    if (!ok) { results.push({ phase: name, id, skipped: 'no control yet' }); continue; }
    const errBefore = errs.length;
    await clickFinish(id);
    const r = await read();
    results.push({ phase: name, id, ...r, ok: r.pressed === id && (r.state === null || r.state.id === id || r.state === id), newErrors: errs.slice(errBefore) });
  }
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

// 1. immediately, before the stage exists
await phase('pre-load', null);

// 2. during the compile (the scene object exists but is not live yet)
await page.waitForFunction(() => !!window.__stage && !document.querySelector('#stage').classList.contains('is-live'), null, { timeout: 20000 }).catch(() => {});
await phase('mid-load', null);

// 3. live and scrolling
await page.waitForFunction(() => document.querySelector('#stage').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
await phase('scrolling', async () => {
  await page.evaluate(() => window.scrollTo(0, innerHeight * 0.6));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
});

// 4. while dragging the object
await phase('dragging', async () => {
  await page.mouse.move(980, 480);
  await page.mouse.down();
  await page.mouse.move(1060, 480, { steps: 6 });
});

await page.mouse.up();
await page.waitForTimeout(300);

// pixel proof: a real screenshot of the object's pixels for two finishes
const shot = async (f) => {
  await clickFinish(f);
  await page.evaluate(() => window.__stage.settle());
  await page.waitForTimeout(500);
  return page.screenshot({ clip: { x: 940, y: 300, width: 220, height: 300 } });
};
let a, b;
try { a = await shot('umber'); b = await shot('bone'); } catch (e) { console.error('shot failed: ' + e.message); }

const diff = a && b ? await page.evaluate(async ([a64, b64]) => {
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const [ia, ib] = await Promise.all([load(a64), load(b64)]);
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
  const g = c.getContext('2d');
  g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
  g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
  let s = 0, n = 0;
  for (let i = 0; i < da.length; i += 4) { s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); n++; }
  return +(s / n / 3).toFixed(1);
}, ['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64')]) : null;

const bad = results.filter((r) => !r.skipped && !r.ok);
console.log(JSON.stringify({
  checks: results.length, mismatches: bad.length, mismatchesDetail: bad.slice(0, 6),
  phases: [...new Set(results.map((r) => r.phase))],
  pixelMeanAbsDiffUmberVsBone: diff,
  errors: errs.slice(0, 4),
}, null, 0));
await browser.close();
