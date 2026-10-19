import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', chromiumSandbox: false,
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--hide-scrollbars'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9311/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__stage, null, { timeout: 90000 });
await p.waitForTimeout(2500);
const before = await p.evaluate(() => ({ y: scrollY, atmoTop: document.getElementById('atmosphere').offsetTop, h: document.documentElement.scrollHeight,
  mood: window.__stage.state.targetMood, int: window.__stage.state.targetIntensity, sec: window.__stage.state.stopIndex ?? null }));
console.log('before', JSON.stringify(before));
await p.evaluate(() => { const el = document.getElementById('atmosphere'); window.scrollTo(0, el.offsetTop + Math.max(0, (el.offsetHeight - innerHeight) / 2)); });
await p.waitForTimeout(1500);
await p.evaluate(() => window.__stage.settle && window.__stage.settle());
await p.waitForTimeout(800);
await p.evaluate(() => { window.__ticks = 0; const t = () => { window.__ticks++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
for (let i = 0; i < 6; i++) {
  await p.waitForTimeout(700);
  const st = await p.evaluate(() => ({ y: scrollY, ticks: window.__ticks, vis: document.visibilityState,
    mood: window.__stage.state.targetMood, int: window.__stage.state.targetIntensity }));
  console.log('t' + i, JSON.stringify(st));
}
await b.close();
