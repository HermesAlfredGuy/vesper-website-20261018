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
U_SLOT = 0.0732          # the slot's centre in u ((0.0330 / 0.0718) / TAU, from build_vesper.py)

# ---------------------------------------------------------------- the slot's throat
# The shell's UV is (arc offset from the helix centre, height), so the cut's *cross-section*
# is a vertical band of the atlas: u = (s / R_REF + OUTER_RAD) / TAU with the same constants
# build_vesper.py uses. That makes the throat a material decision rather than a lighting
# one: from the hero camera (27 deg off the slot's normal, 9 deg above it) the recess shows
# 3.4 mm of land and throat wall beside the blade, and lit as aluminium that band is only
# 35 % darker than the body — a bevel and a blade with nothing between them. Finished matte
# black it is the third band the section needs. The r0 dependence of the mapping drifts the
# edge by <=0.13 mm over the object's height, i.e. under a third of a pixel at 1:1.
R_REF = 0.0718           # the reference radius the shell's arc columns are built from
OUTER_RAD = 0.0330 / 0.0718
S_DARK = (0.00590, 0.00986)   # pipe edge -> lip land's inner edge
S_BEVEL = (0.00986, 0.01200)  # the 2.0 mm 45 deg lip bevel, polished
V_SHELL_MAX = 0.7000          # the Shell's island ends here; the plinth starts at 0.72
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


def band_mask(s_lo, s_hi):
    """1 inside one cross-section band of the cut, 0 outside, feathered over a texel."""
    u = (np.arange(RES) + 0.5) / RES
    lo = (s_lo / R_REF + OUTER_RAD) / (2 * np.pi)
    hi = (s_hi / R_REF + OUTER_RAD) / (2 * np.pi)
    # the cut has two sides, and the map carries both: u(s) and u(-s) sit either side of
    # the slot's centre line
    lo2, hi2 = 2 * U_SLOT - hi, 2 * U_SLOT - lo
    band = (((u >= lo) & (u <= hi)) | ((u >= lo2) & (u <= hi2))).astype(np.float32)
    # one-texel feather, so the band's edge is an edge and not a staircase
    k = np.array([0.25, 0.5, 0.25], np.float32)
    band = np.convolve(band, k, mode="same")
    m = np.repeat(band[None, :], RES, 0)
    # bakes are v-up in Blender and row 0 is the top of a PNG, so the Shell's island is the
    # bottom 70 % of the image
    m[: int(round((1.0 - V_SHELL_MAX) * RES)), :] = 0.0
    print(f"  bands s {s_lo:.4f}-{s_hi:.4f}: u {lo2:.4f}-{hi2:.4f} and {lo:.4f}-{hi:.4f} "
          f"({(hi - lo) * RES:.0f} texels each), {int(m.sum())} texels")
    return m


def main():
    ao = load_gray("T_AO.png")
    rough = load_gray("T_ROUGH.png")
    base = load_gray("T_BASE.png")
    curv = load_gray("T_CURV.png")

    used = ao > 0.05
    tm = band_mask(*S_DARK)
    bv = band_mask(*S_BEVEL)
    shoulder = float(np.percentile(ao[:, int(U_SHOULDER[0] * RES):int(U_SHOULDER[1] * RES)], 70))
    print("shoulder occlusion", round(shoulder, 3))
    occ = np.clip(ao / shoulder, 0, 1)

    # curvature-aware roughness: convex edges burnish, crevices stay blasted
    bend = 1.0 - 0.22 * np.clip((curv - 0.5) * 2.0, -1, 1)
    g = np.clip(rough * bend, 0.56, 1.0)
    orm = np.zeros((RES, RES, 3), np.float32)
    orm[:, :, 0] = occ
    orm[:, :, 1] = g
    orm[:, :, 2] = 1.0 - 0.92 * tm      # metal 1.0 on the body, 0.08 in the throat
    save(orm, os.path.join(HERE, "T_ORM.png"))

    b = base[used].mean()
    b = base * (0.985 / max(1e-6, b))
    # the throat: near-black, matte, and no longer a conductor. 0.045 albedo is a black
    # anodised sleeve, which is what a slot like this is lined with; it also stops the
    # recess mirroring the same softbox the body mirrors, which is why the band read as a
    # grey inlay rather than a hole.
    b = b * (1.0 - tm) + 0.045 * tm
    g = g * (1.0 - tm) + 0.97 * tm
    # the lip: polished, not blasted. A 2 mm bevel at 45 deg is the one surface that can
    # return a *line* of specular at the hero framing; at the body's 0.91 roughness it
    # returns a 3 px smear instead, which is why pass 6 had "no visible lip highlight".
    g = g * (1.0 - bv) + 0.20 * bv
    orm[:, :, 0] = orm[:, :, 0] * (1.0 - tm) + np.minimum(orm[:, :, 0], 0.35) * tm
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
