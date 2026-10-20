import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/* Pass 4: the two claims that are easy to say and hard to keep.

   motion: the OS's prefers-reduced-motion must leave the page at full motion; the viewer's
   "Reduce motion" toggle must calm it (no Lenis, instant scroll, opacity-only reveals) and
   must not freeze it (the emitter still breathes).
   mobile: the boot panel and the hero must be legible at 390x844 with a 2x device, and
   the dock and the hero readout must not overflow.

  node tools/p4-checks.mjs <url> <outDir>
*/
const [url, outDir] = process.argv.slice(2);
const EXEC = process.env.CHROME_BIN || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: EXEC, chromiumSandbox: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
         '--hide-scrollbars', '--force-color-profile=srgb'],
});
const out = { reduced: {}, mobile: {} };

/* ---------- motion policy: full by default, calmer by choice ----------
   The owner's rule for this page: the OS reporting prefers-reduced-motion must NOT cut or
   freeze anything (work laptops ship that way), the viewer's own "Reduce motion" toggle must
   calm it, and "calm" must never mean "dead". So this block tests both directions. */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  const osReduceEarly = await page.evaluate(() => document.documentElement.classList.contains('reduced'));
  await page.waitForTimeout(1200);
  const bootState = await page.evaluate(() => {
    const b = document.getElementById('boot');
    const cs = b ? getComputedStyle(b) : null;
    const sweep = document.querySelector('.boot__sweep');
    return {
      bootPresent: !!b,
      bootClass: b ? b.className : null,
      bootTransition: cs ? cs.transition : null,
      sweepOpacity: sweep ? getComputedStyle(sweep).opacity : null,
      sweepAnim: sweep ? getComputedStyle(sweep).animationName : null,
      lenis: !!window.__lenis,
      revealTransition: (() => {
        const el = document.querySelector('.ln>span');
        return el ? getComputedStyle(el).transition : null;
      })(),
      revealTransform: (() => {
        const el = document.querySelector('.ln>span');
        return el ? getComputedStyle(el).transform : null;
      })(),
    };
  });
  /* the OS flag alone must leave the page at full motion */
  const osReduce = { classOnHtml: osReduceEarly, lenisPresent: bootState.lenis };

  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.hidden || b.classList.contains('is-out');
  }, null, { timeout: 60000, polling: 150 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('.stage').classList.contains('is-live'), null, { timeout: 180000, polling: 300 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  /* full motion under OS reduce: the wheel glides */
  const glideFrom = await page.evaluate(() => Math.round(window.scrollY));
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(90);
  const glideMid = await page.evaluate(() => Math.round(window.scrollY));
  await page.waitForTimeout(1500);
  const glideEnd = await page.evaluate(() => Math.round(window.scrollY));

  /* now the viewer turns it down */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('motionToggle').click());
  await page.waitForTimeout(500);
  const afterToggle = await page.evaluate(() => ({
    htmlClass: document.documentElement.classList.contains('reduced'),
    stored: (() => { try { return localStorage.getItem('site-motion'); } catch (e) { return null; } })(),
    lenis: !!window.__lenis,
    pressed: document.getElementById('motionToggle').getAttribute('aria-pressed'),
    footText: document.getElementById('footMotion').textContent.trim(),
  }));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => Math.round(window.scrollY));
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => Math.round(window.scrollY));
  const settleProbe = [];
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(220); settleProbe.push(await page.evaluate(() => Math.round(window.scrollY))); }
  const ticks = [];
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(600);
    ticks.push(await page.evaluate(() => Math.round(window.scrollY)));
  }
  const calmCss = await page.evaluate(() => {
    const ln = document.querySelector('.ln>span');
    const rv = document.querySelector('.rv');
    const sweep = document.querySelector('.boot__sweep');
    return {
      revealTransform: ln ? getComputedStyle(ln).transform : null,
      revealTransition: ln ? getComputedStyle(ln).transition : null,
      rvTransform: rv ? getComputedStyle(rv).transform : null,
      sweepAnim: sweep ? getComputedStyle(sweep).animationName : null,
      scrollBehaviour: getComputedStyle(document.documentElement).scrollBehavior,
    };
  });

  /* "calm" is not "dead": with the toggle on, the emitter still breathes. Read the value the
     stage actually applied rather than comparing two downscaled screenshots -- 3.5 % of one
     material's output is a few code values over the whole frame, which a pixel diff rounds
     away and a reader does not. */
  const breathe = async () => page.evaluate(() => (window.__stage && window.__stage.output
    ? window.__stage.output().emissiveIntensity : null));
  const liveness = { first: await breathe() };
  await page.waitForTimeout(2600);
  liveness.second = await breathe();
  liveness.changed = liveness.first !== null && liveness.second !== null
    && Math.abs(liveness.second - liveness.first) > 0.001;

  /* and the choice survives a reload, before the module has run */
  const page2 = await ctx.newPage();
  await page2.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const persisted = await page2.evaluate(() => ({
    htmlClass: document.documentElement.classList.contains('reduced'),
    stored: (() => { try { return localStorage.getItem('site-motion'); } catch (e) { return null; } })(),
  }));
  await page2.close();

  const deadStop = settleProbe.every((v) => v === settleProbe[0]);
  out.motion = {
    osReduce,
    glide: { from: glideFrom, mid: glideMid, end: glideEnd, midBeforeEnd: glideMid < glideEnd },
    afterToggle,
    calm: { scrolled: { from: before, to: after, moved: after - before, deadStop, settleProbe }, ticks,
      instantPerTick: ticks.slice(1).map((v, i) => v - ticks[i]), css: calmCss },
    liveness,
    persisted,
    errors,
  };
  await ctx.close();
}
/* ---------- mobile ---------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#boot', { timeout: 30000 });
  await page.waitForTimeout(900);
  const bootShot = path.join(outDir, 'mobile-boot.png');
  await page.screenshot({ path: bootShot, timeout: 180000 });
  const overflow = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    boot: (() => {
      const b = document.getElementById('boot');
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left) };
    })(),
    dock: (() => {
      const d = document.querySelector('.dock');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    })(),
  }));
  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.hidden || b.classList.contains('is-out');
  }, null, { timeout: 60000, polling: 150 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('.stage').classList.contains('is-live'), null, { timeout: 180000, polling: 300 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'mobile-hero.png'), timeout: 180000 });
  await page.evaluate(() => { const s = window.__stage; if (s && s.setOrbit) s.setOrbit(-0.35); s && s.settle && s.settle(); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'mobile-hero-turned.png'), timeout: 180000 });

  /* the object must still turn under a finger, and the page must still scroll natively:
     Lenis is syncTouch:false, so a touch swipe is the browser's, not a tween */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  /* Real touch, through the browser's own touch pipeline: a horizontal swipe must turn
     the object and a vertical one must scroll the page. */
  const cdp = await ctx.newCDPSession(page);
  const touchDrag = async (dx, dy, steps = 8) => {
    const x0 = 195, y0 = 210;   /* over the render, above the hero copy */
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }],
      });
      await page.waitForTimeout(25);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(600);
  };

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const orbitBefore = await page.evaluate(() => window.__stage.state.orbit);
  const scrollBeforeDrag = await page.evaluate(() => Math.round(window.scrollY));
  await touchDrag(-120, 0);
  const orbitAfter = await page.evaluate(() => window.__stage.state.orbit);
  const scrollAfterDrag = await page.evaluate(() => Math.round(window.scrollY));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const orbitBeforeV = await page.evaluate(() => window.__stage.state.orbit);
  await touchDrag(0, -260, 10);
  const orbitAfterV = await page.evaluate(() => window.__stage.state.orbit);
  const scrollAfterV = await page.evaluate(() => Math.round(window.scrollY));

  const scrollBefore = await page.evaluate(() => Math.round(window.scrollY));
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(700);
  const scrollAfter = await page.evaluate(() => Math.round(window.scrollY));
  out.mobile = {
    overflow, errors, shots: [bootShot],
    touchTurn: {
      orbitBefore: +orbitBefore.toFixed(3), orbitAfter: +orbitAfter.toFixed(3),
      turned: Math.abs(orbitAfter - orbitBefore) > 0.02,
      scrollDuringDrag: scrollAfterDrag - scrollBeforeDrag,
    },
    touchScroll: {
      scrollAfter: scrollAfterV, scrolled: scrollAfterV > 100,
      orbitChanged: Math.abs(orbitAfterV - orbitBeforeV) > 0.02,
    },
    nativeScroll: { before: scrollBefore, after: scrollAfter, moved: Math.abs(scrollAfter - scrollBefore) > 200 },
  };
  await ctx.close();
}

/* ---------- desktop: the drag still turns the object ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('.stage').classList.contains('is-live'), null, { timeout: 180000, polling: 300 }).catch(() => {});
  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.hidden || b.classList.contains('is-out');
  }, null, { timeout: 60000, polling: 150 }).catch(() => {});
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => window.__stage.state.orbit);
  /* start over the render, not the copy: pointerdown on a text node is ignored by design */
  await page.mouse.move(1120, 690);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(1120 - i * 26, 690); await page.waitForTimeout(35); }
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.__stage.state.orbit);
  /* the arrow keys are the range input's own behaviour, so they need real key events */
  const kbBefore = await page.evaluate(() => ({ orbit: window.__stage.state.orbit, value: document.getElementById('turnRange').value }));
  await page.evaluate(() => document.getElementById('turnRange').focus());
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const kbAfter = await page.evaluate(() => ({ orbit: window.__stage.state.orbit, value: document.getElementById('turnRange').value }));
  const keyboard = { before: kbBefore, after: kbAfter, moved: kbBefore.value !== kbAfter.value };
  out.desktop = {
    drag: { before: +before.toFixed(3), after: +after.toFixed(3), turned: Math.abs(after - before) > 0.02 },
    keyboard, errors,
  };
  await ctx.close();
}

fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await browser.close();
