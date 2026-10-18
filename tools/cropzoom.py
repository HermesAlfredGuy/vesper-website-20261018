import sys
from PIL import Image, ImageDraw

# usage: cropzoom.py out.png label=path:x1,y1,x2,y2  [scale]
out = sys.argv[1]
items = sys.argv[2:]
sheet_imgs = []
for it in items:
    label, rest = it.split('=', 1)
    path, box = rest.rsplit(':', 1)
    x1, y1, x2, y2 = [int(v) for v in box.split(',')]
    im = Image.open(path).convert('RGB').crop((x1, y1, x2, y2))
    s = max(1, int(520 / im.width) + 1)
    im = im.resize((im.width * s, im.height * s), Image.LANCZOS)
    sheet_imgs.append((label, im))

W = sum(i.width for _, i in sheet_imgs)
H = max(i.height for _, i in sheet_imgs) + 26
sheet = Image.new('RGB', (W, H), (20, 20, 20))
d = ImageDraw.Draw(sheet)
x = 0
for label, im in sheet_imgs:
    sheet.paste(im, (x, 26))
    d.text((x + 8, 8), label, fill=(245, 245, 245))
    x += im.width
sheet.save(out)
print(out, sheet.size)
