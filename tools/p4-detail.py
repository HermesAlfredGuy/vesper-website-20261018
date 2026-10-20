from PIL import Image
import numpy as np
from scipy.ndimage import gaussian_filter

# high-frequency energy on the same patches of the same CSS rectangle, at DPR 1:
# the brushed patch carries the texture detail, the upper patch is seen at a grazing angle
regions = {'metal-mid': (980, 600, 1180, 760), 'metal-upper': (950, 220, 1150, 360)}


def hf(path, box):
    a = np.asarray(Image.open(path).convert('L')).astype(float)
    x0, y0, x1, y1 = box
    p = a[y0:y1, x0:x1]
    d = p - gaussian_filter(p, 2.0)
    return float(np.sqrt((d ** 2).mean()))


out = {}
for name, box in regions.items():
    b = hf('docs/pass4/before/hero-dpr1.png', box)
    a = hf('docs/pass4/after/hero-dpr1.png', box)
    out[name] = {'before': round(b, 2), 'after': round(a, 2), 'delta_pct': round((a - b) / b * 100, 1)}
print(out)
