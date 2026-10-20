/* Loader-only capture for the pass 4 film.
   On a local server the 1.6 MB GLB arrives in milliseconds and the panel is up for one
   second, so its bar is never seen filling. The panel is real; two things are changed for
   the capture and both are stated in the film:
     - the connection is throttled to 300 KB/s, an ordinary 4G link;
     - the 3D drawing buffer is shrunk to 96x60 behind the panel, because a full-size
       software frame here takes ~20 s and the capture would outrun the load it is filming.
   Neither touches the number in the panel: that is the GLB's own bytes and the programs
   that have linked. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const [url, outDir = '/opt/data/cache/scratch/lfilm', w = '1280', h = '720'] = process.argv.slice(2);
const THROTTLE_KBPS = Number(process.env.THROTTLE_KBPS || 300);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--hide-scrollbars', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 90, downloadThroughput: (THROTTLE_KBPS * 1024), uploadThroughput: 200 * 1024,
});

let n = 0;
async function shot() {
  const buf = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, captureBeyondViewport: false });
  fs.writeFileSync(path.join(outDir, `f${String(n).padStart(4, '0')}.jpg`), Buffer.from(buf.data, 'base64'));
  n++;
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#boot', { timeout: 30000 });
/* keep the buffer off the critical path: the panel is DOM, the scene is behind it */
const shrink = setInterval(() => {
  page.evaluate(() => { if (window.__stage && window.__stage.resize) window.__stage.resize(96, 60); }).catch(() => {});
}, 400);
await page.waitForTimeout(150);

const wanted = [3, 9, 16, 24, 33, 43, 54, 64, 74, 83, 91, 97];
let wi = 0;
const seen = [];
for (let guard = 0; guard < 900 && wi < wanted.length; guard++) {
  const st = await page.evaluate(() => {
    const b = document.getElementById('boot');
    if (!b) return { pct: 0, done: true };
    const p = getComputedStyle(b).getPropertyValue('--boot-p') || '0';
    return { pct: Math.round((parseFloat(p) || 0) * 100), done: b.classList.contains('is-out') };
  });
  if (st.done) break;
  if (st.pct >= wanted[wi]) { seen.push(st.pct); wi++; await shot(); }
  else await page.waitForTimeout(90);
}
clearInterval(shrink);
console.log('loader steps', JSON.stringify(seen), 'frames', n);
await browser.close();
