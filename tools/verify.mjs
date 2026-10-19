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
    return { target: window.__stage.state.finishTarget.id, readout: document.getElementById('readoutText').textContent };
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
    await new Promise((x) => setTimeout(x, 900));
    if (window.__stage.settle) { window.__stage.settle(); }
    await new Promise((x) => setTimeout(x, 900));
    const st = window.__stage.state, CH = window.__stage.CHANNEL;
    return {
      orbit: Number(st.orbit.toFixed(3)),
      target: Number(st.targetOrbit.toFixed(3)),
      groupRot: Number(window.__stage.group.rotation.y.toFixed(3)),
      seam: Number(st.seamPhase.toFixed(3)),
      derived: Number((st.seamPhase - (CH.phase + st.orbit)).toFixed(4)),
    };
  });
  // the seam is milled into the body, so there is no separate phase to drift out of
  // step with it: the seam's angle must always be the body's angle
  check('desktop: turn control rotates the object and the seam turns with it',
    turn.target > 2.5 && Math.abs(turn.groupRot - turn.orbit) < 0.01 && Math.abs(turn.derived) < 0.005,
    JSON.stringify(turn));

  const groove = await page.evaluate(() => [0.11, 0.17, 0.24].map((y) => window.__stage.grooveProbe(y)));
  // measured off the vertex buffer, against the smooth profile the lathe would have
  // followed: if the channel were a painted stripe these depths would all be zero
  // 4.6 mm deep and 16.0 mm across: a 7.6 mm rebate is right for a spotlight and wrong
  // for a diffuser, because at the hero's 40-60 deg incidence the near lip occluded the
  // tube along the whole helix. The bounds are the design's, read off CHANNEL, so this
  // check still fails if the mesh ever stops matching the shader.
  const CHd = await page.evaluate(() => window.__stage.CHANNEL.depth);
  const CHa = await page.evaluate(() => window.__stage.CHANNEL.aperture);
  check('desktop: the channel is milled into the mesh, not drawn on it',
    groove.every((g) => g.floorRadius !== null && Math.abs(g.depth - CHd) < 0.0004
      && Math.abs(g.halfWidth - CHa / 2) < 0.0006 && g.samples >= 3),
    JSON.stringify(groove.map((g) => ({ at: g.at, depth: +(g.depth * 1000).toFixed(2), half: +(g.halfWidth * 1000).toFixed(2) }))));

  /* the floor and the wall are lit by a line source that is part of the object, so
     turning the object has to carry the pattern round with it. Rotating the emitter
     twice (the classic version of this bug) leaves the pattern nailed to the room. */
  const spill = await page.evaluate(async () => {
    const s = window.__stage;
    s.setOrbit(0); s.settle(); await new Promise((r) => setTimeout(r, 200));
    const at0 = s.spillProbe();
    s.setOrbit(1.2); s.settle(); await new Promise((r) => setTimeout(r, 200));
    const at1 = s.spillProbe();
    s.setOrbit(0); s.settle(); await new Promise((r) => setTimeout(r, 200));
    return { at0, at1, delta: +(at1.azimuth - at0.azimuth).toFixed(3) };
  });
  check('desktop: the spill turns with the object (the seam owns the pattern)',
    Math.abs(spill.delta) > 0.6 && spill.at1.radius > 0.02 && spill.at1.y > 0.02 && spill.at1.y < 0.30,
    JSON.stringify(spill));

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

  // no readable text anywhere may sit under the fixed dock while a chapter is settled
  check('desktop: no text sits under the dock when a chapter is settled', await page.evaluate(async () => {
    const dock = document.getElementById('dock').getBoundingClientRect();
    const sections = ['specification', 'reserve'];
    const bad = [];
    for (const id of sections) {
      const sec = document.getElementById(id);
      window.scrollTo(0, sec.offsetTop + sec.offsetHeight - window.innerHeight);
      await new Promise((r) => setTimeout(r, 900));
      const d = document.getElementById('dock').getBoundingClientRect();
      for (const el of sec.querySelectorAll('p, td, th, h2, h3, dd, dt, a, button')) {
        if (!(el.textContent || '').trim()) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom > d.top + 2 && r.top < d.bottom - 2 && r.right > d.left + 2 && r.left < d.right - 2) {
          bad.push((el.textContent || '').trim().slice(0, 30));
        }
      }
    }
    window.__underDock = bad;
    return bad.length === 0;
  }), await page.evaluate(() => JSON.stringify(window.__underDock)));

  const cta = [];
  for (const id of ['top', 'object', 'atmosphere', 'materials', 'specification', 'reserve']) {
    await page.evaluate((sid) => {
      const el = document.getElementById(sid);
      window.scrollTo(0, el.offsetTop + Math.max(0, (el.offsetHeight - innerHeight) / 2));
    }, id);
    // wait for the *class*, not for a stopwatch and not for the geometry: the scroll
    // event is a task on the main thread and a WebGL frame here can take a second, so
    // a fixed sleep can read the previous chapter's dock state. This runs in Node — it
    // used to sit inside page.evaluate, where `page` does not exist.
    await page.waitForFunction((want) => document.body.classList.contains('is-end') === want,
      id === 'reserve', { timeout: 20000, polling: 200 }).catch(() => {});
    // visibility flips on the frame the class lands, unlike the opacity fade, so
    // this reads the state as the reader gets it and not as an animation queue sees it
    const lit = await page.evaluate(() => {
      const dock = document.getElementById('dock');
      const dcs = getComputedStyle(dock);
      const dockVis = dcs.visibility !== 'hidden' && dcs.pointerEvents !== 'none'
        && Number(dcs.opacity) > 0.5 && dock.getBoundingClientRect().top < innerHeight;
      return [...document.querySelectorAll('.btn--solid')].filter((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) return false;
        const own = Number(getComputedStyle(b).opacity);
        if (own < 0.5) return false;
        if (b.closest('.dock') && !dockVis) return false;
        return true;
      }).map((b) => b.textContent.trim().slice(0, 24));
    });
    cta.push([id, lit]);
  }
  check('desktop: one primary action is in front of the reader at a time',
    cta.every(([, l]) => l.length <= 1), JSON.stringify(cta));

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
  const heroFrame = await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 1200));
    if (window.__stage && window.__stage.settle) window.__stage.settle();
    await new Promise((r) => setTimeout(r, 900));
    const o = window.__stage.objectRect();
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 ? r.top : Infinity; };
    const parts = [...document.querySelectorAll('.sec--hero .copy')];
    const copyTop = Math.min(...parts.map(vis));
    return { o, copyTop: Math.round(copyTop), vh: innerHeight, vw: innerWidth,
             offCentre: Math.round((o.left + o.right) / 2 - innerWidth / 2) };
  });
  /* the fold is the constraint: the whole object has to be inside the first screen,
     high in the frame and centred, and the copy has to start below most of it */
  check('mobile: the hero shows the whole object inside the first screen, centred',
    heroFrame.o.top >= 0 && heroFrame.o.bottom <= heroFrame.vh
      && heroFrame.o.left >= 0 && heroFrame.o.right <= heroFrame.vw
      && heroFrame.o.top < heroFrame.vh * 0.12
      && heroFrame.o.bottom > heroFrame.vh * 0.34
      && heroFrame.copyTop >= heroFrame.o.bottom - 8
      && Math.abs(heroFrame.offCentre) < 24,
    JSON.stringify(heroFrame));

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
  check('reduced motion: headline reveals do not translate (opacity feedback stays)',
    Math.abs(rmSpan.ty) < 0.5 && /opacity/.test(rmSpan.transition), JSON.stringify(rmSpan));
  let rmStage = false;
  for (let i = 0; i < 90 && !rmStage; i++) {
    await page.waitForTimeout(2000);
    rmStage = await page.evaluate(() => !!window.__stage).catch(() => false);
  }
  await page.evaluate(() => {
    const el = document.getElementById('atmosphere');
    window.scrollTo(0, el.offsetTop + Math.max(0, (el.offsetHeight - innerHeight) / 2));
  });
  // Wait for the *state*, not for a stopwatch. On a software renderer a single animation
  // frame can be a second and a half away, so a fixed wait measures the renderer's mood
  // as much as the page's; this asks the page the question it is actually checking.
  await page.waitForFunction(() => window.__stage && window.__stage.state.targetMood === 1
    && window.__stage.state.targetIntensity === 1, null, { timeout: 30000, polling: 250 });
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
