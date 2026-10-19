/* overflow-pseudo.mjs — pseudo-elements are not in the DOM, so they survive a
   child-removal bisect. Test them directly, then attribute one by one. */
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
await page.waitForTimeout(3500);

const out = await page.evaluate(() => {
  const de = document.documentElement;
  const base = de.scrollWidth;
  const style = document.createElement('style');
  style.id = 'killpseudo';
  document.head.appendChild(style);
  const set = (css) => { style.textContent = css; };
  const read = () => de.scrollWidth;

  set('*::before,*::after{display:none !important}');
  const allOff = read();

  // which rules declare a pseudo? snapshot every stylesheet rule with ::before/::after
  const rules = [];
  for (const sh of document.styleSheets) {
    let rs = [];
    try { rs = [...sh.cssRules]; } catch (e) { continue; }
    for (const r of rs) {
      if (r.selectorText && /::?(before|after)/.test(r.selectorText)) {
        rules.push(r.selectorText + ' { ' + (r.style.cssText || '').slice(0, 120) + ' }');
      }
    }
  }
  // attribute: kill all but one class of pseudo at a time is expensive; instead report
  // every element whose own subtree participates, plus the pseudo rules that could sit
  // in the overflow band (right edge beyond the viewport)
  const cand = [];
  document.querySelectorAll('*').forEach((el) => {
    for (const p of ['::before', '::after']) {
      const cs = getComputedStyle(el, p);
      if (!cs || cs.content === 'none' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      cand.push({
        el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.toString().trim().split(/\s+/).join('.') : ''),
        p, content: cs.content, position: cs.position, right: cs.right, left: cs.left,
        w: cs.width, transform: cs.transform, parentRect: [Math.round(r.left), Math.round(r.right)],
      });
    }
  });
  set('');
  return { base, innerWidth: innerWidth, allPseudoOff: allOff, pseudoRuleCount: rules.length, rules: rules.slice(0, 40), candCount: cand.length, cand: cand.slice(0, 40) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
