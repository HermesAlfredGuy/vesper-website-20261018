import { chromium } from 'playwright-core';
const EXEC = '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const url = process.argv[2];
const KBPS = Number(process.env.KBPS || 0);
const b = await chromium.launch({ executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
if (KBPS) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 90,
  downloadThroughput: KBPS * 1024, uploadThroughput: 200 * 1024 });
const t0 = Date.now();
const samples = [];
const stop = setInterval(async () => {
  try {
    const st = await page.evaluate(() => {
      const b = document.getElementById('boot');
      if (!b) return { pct: null, cls: null };
      const p = getComputedStyle(b).getPropertyValue('--boot-p') || '0';
      const lp = window.__stage && window.__stage.loadProgress ? window.__stage.loadProgress() : null;
      return { pct: Math.round((parseFloat(p) || 0) * 100), cls: b.className, stage: b.dataset.reveal || null,
        lp: lp ? { a: +lp.assets.toFixed(3), c: +lp.compile.toFixed(3), r: lp.ready } : null };
    });
    samples.push({ t: ((Date.now() - t0) / 1000).toFixed(1), ...st });
  } catch (e) {}
}, 300);
page.on('response', (r) => { if (r.url().includes('.glb')) console.log('glb response', ((Date.now() - t0) / 1000).toFixed(1), r.status()); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(30000);
clearInterval(stop);
console.log(JSON.stringify(samples.filter((s, i) => i % 2 === 0).slice(0, 30)));
await b.close();
