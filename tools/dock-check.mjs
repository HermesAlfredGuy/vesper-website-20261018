import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', chromiumSandbox: false,
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--hide-scrollbars'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:9311/index.html', { waitUntil: 'load' });
await p.waitForTimeout(3000);
const out = await p.evaluate(async () => {
  const res = [];
  for (const id of ['top','object','atmosphere','materials','specification','reserve']) {
    const el = document.getElementById(id);
    window.scrollTo(0, el.offsetTop + Math.max(0, (el.offsetHeight - innerHeight) / 2));
    await new Promise((r) => setTimeout(r, 1200));
    const d = document.getElementById('dock'), cs = getComputedStyle(d), r = el.getBoundingClientRect();
    const lit = [...document.querySelectorAll('.btn--solid')].filter((x) => {
      const bcr = x.getBoundingClientRect();
      if (!bcr.width || bcr.bottom < 0 || bcr.top > innerHeight) return false;
      if (x.closest('.dock')) return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5 && d.getBoundingClientRect().top < innerHeight;
      return Number(getComputedStyle(x).opacity) > 0.5;
    }).map((x) => x.textContent.trim().slice(0, 20));
    res.push({ id, secTop: Math.round(r.top), secBot: Math.round(r.bottom), isEnd: document.body.classList.contains('is-end'), vis: cs.visibility, op: cs.opacity, lit });
  }
  return res;
});
out.forEach((r) => console.log(JSON.stringify(r)));
await b.close();
