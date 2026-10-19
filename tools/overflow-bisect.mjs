/* overflow-bisect.mjs — remove each candidate in turn and see which one owns the
   horizontal overflow. The heaviest hammer but the only one that names the element. */
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

const res = await page.evaluate(() => {
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (el.className ? '.' + el.className.toString().trim().split(/\s+/).join('.') : '');
  const de = document.documentElement;
  const base = de.scrollWidth;
  const hits = [];
  const all = [...document.querySelectorAll('body *')];
  for (const el of all) {
    const parent = el.parentNode;
    if (!parent) continue;
    const next = el.nextSibling;
    parent.removeChild(el);
    const after = de.scrollWidth;
    parent.insertBefore(el, next);
    if (after < base) {
      const r = el.getBoundingClientRect();
      hits.push({ el: label(el), fixed: de.scrollWidth, before: base, after,
                  rect: [Math.round(r.left), Math.round(r.right), Math.round(r.top)],
                  pos: getComputedStyle(el).position,
                  text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 46) });
    }
  }
  return { base, innerWidth, hits: hits.slice(0, 30), hitCount: hits.length };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
