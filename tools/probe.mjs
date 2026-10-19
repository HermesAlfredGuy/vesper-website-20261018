/* probe.mjs — what is on screen, and what is it made of.

   Not a test: a diagnostic. The page is one WebGL canvas, so when something looks
   wrong there is nothing in the DOM to inspect. This dumps, for a given viewport and
   scroll position:

     · the scene graph, with each mesh's type, size, position and material
     · the object's screen-space box (objectRect)
     · the milled channel measured off the vertex buffer at three heights
     · any console error

   and can hide one mesh by index and re-shoot, which is how you attribute a bright
   patch on screen to the thing that caused it.

     node tools/probe.mjs http://127.0.0.1:9311/index.html 1440 900
     node tools/probe.mjs ... --scroll 0.5 --ablate 6 --shot /tmp/ab.png
*/
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const url = argv[0] || 'http://127.0.0.1:9311/index.html';
const num = (i, d) => (argv[i] !== undefined && !argv[i].startsWith('--') ? Number(argv[i]) : d);
const W = num(1, 1440), H = num(2, 900);
const flag = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
const scrollF = Number(flag('--scroll') || 0);
const ablate = flag('--ablate') === null ? null : Number(flag('--ablate'));
const shot = flag('--shot');

const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-features=dbus', '--hide-scrollbars'],
});
const mobile = argv.includes('--mobile');
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile, hasTouch: mobile,
});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stage && window.__stage.scene, null, { timeout: 25000 });
await page.waitForTimeout(Number(flag('--settle') || 7000));
// jump the damped camera/brightness to their targets so the numbers are the
// numbers the page intends, not wherever the damping happened to be
await page.evaluate(() => { if (window.__stage && window.__stage.settle) window.__stage.settle(); });
await page.waitForTimeout(700);
if (scrollF) {
  await page.evaluate((f) => window.scrollTo(0, Math.round((document.body.scrollHeight - innerHeight) * f)), scrollF);
  await page.waitForTimeout(1800);
}

const out = await page.evaluate(() => {
  const s = window.__stage;
  const meshes = [];
  s.scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isSprite) return;
    const pr = (o.geometry && o.geometry.parameters) || {};
    meshes.push({
      i: meshes.length, type: o.type,
      mat: (o.material && o.material.type) || '-',
      size: [pr.width, pr.height, pr.radius, pr.tube].filter((v) => v !== undefined).map((v) => +v.toFixed(3)),
      pos: o.position.toArray().map((v) => +v.toFixed(3)),
      vis: o.visible,
    });
  });
  const chan = s.CHANNEL || {};
  const probe = [0.10, 0.16, 0.235].map((y) => s.grooveProbe(y));
  const c = s.camera;
  return {
    innerW: innerWidth, innerH: innerHeight, scrollY: Math.round(scrollY),
    camera: {
      pov: c.position.toArray().map((v) => +v.toFixed(4)),
      fov: c.fov,
      dir: (() => { const v = new s.camera.position.constructor(); c.getWorldDirection(v); return v.toArray().map((x) => +x.toFixed(4)); })(),
      aspect: +c.aspect.toFixed(4),
      buffer: (() => { const cv = s.renderer.domElement; return [cv.width, cv.height]; })(),
      canvasCss: (() => { const cv = document.getElementById('gl'); return [cv.clientWidth, cv.clientHeight]; })(),
      canvasAttr: (() => { const cv = document.getElementById('gl'); return [cv.width, cv.height]; })(),
      orbit: +s.state.orbit.toFixed(4),
      now: s.state.camera.pos.toArray().map((v) => +v.toFixed(4)),
      want: s.state.targetCam.pos.toArray().map((v) => +v.toFixed(4)),
      fovNow: +s.state.camera.fov.toFixed(3), fovWant: +s.state.targetCam.fov.toFixed(3),
    },
    docH: Math.round(document.body.scrollHeight),
    dpr: devicePixelRatio,
    objectRect: s.objectRect ? s.objectRect() : null,
    channel: { yMin: chan.yMin, yMax: chan.yMax, turns: chan.turns, depth: chan.depth, slot: chan.slot },
    probe, meshes,
  };
});

if (ablate !== null) {
  await page.evaluate((i) => {
    let n = -1;
    window.__stage.scene.traverse((o) => {
      if (!o.isMesh && !o.isPoints && !o.isSprite) return;
      n++;
      if (n === i) o.visible = false;
    });
  }, ablate);
  await page.waitForTimeout(900);
}

if (shot) {
  mkdirSync(dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  out.shot = shot;
}
out.errors = errors;
writeFileSync('/tmp/p2/probe.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await browser.close();
