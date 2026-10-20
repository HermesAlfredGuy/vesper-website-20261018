"""VESPER 01 — authored asset (Blender 4.5, headless).

Builds the lamp as real geometry: a waisted cast column with a helical slot cut
into an 11 mm wall, faceted lip / throat / floor, a chamfered plinth and dial, and
a separate emissive light-pipe strip recessed below the lip plane.

Run:  HOME=/opt/data blender -b --factory-startup -P tools/asset/build_vesper.py -- <stage>
      stages: build | tex | export | all
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector

TAU = math.pi * 2
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSET = os.path.join(ROOT, "assets", "asset")
os.makedirs(ASSET, exist_ok=True)

# ---------------------------------------------------------------- silhouette
# the shipped profile (metres). Unchanged: the silhouette is approved.
OUTER = [
    (0.0200, 0.0790), (0.0232, 0.0812), (0.0440, 0.0766), (0.0900, 0.0724),
    (0.1300, 0.0718), (0.1600, 0.0740), (0.1900, 0.0778), (0.2200, 0.0826),
    (0.2480, 0.0872), (0.2720, 0.0900), (0.2900, 0.0902), (0.3000, 0.0886),
    (0.3060, 0.0854), (0.3092, 0.0796), (0.3105, 0.0640), (0.3086, 0.0432),
    (0.3050, 0.0220), (0.3040, 0.0000),
]

Z_BOT, Z_TOP = OUTER[0][0], OUTER[-1][0]
WALL = 0.0110

# ---------------------------------------------------------------- the slot
SLOT = dict(
    # 68.5 deg is where the hero camera stands (pos 0.17,0.31,0.94 -> target -0.20,0.105,0),
    # so the slot's mid-height azimuth is set 10 deg inside it: a section of the helix faces
    # the lens square on, which is the difference between a 24 mm aperture seen at 0.6x and
    # one seen at 1.0x. The helix still turns away above and below, so it reads as a channel.
    # Blender's azimuth runs the other way round once the exporter turns Z-up into Y-up
    # (x, y, z) -> (x, z, -y), and the sign survives into the helix's *direction* as well as
    # its start. -4.665 rad here is +58.5 deg at half height in the page's frame, with the
    # channel climbing the other way; js/scene3d.js states the same helix, not a mirror of it.
    phase=-4.6650,
    turns=1.16,
    z_min=0.038,
    z_max=0.286,
    aperture=0.0240,      # 24 mm across the opening at the untouched surface
    depth=0.00740,        # 7.4 mm floor below the untouched surface
    runout=0.0032,        # the cutter lifts out over this much height at each end
)

# cross-section of the cut, (arc offset from the slot centre, depth below the surface).
# A 2.0 mm, true 45 deg outer bevel; a 0.56 mm land; an 8 deg draft throat wall; a
# filleted floor 16.3 mm across; every junction carries an explicit 0.10-0.16 mm edge
# break. The widths are set by the hero framing, not by taste: at 0.50 mm/px the bevel
# is 4 px, the dark throat reveal 5 px and the 13.2 mm pipe 26 px, so the recess reads as
# three separate bands instead of one amber line.
SLOT_PROFILE = [
    (-0.01200, 0.00000),   # untouched surface
    (-0.01186, 0.00016),   # edge break
    (-0.00986, 0.00216),   # 2.0 mm outer lip bevel, 45 deg
    (-0.00972, 0.00222),   # edge break
    (-0.00930, 0.00226),   # lip land, 0.56 mm wide, flat
    (-0.00918, 0.00234),   # edge break into the throat
    (-0.00890, 0.00490),   # throat wall, 8 deg draft
    (-0.00870, 0.00670),   # floor fillet
    (-0.00842, 0.00732),   # fillet out
    (-0.00815, 0.00740),   # floor, 16.3 mm across
    (0.00000, 0.00740),
    (0.00815, 0.00740),
    (0.00842, 0.00732),
    (0.00870, 0.00670),
    (0.00890, 0.00490),
    (0.00918, 0.00234),
    (0.00930, 0.00226),
    (0.00972, 0.00222),
    (0.00986, 0.00216),
    (0.01186, 0.00016),
    (0.01200, 0.00000),
]
DENSE_S = 0.01200

# every object shares one baked 2K set, so every object gets its own rectangle of it.
# (shell, plinth, dial live in three islands; the shell's cavity wall and base rim sit
# in a small reserved corner, because nothing ever sees them at more than a texel.)
# Four islands, none of them overlapping, in one 2K map:
#   shell   0.00-1.00 x 0.00-0.70   0.219 mm/texel across, 0.198 mm up
# 1.30 mm rows and 176 uniform columns put the shell near 49 k vertices, which is
# under the 65 536 that lets the export use 16-bit indices. The slot's edges are not
# affected: in unrolled (arc, z) they are straight lines, and the column that carries
# each edge sits exactly on that line at every row.
#   plinth  0.00-1.00 x 0.72-0.78
#   dial    0.00-1.00 x 0.80-0.84
#   cavity  one texel at 0.995,0.995 — the inside of the wall is never seen, so it is
#           not given room at the expense of the surfaces that are.
UV_BOX = {
    "Shell":  (0.0000, 0.0000, 1.0000, 0.7000),
    "Inner":  (0.9950, 0.9950, 0.9954, 0.9954),
    "Rim":    (0.9950, 0.9950, 0.9954, 0.9954),
    "Plinth": (0.0000, 0.7200, 1.0000, 0.7800),
    "Dial":   (0.0000, 0.8000, 1.0000, 0.8400),
}


def uv_box(name, u, v):
    x0, y0, x1, y1 = UV_BOX[name]
    return (x0 + (x1 - x0) * u, y0 + (y1 - y0) * v)

N_UNIFORM = 176          # columns round the rest of the circumference
ROW_STEP = 0.00130
EMIT_HALF = 0.00590      # light-pipe half width: 11.8 mm of blade in an 18 mm throat
# 1.25 mm below the lip plane, against a 7.4 mm floor: the blade is a light pipe at the
# mouth, not a diffuser at the bottom of a trench. Its edges stop 3.4 mm inside the lip
# land, and that 3.4 mm of throat is finished matte black in the atlas (compose.py), so the
# hero frame reads bright bevel / black reveal / bright core: 24 px of source with a 6 px
# dark band beside it at 0.50 mm/px, and the recess reads as a recess because the metal in
# it is not metal.
EMIT_TOP = 0.00125       # crown depth below the untouched surface
EMIT_BOT = 0.00720


def r_of(z):
    if z <= OUTER[0][0]:
        return OUTER[0][1]
    if z >= OUTER[-1][0]:
        return OUTER[-1][1]
    for i in range(len(OUTER) - 1):
        z0, r0 = OUTER[i]
        z1, r1 = OUTER[i + 1]
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * ((z - z0) / max(1e-12, z1 - z0))
    return OUTER[-1][1]


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / max(1e-12, b - a)))
    return t * t * (3 - 2 * t)


def slot_ramp(z):
    if z < SLOT["z_min"] or z > SLOT["z_max"]:
        return 0.0
    return smoothstep(0.0, SLOT["runout"], z - SLOT["z_min"]) * \
        smoothstep(0.0, SLOT["runout"], SLOT["z_max"] - z)


def cut_depth(s, z):
    """How far the surface is cut below r0 at arc offset s, at height z."""
    ramp = slot_ramp(z)
    if ramp <= 0.0:
        return 0.0
    a = abs(s)
    if a >= SLOT_PROFILE[-1][0]:
        return 0.0
    for i in range(len(SLOT_PROFILE) - 1):
        s0, d0 = SLOT_PROFILE[i]
        s1, d1 = SLOT_PROFILE[i + 1]
        if s0 <= s <= s1:
            u = (s - s0) / max(1e-12, s1 - s0)
            return (d0 + (d1 - d0) * u) * ramp
    return 0.0


def helix_angle(z):
    t = (z - SLOT["z_min"]) / (SLOT["z_max"] - SLOT["z_min"])
    return SLOT["phase"] + t * SLOT["turns"] * TAU


# ---------------------------------------------------------------- mesh helpers
def new_mesh(name, verts, faces, uvs, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate(verbose=False)
    me.update()
    if uvs:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                layer.data[li].uv = uvs[vi]
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def mark_sharp(ob, angle_deg=34.0):
    me = ob.data
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle_deg)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            if e.calc_face_angle(0.0) > lim:
                e.smooth = False
        else:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()
    me.update()


def clean(ob, merge=0.00002):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


# ---------------------------------------------------------------- the shell
def build_shell():
    """Outer skin. The topology follows the helix (columns are clustered on the
    slot's own knots, so a 0.12 mm edge break is two columns wide at any height);
    the UV does not — it is (arc from the helix centre, height), which is a
    distortion-free unwrap: a shear only rotates the parameter axes, so a baked
    object-space finish survives it exactly, and there is no wrap column to seam.
    """
    dense_half = DENSE_S / 0.0718          # radians at the reference radius
    cols = []                              # ('s', metres of arc) or ('a', radians)
    for p in SLOT_PROFILE:
        cols.append(("s", p[0]))
    # 's' columns keep a constant arc width at every height; the columns that take
    # over from them are fixed angles, so the ring still closes exactly.
    for s in (0.0148, 0.0208, 0.0330):
        cols.append(("a", s / 0.0718))
        cols.append(("a", -s / 0.0718))
    cols.sort(key=lambda c: (c[1] / 0.0718) if c[0] == "s" else c[1])
    outer = cols[-1][1]                    # 0.0330 / 0.0718
    span = TAU - 2 * outer
    for k in range(N_UNIFORM):
        cols.append(("a", outer + span * (k + 1) / (N_UNIFORM + 1)))
    cols.append(("a", TAU - outer))        # coincident with column 0; holds u = 1

    rows = [Z_BOT]
    extra = [SLOT["z_min"], SLOT["z_min"] + SLOT["runout"],
             SLOT["z_max"] - SLOT["runout"], SLOT["z_max"]]
    zz = Z_BOT
    while zz < Z_TOP - 1e-9:
        zz = min(Z_TOP, zz + ROW_STEP)
        rows.append(zz)
    rows.extend([e for e in extra if Z_BOT < e < Z_TOP])
    rows = sorted(set(round(r, 6) for r in rows))
    ncol = len(cols)

    verts, uvs, faces = [], [], []
    for z in rows:
        r0 = max(0.00045, r_of(z))          # the apex closes to a 0.9 mm eye, capped below
        a0 = helix_angle(z)
        for kind, v in cols:
            if kind == "s":
                s = v
                off = s / r0
            else:
                off = v
                s = off * r0
            d = cut_depth(s, z)
            a = a0 + off
            r = r0 - d
            verts.append((r * math.cos(a), r * math.sin(a), z))
            uvs.append(uv_box("Shell", (off + outer) / TAU, (z - Z_BOT) / (Z_TOP - Z_BOT)))
    for i in range(len(rows) - 1):
        for j in range(ncol - 1):
            a = i * ncol + j
            b = a + 1
            c = a + ncol
            d = c + 1
            faces.append((a, c, b))
            faces.append((b, c, d))
    # cap the apex with a fan, so the shell is a closed skin
    top = (len(rows) - 1) * ncol
    apex = len(verts)
    verts.append((0.0, 0.0, rows[-1] + 0.0009))
    uvs.append(uv_box("Shell", 0.5, (rows[-1] - Z_BOT) / (Z_TOP - Z_BOT)))
    for j in range(ncol - 1):
        faces.append((top + j, top + j + 1, apex))
    ob = new_mesh("Shell", verts, faces, uvs)
    # weld the closing column: geometry closes, the UV stays split (per loop)
    clean(ob, 1e-6)
    mark_sharp(ob, 20.0)
    return ob


def build_inner():
    """The cavity wall, offset 11 mm along the profile normal. Invisible except
    through the open base; it exists so the shell is a real cast wall rather than a
    single surface, and so the AO bake has a body behind the slot."""
    prof = []
    n = len(OUTER)
    for i, (z, r) in enumerate(OUTER):
        z0, r0 = OUTER[max(0, i - 1)]
        z1, r1 = OUTER[min(n - 1, i + 1)]
        tz, tr = z1 - z0, r1 - r0
        ln = math.hypot(tz, tr) or 1.0
        # normal in (z, r): rotate the tangent by 90 deg, then take whichever of the two
        # directions actually lands inside the outer skin. The old rule ("always shrink
        # the radius") has no answer where the surface is horizontal, and at the apex it
        # sent the inner wall 11 mm *up*, which put a flared collar 17 mm above the
        # approved silhouette. Test both offsets against the profile instead of guessing.
        nz, nr = -tr / ln, tz / ln
        best = None
        for sgn in (1, -1):
            zz, rr = z + nz * WALL * sgn, r + nr * WALL * sgn
            if zz <= Z_BOT or zz >= 0.3105:
                continue
            if rr > r_of(zz) - 0.0008 or rr < 0.0015:
                continue
            best = (zz, rr)
            break
        if best:
            prof.append(best)
    cols = 132
    verts, uvs, faces = [], [], []
    for (z, r) in prof:
        for j in range(cols + 1):
            a = TAU * j / cols
            verts.append((r * math.cos(a), r * math.sin(a), z))
            uvs.append(uv_box("Inner", j / cols, (z - Z_BOT) / (Z_TOP - Z_BOT)))
    n = len(prof)
    for i in range(n - 1):
        for j in range(cols):
            a = i * (cols + 1) + j
            faces.append((a, a + 1, a + cols + 1))
            faces.append((a + 1, a + cols + 2, a + cols + 1))
    ob = new_mesh("Inner", verts, faces, uvs)
    clean(ob, 1e-6)
    mark_sharp(ob, 40.0)
    return ob


def build_rims():
    """Close the base annulus between the outer skin and the cavity wall."""
    cols = 132
    verts, uvs, faces = [], [], []
    zo, ro = OUTER[0]
    z = OUTER[0][0]
    # inner start radius: the offset profile's first point
    pts = []
    n = len(OUTER)
    for i in (0, 1):
        z0, r0 = OUTER[max(0, i - 1)]
        z1, r1 = OUTER[min(n - 1, i + 1)]
        tz, tr = z1 - z0, r1 - r0
        ln = math.hypot(tz, tr) or 1.0
        nz, nr = -tr / ln, tz / ln
        if nr > 0:
            nz, nr = -nz, -nr
        pts.append((z0 + nz * WALL, max(0.0015, r0 + nr * WALL)))
    ri, zi = pts[0][1], pts[0][0]
    for j in range(cols + 1):
        a = TAU * j / cols
        verts.append((ro * math.cos(a), ro * math.sin(a), z))
        uvs.append(uv_box("Rim", j / cols, 0.0))
    for j in range(cols + 1):
        a = TAU * j / cols
        verts.append((ri * math.cos(a), ri * math.sin(a), zi + 0.0016))
        uvs.append(uv_box("Rim", j / cols, 1.0))
    for j in range(cols):
        faces.append((j, j + cols + 1, j + 1))
        faces.append((j + 1, j + cols + 1, j + cols + 2))
    ob = new_mesh("Rim", verts, faces, uvs)
    clean(ob, 1e-7)
    mark_sharp(ob, 40.0)
    return ob


# ---------------------------------------------------------------- emitter strip
def build_lightpipe():
    """A separate strip of light-pipe in the slot, crown 3.15 mm below the lip
    plane and 2.85 mm above the floor, narrower than the throat, so the metal
    occludes it by depth rather than by a shader gate."""
    prof = [
        (-EMIT_HALF, EMIT_BOT),
        (-EMIT_HALF, EMIT_TOP + 0.00030),
        (-EMIT_HALF + 0.00028, EMIT_TOP + 0.00006),
        (-EMIT_HALF + 0.00090, EMIT_TOP - 0.00010),
        (-EMIT_HALF + 0.00190, EMIT_TOP),
        (0.0, EMIT_TOP),
        (EMIT_HALF - 0.00190, EMIT_TOP),
        (EMIT_HALF - 0.00090, EMIT_TOP - 0.00010),
        (EMIT_HALF - 0.00028, EMIT_TOP + 0.00006),
        (EMIT_HALF, EMIT_TOP + 0.00030),
        (EMIT_HALF, EMIT_BOT),
    ]
    steps = 300
    z0, z1 = SLOT["z_min"] + 0.0055, SLOT["z_max"] - 0.0055
    verts, uvs, faces = [], [], []
    ring = len(prof)
    for i in range(steps + 1):
        t = i / steps
        z = z0 + (z1 - z0) * t
        r0 = r_of(z)
        a = helix_angle(z)
        # taper the ends into the slot so the strip has no blunt face in view
        e = min(t, 1 - t) / 0.04
        ramp = min(1.0, e)
        for (s, d) in prof:
            ss = s * (0.55 + 0.45 * ramp)
            r = r0 - d
            verts.append(((r) * math.cos(a + ss / r0), (r) * math.sin(a + ss / r0), z))
            uvs.append((0.5 + ss / 0.02, t))
    for i in range(steps):
        for j in range(ring - 1):
            a0 = i * ring + j
            faces.append((a0, a0 + ring, a0 + 1))
            faces.append((a0 + 1, a0 + ring, a0 + ring + 1))
    ob = new_mesh("LightPipe", verts, faces, uvs)
    clean(ob, 1e-7)
    mark_sharp(ob, 30.0)
    return ob


# ---------------------------------------------------------------- plinth / dial
def lathe(name, prof, segs=220, uv_scale=None):
    verts, uvs, faces = [], [], []
    zs = [p[0] for p in prof]
    z_lo, z_hi = min(zs), max(zs)
    for (z, r) in prof:
        for j in range(segs + 1):
            a = TAU * j / segs
            verts.append((r * math.cos(a), r * math.sin(a), z))
            uvs.append(uv_box(name, j / segs, (z - z_lo) / max(1e-6, z_hi - z_lo)))
    for i in range(len(prof) - 1):
        for j in range(segs):
            a = i * (segs + 1) + j
            faces.append((a, a + 1, a + segs + 1))
            faces.append((a + 1, a + segs + 2, a + segs + 1))
    ob = new_mesh(name, verts, faces, uvs)
    clean(ob, 1e-7)
    mark_sharp(ob, 34.0)
    return ob


def build_plinth():
    # 196 mm across, chamfered foot and top edge, matching the shipped plinth
    p = [
        (0.0000, 0.0000), (0.0000, 0.0952), (0.0011, 0.0968), (0.0042, 0.0982),
        (0.0132, 0.0981), (0.0164, 0.0962), (0.0186, 0.0912), (0.0200, 0.0790),
        (0.0192, 0.0712), (0.0180, 0.0700), (0.0000, 0.0700),
    ]
    return lathe("Plinth", p, 240)


def build_dial():
    p = [
        (0.0049, 0.0900), (0.0049, 0.0980), (0.0054, 0.0986), (0.0134, 0.0986),
        (0.0139, 0.0980), (0.0139, 0.0900),
    ]
    return lathe("Dial", p, 200)


# ---------------------------------------------------------------- materials
def material_shell():
    m = bpy.data.materials.new("M_Shell")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.62, 0.65, 0.69, 1)
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.42
    return m


def material_emitter():
    m = bpy.data.materials.new("M_LightPipe")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.42, 0.14, 1)
    em.inputs["Strength"].default_value = 1.7
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for it in list(c):
            try:
                c.remove(it)
            except Exception:
                pass


def build():
    reset()
    shell = build_shell()
    inner = build_inner()
    rim = build_rims()
    # join the three shell islands into one object with one material
    bpy.ops.object.select_all(action="DESELECT")
    for o in (shell, inner, rim):
        o.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.join()
    shell.name = "Shell"
    pipe = build_lightpipe()
    plinth = build_plinth()
    dial = build_dial()
    ms = material_shell()
    me = material_emitter()
    for o in (shell, plinth, dial):
        o.data.materials.append(ms)
    pipe.data.materials.append(me)
    pipe["kind"] = "emitter"

    tri = 0
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tri += len(o.data.loop_triangles)
            print(f"  {o.name:10s} v={len(o.data.vertices):7d} f={len(o.data.polygons):7d} "
                  f"dim={tuple(round(d, 4) for d in o.dimensions)}")
    print(f"  TOTAL tris={tri}")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ASSET, "vesper.blend"))
    print("saved", os.path.join(ASSET, "vesper.blend"))


if __name__ == "__main__":
    build()
