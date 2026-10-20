import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

/* Pass 4: the boot panel, as it actually looks.
   Captures the panel at two real progress values and the page after the reveal, then
   reports what opened it (dataset.reveal), how long it was up, and whether the scroll
   position moved with Lenis afterwards.

   node tools/p4-loader.mjs <url> <outdir> [w] [h] [dpr]
*/
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const [url, out, w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, hasTouch: +w < 900, isMobile: +w < 900 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

/* THROTTLE_KBPS slows the wire so the panel can be photographed at a real mid-progress
   value instead of being reconstructed: the fill is then where the bytes actually are. */
const kbps = +(process.env.THROTTLE_KBPS || 0);
if (kbps) {
  const client = await ctx.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 60, downloadThroughput: kbps * 1024, uploadThroughput: kbps * 1024,
  });
}

const t0 = Date.now();
page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
/* Raw CDP capture: playwright's screenshot waits for a stable frame, and while the stage
   compiles its programs the main thread is busy for seconds at a time — by the time the
   shutter opened the panel had finished. This takes the frame that is on screen at the
   moment the progress value is read, so the still and the number agree. */
const cdp = await ctx.newCDPSession(page);
const grab = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path, Buffer.from(data, 'base64'));
};
const readBoot = () => page.evaluate(() => {
  const el = document.getElementById('boot');
  return {
    p: getComputedStyle(el).getPropertyValue('--boot-p').trim(),
    pct: document.getElementById('bootPct').textContent,
    copy: document.getElementById('bootStage').textContent,
  };
});
const shotAt = async (min, name) => {
  const shot = await readBoot();
  const ok = await page.waitForFunction((m) => {
    const el = document.getElementById('boot');
    if (!el || el.hidden) return false;
    return parseFloat(getComputedStyle(el).getPropertyValue('--boot-p') || '0') >= m;
  }, min, { timeout: 45000, polling: 100 }).then(() => true).catch(() => false);
  const at = await readBoot();
  if (ok) await grab(`${out}/${name}.png`);
  return { requested: min, got: ok, at };
};

/* The panel is opaque and covers the viewport, so the stills are taken with the stage
   hidden: it is not visible in them either way, and hiding it stops a 4x-MSAA software
   frame from taking ten seconds and moving the fill on while the shutter is open. */
const hideStage = process.env.HIDE_STAGE === '1';
await page.waitForSelector('#boot', { timeout: 60000 }).catch(() => {});
if (hideStage) await page.addStyleTag({ content: '.stage{visibility:hidden!important}' });

const a = await shotAt(0.18, 'boot-early');
const b = await shotAt(0.70, 'boot-late');
await page.waitForFunction(() => !document.documentElement.classList.contains('is-boot'), null, { timeout: 90000 }).catch(() => {});
const revealedAt = Date.now() - t0;
if (hideStage) await page.evaluate(() => { const st = document.querySelector('.stage'); if (st) st.style.visibility = ''; });
await page.waitForTimeout(1200);
await grab(`${out}/revealed.png`);

/* the first scroll after the reveal: does the position actually travel, and is the smooth
   scroller the thing moving it? */
const scroll = await page.evaluate(async () => {
  const t0 = performance.now();
  window.scrollBy({ top: 420, behavior: 'auto' });
  await new Promise((r) => setTimeout(r, 900));
  return { y: Math.round(window.scrollY), ms: Math.round(performance.now() - t0), htmlClass: document.documentElement.className };
});

const info = await page.evaluate(() => ({
  reveal: document.getElementById('boot').dataset.reveal || null,
  bootHidden: document.getElementById('boot').hidden,
  marks: Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)])),
  stageLive: document.getElementById('stage').classList.contains('is-live'),
  output: window.__stage ? window.__stage.output() : null,
  scrollY: Math.round(window.scrollY),
  docH: document.documentElement.scrollHeight,
}));

console.log(JSON.stringify({ early: a, late: b, revealedAt, scroll, info, errors }, null, 2));
await browser.close();
