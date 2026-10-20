import { chromium } from 'playwright-core';
const EXEC = '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const run = async (reduced) => {
  const browser = await chromium.launch({ executablePath: EXEC, chromiumSandbox: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 },
    ...(reduced ? { reducedMotion: 'reduce' } : {}) });
  const page = await ctx.newPage();
  await page.goto('http://localhost:9311/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage && window.__stage.emitterProbe().loaded &&
    document.querySelector('.stage').classList.contains('is-live'), null, { timeout: 90000, polling: 250 });
  await page.evaluate(() => { const s = window.__stage; s.settle(); s.update(0.016); });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const s = window.__stage, m = s.opal.material;
    return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      orbit: +s.state.orbit.toFixed(3), cam: s.camera.position.toArray().map((v) => +v.toFixed(2)),
      exp: +s.renderer.toneMappingExposure.toFixed(3),
      emis: [m.emissive.r, m.emissive.g, m.emissive.b].map((v) => +v.toFixed(3)),
      ei: +m.emissiveIntensity.toFixed(2), int: +s.state.intensity.toFixed(2),
      atmo: s.state.atmosphere && s.state.atmosphere.id, mood: +(s.state.mood || 0).toFixed(2) };
  });
  await browser.close();
  return r;
};
console.log(JSON.stringify(await run(false)));
console.log(JSON.stringify(await run(true)));
