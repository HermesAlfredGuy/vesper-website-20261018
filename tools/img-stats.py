import sys
from PIL import Image
import numpy as np

for p in sys.argv[1:]:
    im = Image.open(p).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    print(p, im.size, 'mean', a.mean(axis=(0, 1)).round(1), 'std', a.std(axis=(0, 1)).round(1))
    # grid of 6x4 cell means to see structure
    h, w, _ = a.shape
    for gy in range(4):
        row = []
        for gx in range(6):
            c = a[gy * h // 4:(gy + 1) * h // 4, gx * w // 6:(gx + 1) * w // 6]
            row.append(int(c.mean()))
        print('   ', row)
