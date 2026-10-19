import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', chromiumSandbox: false,
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--hide-scrollbars'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:9311/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__stage, null, { timeout: 60000 });
await p.waitForTimeout(4000);
const out = await p.evaluate(() => {
  const s = window.__stage; let body = null;
  s.scene.traverse((o) => { if (o.isMesh && o.material && o.material.type === 'MeshStandardMaterial' && o.geometry.attributes.aGroove && !body) body = o; });
  const m = body.material;
  return { rev: s.scene.constructor.name, hasEnvInt: 'environmentIntensity' in s.scene,
    envInt: s.scene.environmentIntensity, env: !!s.scene.environment,
    envIsTex: s.scene.environment && s.scene.environment.isTexture, envMapping: s.scene.environment && s.scene.environment.mapping,
    color: m.color.getHexString(), metal: m.metalness, rough: m.roughness, envMapIntensity: m.envMapIntensity,
    matEnv: !!m.envMap, map: !!m.map, exposure: s.renderer.toneMappingExposure, tone: s.renderer.toneMapping,
    outputColorSpace: s.renderer.outputColorSpace, physLights: s.renderer.useLegacyLights === undefined ? 'n/a' : s.renderer.useLegacyLights,
    lights: (() => { const l = []; s.scene.traverse((o) => { if (o.isLight) l.push([o.type, +o.intensity.toFixed(2), o.color.getHexString(), o.visible]); }); return l; })(),
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
