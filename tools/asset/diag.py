"""Diagnostic: render the asset with parts hidden.
HOME=/opt/data blender -b assets/asset/vesper.blend -P tools/asset/diag.py -- out.png w h dist aim orbit [only|hide:Name,...]
"""
import bpy, sys, math, os
argv = sys.argv[sys.argv.index("--") + 1:]
out, W, H = argv[0], int(argv[1]), int(argv[2])
DIST, AIM, ORBIT = float(argv[3]), float(argv[4]), float(argv[5])
sel = argv[6] if len(argv) > 6 else ""
if sel.startswith("only"):
    keep = sel[5:].split(",")
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o.name not in keep
elif sel.startswith("hide"):
    for n in sel[5:].split(","):
        o = bpy.data.objects.get(n)
        if o:
            o.hide_render = True

if os.environ.get("MAPS"):
    import importlib.util
    spec = importlib.util.spec_from_file_location("mapmat", os.path.join(os.path.dirname(os.path.abspath(__file__)), "mapmat.py"))
    mm = importlib.util.module_from_spec(spec); spec.loader.exec_module(mm)
    mm.apply_to_all()

sc = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in {"CAMERA", "LIGHT", "EMPTY"} or o.name == "Plane":
        bpy.data.objects.remove(o, do_unlink=True)

cam_d = bpy.data.cameras.new("Cam")
cam_d.lens = float(os.environ.get("LENS", 61))
cam_d.sensor_width = 36
cam = bpy.data.objects.new("Cam", cam_d)
sc.collection.objects.link(cam)
cam.location = (math.sin(ORBIT) * DIST, -math.cos(ORBIT) * DIST, float(os.environ.get("CAMZ", 0.25)))
tgt = bpy.data.objects.new("Tgt", None)
sc.collection.objects.link(tgt)
tgt.location = (0, 0, AIM)
c = cam.constraints.new("TRACK_TO")
c.target = tgt
c.track_axis = "TRACK_NEGATIVE_Z"
c.up_axis = "UP_Y"
sc.camera = cam


def area(name, loc, size, energy, color):
    d = bpy.data.lights.new(name, "AREA")
    d.shape = "RECTANGLE"
    d.size, d.size_y = size
    d.energy = energy
    d.color = color
    o = bpy.data.objects.new(name, d)
    o.location = loc
    sc.collection.objects.link(o)
    tc = o.constraints.new("TRACK_TO")
    tc.target = tgt
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"


area("Key", (-0.9, -1.5, 1.35), (1.0, 1.4), 260, (1.0, 0.98, 0.95))
area("Strip", (1.7, -0.9, 0.55), (0.12, 1.1), 120, (0.92, 0.96, 1.0))
area("Fill", (-1.6, 0.5, 0.35), (1.2, 0.9), 40, (0.85, 0.88, 0.92))
area("Rim", (0.6, 1.9, 1.1), (0.7, 0.9), 90, (0.9, 0.95, 1.0))

w = bpy.data.worlds.new("W")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.055, 0.06, 1)

sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = int(os.environ.get("SAMPLES", 48))
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = "AgX"
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("wrote", out)
