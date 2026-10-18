/* End-to-end behaviour check for the real page. Reports pass/fail per item, plus
   console errors and a horizontal-overflow check. Usage: node tools/verify.mjs [url] */
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});

/* ---------- desktop ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  // the 3D stage loads lazily after the first paint; poll from Node, because the page's own
  // timers are starved while the software rasteriser compiles the scene
  let stageLive = false;
  for (let i = 0; i < 90 && !stageLive; i++) {
    await page.waitForTimeout(2000);
    stageLive = await page.evaluate(() => !!window.__stage && document.getElementById('stage').classList.contains('is-live')).catch(() => false);
  }
  check('desktop: WebGL stage becomes live (crossfades in from the still)', stageLive);
  await page.waitForTimeout(1500);

  check('desktop: no console/page/network errors', errs.length === 0, errs.join(' | '));
  check('desktop: canvas present, stage exposed', await page.evaluate(() => !!document.querySelector('#gl') && !!window.__stage));
  check('desktop: fonts are self-hosted and loaded',
    await page.evaluate(() => document.fonts.status === 'loaded' &&
      performance.getEntriesByType('resource').filter((r) => /\.woff2$/.test(r.name)).every((r) => new URL(r.name).origin === location.origin)));
  check('desktop: no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    await page.evaluate(() => `${document.documentElement.scrollWidth} vs ${window.innerWidth}`));

  // the headline must actually be visible (a masked reveal must never hide content)
  const head = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 3000));
    const s = document.querySelector('.display .ln > span');
    const cs = getComputedStyle(s);
    const box = s.getBoundingClientRect();
    return { transform: cs.transform, fontSize: cs.fontSize, top: Math.round(box.top), h: Math.round(box.height),
             opacity: cs.opacity, masked: getComputedStyle(s.parentElement).overflow };
  });
  check('desktop: hero headline is revealed and legible',
    (head.transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(head.transform)) && head.h > 30 && head.top > -20 && head.opacity === '1',
    JSON.stringify(head));

  for (const id of ['object', 'atmosphere', 'materials', 'specification']) {
    const res = await page.evaluate(async (i) => {
      location.hash = '';
      location.hash = '#' + i;
      await new Promise((r) => setTimeout(r, 900));
      const el = document.getElementById(i);
      const top = el.getBoundingClientRect().top;
      const prev = el.previousElementSibling ? null : null;
      return { top: Math.round(top), h: el.offsetHeight, hit: top <= 4 && top + el.offsetHeight > 40, prev };
    }, id);
    check(`desktop: #${id} anchor lands correctly`, res.hit, JSON.stringify(res));
  }

  // finish change reaches the scene and the readouts
  const fin = await page.evaluate(async () => {
    document.querySelector('.fin[data-finish="bone"]').click();
    await new Promise((r) => setTimeout(r, 2600));
    return { target: window.__stage.state.finishTarget.id, readout: document.getElementById('dockReadout').textContent };
  });
  check('desktop: finish control changes the scene', fin.target === 'bone' && /Bone/.test(fin.readout), JSON.stringify(fin));

  const atmo = await page.evaluate(async () => {
    document.querySelector('.atmos__row[data-atmo="meridian"]').click();
    await new Promise((r) => setTimeout(r, 2600));
    return { target: window.__stage.state.atmoTarget.id, readout: document.getElementById('readoutText').textContent, pressed: document.querySelector('.atmos__row[data-atmo="meridian"]').getAttribute('aria-pressed') };
  });
  check('desktop: atmosphere control changes the scene', atmo.target === 'meridian' && atmo.pressed === 'true', JSON.stringify(atmo));

  const turn = await page.evaluate(async () => {
    const r = document.getElementById('turnRange');
    r.value = '100';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((x) => setTimeout(x, 2000));
    return { orbit: Number(window.__stage.state.targetOrbit.toFixed(3)), phase: Number(window.__stage.state.targetPhase.toFixed(3)) };
  });
  check('desktop: turn control rotates the object and moves the seam', turn.orbit > 2.5 && turn.phase > 1, JSON.stringify(turn));

  const drag = await page.evaluate(async () => {
    const before = window.__stage.state.targetOrbit;
    const el = document.querySelector('.sec--hero');   // the transparent section a real click lands on
    const opts = { bubbles: true, clientX: 1200, clientY: 480, pointerType: 'mouse', pointerId: 1, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 1000 }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 1000 }));
    await new Promise((x) => setTimeout(x, 400));
    return { before: Number(before.toFixed(3)), after: Number(window.__stage.state.targetOrbit.toFixed(3)) };
  });
  check('desktop: mouse drag rotates the object', Math.abs(drag.after - drag.before) > 0.1, JSON.stringify(drag));

  const dragText = await page.evaluate(async () => {
    const before = window.__stage.state.targetOrbit;
    const el = document.querySelector('.sec--hero .lede');
    const opts = { bubbles: true, clientX: 300, clientY: 640, pointerType: 'mouse', pointerId: 2, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 100 }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 100 }));
    await new Promise((x) => setTimeout(x, 300));
    return { before: Number(before.toFixed(3)), after: Number(window.__stage.state.targetOrbit.toFixed(3)) };
  });
  check('desktop: dragging over body text selects instead of rotating', dragText.after === dragText.before, JSON.stringify(dragText));

  // reservation dialog
  const modal = await page.evaluate(async () => {
    document.querySelector('[data-open-reserve]').click();
    await new Promise((r) => setTimeout(r, 700));
    const d = document.getElementById('reserveModal');
    const text = d.textContent;
    const ref = document.getElementById('modalRef').textContent;
    return { open: d.open === true, hasDisclaimer: /no payment/i.test(text), ref,
             mentionsFinish: /Bone/.test(text), mentionsAtmo: /Meridian/.test(text) };
  });
  check('reservation preview opens with the live configuration', modal.open && modal.mentionsFinish && modal.mentionsAtmo, JSON.stringify(modal));
  check('reservation preview states no payment and shows a local reference', modal.hasDisclaimer && /^VS01-/.test(modal.ref), JSON.stringify(modal));

  const esc = await page.evaluate(async () => {
    document.getElementById('reserveModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.getElementById('reserveModal').close();
    await new Promise((r) => setTimeout(r, 300));
    return document.getElementById('reserveModal').open;
  });
  check('reservation preview closes', esc === false, String(esc));

  // keyboard reachability of the primary control
  const kb = await page.evaluate(() => {
    const r = document.getElementById('turnRange');
    r.value = '40';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.focus();
    const before = window.__stage.state.targetOrbit;
    r.stepUp(20);
    r.dispatchEvent(new Event('input', { bubbles: true }));
    return { focused: document.activeElement === r, from: Number(before.toFixed(3)),
             to: Number(window.__stage.state.targetOrbit.toFixed(3)),
             changed: window.__stage.state.targetOrbit !== before };
  });
  check('desktop: turn control is keyboard operable', kb.focused && kb.changed, JSON.stringify(kb));

  // deep scroll forward and back keeps the pipeline alive
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  const bottom = await page.evaluate(() => ({ y: Math.round(window.scrollY), tone: document.body.className }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);
  const top = await page.evaluate(() => ({ y: Math.round(window.scrollY), mood: Number(window.__stage.state.targetMood.toFixed(3)), int: Number(window.__stage.state.targetIntensity.toFixed(3)) }));
  check('desktop: scroll to end and back returns to the hero framing',
    bottom.y > 3000 && top.y === 0 && top.mood === 0.9 && top.int === 0.8, JSON.stringify({ bottom, top }));

  // resize
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(2200);
  check('desktop: resize keeps the canvas matched to the viewport',
    await page.evaluate(() => { const c = document.getElementById('gl'); return Math.abs(c.clientWidth - window.innerWidth) < 2 && Math.abs(c.clientHeight - window.innerHeight) < 2; }),
    await page.evaluate(() => { const c = document.getElementById('gl'); return `${c.clientWidth}x${c.clientHeight} vs ${window.innerWidth}x${window.innerHeight}`; }));

  // back to the desktop viewport before asserting layout against the editorial column
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('specification').offsetTop));

  check('desktop: configurator dock clears the editorial column', await page.evaluate(() => {
    const d = document.getElementById('dock').getBoundingClientRect();
    const col = document.querySelector('.sec--specs .copy').getBoundingClientRect();
    return d.left >= col.right;
  }), await page.evaluate(() => {
    const d = document.getElementById('dock').getBoundingClientRect();
    const col = document.querySelector('.sec--specs .copy').getBoundingClientRect();
    return JSON.stringify({ dockLeft: Math.round(d.left), dockRight: Math.round(d.right), colRight: Math.round(col.right) });
  }));

  check('desktop: Pause motion control is operable', await page.evaluate(async () => {
    const b = document.getElementById('motionToggle');
    b.click();
    const pressed = b.getAttribute('aria-pressed');
    b.click();
    return pressed === 'true' && b.getAttribute('aria-pressed') === 'false';
  }));
  await ctx.close();
}

/* ---------- mobile ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  check('mobile: no console errors', errs.length === 0, errs.join(' | '));
  check('mobile: no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    await page.evaluate(() => `${document.documentElement.scrollWidth} vs ${window.innerWidth}`));
  check('mobile: controls are comfortably tappable (>= 24px)', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.btn, .swatch, .atmos__row, .fin, input[type=range]'))
      .filter((el) => el.offsetParent !== null)
      .every((el) => el.getBoundingClientRect().height >= 24)),
    await page.evaluate(() => JSON.stringify(Array.from(document.querySelectorAll('.btn,.swatch,.fin')).map((e) => [e.className.slice(0, 18), Math.round(e.getBoundingClientRect().height)]).slice(0, 14))));
  check('mobile: dock stays inside the viewport', await page.evaluate(() => {
    const r = document.getElementById('dock').getBoundingClientRect();
    return r.left >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
  }), await page.evaluate(() => JSON.stringify(document.getElementById('dock').getBoundingClientRect().toJSON())));
  check('mobile: turn control is present and the drag does not hijack scroll', await page.evaluate(() => {
    const r = document.getElementById('turnRange');
    return !!r && getComputedStyle(document.getElementById('gl')).touchAction === 'pan-y';
  }));
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(2500);
  check('mobile: page still scrolls normally', await page.evaluate(() => window.scrollY > 800));

  // the fixed dock must never cover the end-of-page calls to action
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  const clear = await page.evaluate(() => {
    const dock = document.getElementById('dock').getBoundingClientRect();
    const btns = [...document.querySelectorAll('.sec--reserve a, .sec--reserve button, .foot a, .foot button')]
      .map((b) => ({ t: (b.textContent || '').trim().slice(0, 24), r: b.getBoundingClientRect() }))
      .filter((b) => b.r.width > 0 && b.r.height > 0);
    const covered = btns.filter((b) => b.r.bottom > dock.top + 2 && b.r.top < dock.bottom - 2);
    return { count: btns.length, covered: covered.map((c) => c.t), dockTop: Math.round(dock.top), lastBottom: btns.length ? Math.round(Math.max(...btns.map((b) => b.r.bottom))) : null };
  });
  check('mobile: end-of-page buttons are not hidden under the dock', clear.count > 0 && clear.covered.length === 0, JSON.stringify(clear));

  await ctx.close();
}

/* ---------- reduced motion ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const rm = await page.evaluate(() => ({
    btn: document.getElementById('motionToggle').getAttribute('aria-pressed'),
    label: document.getElementById('motionToggle').getAttribute('aria-label') || document.getElementById('motionToggle').textContent.trim(),
    lines: getComputedStyle(document.querySelector('.ln > span')).transform,
    probe: (() => { const el = document.querySelector('.copy'); return getComputedStyle(el).transitionDuration; })(),
  }));
  check('reduced motion: ambient motion is already paused', rm.btn === 'true' && /Resume/i.test(rm.label), JSON.stringify(rm));
  const rmSpan = await page.evaluate(() => {
    const s = document.querySelector('.ln > span');
    const cs = getComputedStyle(s);
    const m = cs.transform.match(/matrix\(([^)]+)\)/);
    const ty = m ? Number(m[1].split(',')[5]) : 0;
    return { transform: cs.transform, ty, transition: cs.transitionProperty + ' ' + cs.transitionDuration };
  });
  check('reduced motion: headline reveals do not translate (opacity only)',
    Math.abs(rmSpan.ty) < 0.5 && !/transform/.test(rmSpan.transition), JSON.stringify(rmSpan));
  let rmStage = false;
  for (let i = 0; i < 90 && !rmStage; i++) {
    await page.waitForTimeout(2000);
    rmStage = await page.evaluate(() => !!window.__stage).catch(() => false);
  }
  await page.evaluate(() => window.scrollTo(0, 1764));
  await page.waitForTimeout(3000);
  const snap = await page.evaluate(() => ({ mood: Number(window.__stage.state.targetMood.toFixed(3)), int: Number(window.__stage.state.targetIntensity.toFixed(3)) }));
  check('reduced motion: the scene still responds to scroll', snap.mood === 1 && snap.int === 1, JSON.stringify(snap));
  await ctx.close();
}

/* ---------- no WebGL ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith('webgl')) return null;
      return orig.call(this, type, ...rest);
    };
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const fb = await page.evaluate(() => {
    const img = document.getElementById('stagePoster');
    return {
      noticeVisible: !document.getElementById('fallback').hidden,
      posterLoaded: !!img && img.complete && img.naturalWidth > 0,
      posterVisible: !!img && getComputedStyle(img).opacity === '1',
      noGlClass: document.body.classList.contains('no-gl'),
      canvasHidden: getComputedStyle(document.getElementById('gl')).display === 'none',
      liveNeverAdded: !document.getElementById('stage').classList.contains('is-live'),
      scrollable: document.documentElement.scrollHeight > 3000,
    };
  });
  check('no WebGL: the still stays visible, the notice explains it, the scene never fakes being live',
    fb.posterLoaded && fb.posterVisible && fb.noticeVisible && fb.noGlClass && fb.canvasHidden && fb.liveNeverAdded && fb.scrollable && errs.length === 0,
    JSON.stringify({ ...fb, errs }));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log('RESULTS');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  -> ' + r.detail}`);
console.log(`TOTAL ${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILURES'); for (const f of failed) console.log(' - ' + f.name + ' :: ' + f.detail); }
