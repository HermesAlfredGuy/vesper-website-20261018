#!/usr/bin/env python3
"""Pass 7 acceptance measurements — the slot, the patch it throws, and the banding.

Nothing here trusts a caption. Every number is read off a shipped frame:

  slot    the section across the milled channel: how wide the lit core is, how wide the
          dark reveal either side of it, and whether the lip above it carries a specular
          that is brighter than the body. Widths are taken perpendicular to the band,
          because the section runs at ~30 deg in the hero frame and a screen row
          overstates every width by 1/cos(30) = 1.15.
  patch   the warm footprint on floor and wall: its centroid, its area, and its mean
          red-minus-blue, in two frames at different rotations. A patch that belongs to
          the object has to move when the object moves.
  banding the longest run of identical code values along a gradient, in rows and columns.
          An 8-bit frame with a visible staircase shows runs of 6-14; a dithered,
          supersampled one shows 2-3.

  python3 tools/pass7_measure.py slot    docs/pass7/shots/hero-desktop.png
  python3 tools/pass7_measure.py slot    <img> --x0 900 --x1 1100 --y0 380 --y1 460
  python3 tools/pass7_measure.py patch   <a.png> <b.png>
  python3 tools/pass7_measure.py banding <img> --x0 .. --x1 .. --y0 .. --y1 ..
"""
import sys
import numpy as np
from PIL import Image


def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32)


def lum(a):
    return a @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def parse(argv):
    kw, pos = {}, []
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            k = argv[i][2:]
            v = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
            kw[k] = v
            i += 2
        else:
            pos.append(argv[i])
            i += 1
    return kw, pos


def runs(mask, gap=2):
    idx = np.nonzero(mask)[0]
    if not len(idx):
        return []
    out, s, p = [], idx[0], idx[0]
    for x in idx[1:]:
        if x - p > gap:
            out.append((s, p + 1))
            s = x
        p = x
    out.append((s, p + 1))
    return out


def cmd_slot(kw, pos):
    a = load(pos[0])
    L, ch = lum(a), a[..., 0] - a[..., 2]
    h, w = L.shape
    x0, x1 = int(kw.get('x0', 0)), int(kw.get('x1', w))
    y0, y1 = int(kw.get('y0', 0)), int(kw.get('y1', h))
    win = np.zeros_like(L, bool)
    win[y0:y1, x0:x1] = True
    warm = ((ch > 35) & (L > 55) & win)
    rows = []
    for y in range(y0, y1):
        r = [q for q in runs(warm[y]) if q[1] - q[0] >= 5]
        if r:
            s, e = max(r, key=lambda q: q[1] - q[0])
            rows.append((y, s, e))
    if not rows:
        print('NO CORE: no warm run of 5 px or more in the window')
        return 1
    print(f'core rows {rows[0][0]}-{rows[-1][0]}  ({len(rows)} rows carry a core)')
    # tilt from a *taller* window: inside a narrow one the run centres barely move and the
    # fit returns noise, and a wrong tilt scales every width by the wrong cosine
    ty0, ty1 = max(0, y0 - 80), min(h, y1 + 80)
    tw = np.zeros_like(L, bool)
    tw[ty0:ty1, max(0, x0 - 40):min(w, x1 + 40)] = True
    twm = (ch > 35) & (L > 55) & tw
    tys, txs = [], []
    for yy in range(ty0, ty1):
        rr = [q for q in runs(twm[yy]) if q[1] - q[0] >= 5]
        if rr:
            q = max(rr, key=lambda z: z[1] - z[0])
            tys.append(yy); txs.append((q[0] + q[1]) / 2)
    sl = np.polyfit(tys, txs, 1)[0] if len(tys) > 8 else -0.5
    tilt = np.degrees(np.arctan(np.clip(sl, -2.5, 2.5)))
    cos = abs(np.cos(np.radians(tilt)))
    print(f'band tilt {tilt:+.1f} deg from horizontal -> perpendicular = row width x {cos:.2f}')
    y, s, e = rows[len(rows) // 2]
    ref = []
    for lo, hi in ((s - 44, s - 22), (e + 22, e + 44)):
        lo, hi = max(0, lo), min(w, hi)
        if hi > lo:
            ref.append(L[y, lo:hi])
    body = float(np.median(np.concatenate(ref))) if ref else float(np.median(L[y]))
    # width from area / length: the band is inclined ~70 deg here, so a single row cut is
    # nearly *along* it and would overstate the width by four. Area over length is what a
    # caliper does — total lit area divided by how long the section is.
    ys_all, xs_all = np.nonzero(warm)
    sel = (ys_all >= rows[0][0]) & (ys_all <= rows[-1][0]) & (xs_all >= rows[0][1] - 8) & (xs_all <= rows[0][2] + 8)
    pts = np.stack([xs_all[sel], ys_all[sel]], 1).astype(float)
    if len(pts) > 40:
        c = pts.mean(0)
        wv, vv = np.linalg.eigh(np.cov((pts - c).T))
        ax = vv[:, int(np.argmax(wv))]
        ln = np.ptp((pts - c) @ ax)
        wid = len(pts) / max(1.0, ln)
    else:
        ln, wid = float(e - s), float(e - s)
    print(f'section: area {len(pts)} px over length {ln:.0f} px -> WIDTH {wid:.1f} px '
          f'(perpendicular, area/length)')
    print(f'row {y}: core x {s}-{e - 1}, body reference L {body:.0f}')
    print('  x     L   r-b   rgb                band')
    for x in range(max(0, s - 10), min(w, e + 10)):
        tag = 'CORE' if s <= x < e else ('dark' if L[y, x] < body * 0.85 else
                                         ('lip' if abs(ch[y, x]) < 24 and L[y, x] > body + 8 else ''))
        print(f'  {x:4d} {L[y, x]:4.0f} {ch[y, x]:+5.0f}  '
              f'({a[y, x, 0]:3.0f},{a[y, x, 1]:3.0f},{a[y, x, 2]:3.0f})  {tag}')
    pk = int(np.argmax(ch[y, s:e]) + s)
    print(f'peak chroma {ch[y, pk]:+.0f} at x {pk} rgb {a[y, pk].astype(int)}   '
          f'core peak L {L[y, s:e].max():.0f}   core mean L {L[y, s:e].mean():.0f}')
    for side, name in ((-1, 'near'), (1, 'far')):
        edge = s if side < 0 else e - 1
        dark, x = 0, edge + side
        while 0 <= x < w and dark < 14 and L[y, x] < body * 0.85:
            dark += 1
            x += side
        lip, lip_peak, x2 = 0, 0.0, edge + side
        for _ in range(14):
            if not (0 <= x2 < w):
                break
            if abs(ch[y, x2]) < 26 and L[y, x2] > lip_peak:
                lip_peak = L[y, x2]
            if abs(ch[y, x2]) < 26 and L[y, x2] > body + 8:
                lip += 1
            x2 += side
        print(f'{name}: dark reveal {dark} px   lip peak L {lip_peak:.0f} vs body {body:.0f} '
              f'(+{lip_peak - body:.0f}) over {lip} px')
    return 0


def cmd_patch(kw, pos):
    out = []
    for p in pos:
        a = load(p)
        L, ch = lum(a), a[..., 0] - a[..., 2]
        h, w = L.shape
        m = (ch > 18) & (L > 26)
        m[:, int(w * 0.50):int(w * 0.86)] = False     # the object's own warm slot
        ys, xs = np.nonzero(m)
        if not len(xs):
            print(f'{p}: no patch')
            out.append(None)
            continue
        out.append(dict(n=len(xs), cx=float(xs.mean()), cy=float(ys.mean()), ch=float(ch[m].mean())))
        print(f'{p}: warm px {len(xs)}  centroid ({xs.mean():.1f},{ys.mean():.1f})  '
              f'mean r-b {ch[m].mean():.0f}  mean rgb {a[m].mean(0).round(0)}  '
              f'bbox ({xs.min()},{ys.min()})-({xs.max()},{ys.max()})')
    if len(out) == 2 and all(out):
        d = np.hypot(out[1]['cx'] - out[0]['cx'], out[1]['cy'] - out[0]['cy'])
        print(f'CENTROID SHIFT {d:.1f} px   area {out[0]["n"]} -> {out[1]["n"]} '
              f'({out[1]["n"] - out[0]["n"]:+d})   mean r-b {out[0]["ch"]:.0f} -> {out[1]["ch"]:.0f}')
    return 0


def cmd_banding(kw, pos):
    a = load(pos[0])
    L = lum(a)
    x0, x1 = int(kw.get('x0', 0)), int(kw.get('x1', L.shape[1]))
    y0, y1 = int(kw.get('y0', 0)), int(kw.get('y1', L.shape[0]))
    q = np.round(L[y0:y1, x0:x1] * 255).astype(int)
    print(f'window x {x0}-{x1} y {y0}-{y1}  ({q.size} px)')
    for axis, name in ((1, 'rows'), (0, 'cols')):
        flat = []
        for line in (q if axis == 1 else q.T):
            d = np.diff(line)
            if np.abs(d).mean() < 0.002:
                continue
            run = best = 1
            for v in d:
                run = run + 1 if v == 0 else 1
                best = max(best, run)
            flat.append(best)
        if flat:
            flat = np.array(flat)
            print(f'{name}: longest identical-code run  median {np.median(flat):.0f}  '
                  f'p90 {np.percentile(flat, 90):.0f}  max {flat.max()}  '
                  f'| lines with a run >= 4: {100 * (flat >= 4).mean():.1f} %')
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cmd = sys.argv[1]
    kw, pos = parse(sys.argv[2:])
    fn = {'slot': cmd_slot, 'patch': cmd_patch, 'banding': cmd_banding}.get(cmd)
    if not fn:
        print(__doc__)
        sys.exit(2)
    sys.exit(fn(kw, pos) or 0)
