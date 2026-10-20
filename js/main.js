/* VESPER — main.js
   One timeline owner: this file owns scroll -> scene state and the single rAF loop.
   CSS handles only micro-transitions, so nothing competes with the scene clock. */

import { FINISHES, ATMOSPHERES, REST } from './data.js';

let createStage = null;   // resolved lazily with js/scene3d.js, after the first view is painted

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

/* Motion policy (owner, 2026-10-20): full motion by default, even when the OS reports
   prefers-reduced-motion — work laptops ship with Windows "Animation effects" off and the
   page must not read that as a request to go still. The only thing that calms the page is
   the viewer's own toggle, remembered in localStorage as `site-motion`. */
const MOTION_KEY = 'site-motion';
let reduced = (() => {
  try { return localStorage.getItem(MOTION_KEY) === 'reduced'; } catch (e) { return false; }
})();
let ambientOn = !reduced;          // the toggle drives both; kept in step in paintMotion()

const body = document.body;
const sections = $$('.sec');
const canvas = $('#gl');

/* ---------- stops: one per section, from its data attributes ----------
   data-cam is the editorial framing. data-cam-m is the portrait one: the same object,
   further back and aimed below its base, so the whole column sits above the copy
   instead of being cropped behind it. */
const narrowQuery = window.matchMedia('(max-width: 1099px)');
function parseCam(str) {
  const [pos, tgt, fov] = str.split('|');
  return { pos: pos.split(',').map(Number), target: tgt.split(',').map(Number), fov: Number(fov) };
}
function readStops() {
  const narrow = narrowQuery.matches;
  return sections.map((s) => {
    let c = parseCam(s.dataset.cam);
    if (narrow && s.dataset.camM) c = parseCam(s.dataset.camM);
    return {
      y: s.offsetTop + s.offsetHeight / 2,
      pos: c.pos, target: c.target, fov: c.fov,
      mood: Number(s.dataset.mood), int: Number(s.dataset.int),
      tone: s.dataset.tone, el: s,
    };
  });
}
let stops = readStops();
narrowQuery.addEventListener('change', () => { stops = readStops(); dirty = true; });

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function sampleStops(center) {
  if (stops.length === 1) return { ...stops[0], t: 0 };
  if (center <= stops[0].y) return { ...stops[0], t: 0 };
  const last = stops[stops.length - 1];
  if (center >= last.y) return { ...last, t: 1 };
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (center >= a.y && center <= b.y) {
      const raw = (center - a.y) / Math.max(1, b.y - a.y);
      /* eased in both modes: this is the camera following the viewer's own scroll, not
         autonomous motion, and a stepped camera is rougher than a smooth one */
      const t = smooth(raw);
      return {
        pos: lerp3(a.pos, b.pos, t),
        target: lerp3(a.target, b.target, t),
        fov: lerp(a.fov, b.fov, t),
        mood: lerp(a.mood, b.mood, t),
        int: lerp(a.int, b.int, t),
        tone: t < 0.5 ? a.tone : b.tone,
        el: t < 0.5 ? a.el : b.el,
        t,
      };
    }
  }
  return { ...last, t: 1 };
}

/* ---------- stage boot ----------
   The first view is text, type and the still; three.js and the WebGL stage arrive
   afterwards, on an idle frame, and crossfade in. Nothing about the page's
   navigation, copy or controls waits on a GPU. */
let stage = null;
let booted = false;
let stageLive = false;      // the stage has handed over a real frame (see live())
const stageEl = $('#stage');

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

function bootStage() {
  if (booted) return;
  booted = true;
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:boot');
  if (!webglOK()) {
    console.warn('VESPER: no WebGL in this browser, keeping the still.');
    body.classList.add('no-gl');
    $('#fallback').hidden = false;
    revealBoot('no-gl');
    return;
  }
  import('./scene3d.js').then((mod) => {
    if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:imported');
    createStage = mod.createStage;
    try {
      stage = createStage(canvas);
    } catch (err) {
      stage = null;
      console.warn('VESPER: realtime stage failed, keeping the still.', err);
      body.classList.add('no-gl');
      $('#fallback').hidden = false;
      revealBoot('stage-failed');
      return;
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Realtime view of Vesper 01: a cast-aluminium column with a single glowing helical channel.');
    if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:stage');
    // tools settle the damped camera before they capture. It has to be synchronous —
    // on a slow renderer the next animation frame can be a second away, and a capture
    // taken in between records a camera that is still travelling.
    const stageSettle = stage.settle.bind(stage);
    stage.settle = () => { stageSettle(); dirty = true; stage.update(0.016); };

    window.__stage = stage;
    stage.resize(window.innerWidth, window.innerHeight);
    stage.setFinish(state.finish);
    stage.setAtmosphere(state.atmosphere);
    stage.setIntensity(state.intensity);
    stage.settle(true);
    const live = () => {
      stageLive = true;
      stage.settle(true);
      stage.update(0.016);
      if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:live');
      requestAnimationFrame(() => { stageEl.classList.add('is-live'); });
      dirty = true;
      startLoop();
      if (typeof window.__onStageReady === 'function') window.__onStageReady(stage);
    };
    if (stage.compile) {
      const timeout = new Promise((r) => setTimeout(r, 8000));   // a hung parallel compile must not hold the still forever
      Promise.race([stage.compile(), timeout]).then(() => {
        if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:compiled');
        live();
      }, live);
    } else live();
  }).catch((err) => {
    console.warn('VESPER: could not load the realtime stage, keeping the still.', err);
    body.classList.add('no-gl');
    $('#fallback').hidden = false;
    revealBoot('import-failed');
  });
}

/* The still, the type and the controls are on screen before any of this runs:
   boot only after the first frame has actually been painted. */
function scheduleBoot() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) requestIdleCallback(bootStage, { timeout: 1200 });
      else setTimeout(bootStage, 200);
    });
  });
}
if (document.readyState === 'complete') scheduleBoot();
else window.addEventListener('load', scheduleBoot, { once: true });

/* ---------- configuration state: one source of truth for every control ---------- */
const state = {
  /* raw cast aluminium, not the anodised charcoal: the hero makes a claim about what
     the object is made of, and the darkest finish is the one that cannot show it. */
  finish: 'foundry',
  atmosphere: 'hearth',
  intensity: 0.72,
  orbit: REST,
  userIntensity: false,
};

const dockFinish = $('#dockFinish');
const dockAtmo = $('#dockAtmo');

FINISHES.forEach((f) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.style.setProperty('--sw', f.swatch);
  b.dataset.finish = f.id;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(f.id === state.finish));
  b.setAttribute('aria-label', `${f.name} — ${f.sub}`);
  b.title = `${f.name} · ${f.sub}`;
  b.addEventListener('click', () => setFinish(f.id));
  dockFinish.appendChild(b);
});
ATMOSPHERES.forEach((a) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch swatch--atmo';
  b.style.setProperty('--sw', a.swatch);
  b.dataset.atmo = a.id;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(a.id === state.atmosphere));
  b.setAttribute('aria-label', `${a.name} — ${a.kelvin}, ${a.lumen}`);
  b.title = `${a.name} · ${a.kelvin}`;
  b.addEventListener('click', () => setAtmosphere(a.id));
  dockAtmo.appendChild(b);
});

const readoutText = $('#readoutText');
const dimVal = $('#dimVal');
const dockFinishVal = $('#dockFinishVal');
const dockAtmoVal = $('#dockAtmoVal');
const dockDim = $('#dimRange');
const turnRange = $('#turnRange');

function announce() {
  const f = FINISHES.find((x) => x.id === state.finish);
  const a = ATMOSPHERES.find((x) => x.id === state.atmosphere);
  const line = `${a.name} · ${a.kelvin} · ${a.lumen} · ${f.name}`;
  readoutText.textContent = line;
  if (dimVal) dimVal.textContent = `${Math.round(state.intensity * 100)} %`;
  /* the swatches are material samples, so they say what they are both in the accessible
     name of each button and, where there is room, next to the group they belong to */
  if (dockFinishVal) dockFinishVal.textContent = f.name;
  if (dockAtmoVal) dockAtmoVal.textContent = a.name;
  const cardF = $('#cardFinish'), cardA = $('#cardAtmo'), cardO = $('#cardOut');
  if (cardF) cardF.textContent = `${f.name} — ${f.sub}`;
  if (cardA) cardA.textContent = `${a.name} — ${a.kelvin} · ${a.lumen}`;
  if (cardO) cardO.textContent = `${Math.round(state.intensity * 100)} % of 240 lm`;
}

function setFinish(id) {
  if (state.finish === id) return;
  state.finish = id;
  $$('[data-finish]').forEach((el) => {
    const on = el.dataset.finish === id;
    if (el.getAttribute('role') === 'radio') el.setAttribute('aria-checked', String(on));
    else el.setAttribute('aria-pressed', String(on));
  });
  stage && stage.setFinish(id);
  announce();
}

function setAtmosphere(id) {
  if (state.atmosphere === id) return;
  state.atmosphere = id;
  $$('[data-atmo]').forEach((el) => {
    const on = el.dataset.atmo === id;
    if (el.getAttribute('role') === 'radio') el.setAttribute('aria-checked', String(on));
    else el.setAttribute('aria-pressed', String(on));
  });
  stage && stage.setAtmosphere(id);
  announce();
}

function setIntensity(v, fromUser = true) {
  state.intensity = clamp(v, 0, 1);
  if (fromUser) state.userIntensity = true;
  dockDim.value = String(Math.round(state.intensity * 100));
  announce();
}

$$('[data-finish]').forEach((el) => el.addEventListener('click', () => setFinish(el.dataset.finish)));
$$('[data-atmo]').forEach((el) => {
  const a = ATMOSPHERES.find((x) => x.id === el.dataset.atmo);
  if (a) el.style.setProperty('--c', a.swatch);
  el.addEventListener('click', () => setAtmosphere(el.dataset.atmo));
});
dockDim.addEventListener('input', () => setIntensity(Number(dockDim.value) / 100, true));

/* ---------- turning the object: slider (touch + keyboard) and drag (pointer) ----------
   The channel is part of the body, so turning the object turns the seam. There is no
   separate seam phase to keep in sync, and nothing about the aperture is faked. */
function setOrbit(t) {           // t in [-1, 1]
  /* 0 is the rest pose, which pass 8 settled at REST radians; full right is still 2.6 rad
     of travel from it, so the control turns the object through the same arc it always did
     and the seam under it turns with it because the seam is milled into the body. */
  const o = REST + t * (2.6 - REST);
  state.orbit = o;
  if (stage) stage.setOrbit(o);
}
turnRange.addEventListener('input', () => setOrbit(Number(turnRange.value) / 100));
turnRange.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    // arrow keys are already handled by the range input; keep focus predictable
    e.stopPropagation();
  }
});

/* Dragging the scene turns the object. Mouse drags anywhere that is not text or a control;
   a finger drags too, but only once the gesture is clearly horizontal — the canvas is
   touch-action: pan-y, so a vertical swipe is the browser's scroll and must stay that way.
   The slider (touch + keyboard) is hidden below 1100px, which is exactly where the finger
   gesture is the only way to turn the object, so both paths have to work. */
{
  let dragging = false, startX = 0, baseT = 0;
  let touchPending = false, startY = 0;
  const TEXTY = 'a,button,input,dialog,label,p,h1,h2,h3,li,td,th,dt,dd,figcaption,b,em,img';
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      if (e.target.closest(TEXTY)) return;
      touchPending = true; dragging = false;
      startX = e.clientX; startY = e.clientY; baseT = Number(turnRange.value) / 100;
      return;
    }
    if (e.button !== 0) return;
    if (e.target.closest(TEXTY)) return;
    dragging = true; startX = e.clientX; baseT = Number(turnRange.value) / 100;
    document.body.classList.add('is-dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (touchPending && !dragging) {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { touchPending = false; return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      dragging = true;
      document.body.classList.add('is-dragging');
    }
    if (!dragging) return;
    const t = clamp(baseT + (e.clientX - startX) / 420, -1, 1);
    turnRange.value = String(Math.round(t * 100));
    setOrbit(t);
  });
  const stop = () => {
    dragging = false; touchPending = false;
    document.body.classList.remove('is-dragging');
  };
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  window.addEventListener('blur', stop);
}

/* ---------- reduce motion: a visible control, not an OS guess ---------- */
const motionBtn = $('#motionToggle');
const footMotion = $('#footMotion');
function paintMotion() {
  ambientOn = !reduced;
  document.documentElement.classList.toggle('reduced', reduced);
  if (motionBtn) {
    motionBtn.setAttribute('aria-pressed', String(reduced));
    motionBtn.setAttribute('aria-label', reduced ? 'Turn motion back on' : 'Reduce motion');
    motionBtn.title = reduced ? 'Turn motion back on' : 'Reduce motion';
  }
  if (footMotion) {
    footMotion.setAttribute('aria-pressed', String(reduced));
    footMotion.textContent = reduced ? 'Motion reduced' : 'Reduce motion';
  }
}
function toggleMotion() {
  reduced = !reduced;
  try { localStorage.setItem(MOTION_KEY, reduced ? 'reduced' : 'full'); } catch (e) {}
  applySmoothScroll();
  paintMotion();
  dirty = true;
}
paintMotion();
if (motionBtn) motionBtn.addEventListener('click', toggleMotion);
if (footMotion) footMotion.addEventListener('click', toggleMotion);

/* ---------- reveal + tone + chapter rail ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) {
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    }
  });
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
const revealTargets = $$('.rv, .ln, .callouts, .atmos, .finishes, .drawing, .spec, .honesty, .actions');
revealTargets.forEach((el) => io.observe(el));
/* a reveal must never be able to hide content: if anything is still hidden after
   the first couple of seconds, show it. */
setTimeout(() => revealTargets.forEach((el) => el.classList.add('is-in')), 2600);

/* the rail is an index of the whole document, built from the sections themselves so
   it cannot fall out of step with them */
const railIndex = $('#chapterIndex');
const railTicks = [];
if (railIndex) {
  sections.forEach((s) => {
    const tick = document.createElement('span');
    tick.className = 'chapters__tick';
    tick.dataset.chapter = s.dataset.chapter;
    railIndex.appendChild(tick);
    railTicks.push(tick);
  });
}
function paintRail(i) {
  railTicks.forEach((tk, n) => tk.classList.toggle('is-on', n === i));
}

/* The chapter state — tone, rail tick, chapter number, and whether the dock stands
   down — is derived from scroll position, not from IntersectionObserver callbacks.
   Observers are delivered in the frame's rendering step, which a heavy WebGL frame
   starves on a slow renderer: the states would lag by seconds or never arrive. A
   scroll handler cannot be starved, and this is cheap arithmetic. */
let activeIndex = 0;
let syncY = -1;
const reserveSec = $('#reserve');
function syncChapter() {
  const mid = window.scrollY + window.innerHeight * 0.5;
  let active = 0;
  sections.forEach((s, i) => { if (s.offsetTop <= mid) active = i; });
  const s = sections[active];
  if (s) {
    const light = s.dataset.tone === 'light';
    body.classList.toggle('is-tone-dark', !light);
    body.classList.toggle('is-tone-light', light);
    const num = $('#chapterNum'), name = $('#chapterName');
    if (num) num.textContent = s.dataset.chapter || '01';
    if (name) name.textContent = s.dataset.chapterName || '';
    if (active !== activeIndex) { activeIndex = active; paintRail(active); }
  }
  if (reserveSec) {
    // the dock stands down once the reservation chapter owns the screen: the page
    // offers one primary action, and it is the one already in front of you
    const r = reserveSec.getBoundingClientRect();
    body.classList.toggle('is-end', r.top < window.innerHeight * 0.40 && r.bottom > window.innerHeight * 0.55);
  }
}
function syncChapterAndWake() { syncChapter(); dirty = true; }
window.addEventListener('scroll', syncChapterAndWake, { passive: true });
window.addEventListener('resize', syncChapterAndWake, { passive: true });
syncChapter();

/* ---------- smooth scroll: Lenis, driven by the one frame loop ----------
   Not a second loop and not a scroll library with its own clock: `frame()` calls
   `lenis.raf(now)` at the top, Lenis writes the real scroll position, and every reader
   downstream (`syncChapter`, the camera stops, the progress bar) keeps reading
   window.scrollY exactly as before. One clock, one position, no drift between them.

   On by default; off when the viewer turns motion down with the toggle (and off if the
   module fails to load). Touch is left native (`syncTouch: false`) so a phone still
   scrolls the way a phone scrolls. The object's drag never touches the scroll. */
let lenis = null;
let lenisModPromise = null;

function loadLenis() {
  if (reduced) return null;
  if (!lenisModPromise) lenisModPromise = import('../vendor/lenis.mjs').catch(() => null);
  return lenisModPromise;
}
loadLenis();          // warm it during the boot panel, not on the first gesture

/* The toggle has to be able to take the smooth scroll away and give it back, so the
   two directions live here rather than in an init-only branch. */
function applySmoothScroll() {
  if (reduced) {
    if (lenis) {
      try { lenis.destroy(); } catch (e) {}
      lenis = null;
      window.__lenis = null;
      document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
      body.style.removeProperty('height');
    }
    return null;
  }
  return startSmoothScroll(null);
}

function startSmoothScroll(mod) {
  if (lenis || reduced) return null;
  /* the module is usually already resolved: the boot panel has been up for seconds */
  if (!mod) { loadLenis().then((m) => { if (m) startSmoothScroll(m); }); return null; }
  try {
    const Lenis = mod.default;
    lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: false,          // frame() drives it
    });
    lenis.resize();
    /* exposed the way the stage is: the checks measure the interpolation itself rather
       than guessing at it from wall-clock samples between slow frames */
    window.__lenis = lenis;
    /* in-page anchors glide; the skip link deliberately does not (it moves focus and
       must land instantly for a keyboard user) */
    $$('a[href^="#"]').forEach((a) => {
      if (a.classList.contains('skip')) return;
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id.length < 2) return;
        const el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: 0, duration: 1.35 });
      });
    });
    if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:smooth');
  } catch (e) {
    console.warn('VESPER: smooth scroll unavailable, native scroll kept.', e);
    lenis = null;
  }
  return lenis;
}

/* ---------- boot: the wait, designed ----------
   Two numbers drive the line, both real: the GLB's bytes as they arrive (LoadingManager)
   and the share of the object's programs that have linked (the stage compiles one mesh at
   a time). The last few per cent belong to the first two frames actually drawn — a
   loading screen that finishes before the first rendered frame is a lie the reveal
   exposes. Falls back to revealing at 14 s: a slow machine should get the poster and a
   live page rather than a beautiful panel forever. */
const bootEl = $('#boot');
const bootPctEl = $('#bootPct');
const bootStageEl = $('#bootStage');
const BOOT_COPY = { assets: 'Milling the channel', compile: 'Lighting the slot', frames: 'Opening the room' };
let bootDone = false;
let bootShown = 0.04;
let bootTarget = 0.04;
let bootCopy = BOOT_COPY.assets;
let liveFrames = 0;
let bootTimeout = null;

function paintBoot(v, copy) {
  /* one number, one property: the fill and its head both read --boot-p, so they cannot
     disagree about where the light has got to */
  if (bootEl) bootEl.style.setProperty('--boot-p', Math.max(0, Math.min(1, v)).toFixed(4));
  if (bootPctEl) bootPctEl.textContent = String(Math.round(v * 100)).padStart(2, '0');
  if (copy && bootStageEl && copy !== bootCopy) {
    bootCopy = copy;
    bootStageEl.textContent = copy;
  }
}

function bootFrame() {
  if (bootDone) return;
  const s = stage && stage.loadProgress ? stage.loadProgress() : null;
  if (s) {
    /* 0-62 % the bytes, 62-96 % the programs; the rest is the first frames */
    bootTarget = Math.max(bootTarget, Math.min(0.96, s.assets * 0.62 + s.compile * 0.34));
    paintBoot(bootShown, s.assets < 1 ? BOOT_COPY.assets : s.compile < 1 ? BOOT_COPY.compile : BOOT_COPY.frames);
  }
  /* ease, so a chunk that arrives all at once still reads as travel rather than a jump */
  bootShown += (bootTarget - bootShown) * 0.16;
  paintBoot(bootShown);
  requestAnimationFrame(bootFrame);
}
paintBoot(bootShown);
requestAnimationFrame(bootFrame);

function revealBoot(reason) {
  if (bootDone) return;
  bootDone = true;
  if (bootEl) bootEl.dataset.reveal = reason;   // read by tools/qa: which signal opened the page
  bootTarget = 1;
  bootShown = 1;
  paintBoot(1, BOOT_COPY.frames);
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:revealed');
  if (!bootEl) {
    document.documentElement.classList.remove('is-boot');
    startSmoothScroll(null);
    return;
  }
  bootEl.classList.add('is-done');            // the line sweeps into its own end
  const sweep = reduced ? 60 : 440;
  setTimeout(() => {
    bootEl.classList.add('is-out');           // ...then the panel lifts off the hero
    document.documentElement.classList.remove('is-boot');
    /* the page is scrollable in this same task, so the first wheel after the reveal has
       a scroller ready for it instead of hitching on a library that loads on demand */
    startSmoothScroll(null);
    setTimeout(() => { bootEl.hidden = true; }, reduced ? 0 : 700);
    if (typeof performance !== 'undefined' && performance.mark) performance.mark('vesper:unlocked');
  }, sweep);
  if (reason !== 'timeout') clearTimeout(bootTimeout);
}
bootTimeout = setTimeout(() => revealBoot('timeout'), 15000);

/* ---------- the loop: one owner, throttled, and never in front of page load ---------- */
const progressBar = $('#progressBar');
let last = performance.now();
let lastRender = 0;
let dirty = true;
let idleFrames = 0;
const MIN_FRAME_MS = 16.7;                  // 60 fps target: a 30 fps cap is visible on a
                                            // machine that can afford the frame, and the cost
                                            // of one frame here is ~1.5 ms even in software
let slowFrames = 0;                         // and it steps back down if the machine cannot hold it
let frameBudget = MIN_FRAME_MS;
const prev = { pos: [0, 0, 0], target: [0, 0, 0], mood: 0, int: 0, orbit: 0 };

function drawProgress() {
  if (!progressBar) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max, 0, 1) : 0})`;
}

function frame(now) {
  /* Lenis owns the scroll position and this is the only clock it gets. It runs before
     anything reads scrollY, so a frame never mixes this frame's camera with last
     frame's position. */
  if (lenis) lenis.raf(now);
  const raw = (now - last) / 1000;
  last = now;
  const dt = clamp(Number.isFinite(raw) ? raw : 0.016, 0, 0.25);   // scene3d clamps motion
                                                                   // itself at 50 ms; material
                                                                   // cross-fades need real time
  /* The scroll event is a task on the main thread, and a WebGL frame here can take a
     second: while the thread is inside a frame the event waits, and any reader of the
     state (a screenshot, an audit, a person who scrolled and stopped) sees the previous
     chapter. Re-deriving it on the frame as well makes the state converge in one frame
     whatever the event loop is doing; it is a few class toggles. */
  if (window.scrollY !== syncY) { syncY = window.scrollY; syncChapter(); }

  if (stage && now - lastRender >= frameBudget) {
    lastRender = now;
    /* Adaptive frame budget: aim at 60 fps, but if the frames we are actually
       producing cost more than 20 ms, halve the rate instead of asking for a frame
       the machine cannot afford — a steady 30 is smooth, an uneven 45 is not. */
    const drewAt = performance.now();
    const center = window.scrollY + window.innerHeight / 2;
    const s = sampleStops(center);

    const targetInt = state.userIntensity ? state.intensity : s.int;
    if (!state.userIntensity) setIntensity(s.int, false);

    const camChanged =
      Math.abs(s.pos[0] - prev.pos[0]) > 1e-4 || Math.abs(s.pos[1] - prev.pos[1]) > 1e-4 ||
      Math.abs(s.pos[2] - prev.pos[2]) > 1e-4 || Math.abs(s.mood - prev.mood) > 1e-4 ||
      Math.abs(targetInt - prev.int) > 1e-4 || Math.abs(state.orbit - prev.orbit) > 1e-4;

    if (camChanged) { dirty = true; idleFrames = 0; }
    else idleFrames++;

    if (dirty || idleFrames < 90 || (stage && !stage.isSettled())) {
      stage.paceCamera(s.pos, s.target, s.fov);
      stage.setMood(s.mood);
      stage.setIntensity(targetInt);
      stage.update(dt, !ambientOn || reduced);
      dirty = false;
    }
    prev.pos = s.pos; prev.target = s.target; prev.mood = s.mood;
    prev.int = targetInt; prev.orbit = state.orbit;

    /* The reveal waits for the object, not for a promise: two frames on the canvas after
       the stage reports the GLB applied and its programs linked. Counting frames from the
       moment the loop starts would reveal placeholder boxes — pass 8's capture tools made
       exactly that mistake with the poster, and the panel makes it much easier to hide. */
    if (!bootDone && stageLive) {
      liveFrames++;
      const lp = stage.loadProgress ? stage.loadProgress() : { ready: true };
      const compiled = !stage.isCompiled || stage.isCompiled();
      const edgesReady = !stage.edgeReady || stage.edgeReady();
      if (liveFrames >= 2 && lp.ready && compiled && edgesReady) revealBoot('frames');
    }

    /* measure what the frame actually cost, not the gap between frames: the gap
       includes idle waiting and would never fall back on a rested machine */
    if (performance.now() - drewAt > 18) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 45) frameBudget = MIN_FRAME_MS * 2;
    else if (slowFrames === 0) frameBudget = MIN_FRAME_MS;
  } else if (!stage) {
    drawProgress();
  }
  requestAnimationFrame(frame);
}

let loopStarted = false;
function startLoop() {
  if (loopStarted) return;
  loopStarted = true;
  last = performance.now();
  lastRender = 0;
  requestAnimationFrame(frame);
}
if (stage) {
  window.__stage = stage;
  stage.resize(window.innerWidth, window.innerHeight);
  stage.update(0.016);                  // never leave the hero blank while the page settles
}
if (document.readyState === 'complete') startLoop();
else {
  window.addEventListener('load', startLoop, { once: true });
  setTimeout(startLoop, 1500);          // a stalled image must not hold the scene back
}

/* ---------- resize ---------- */
function fit() {
  if (!stage) return;
  const w = window.innerWidth, h = window.innerHeight;
  stage.resize(w, h);
  dirty = true;
}
fit();
window.addEventListener('resize', () => { stops = readStops(); fit(); if (lenis) lenis.resize(); }, { passive: true });
window.addEventListener('orientationchange', () => { stops = readStops(); fit(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { stops = readStops(); dirty = true; });

/* ---------- reserve preview modal ---------- */
const modal = $('#reserveModal');
const modalRef = $('#modalRef');
const modalCfg = $('#modalCfg');
const copyNote = $('#copyNote');

function refCode() {
  const bytes = new Uint8Array(2);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
  else { bytes[0] = Math.floor(Math.random() * 256); bytes[1] = Math.floor(Math.random() * 256); }
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const f = FINISHES.find((x) => x.id === state.finish);
  const a = ATMOSPHERES.find((x) => x.id === state.atmosphere);
  return `VS01-${f.name.toUpperCase()}-${a.name.toUpperCase()}-${hex}`;
}

function fillModal() {
  const f = FINISHES.find((x) => x.id === state.finish);
  const a = ATMOSPHERES.find((x) => x.id === state.atmosphere);
  modalCfg.innerHTML = '';
  [
    ['Object', 'Vesper 01 — concept unit'],
    ['Finish', `${f.name} · ${f.sub}`],
    ['Atmosphere', `${a.name} · ${a.kelvin} · ${a.lumen}`],
    ['Output', `${Math.round(state.intensity * 100)} % of 240 lm`],
    ['Delivery', 'None — this is a design concept'],
  ].forEach(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    modalCfg.append(dt, dd);
  });
  modalRef.textContent = refCode();
  copyNote.textContent = '';
}

$$('[data-open-reserve]').forEach((b) => b.addEventListener('click', () => {
  fillModal();
  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.setAttribute('open', '');
}));

$('#copyCfg').addEventListener('click', async () => {
  const f = FINISHES.find((x) => x.id === state.finish);
  const a = ATMOSPHERES.find((x) => x.id === state.atmosphere);
  const text = [
    `VESPER 01 — concept reservation preview (not an order)`,
    `Reference: ${modalRef.textContent}`,
    `Finish: ${f.name} (${f.sub})`,
    `Atmosphere: ${a.name} — ${a.kelvin}, ${a.lumen}`,
    `Output: ${Math.round(state.intensity * 100)} % of 240 lm`,
    `Nothing was submitted, charged or stored.`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copyNote.textContent = 'Copied to your clipboard.';
  } catch (e) {
    copyNote.textContent = 'Clipboard blocked by the browser — select the text above instead.';
  }
});

modal.addEventListener('close', () => { copyNote.textContent = ''; });

/* ---------- small things ---------- */
const y = new Date().getFullYear();
const yearEl = $('#year');
if (yearEl) yearEl.textContent = String(y);

announce();
setOrbit(0);
body.dataset.ready = '1';
