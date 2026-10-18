import sys
from PIL import Image, ImageDraw

# usage: grid.py out.png COLS WIDTH label1=path1 ...
out = sys.argv[1]
cols = int(sys.argv[2])
W = int(sys.argv[3])
items = [a.split('=', 1) for a in sys.argv[4:]]
tiles = []
for label, path in items:
    im = Image.open(path).convert('RGB')
    h = int(im.height * W / im.width)
    tiles.append((label, im.resize((W, h), Image.LANCZOS)))
th = max(t.height for _, t in tiles)
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, (th + 26) * rows), (14, 14, 14))
d = ImageDraw.Draw(sheet)
for n, (label, im) in enumerate(tiles):
    x = (n % cols) * W
    y = (n // cols) * (th + 26)
    sheet.paste(im, (x, y + 26))
    d.text((x + 8, y + 8), label, fill=(240, 240, 240))
sheet.save(out)
print(out, sheet.size)
