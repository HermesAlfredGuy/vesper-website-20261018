import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', chromiumSandbox: false, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--hide-scrollbars'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on('console', (m) => console.log(m.type(), m.text().slice(0, 400)));
p.on('pageerror', (e) => console.log('pageerror', String(e.stack || e.message).slice(0, 700)));
await p.goto(process.argv[2], { waitUntil: 'load' });
await p.waitForTimeout(9000);
await b.close();
