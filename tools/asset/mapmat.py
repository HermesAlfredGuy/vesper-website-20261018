"""Give the asset the shader the maps were baked for, so the Blender preview and the
page are looking at the same surface. Loaded by diag.py when MAPS=1."""
import bpy, os
ASSET = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "assets", "asset")


def build(colour=(0.60, 0.63, 0.67), metal=1.0, rough=0.42):
    mat = bpy.data.materials.new("M_Baked")
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough

    def img(name, non_color=True):
        i = bpy.data.images.load(os.path.join(ASSET, name))
        i.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
        return i

    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img("T_Base.png", False)
    tex.location = (-900, 300)
    mixc = nt.nodes.new("ShaderNodeMixRGB"); mixc.blend_type = "MULTIPLY"; mixc.inputs[0].default_value = 1.0
    mixc.inputs[1].default_value = (*colour, 1)
    nt.links.new(tex.outputs["Color"], mixc.inputs[2])
    nt.links.new(mixc.outputs["Color"], b.inputs["Base Color"])

    orm = nt.nodes.new("ShaderNodeTexImage"); orm.image = img("T_ORM.png")
    orm.location = (-900, 0)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = rough
    nt.links.new(sep.outputs["Green"], mul.inputs[0])
    nt.links.new(mul.outputs[0], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    b.inputs["Metallic"].default_value = metal

    ntex = nt.nodes.new("ShaderNodeTexImage"); ntex.image = img("T_N.png")
    ntex.location = (-900, -300)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(ntex.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return mat


def apply_to_all():
    mat = build()
    for o in bpy.data.objects:
        if o.type == "MESH" and not o.name.endswith("_HI") and o.name != "LightPipe":
            o.data.materials.clear()
            o.data.materials.append(mat)
    return mat
