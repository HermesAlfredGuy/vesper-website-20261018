/* overflow-descent.mjs — descend the tree to the element that actually sets
   documentElement.scrollWidth, then measure its own content box. */
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const W = Number(process.argv[3] || 390), H = Number(process.argv[4] || 844);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-features=dbus'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stage && window.__stage.scene, null, { timeout: 30000 });
await page.waitForTimeout(4000);

const out = await page.evaluate(() => {
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.toString().trim().split(/\s+/).join('.') : '');
  const lines = [];
  // walk down: at each level, report children whose scrollWidth or bounding right
  // reaches the parent's scrollWidth (the chain that carries the 399)
  const chain = [];
  let node = document.body;
  const target = document.documentElement.scrollWidth;
  for (let depth = 0; depth < 40 && node; depth++) {
    const kids = [...node.children];
    let next = null;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      const cs = getComputedStyle(k);
      if (cs.position === 'fixed') continue;
      if (k.scrollWidth >= target - 1 || r.right >= target - 1) { next = k; break; }
    }
    chain.push({ d: depth, el: label(node), scrollW: node.scrollWidth, clientW: node.clientWidth,
                 rect: [Math.round(node.getBoundingClientRect().left), Math.round(node.getBoundingClientRect().right)] });
    if (!next) break;
    node = next;
  }
  // also: every element whose painted box right edge is the max
  let maxR = -1e9, maxEl = null;
  document.querySelectorAll('*').forEach((el) => {
    if (getComputedStyle(el).position === 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.right > maxR) { maxR = r.right; maxEl = el; }
  });
  // text-node level: what actually paints past the viewport
  const spills = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.right > innerWidth + 0.5) {
        spills.push({ right: Math.round(r.right * 10) / 10, left: Math.round(r.left * 10) / 10,
                      parent: label(n.parentElement), text: n.textContent.trim().replace(/\s+/g, ' ').slice(0, 50) });
      }
    }
  }
  return { target, innerWidth, chain, maxRight: Math.round(maxR * 10) / 10, maxEl: maxEl ? label(maxEl) : null, spills: spills.slice(0, 20) };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
