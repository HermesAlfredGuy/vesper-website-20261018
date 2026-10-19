/* overflow-probe.mjs — find what actually overflows the viewport at a given width.
   Reports documentElement.scrollWidth, then every element whose border box or
   scrollWidth extends past innerWidth, with its tag/class and the exact overhang. */
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const W = Number(process.argv[3] || 390);
const H = Number(process.argv[4] || 844);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stage && window.__stage.scene, null, { timeout: 30000 });
await page.waitForTimeout(4000);

const out = await page.evaluate((W) => {
  const de = document.documentElement;
  const rows = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const over = Math.round((r.right - W) * 10) / 10;
    const soff = el.scrollWidth - el.clientWidth;
    if (over > 0.5 || soff > 1) {
      rows.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 60),
        id: el.id || '',
        right: Math.round(r.right * 10) / 10,
        left: Math.round(r.left * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        over,
        scrollW: el.scrollWidth, clientW: el.clientWidth,
        pos: cs.position, ox: cs.overflowX, text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  });
  return {
    innerWidth: innerWidth,
    deScrollWidth: de.scrollWidth, deClientWidth: de.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    htmlOverflowX: getComputedStyle(de).overflowX,
    rows,
  };
}, W);

console.log(JSON.stringify(out, null, 1));
await browser.close();
