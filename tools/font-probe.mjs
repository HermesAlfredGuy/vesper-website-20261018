/* Is the self-hosted Instrument Sans a variable font (real weight axis) or a single
   static instance (in which case asking for 500 would be synthesised)? Measures the
   same string at several weights in the real browser. */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:9311/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(async () => {
  await document.fonts.ready;
  const mk = (w) => {
    const s = document.createElement('span');
    s.style.cssText = `position:absolute;left:-9999px;white-space:nowrap;font-family:'Instrument Sans';font-size:40px;font-weight:${w}`;
    s.textContent = 'VESPER ATMOSPHERE';
    document.body.appendChild(s);
    const r = s.getBoundingClientRect();
    const box = { w: r.width, h: r.height };
    s.remove();
    return box;
  };
  // the same canvas measurement of stroke coverage tells us if 500 is drawn heavier
  const ink = (w) => {
    const c = document.createElement('canvas');
    c.width = 500; c.height = 80;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 500, 80);
    g.fillStyle = '#fff';
    g.font = `${w} 40px 'Instrument Sans'`;
    g.fillText('VESPER', 4, 52);
    const d = g.getImageData(0, 0, 500, 80).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i];
    return sum;
  };
  return { w300: mk(300), w400: mk(400), w500: mk(500), w700: mk(700), ink400: ink(400), ink500: ink(500), ink700: ink(700) };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
