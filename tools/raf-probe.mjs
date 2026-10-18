/* Does requestAnimationFrame actually fire in this headless context, and does the
   stage reach .is-live? Prints visibilityState, rAF latency, and the resulting class. */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
page.on('console', (m) => console.log('CONSOLE ' + m.type() + ': ' + m.text()));
await page.goto('http://127.0.0.1:9311/index.html', { waitUntil: 'load', timeout: 60000 });
console.log('visibility', await page.evaluate(() => document.visibilityState));
console.log('raf', await page.evaluate(() => new Promise((r) => {
  const t = setTimeout(() => r('NO RAF in 4s'), 4000);
  requestAnimationFrame(() => { clearTimeout(t); r('fired'); });
})));
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => ({
    cls: document.getElementById('stage').className,
    live: !!window.__stage,
    marks: performance.getEntriesByType('mark').map((m) => `${m.name}@${Math.round(m.startTime)}`),
  }));
  console.log(i, JSON.stringify(s));
  if (s.cls.includes('is-live')) break;
}
await browser.close();
