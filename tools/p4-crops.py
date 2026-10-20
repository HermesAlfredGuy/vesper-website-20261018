"""Pass 4 evidence: the same rectangle of the same frame, before and after.

usage: p4-crops.py <out.png> <x> <y> <w> <h>   (CSS pixels)

Nothing is rescaled except the last row, which says so in its own label: a DPR 1 panel is
exactly the device pixels the page drew at DPR 1, a DPR 2 panel is twice as many device
pixels for the same CSS rectangle, and the magnifier blows a 34 px patch up 5x with
nearest neighbour so every block in it is one device pixel. The patch the magnifier uses
is outlined in the two DPR 1 panels above it, so it can be checked, not taken on trust.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

out, x, y, w, h = sys.argv[1], *[int(v) for v in sys.argv[2:6]]
B1, B2 = 'docs/pass4/before/hero-dpr1.png', 'docs/pass4/before/hero-dpr2.png'
A1, A2 = 'docs/pass4/after/hero-dpr1.png', 'docs/pass4/after/hero-dpr2.png'

F = '/usr/share/fonts/truetype/dejavu/'
mono = ImageFont.truetype(F + 'DejaVuSansMono.ttf', 13)
mono_sm = ImageFont.truetype(F + 'DejaVuSansMono.ttf', 11.5)
bold = ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 15)
title = ImageFont.truetype(F + 'DejaVuSans.ttf', 19)

BG, INK, DIM, WARM, RULE = (17, 15, 13), (240, 236, 228), (176, 171, 162), (255, 178, 96), (64, 58, 50)
PAD, GAP = 26, 30
CELL = 470                       # width of one column, big enough for the DPR 2 panel
ZX, ZY, ZW, Z = x + 150, y + 96, 34, 5

before1 = Image.open(B1).convert('RGB')
after1 = Image.open(A1).convert('RGB')
before2 = Image.open(B2).convert('RGB')
after2 = Image.open(A2).convert('RGB')


def crop(im, s):
    return im.crop((x * s, y * s, (x + w) * s, (y + h) * s))


p1b, p1a = crop(before1, 1), crop(after1, 1)
p2b, p2a = crop(before2, 2), crop(after2, 2)


def mark(im, ox, oy, s):
    """outline the magnifier's source patch, in this panel's own pixel grid"""
    im = im.copy()
    d = ImageDraw.Draw(im)
    bx, by = (ZX - x) * s, (ZY - y) * s
    d.rectangle([bx, by, bx + ZW * s - 1, by + ZW * s - 1], outline=WARM)
    return im


p1b, p1a = mark(p1b, 0, 0, 1), mark(p1a, 0, 0, 1)
zoom_b = p1b.crop(((ZX - x), (ZY - y), (ZX - x) + ZW, (ZY - y) + ZW)).resize((ZW * Z, ZW * Z), Image.NEAREST)
zoom_a = p1a.crop(((ZX - x), (ZY - y), (ZX - x) + ZW, (ZY - y) + ZW)).resize((ZW * Z, ZW * Z), Image.NEAREST)

rows = [
    ('DPR 1  ·  1:1', 'pass 8 — 1.5x supersample, one bilinear tap', p1b, 'pass 4 — 4x MSAA, native', p1a, 236),
    ('DPR 2  ·  1:1 at twice the size  ·  460 x 460 device px for the same 230 CSS px', 'pass 8 — no antialiasing above DPR 1.5', p2b, 'pass 4 — 4x MSAA, native 2x', p2a, 470),
    ('MAGNIFIER  ·  5x nearest neighbour, no interpolation', 'pass 8 — the slot edge', zoom_b, 'pass 4 — the same 34 px', zoom_a, 178),
]

H = PAD + 74 + 150 + 22
for _, _, im, _, _, ch in rows:
    H += 26 + max(ch, im.height) + 16
H += 230

sheet = Image.new('RGB', (PAD * 2 + CELL * 2 + GAP, H), BG)
d = ImageDraw.Draw(sheet)

d.text((PAD, PAD), 'VESPER 01  —  pass 4  —  antialiasing', fill=INK, font=title)
d.text((PAD, PAD + 30), 'Same camera, same rest pose, same frame. Crop x%d y%d %dx%d CSS px from the hero.' % (x, y, w, h),
       fill=DIM, font=mono)
d.text((PAD, PAD + 48), 'Every panel is the page\'s own pixels: 1:1 at DPR 1, 1:1 at DPR 2 (so twice the size), and the last row 5x with no interpolation.',
       fill=DIM, font=mono_sm)

# locator: the whole hero, with the crop drawn on it
cy = PAD + 74
thumb_w = 246
thumb = before1.resize((thumb_w, round(before1.height * thumb_w / before1.width)), Image.LANCZOS)
sheet.paste(thumb, (PAD, cy))
d.rectangle([PAD + x * thumb_w // before1.width, cy + y * thumb.height // before1.height,
             PAD + (x + w) * thumb_w // before1.width, cy + (y + h) * thumb.height // before1.height],
            outline=WARM)
d.rectangle([PAD - 1, cy - 1, PAD + thumb_w, cy + thumb.height], outline=RULE)
d.text((PAD + thumb_w + 22, cy + 6), 'the crop is here, on the column\'s lit side:', fill=DIM, font=mono_sm)
d.text((PAD + thumb_w + 22, cy + 24), 'the left silhouette and the emitter slot, nothing else.', fill=DIM, font=mono_sm)
d.text((PAD + thumb_w + 22, cy + 52), 'pass 8 = the build you looked at last.', fill=WARM, font=mono_sm)
d.text((PAD + thumb_w + 22, cy + 68), 'pass 4 = this build.', fill=WARM, font=mono_sm)

cy += 150 + 22
for label, l1, im1, l2, im2, ch in rows:
    d.text((PAD, cy), label, fill=INK, font=bold)
    d.line([PAD, cy + 22, PAD + CELL * 2 + GAP, cy + 22], fill=RULE)
    for col, (lab, im) in enumerate(((l1, im1), (l2, im2))):
        cx = PAD + col * (CELL + GAP)
        warm = col == 1
        d.text((cx, cy + 30), lab, fill=WARM if warm else DIM, font=mono)
        px = cx
        py = cy + 48
        sheet.paste(im, (px, py))
        d.rectangle([px - 1, py - 1, px + im.width, py + im.height], outline=RULE)
        if label.startswith('DPR 1'):
            d.text((px, py + im.height + 9), 'the outlined 34 px is what the magnifier below shows', fill=(128, 123, 115), font=mono_sm)
    cy += 26 + max(ch, im1.height, im2.height) + (34 if label.startswith('DPR 1') else 16)

# scale bar + numbers
sb = cy + 10
d.line([PAD, sb, PAD + 50, sb], fill=INK)
d.line([PAD, sb - 4, PAD, sb + 4], fill=INK)
d.line([PAD + 50, sb - 4, PAD + 50, sb + 4], fill=INK)
d.text((PAD + 58, sb - 8), '50 CSS px at DPR 1', fill=DIM, font=mono_sm)

nx = PAD + 236
d.text((nx, sb - 10), 'MEASURED', fill=INK, font=bold)
d.text((nx + 118, sb - 8), 'tools/p4-edge.py — both builds, the same rows of the same edge', fill=DIM, font=mono_sm)

ty = sb + 18
col2, col3 = nx + 300, nx + 400
d.text((nx, ty), '', fill=DIM, font=mono)
d.line([nx, ty - 3, nx + 470, ty - 3], fill=RULE)
d.text((nx, ty), 'emitter slot: row-to-row wander', fill=INK, font=mono_sm)
d.text((col2, ty), 'pass 8', fill=DIM, font=mono_sm)
d.text((col2 + 58, ty), '1.03 px', fill=DIM, font=mono_sm)
d.text((col3, ty), 'pass 4', fill=WARM, font=mono_sm)
d.text((col3 + 58, ty), '0.70 px', fill=WARM, font=mono_sm)

ty += 20
d.text((nx, ty), 'left silhouette: sharpest step', fill=INK, font=mono_sm)
d.text((col2, ty), 'pass 8', fill=DIM, font=mono_sm)
d.text((col2 + 58, ty), '0.33', fill=DIM, font=mono_sm)
d.text((col3, ty), 'pass 4', fill=WARM, font=mono_sm)
d.text((col3 + 58, ty), '0.33', fill=WARM, font=mono_sm)

ty += 18
d.text((nx, ty), 'unchanged on purpose: a near-vertical edge lands on one pixel in both builds.', fill=(128, 123, 115), font=mono_sm)
d.text((nx, ty + 16), 'The diagonals are where pass 8 lost the edge — 1.03 px of wander is a stair-step.', fill=(128, 123, 115), font=mono_sm)

sheet.save(out)
print(out, sheet.size)
