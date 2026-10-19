import sys
from PIL import Image, ImageStat

for path in sys.argv[1:]:
    im = Image.open(path).convert('L')
    st = ImageStat.Stat(im)
    print(f'{path} mean={st.mean[0]:6.1f} std={st.stddev[0]:6.1f} min={im.getextrema()[0]:3d} max={im.getextrema()[1]:3d}')
