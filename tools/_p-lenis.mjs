import { chromium } from 'playwright-core';
const EXEC = '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await page.goto(url, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => document.querySelector('.stage').classList.contains('is-live'), null, { timeout: 180000, polling: 300 }).catch(() => {});
await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.hidden || b.classList.contains('is-out'); }, null, { timeout: 60000, polling: 150 }).catch(() => {});
await page.waitForTimeout(1200);
const st = await page.evaluate(() => ({
  lenis: !!window.__lenis, htmlReduced: document.documentElement.classList.contains('reduced'),
  stored: (() => { try { return localStorage.getItem('site-motion'); } catch (e) { return 'x'; } })(),
  lenisClasses: document.documentElement.className,
  emitter: window.__stage && window.__stage.output ? window.__stage.output().emissiveIntensity : null,
}));
await page.mouse.move(720, 450);
await page.mouse.wheel(0, 900);
const samples = [];
for (let i = 0; i < 12; i++) { await page.waitForTimeout(120); samples.push(await page.evaluate(() => Math.round(window.scrollY))); }
console.log(JSON.stringify({ st, samples, errs }, null, 1));
await browser.close();
