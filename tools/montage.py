import sys
from PIL import Image, ImageDraw

# usage: montage.py out.png label1=path1 label2=path2 ...
out = sys.argv[1]
items = [a.split('=', 1) for a in sys.argv[2:]]
imgs = []
W = 760
for label, path in items:
    im = Image.open(path).convert('RGB')
    h = int(im.height * W / im.width)
    imgs.append((label, im.resize((W, h), Image.LANCZOS)))
H = max(i.height for _, i in imgs) + 26
sheet = Image.new('RGB', (W * len(imgs), H), (18, 18, 18))
d = ImageDraw.Draw(sheet)
for n, (label, im) in enumerate(imgs):
    sheet.paste(im, (n * W, 26))
    d.text((n * W + 8, 8), label, fill=(240, 240, 240))
sheet.save(out)
print(out, sheet.size)
