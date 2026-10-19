import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
await p.goto('http://127.0.0.1:9311/tools/macro.html?d=0.78&aim=0.16&finish=foundry&mood=0.0&i=0.8&turn=-1.07', { waitUntil: 'load' });
await p.waitForTimeout(10000);
const r = await p.evaluate(() => {
  const s = window.__stage;
  s.setMood(0); s.settle();
  for (let i = 0; i < 3; i++) s.update(0.05);
  const c = s.renderer.domElement;
  return { url: c.toDataURL('image/png').slice(0, 40), len: c.toDataURL('image/png').length,
           mood: s.state.mood, bg: s.scene.background.getHexString(), exp: s.renderer.toneMappingExposure };
});
console.log(JSON.stringify(r));
const durl = await p.evaluate(() => window.__stage.renderer.domElement.toDataURL('image/png'));
fs.writeFileSync('/tmp/glread.png', Buffer.from(durl.split(',')[1], 'base64'));
await b.close();
