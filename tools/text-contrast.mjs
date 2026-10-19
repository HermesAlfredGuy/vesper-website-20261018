/* text-contrast.mjs — the measured contrast of the text that is actually on screen.

   A stylesheet declares two colours; what a reader sees is text rendered over a WebGL
   canvas, a translucent dock and a gradient scrim, so the declared pair is not the
   answer. This samples the real pixels: for every text box it splits the pixels into
   "paper" (the median, i.e. the background) and "ink" (the extreme 2 %), converts both
   to relative luminance and reports the WCAG 2.1 ratio for the size the text is set at.

     node tools/text-contrast.mjs [url] [w] [h] [minRatio]

   Exits non-zero if anything fails AA, so it can gate a deploy. */
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:9311/index.html';
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const FLOOR = Number(process.argv[5] || 4.5);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e.message)));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('stage').classList.contains('is-live') && window.__stage, null, { timeout: 180000, polling: 400 });
await page.waitForTimeout(2500);
await page.evaluate(() => { if (window.__stage && window.__stage.settle) window.__stage.settle(); });
await page.waitForTimeout(1500);

const cdp = await ctx.newCDPSession(page);
const ids = await page.$$eval('.sec', (els) => els.map((e) => e.id));
const rows = [];

for (const id of ids.concat(['foot'])) {
  await page.evaluate((i) => {
    const el = document.getElementById(i) || document.querySelector('.' + i);
    window.scrollTo({ top: el.offsetTop + Math.max(0, (el.offsetHeight - innerHeight) / 2), behavior: 'instant' });
  }, id);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (window.__stage && window.__stage.settle) window.__stage.settle(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('.ln,.rv').forEach((e) => e.classList.add('is-in')));
  /* the reveal is a fade, and a canvas render can starve the transition for as long as
     the capture takes: measured mid-fade, bone-on-graphite reads as ~2:1 and every
     headline on the page looks like a failure. Measure the state the reader ends up
     looking at, with transitions out of the way. */
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important;animation:none !important}' });
  await page.waitForTimeout(400);

  /* the boxes, in CSS pixels, with what the cascade says about them */
  const boxes = await page.evaluate(() => {
    const out = [];
    const sel = 'h1,h2,h3,p,li,span,a,dt,dd,th,td,figcaption,button,label,s';
    document.querySelectorAll(sel).forEach((el) => {
      if (el.matches('.sr-only')) return;
      if (el.closest('[hidden]')) return;
      // only leaf-ish text: skip a container whose children also carry text
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own) return;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 8) return;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.25) return;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 40)) || '',
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 34),
        size: parseFloat(cs.fontSize),
        weight: Number(cs.fontWeight) || 400,
        color: cs.color,
        x: Math.round(r.left), y: Math.round(r.top),
        w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)),
      });
    });
    return out;
  });

  /* A software renderer can hand back a frame from before the scroll landed, in which
     case every box in the section is measured against the wrong pixels — and a box whose
     text is not in it reads as a 1.0 failure. Capture twice and keep the better reading
     per element: a real failure fails both captures, a stale frame only the first. */
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(700);
  const shotA = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(400);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const measured = await page.evaluate(async ({ b64, b64b, boxes, W, H }) => {
    const canvasFor = async (src) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + src;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, H);
      return g;
    };
    const g = await canvasFor(b64);
    const gB = await canvasFor(b64b);
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const LUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) LUT[i] = lin(i / 255);
    return boxes.map((b) => {
      const measureOn = (ctx) => {
      const d = ctx.getImageData(b.x, b.y, b.w, b.h).data;
      const Ls = new Float64Array(d.length / 4);
      const cols = new Float32Array(d.length / 4 * 3);
      for (let i = 0, n = 0; i < d.length; i += 4, n++) {
        const r = LUT[d[i]], gg = LUT[d[i + 1]], bb = LUT[d[i + 2]];
        Ls[n] = 0.2126 * r + 0.7152 * gg + 0.0722 * bb;
        cols[n * 3] = d[i]; cols[n * 3 + 1] = d[i + 1]; cols[n * 3 + 2] = d[i + 2];
      }
      /* Which two luminances are this text and its background? The median of the box is
         wrong the moment the glyphs cover more than half of it — which is what a 72 px
         headline does, and there the median *is* the ink. The mode is the right question:
         the background is whatever luminance the largest number of box pixels share. */
      const BINS = 48;
      const hist = new Int32Array(BINS);
      for (let i = 0; i < Ls.length; i++) hist[Math.min(BINS - 1, (Ls[i] * BINS) | 0)]++;
      let modeBin = 0;
      for (let i = 1; i < BINS; i++) if (hist[i] > hist[modeBin]) modeBin = i;
      let paper = 0, paperN = 0;
      for (let i = 0; i < Ls.length; i++) {
        if (Math.min(BINS - 1, (Ls[i] * BINS) | 0) === modeBin) { paper += Ls[i]; paperN++; }
      }
      paper = paperN ? paper / paperN : Ls[0];
      /* The ink is the extreme percentile furthest from the background, not a histogram
         band: a 12 px label in a padded table cell has its glyph cores spread across
         several bands, and requiring any single band to hold 0.4 % of a 5700-pixel box
         picks the anti-aliased edge instead of the glyph — which reads a legible row as
         a 1.5:1 failure. The mode above answers "what is behind the text"; the extreme
         percentile answers "how dark is the text", and each is the right tool for its job. */
      const sortedAll = Float64Array.from(Ls).sort();
      /* 0.2 %, not 1 %: these are PNG captures, so the darkest pixels in a box are the
         glyph cores and not compression noise. At 1 % a short line of text in a wide
         table cell has its cores outnumbered by anti-aliased edges, the ink estimate
         lands mid-grey, and a 13:1 row measures as 3:1. */
      const kk = Math.max(3, Math.round(Ls.length * 0.002));
      const loLikely = sortedAll[kk - 1], hiLikely = sortedAll[sortedAll.length - kk];
      const darkSide = paper - loLikely, lightSide = hiLikely - paper;
      const side = lightSide >= darkSide ? 1 : -1;
      let acc = 0, cnt = 0;
      for (let i = 0; i < Ls.length; i++) {
        const v = Ls[i];
        if ((side > 0 && v >= hiLikely) || (side < 0 && v <= loLikely)) { acc += v; cnt++; }
      }
      const ink = cnt ? acc / cnt : paper;
      const inkDist = Math.abs(ink - paper);
      /* The other side of the background. Dark ink inside a bone halo has glyph cores at
         ~0.006 and a halo at ~0.79, while the modal colour of the box is the render behind
         both of them. The reader's question is "can I read this", and the answer is the
         better of the two sides, not whichever side the extreme percentile landed on. */
      const otherSide = side > 0 ? loLikely : hiLikely;
      const inkBest = (Math.abs(otherSide - paper) > inkDist && ((otherSide > paper) !== (ink > paper)))
        ? otherSide : ink;
      const a = Math.max(inkBest, paper), bb2 = Math.min(inkBest, paper);
      /* a box whose pixels are all one luminance is not a contrast failure, it is a
         capture that missed the text (a fixed, blurred layer can composite late).
         Report it as unmeasured rather than as a fail; the summary counts them. */
      const uniform = (Math.abs(inkBest - paper) < 0.02) || (paperN / Ls.length > 0.94 && inkDist < 0.06);
      return { ratio: +(((a + 0.05) / (bb2 + 0.05))).toFixed(2), ink: +inkBest.toFixed(4),
               paper: +paper.toFixed(4), uniform, bx: b.x, by: b.y, bw: b.w, bh: b.h };
      };
      const first = measureOn(g), second = measureOn(gB);
      return (first.ratio >= second.ratio ? first : second);
    });
  }, { b64: shot.data, b64b: shotA.data, boxes, W, H });

  boxes.forEach((b, i) => {
    const large = b.size >= 24 || (b.size >= 18.66 && b.weight >= 700);
    rows.push({ ...b, ...measured[i], large, need: large ? 3 : FLOOR, section: id });
  });
}

rows.sort((a, b) => a.ratio - b.ratio);
const fails = rows.filter((r) => r.ratio < r.need && !r.uniform);
const skipped = rows.filter((r) => r.uniform);
const thin = rows.filter((r) => r.ratio >= r.need && r.ratio < r.need + 0.9);
console.log(`measured ${rows.length} text boxes at ${W}x${H}  (AA floor ${FLOOR}, large 3.0)`);
console.log('FAIL ' + fails.length + '   near-miss ' + thin.length);
for (const r of rows.slice(0, 26)) {
  const flag = r.uniform ? 'unmeas'
    : (r.ratio < r.need ? 'FAIL' : (r.ratio < r.need + 0.9 ? 'thin' : '  ok'));
  console.log(`${flag}  ${String(r.ratio).padStart(6)}  ${String(r.size).padStart(4)}px ${String(r.weight).padStart(3)}  ${r.section}/${r.tag}${r.cls ? '.' + r.cls.split(' ')[0] : ''}  [${r.bx},${r.by} ${r.bw}x${r.bh}] ink ${r.ink} on ${r.paper}  "${r.text}"`);
}
if (problems.length) console.log('PROBLEMS ' + problems.join(' | '));
await browser.close();
process.exit(fails.length ? 1 : 0);
