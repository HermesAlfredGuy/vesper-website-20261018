"""VESPER 01 — the bake set.

  HOME=/opt/data blender -b assets/asset/vesper.blend -P tools/asset/bake_tex.py -- <stage>

stages:
  hipoly    build the displaced high-poly (the finish as geometry) for the shell + base
  ao        bake ambient occlusion, 2K, into assets/asset/T_AO.png       (Cycles)
  norm      bake tangent-space normals from the high-poly, 2K            (Cycles)
  curv      bake convexity/concavity via Pointiness, 1K                  (Cycles)
  vary      bake the "polish" pass and the albedo mottle, 1K             (Cycles)
  (compose lives in tools/asset/compose.py)
  export    wire the maps into the material and write assets/vesper-01.glb

The micro-structure is authored in OBJECT space and evaluated on a domain that wraps
the cylinder, so there is no seam, no ring period, and no single frequency to beat
against the pixel grid: three anisometric streak octaves (5.0/2.2/1.1 mm across,
long along the circumference) over two isotropic grain octaves (no finer than 1.1 mm,
i.e. >= 4 texels per period at 2K over a 0.5 m circumference).
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector

TAU = math.pi * 2
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSET = os.path.join(ROOT, "assets", "asset")
RES = int(os.environ.get("RES", "2048"))
RES_C = int(os.environ.get("RES_C", str(RES)))   # the vary/curvature bakes are cheap: keep them 1:1
CIRC = 0.4487          # circumference of the waist, metres (2*pi*0.0714)
FINISH_OBJS = ("Shell", "Plinth", "Dial")


# ---------------------------------------------------------------- the finish
# Value noise on a lattice, vectorised with numpy: the same field has to be evaluated
# on a million-plus vertices twice (high-poly displacement, then the attribute bakes),
# and a per-vertex Python loop is minutes of wall clock for no gain in the result.
SEED_TABLE = np.array([0.0])


def _hash3(ix, iy, iz, seed):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ \
        (iz.astype(np.int64) * 83492791) ^ np.int64(seed * 2654435761 % 2147483647)
    h = (h * 1103515245 + 12345) & 0x7FFFFFFF
    return (h % 1000003) / 1000003.0


def vnoise(px, py, pz, seed):
    """smooth value noise, mean 0.5, on a unit lattice"""
    ix = np.floor(px); iy = np.floor(py); iz = np.floor(pz)
    fx = px - ix; fy = py - iy; fz = pz - iz
    ux = fx * fx * (3 - 2 * fx); uy = fy * fy * (3 - 2 * fy); uz = fz * fz * (3 - 2 * fz)
    ix = ix.astype(np.int64); iy = iy.astype(np.int64); iz = iz.astype(np.int64)
    c = {}
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                c[(dx, dy, dz)] = _hash3(ix + dx, iy + dy, iz + dz, seed)
    x00 = c[(0, 0, 0)] + (c[(1, 0, 0)] - c[(0, 0, 0)]) * ux
    x10 = c[(0, 1, 0)] + (c[(1, 1, 0)] - c[(0, 1, 0)]) * ux
    x01 = c[(0, 0, 1)] + (c[(1, 0, 1)] - c[(0, 0, 1)]) * ux
    x11 = c[(0, 1, 1)] + (c[(1, 1, 1)] - c[(0, 1, 1)]) * ux
    y0 = x00 + (x10 - x00) * uy
    y1 = x01 + (x11 - x01) * uy
    return y0 + (y1 - y0) * uz


R_REF = 0.0714            # waist radius: the arc length the angular domain is scaled to


def wrap_noise(a, z, along_mm, across_mm, seed):
    """noise on a domain that wraps the cylinder exactly, parameterised by the world
    sizes it should have: `along_mm` of arc round the circumference, `across_mm` of
    height. cos/sin of the azimuth make it seamless at the seam, whatever the spacing."""
    k = R_REF / (along_mm * 1e-3)          # lattice units per radian
    l = 1.0 / (across_mm * 1e-3)           # lattice units per metre of height
    r = vnoise(np.cos(a) * k, np.sin(a) * k, z * l, seed)
    return (r - 0.5) * 2.0


def streak_field(a, z):
    """tool marks: three octaves, each long along the circumference and narrow across it,
    no two sharing a period, so there is no single frequency to beat the pixel grid:
    60 x 5.5 mm, 26 x 2.6 mm, 11 x 1.4 mm. Long and faint rather than a wound thread —
    at the hero's 0.94 mm/px the shortest of them is still 12 px long and 1.5 px wide."""
    # Weight moved off the long circumferential stretches and onto the isotropic
    #  grain: at hero framing a 4 mm streak is 8 px and reads as a lathe ring — the
    #  one thing a sand-cast shell must not look like (brief: no ring pattern).
    return (0.55 * wrap_noise(a, z, 60.0, 4.0, 3.0)
            + 0.30 * wrap_noise(a, z, 26.0, 2.0, 17.0)
            + 0.14 * wrap_noise(a, z, 11.0, 1.1, 41.0))


def grain_field(a, z):
    """the blast itself: isotropic, three octaves, and never finer than 0.75 mm, which
    is 3.8 texels per period at 2K over a 0.449 m circumference."""
    return (1.00 * wrap_noise(a, z, 2.60, 2.60, 71.0)
            + 0.60 * wrap_noise(a, z, 1.20, 1.20, 113.0)
            + 0.30 * wrap_noise(a, z, 0.75, 0.75, 151.0))


def micro_height(a, z):
    """metres. Value noise concentrates its power at the long end, so the amplitudes are
    large and the slopes they make are modest: about 0.11 rms across the tool marks and
    0.05 along them, i.e. 6 deg of tilt at the marks and 3 deg along them. That is the
    scale at which a highlight is shaped instead of merely dimmed; a tenth of it is
    invisible at 1 px, and a tenth of it is what the last five passes shipped."""
    amp = float(os.environ.get("AMP", "2.2"))
    return amp * (120e-6 * streak_field(a, z) + 16e-6 * grain_field(a, z))


def polish_field(a, z):
    """1.0 = as blasted as the finish says, lower = burnished by handling. Slow and
    mottled, and it only ever makes the surface *smoother* than the finish's own
    roughness, so the finish's number stays the body's typical value."""
    p = np.clip(0.5 + 0.5 * wrap_noise(a, z, 90.0, 90.0, 211.0), 0, 1)
    return 0.86 + 0.14 * p


def mottle_field(a, z):
    """cast aluminium is not one colour: a 1.5 % drift over 5-20 mm, nothing more"""
    m = np.clip(0.5 + 0.5 * wrap_noise(a, z, 12.0, 12.0, 307.0), 0, 1)
    return 0.985 + 0.030 * (m - 0.5)


def curvature_field(ob):
    """mean curvature per vertex from the discrete Laplacian, mapped to 0..1 around the
    body's own curvature (0.5 flat, 1.0 a milled edge, 0.0 a crevice). Pointiness was
    the obvious source and it is per-vertex noise on a 600 k mesh, which would put its
    noise straight into the roughness map."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    nr = np.empty(n * 3, np.float32); me.vertices.foreach_get("normal", nr); nr = nr.reshape(-1, 3)
    ed = np.empty(len(me.edges) * 2, np.int32); me.edges.foreach_get("vertices", ed); ed = ed.reshape(-1, 2)
    d = co[ed[:, 1]] - co[ed[:, 0]]
    L2 = np.maximum((d ** 2).sum(1), 1e-16)
    k = 2.0 * (nr[ed[:, 0]] * d).sum(1) / L2
    acc = np.zeros(n); cnt = np.zeros(n)
    for side in (0, 1):
        np.add.at(acc, ed[:, side], k)
        np.add.at(cnt, ed[:, side], 1.0)
    H = acc / np.maximum(cnt, 1)
    # centred on the body's own median curvature with a robust spread, so 0.5 is "as
    # curved as this casting", the milled edge breaks saturate at 1 and the fillets at 0
    med = float(np.median(H))
    spread = max(2.0, 3.0 * float(np.median(np.abs(H - med))))
    return 0.5 + 0.5 * np.tanh((H - med) / spread)


def coords(me):
    """(azimuth, z, x, y) for every vertex, as numpy arrays"""
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    a = np.arctan2(co[:, 1], co[:, 0])
    return a, co[:, 2], co[:, 0], co[:, 1]


def displace(ob, amp=1.0):
    me = ob.data
    a, z, x, y = coords(me)
    h = (micro_height(a, z) * amp).astype(np.float32)
    nrm = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("normal", nrm)
    nrm = nrm.reshape(-1, 3)
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) + nrm * h[:, None]
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def build_hipoly():
    for o in list(bpy.data.objects):
        if o.name.endswith("_HI"):
            bpy.data.objects.remove(o, do_unlink=True)
    made = []
    for name in FINISH_OBJS:
        src = bpy.data.objects[name]
        bpy.ops.object.select_all(action="DESELECT")
        src.select_set(True)
        bpy.context.view_layer.objects.active = src
        bpy.ops.object.duplicate()
        dup = bpy.context.view_layer.objects.active
        dup.name = name + "_HI"
        m = dup.modifiers.new("sub", "SUBSURF")
        m.subdivision_type = "SIMPLE"
        m.levels = m.render_levels = 1
        bpy.ops.object.modifier_apply(modifier="sub")
        displace(dup)
        made.append(dup)
        print(f"  hi {dup.name}: {len(dup.data.vertices)} verts")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ASSET, "vesper.blend"))
    print("saved with high-poly")


def ensure_objects():
    return [bpy.data.objects[n] for n in FINISH_OBJS]


def cycles_setup(samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.render.bake.margin = 12
    sc.render.bake.use_clear = True


def img_node(mat, image):
    nt = mat.node_tree
    n = nt.nodes.get("BAKE_TARGET")
    if n is None:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.name = "BAKE_TARGET"
        n.location = (-900, 400)
    n.image = image
    for other in nt.nodes:
        other.select = False
    n.select = True
    nt.nodes.active = n
    return n


def new_image(name, res, non_color=True):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    im = bpy.data.images.new(name, res, res, alpha=False, float_buffer=False)
    im.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    im.generated_color = (0, 0, 0, 1)
    return im


def save_img(im, path):
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    print("  wrote", path, os.path.getsize(path) // 1024, "kB")


def bake_to(image, objs, kind, samples=1, use_pass_direct=None, hipoly=None, clear=True):
    cycles_setup(samples)
    bpy.context.scene.render.bake.use_clear = clear
    mat = objs[0].data.materials[0]
    img_node(mat, image)
    bpy.ops.object.select_all(action="DESELECT")
    if hipoly:
        for h in hipoly:
            h.select_set(True)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type=kind, use_selected_to_active=bool(hipoly),
                        cage_extrusion=0.0009, max_ray_distance=0.0020, margin=12)
    print(f"  baked {kind} -> {image.name}")


# ---------------------------------------------------------------- stages
def stage_hipoly():
    build_hipoly()


def stage_ao():
    objs = ensure_objects()
    pipe = bpy.data.objects["LightPipe"]
    pipe.hide_render = True
    for h in list(bpy.data.objects):
        if h.name.endswith("_HI"):
            h.hide_render = True
    im = new_image("T_AO", RES)
    bake_to(im, objs, "AO", samples=int(os.environ.get("AO_SAMPLES", "96")))
    save_img(im, os.path.join(ASSET, "T_AO.png"))


def stage_norm():
    objs = ensure_objects()
    hi = [bpy.data.objects[n + "_HI"] for n in FINISH_OBJS]
    for o in hi:
        o.hide_render = False
    bpy.data.objects["LightPipe"].hide_render = True
    im = new_image("T_N", RES)
    first = True
    for i, o in enumerate(objs):
        bake_to(im, [o], "NORMAL", samples=1, hipoly=[hi[i]], clear=first)
        first = False
    save_img(im, os.path.join(ASSET, "T_N.png"))


def stage_curv():
    objs = ensure_objects()
    for h in list(bpy.data.objects):
        if h.name.endswith("_HI") or h.name == "LightPipe":
            h.hide_render = True
    for o in objs:
        cols = o.data.color_attributes
        ca = cols.get("curv") or cols.new("curv", "FLOAT_COLOR", "POINT")
        v = curvature_field(o).astype(np.float32)
        if o.name == "Shell":
            print(f"    curvature med/spread -> mean {v.mean():.3f} p2 {np.percentile(v,2):.3f} "
                  f"p98 {np.percentile(v,98):.3f}")
        buf = np.ones((len(v), 4), dtype=np.float32)
        buf[:, 0] = buf[:, 1] = buf[:, 2] = v
        ca.data.foreach_set("color", buf.ravel())
    mat, em = _emit_material("M_curv", None)
    at = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    at.layer_name = "curv"
    mat.node_tree.links.new(at.outputs["Color"], em.inputs["Color"])
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
    im = new_image("T_CURV", RES_C)
    bake_to(im, objs, "EMIT", samples=1)
    save_img(im, os.path.join(ASSET, "T_CURV.png"))


def _emit_material(name, fn):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return mat, em


def stage_vary():
    """polish (roughness multiplier) and albedo mottle, both from the same object-space
    fields as the normal map, so the three agree texel for texel."""
    objs = ensure_objects()
    for h in list(bpy.data.objects):
        if h.name.endswith("_HI") or h.name == "LightPipe":
            h.hide_render = True

    # Blender python cannot inject a per-point shader function, so the fields are
    # evaluated to a vertex colour attribute and baked from that instead: same field,
    # same result, and the bake stays a Cycles bake.
    for o in objs:
        cols = o.data.color_attributes
        while cols:
            cols.remove(cols[0])
        a, z, x, y = coords(o.data)
        for attr in ("polish", "mottle"):
            ca = o.data.color_attributes.new(attr, "FLOAT_COLOR", "POINT")
            val = (polish_field(a, z) if attr == "polish" else mottle_field(a, z)).astype(np.float32)
            buf = np.ones((len(val), 4), dtype=np.float32)
            buf[:, 0] = val
            buf[:, 1] = val
            buf[:, 2] = val
            ca.data.foreach_set("color", buf.ravel())

    for attr, name in (("polish", "T_ROUGH"), ("mottle", "T_BASE")):
        mat, em = _emit_material("M_" + attr, None)
        nt = mat.node_tree
        at = nt.nodes.new("ShaderNodeVertexColor")
        at.layer_name = attr
        nt.links.new(at.outputs["Color"], em.inputs["Color"])
        for o in objs:
            o.data.materials.clear()
            o.data.materials.append(mat)
        im = new_image(name, RES_C)
        bake_to(im, objs, "EMIT", samples=1)
        save_img(im, os.path.join(ASSET, name + ".png"))


# composition lives in tools/asset/compose.py: packing 16.7 M floats through bpy.types.Image
# at 2K is slow and, in this container, fatal. Blender bakes; PIL packs.


def stage_uvcheck():
    """the two things a bake cannot survive: a UV triangle whose winding is inverted
    relative to its island, and two faces from different parts of the surface sharing
    a texel. Handedness is measured against each face's own tangent frame, so slot
    walls and cavity walls are judged like any other face."""
    G = 1024
    for name in FINISH_OBJS:
        me = bpy.data.objects[name].data
        layer = me.uv_layers[0]
        me.calc_loop_triangles()
        pos = 0
        neg = 0
        cells = {}
        for t in me.loop_triangles:
            tri = [layer.data[li].uv[:] for li in t.loops]
            p3 = [me.vertices[vi].co for vi in t.vertices]
            du = Vector((tri[1][0] - tri[0][0], tri[2][0] - tri[0][0]))
            dv = Vector((tri[1][1] - tri[0][1], tri[2][1] - tri[0][1]))
            det = du.x * dv.y - du.y * dv.x
            n = (p3[1] - p3[0]).cross(p3[2] - p3[0])
            if det * (1.0 if n.length_squared > 0 else 1.0) > 0:
                pos += 1
            else:
                neg += 1
            rad = (p3[0] + p3[1] + p3[2]) / 3.0
            cx = int(min(G - 1, max(0, (sum(u[0] for u in tri) / 3) * G)))
            cy = int(min(G - 1, max(0, (sum(u[1] for u in tri) / 3) * G)))
            cells.setdefault((cx, cy), []).append(Vector(rad))
        worst = 0.0
        for vs in cells.values():
            if len(vs) < 2:
                continue
            c = sum(vs, Vector()) / len(vs)
            worst = max(worst, max((v - c).length for v in vs))
        print(f"  {name}: uv handedness +{pos} / -{neg}; "
              f"worst spread of faces sharing a texel cell {worst*1000:.2f} mm")


def stage_export():
    """wire the maps exactly as glTF wants them and write the GLB"""
    for o in list(bpy.data.objects):
        if o.name.endswith("_HI"):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.materials):
        if o.name.startswith("M_"):
            bpy.data.materials.remove(o)

    mat = bpy.data.materials.new("M_Shell")
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (1, 1, 1, 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 1.0

    def tex(name, non_color):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(ASSET, name))
        n.image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
        n.location = (-900, 0)
        return n

    base = tex("T_Base.png", False)
    nt.links.new(base.outputs["Color"], b.inputs["Base Color"])
    orm = tex("T_ORM.png", True)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    nmap = tex("T_N.png", True)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 1.0
    nt.links.new(nmap.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    # the exporter reads occlusion from a group called "glTF Material Output"
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    ng = nt.nodes.new("ShaderNodeGroup")
    ng.node_tree = g
    nt.links.new(sep.outputs["Red"], ng.inputs["Occlusion"])

    pipe = bpy.data.materials.get("M_LightPipe")
    if pipe is None:
        pipe = bpy.data.materials.new("M_LightPipe")
        pipe.use_nodes = True
        nt2 = pipe.node_tree
        for n in list(nt2.nodes):
            nt2.nodes.remove(n)
        out = nt2.nodes.new("ShaderNodeOutputMaterial")
        em = nt2.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (1.0, 0.55, 0.26, 1)
        nt2.links.new(em.outputs[0], out.inputs["Surface"])

    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        o.data.materials.clear()
        o.data.materials.append(pipe if o.name == "LightPipe" else mat)
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    out = os.path.join(ROOT, "assets", "vesper-01.glb")
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", export_apply=True, export_yup=True,
        export_normals=True, export_texcoords=True, export_image_format="AUTO",
        export_materials="EXPORT", export_extras=False, export_cameras=False,
        export_lights=False, export_animations=False, export_skins=False,
        export_morph=False, use_selection=False,
    )
    print("wrote", out, os.path.getsize(out) // 1024, "kB")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    stages = argv if argv else ["uvcheck"]
    for st in stages:
        print("== stage", st)
        globals()["stage_" + st]()
