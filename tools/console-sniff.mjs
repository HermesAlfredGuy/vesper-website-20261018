import { chromium } from 'playwright-core';
const b = await chromium.launch({
  executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  chromiumSandbox: false, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
const p = await b.newPage();
p.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 400)));
p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 500)));
p.on('requestfailed', (r) => console.log('REQFAIL', r.url()));
await p.goto(process.argv[2], { waitUntil: 'load' });
await p.waitForTimeout(6000);
console.log('stage?', await p.evaluate(() => !!window.__stage));
await b.close();
