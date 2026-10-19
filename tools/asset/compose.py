"""Pack the baked maps into the set glTF wants. Run after bake_tex.py.

  T_ORM.png   R = occlusion, G = roughness multiplier, B = metalness (255: the finish
              owns the metalness factor). Linear, as glTF specifies.
  T_Base.png  the albedo mottle, sRGB-encoded.
  T_N.png     tangent-space normals, straight from the bake.

Three normalisations, each because a bake measures the object and a material map has
to measure it *relative to the finish the page already declared*:
  * occlusion is divided by the shoulder's own occlusion, so flat metal reads 1.0 and
    only the cut is dark — otherwise the whole body would come down 29 %;
  * roughness is scaled so the blasted body reads 0.95-1.00 of the finish's number and
    only the burnished waist comes below it, then bent by the baked curvature map:
    convex edges polish, crevices stay dull;
  * albedo is normalised to a mean of 0.98 with a +-1.5 % mottle.
"""
import os, sys
import numpy as np
from PIL import Image

HERE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "assets", "asset")
RES = int(os.environ.get("RES", "2048"))
U_SLOT = 0.0576          # the slot's centre in u (arc from the helix centre / TAU)
U_SHOULDER = (0.010, 0.040)


def load_gray(name):
    a = np.asarray(Image.open(os.path.join(HERE, name)).convert("L")).astype(np.float32) / 255.0
    if a.shape[0] != RES:
        a = np.repeat(np.repeat(a, RES // a.shape[0], 0), RES // a.shape[1], 1)
    return a


def save(arr, path, mode="RGB"):
    a = np.clip(arr, 0, 1)
    if mode == "L":
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), "L").save(path)
    else:
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGB").save(path)
    print("wrote", os.path.basename(path), os.path.getsize(path) // 1024, "kB")


def main():
    ao = load_gray("T_AO.png")
    rough = load_gray("T_ROUGH.png")
    base = load_gray("T_BASE.png")
    curv = load_gray("T_CURV.png")

    used = ao > 0.05
    shoulder = float(np.percentile(ao[:, int(U_SHOULDER[0] * RES):int(U_SHOULDER[1] * RES)], 70))
    print("shoulder occlusion", round(shoulder, 3))
    occ = np.clip(ao / shoulder, 0, 1)

    # curvature-aware roughness: convex edges burnish, crevices stay blasted
    bend = 1.0 - 0.22 * np.clip((curv - 0.5) * 2.0, -1, 1)
    g = np.clip(rough * bend, 0.56, 1.0)
    orm = np.zeros((RES, RES, 3), np.float32)
    orm[:, :, 0] = occ
    orm[:, :, 1] = g
    orm[:, :, 2] = 1.0
    save(orm, os.path.join(HERE, "T_ORM.png"))

    b = base[used].mean()
    b = base * (0.985 / max(1e-6, b))
    srgb = np.where(b <= 0.0031308, b * 12.92, 1.055 * np.power(np.clip(b, 0, None), 1 / 2.4) - 0.055)
    save(np.repeat(srgb[:, :, None], 3, axis=2), os.path.join(HERE, "T_Base.png"))

    for n, a in (("occlusion", occ), ("roughness", g), ("albedo(lin)", base), ("curvature", curv)):
        m = a[used]
        print(f"  {n:12s} in the islands: mean {m.mean():.3f} p2 {np.percentile(m,2):.3f} "
              f"p98 {np.percentile(m,98):.3f}")
    slot = occ[:, int((U_SLOT - 0.008) * RES):int((U_SLOT + 0.008) * RES)]
    print("  slot occlusion: mean", round(float(slot[used[:, :1].repeat(1, 1)].mean()), 3) if False else
          round(float(slot.mean()), 3), "min", round(float(slot.min()), 3))


if __name__ == "__main__":
    main()
