/* overflow-pseudo2.mjs — attribute the pseudo-element overflow to one selector. */
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const W = Number(process.argv[3] || 390), H = Number(process.argv[4] || 844);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stage && window.__stage.scene, null, { timeout: 30000 });
await page.waitForTimeout(3500);

const out = await page.evaluate(() => {
  const de = document.documentElement;
  const base = de.scrollWidth;
  const style = document.createElement('style');
  document.head.appendChild(style);
  // collect the base ::before/::after selectors from the real stylesheets
  const sels = new Set();
  for (const sh of document.styleSheets) {
    let rs = []; try { rs = [...sh.cssRules]; } catch (e) { continue; }
    for (const r of rs) {
      if (r.selectorText && /::?(before|after)/.test(r.selectorText)) sels.add(r.selectorText);
    }
  }
  const hits = [];
  for (const s of sels) {
    if (/\*\s*$|^::/.test(s) && s.includes('*')) continue;
    style.textContent = `${s}{display:none !important}`;
    const after = de.scrollWidth;
    if (after < base) hits.push({ sel: s, after });
  }
  style.textContent = '';
  // and now measure each live pseudo box directly, with no kill rules in play
  const boxes = [];
  document.querySelectorAll('*').forEach((el) => {
    for (const p of ['::before', '::after']) {
      const cs = getComputedStyle(el, p);
      if (!cs || cs.content === 'none' || !cs.content) continue;
      if (cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      boxes.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.toString().trim().split(/\s+/).join('.') : ''),
        p, content: cs.content, position: cs.position, right: cs.right, left: cs.left, width: cs.width,
        boxSizing: cs.boxSizing, transform: cs.transform, parent: [Math.round(r.left), Math.round(r.right), Math.round(r.top)] });
    }
  });
  return { base, innerWidth, hits, boxCount: boxes.length, boxes: boxes.slice(0, 30) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
