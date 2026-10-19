import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:9311/tools/macro.html?d=0.78&aim=0.16&finish=foundry&mood=0.0&i=0.8&turn=-1.07', { waitUntil: 'load' });
await p.waitForTimeout(10000);
console.log(JSON.stringify(await p.evaluate(() => {
  const s = window.__stage, gl = s.renderer.getContext();
  let err = null;
  try { s.setMood(0); s.settle(); for (let i = 0; i < 3; i++) s.update(0.05); } catch (e) { err = e.message; }
  const px = new Uint8Array(4 * 16);
  gl.readPixels(10, 10, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const mid = new Uint8Array(4);
  gl.readPixels(450, 550, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, mid);
  return { err, corner: Array.from(px.slice(0, 8)), centre: Array.from(mid),
    frame: s.renderer.info.render.frame, calls: s.renderer.info.render.calls,
    fb: gl.checkFramebufferStatus(gl.FRAMEBUFFER), lost: gl.isContextLost(),
    size: [s.renderer.domElement.width, s.renderer.domElement.height] };
})));
console.log('pageerrors:', errs.slice(0, 3));
await b.close();
