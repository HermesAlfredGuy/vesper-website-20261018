import { chromium } from 'playwright-core';
const EXEC = '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const b = await chromium.launch({ executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
p.on('console', (m) => console.log('[' + m.type() + ']', m.text().slice(0, 400)));
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
p.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
await p.goto('http://127.0.0.1:9311/index.html', { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(15000);
console.log('stage?', await p.evaluate(() => !!window.__stage));
console.log('no-gl?', await p.evaluate(() => document.body.classList.contains('no-gl')));
console.log('poster?', await p.evaluate(() => { const i = document.getElementById('stagePoster'); return i ? i.complete + ' ' + getComputedStyle(i).opacity : 'none'; }));
console.log('probe', JSON.stringify(await p.evaluate(() => {
  const s = window.__stage; if (!s) return 'none';
  return { verts: s.body.geometry.getAttribute('position').count, g: s.grooveProbe(0.17), e: s.emitterProbe() };
})));
await b.close();
