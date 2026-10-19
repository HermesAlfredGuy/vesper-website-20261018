import { chromium } from 'playwright-core';
import fs from 'node:fs';

// Checks the *deployed* page in a real browser and captures the delivery stills.
// usage: node tools/live-check.mjs [url] [outDir]
const url = process.argv[2] || 'https://hermesalfredguy.github.io/vesper-website-20261018/';
const out = process.argv[3] || 'refs/live';
fs.mkdirSync(out, { recursive: true });

const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: EXEC,
  chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus', '--hide-scrollbars'],
});

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

/* ---------- desktop, live ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  const loadMs = Date.now() - t0;

  // the still must be up before the GPU is: the poster is the first paint
  const poster = await page.evaluate(() => {
    const img = document.getElementById('stagePoster');
    return { complete: !!img && img.complete && img.naturalWidth > 0, natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null, fetchPriority: img ? img.getAttribute('fetchpriority') : null };
  });
  check('live: the poster still is served and decoded', poster.complete, JSON.stringify(poster));

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return { serif: document.fonts.check('400 40px "Instrument Serif"'), sans: document.fonts.check('400 16px "Instrument Sans"'), mono: document.fonts.check('400 12px "IBM Plex Mono"'), loaded: [...document.fonts].length };
  });
  check('live: self-hosted fonts are the ones rendering', fonts.serif && fonts.sans && fonts.mono, JSON.stringify(fonts));

  let stage = false;
  for (let i = 0; i < 120 && !stage; i++) {
    stage = await page.evaluate(() => !!(document.querySelector('.stage.is-live') && window.__stage && window.__stage.scene));
    if (!stage) await page.waitForTimeout(2000);
  }
  const marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)])));
  check('live: the 3D stage comes up on the deployed site', stage, JSON.stringify(marks));
  check('live: no console, page or request errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('live: nothing overflows horizontally', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  const head = await page.evaluate(() => {
    const s = document.querySelector('.ln > span');
    const r = s.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), opacity: getComputedStyle(s).opacity, visible: r.width > 40 && r.height > 20 };
  });
  check('live: the headline is actually rendered, not just present', head.visible && Number(head.opacity) > 0.5, JSON.stringify(head));

  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/live-desktop-hero.png`, timeout: 120000 });

  // the configurator must change the object, on the deployed build
  const before = await page.evaluate(() => ({ f: window.__stage.state.finish.id, a: window.__stage.state.atmosphere.id }));
  await page.evaluate(() => document.querySelector('[data-finish="umber"]').click());
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => window.__stage.state.finish.id);
  check('live: choosing a finish changes the object', after === 'umber' && after !== before.f, `${before.f} -> ${after}`);

  await page.evaluate(() => document.getElementById('atmosphere').scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('[data-atmo="meridian"]').click());
  await page.waitForTimeout(3200);
  const atmo = await page.evaluate(() => ({ id: window.__stage.state.atmosphere.id, mood: window.__stage.state.mood, readout: document.getElementById('readoutText').textContent.trim() }));
  check('live: choosing an atmosphere changes the room and the readout', atmo.id === 'meridian' && /Meridian/.test(atmo.readout), JSON.stringify(atmo));
  await page.screenshot({ path: `${out}/live-desktop-atmosphere.png`, timeout: 120000 });

  // back to the default so the delivered hero still matches the poster
  await page.evaluate(() => { document.querySelector('[data-atmo="hearth"]').click(); document.querySelector('[data-finish="slate"]').click(); });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/live-desktop-hero-final.png`, timeout: 120000 });
  await ctx.close();
}

/* ---------- mobile, live ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  let stage = false;
  for (let i = 0; i < 120 && !stage; i++) {
    stage = await page.evaluate(() => !!(document.querySelector('.stage.is-live') && window.__stage));
    if (!stage) await page.waitForTimeout(2000);
  }
  check('live mobile: the stage comes up', stage);
  check('live mobile: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('live mobile: nothing overflows horizontally', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/live-mobile-hero.png`, timeout: 120000 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/live-mobile-bottom.png`, timeout: 120000 });
  await ctx.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`TOTAL ${results.length - failed.length}/${results.length} passed`);
console.log('LIVE_LOAD_MS ' + loadMs);
await browser.close();
process.exit(failed.length ? 1 : 0);
