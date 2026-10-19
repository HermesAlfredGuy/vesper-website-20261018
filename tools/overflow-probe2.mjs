/* overflow-probe2.mjs — find the true offender at a hard 390px viewport.
   Desktop emulation (isMobile:false) so the layout viewport cannot shrink-to-fit
   and mask the element that is genuinely too wide. */
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
await page.waitForTimeout(4000);
const out = await page.evaluate((W) => {
  const de = document.documentElement;
  const rows = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const over = Math.round((r.right - W) * 10) / 10;
    const under = Math.round(r.left * 10) / 10;
    if (over > 0.5 || under < -0.5 || el.scrollWidth - el.clientWidth > 1) {
      rows.push({
        tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 48), id: el.id || '',
        left: under, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10,
        over, scrollW: el.scrollWidth, clientW: el.clientWidth,
        pos: cs.position, ox: cs.overflowX, minW: cs.minWidth, ws: cs.whiteSpace,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
      });
    }
  });
  return { innerWidth: innerWidth, deScrollWidth: de.scrollWidth, deClientWidth: de.clientWidth,
           htmlOx: getComputedStyle(de).overflowX, bodyOx: getComputedStyle(document.body).overflowX, rows };
}, W);
console.log(JSON.stringify(out, null, 1));
await browser.close();
