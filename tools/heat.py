import sys
from PIL import Image

# usage: heat.py image.png [cols] [rows] [x1,y1,x2,y2]
path = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 72
rows = int(sys.argv[3]) if len(sys.argv) > 3 else 26
box = None
if len(sys.argv) > 4:
    box = tuple(int(v) for v in sys.argv[4].split(','))
im = Image.open(path).convert('RGB')
if box:
    im = im.crop(box)
im = im.resize((cols, rows), Image.BOX)
px = im.load()
ramp = ' .:-=+*#%@'
print(f'{path} {im.size} box={box}')
for y in range(rows):
    line = ''
    for x in range(cols):
        r, g, b = px[x, y]
        lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
        line += ramp[min(len(ramp) - 1, int(lum * len(ramp) * 2.4))]
    print(line)
