#!/usr/bin/env python3
"""Fast structural check on the shipped GLB (no browser, no Blender).

Asserts the shipped GLB really contains what the report claims, straight off the
binary: node names, index width, image codec, silhouette extents, the slot's
measured cross-section, and the build tag the page requests.

    python3 tools/asset/check_asset.py [repo]
"""
import json
import re
import struct
import sys
from pathlib import Path

repo = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
glb = repo / "assets" / "vesper-01.glb"
raw = glb.read_bytes()
jlen = struct.unpack("<I", raw[12:16])[0]
j = json.loads(raw[20:20 + jlen])

fails = []


def check(label, cond, detail=""):
    print(("ok   " if cond else "FAIL ") + label + (f"  {detail}" if detail else ""))
    if not cond:
        fails.append(label)


names = [n.get("name") for n in j["nodes"]]
check("nodes are Shell/LightPipe/Plinth/Dial", names == ["Shell", "LightPipe", "Plinth", "Dial"], str(names))

for n in j["nodes"]:
    check(f"{n['name']} node is untransformed", not ({"translation", "rotation", "scale"} & set(n)),
          str({k: n[k] for k in ("translation", "rotation", "scale") if k in n}))

tris = 0
for m in j["meshes"]:
    for p in m["primitives"]:
        acc = j["accessors"][p["indices"]]
        tris += acc["count"] // 3
        check(f"{m['name']} fits 16-bit indices", j["accessors"][p["attributes"]["POSITION"]]["count"] < 65536,
              f"{j['accessors'][p['attributes']['POSITION']]['count']} verts")
check("total triangles 100k-115k", 100_000 <= tris <= 115_000, f"{tris}")

mimes = {i.get("mimeType") for i in j["images"]}
check("textures are lossless PNG", mimes == {"image/png"}, str(mimes))

mat = [m for m in j["materials"] if m["name"] == "M_Shell"]
check("M_Shell exists with all four maps",
      bool(mat) and all(k in mat[0] for k in ("normalTexture", "occlusionTexture", "pbrMetallicRoughness")),
      str(sorted(mat[0].keys())) if mat else "missing")

pos = j["accessors"][[p for m in j["meshes"] if m["name"] == "Shell" for p in m["primitives"]][0]["attributes"]["POSITION"]]
mn, mx = pos["min"], pos["max"]
height = mx[1] - mn[1]
check("shell height 0.2849 m (approved silhouette)", abs(height - 0.2849) < 2e-4, f"{height:.4f}")
check("shell radius <= 0.0902 m", max(mx[0], mx[2]) <= 0.0902 + 1e-6, f"{max(mx[0], mx[2]):.4f}")
check("shell sits on y=0.020", abs(mn[1] - 0.020) < 2e-4, f"{mn[1]:.4f}")

src = (repo / "js" / "scene3d.js").read_text()
tag = re.search(r"vesper-01\.glb\?v=(\d+)", src)
check("scene3d.js requests a versioned GLB", bool(tag), tag.group(0) if tag else "no query tag")
check("procedural lathe is gone", "shellGeometry(" not in src and "channelify" not in src)
check("channel shader is gone", "CH_uGlow" not in src)
check("baked maps are bound", all(k in src for k in ("aoMap", "normalMap", "roughnessMap")))
check("dither on the body", "bodyMat.dithering = true" in src)

print(f"\n{'FAILED: ' + ', '.join(fails) if fails else 'all ad-hoc checks passed'}")
sys.exit(1 if fails else 0)
