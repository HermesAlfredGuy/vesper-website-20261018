import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
await p.goto('http://127.0.0.1:9311/tools/macro.html?d=0.78&aim=0.16&finish=foundry&mood=0.0&i=0.8&turn=-1.07', { waitUntil: 'load' });
await p.waitForTimeout(9000);
console.log(JSON.stringify(await p.evaluate(() => {
  const s = window.__stage, c = s.renderer.domElement;
  return { canvasCss: [c.clientWidth, c.clientHeight], buf: [c.width, c.height], pr: s.renderer.getPixelRatio(),
    live: document.querySelector('#stage') ? 1 : 0, tris: s.renderer.info.render.triangles, calls: s.renderer.info.render.calls,
    bg: s.scene.background && s.scene.background.getHexString(), mood: s.state.mood, exp: s.renderer.toneMappingExposure };
})));
console.log('errors:', errs.slice(0, 5));
await b.close();
