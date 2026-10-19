"""Quick look: render the asset in Blender to judge the slot before wiring it into the page.
HOME=/opt/data blender -b assets/asset/vesper.blend -P tools/asset/preview.py -- out.png [w] [h] [dist] [z]
"""
import bpy, sys, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = argv[0] if argv else "/tmp/vesper-preview.png"
W = int(argv[1]) if len(argv) > 1 else 900
H = int(argv[2]) if len(argv) > 2 else 620
DIST = float(argv[3]) if len(argv) > 3 else 0.98
AIM = float(argv[4]) if len(argv) > 4 else 0.20
ORBIT = float(argv[5]) if len(argv) > 5 else 0.0

sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(o, do_unlink=True)

# camera
cam_d = bpy.data.cameras.new("Cam")
cam_d.lens = 70
cam = bpy.data.objects.new("Cam", cam_d)
sc.collection.objects.link(cam)
cam.location = (math.sin(ORBIT) * DIST, -math.cos(ORBIT) * DIST, 0.25)
tgt = bpy.data.objects.new("Tgt", None)
sc.collection.objects.link(tgt)
tgt.location = (0, 0, AIM)
c = cam.constraints.new("TRACK_TO")
c.target = tgt
c.track_axis = "TRACK_NEGATIVE_Z"
c.up_axis = "UP_Y"
sc.camera = cam
cam_d.sensor_width = 36

# a studio: one big soft key up-front-left, a cool strip right, a dim room
def area(name, loc, size, energy, color, rot=(0, 0, 0)):
    d = bpy.data.lights.new(name, "AREA")
    d.shape = "RECTANGLE"
    d.size, d.size_y = size
    d.energy = energy
    d.color = color
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = rot
    sc.collection.objects.link(o)
    tc = o.constraints.new("TRACK_TO")
    tc.target = tgt
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    return o

area("Key", (-0.9, -1.5, 1.35), (1.0, 1.4), 260, (1.0, 0.98, 0.95))
area("Strip", (1.7, -0.9, 0.55), (0.12, 1.1), 120, (0.92, 0.96, 1.0))
area("Fill", (-1.6, 0.5, 0.35), (1.2, 0.9), 40, (0.85, 0.88, 0.92))
area("Rim", (0.6, 1.9, 1.1), (0.7, 0.9), 90, (0.9, 0.95, 1.0))

w = bpy.data.worlds.new("W")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.055, 0.06, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 1.0

# a floor so the object is in a room and casts something
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, 0))
floor = bpy.context.object
m = bpy.data.materials.new("Floor")
m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.14, 0.135, 0.125, 1)
m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
floor.data.materials.append(m)

sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = int(os.environ.get("SAMPLES", 48))
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.film_transparent = False
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("wrote", out)
