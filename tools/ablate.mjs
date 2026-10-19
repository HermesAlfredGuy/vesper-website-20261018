/* ablate.mjs — attribute a surface defect to its actual cause, not to a theory.
   Each variant reloads the macro stage, applies exactly one change, screenshots.
   Then python measures the row-profile period of the body in each frame.

   node tools/ablate.mjs "http://127.0.0.1:9311/tools/macro.html?d=0.26&aim=0.162&finish=foundry&mood=0.06" /tmp/ablate */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2];
const outDir = process.argv[3] || '/tmp/ablate';
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function settle() {
  await page.waitForFunction(() => window.__stage && window.__stage.scene, null, { timeout: 30000 });
  await page.waitForTimeout(6500);
  await page.evaluate(() => window.__stage.settle());
  await page.waitForTimeout(500);
}

const variants = [
  ['baseline', null],
  ['no-normalmap', `s.bodyMat.normalMap=null; s.bodyMat.needsUpdate=true;`],
  ['no-channel-shader', `s.body.material = new s.bodyMat.constructor({color:0xc6cbd2,metalness:0.85,roughness:0.42,envMapIntensity:2.4,side:2});`],
  ['geom-normals-only', `const T = await import('/vendor/three.module.js'); s.body.material = new T.MeshNormalMaterial();`],
  ['no-texture-noslot', `const T2 = await import('/vendor/three.module.js');
      s.body.material = new T2.MeshNormalMaterial(); s.body.material.flatShading = false;`],
];

const rows = [];
for (const [name, code] of variants) {
  await page.goto(url, { waitUntil: 'load' });
  await settle();
  if (code) {
    const r = await page.evaluate(async (src) => {
      try { await (new Function('s', 'return (async () => {' + src + '})()'))(window.__stage); return 'ok'; }
      catch (e) { return String(e); }
    }, code);
    if (r !== 'ok') console.error(name, 'apply failed:', r);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  rows.push(name);
}
console.log(JSON.stringify(rows));
await browser.close();
