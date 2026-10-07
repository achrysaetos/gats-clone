"""Shared scene rules for every Skirmish bake: units, camera, sun, the oblique shear and the materials.

One Blender unit is one game unit. Game x runs east and game y runs south, so Blender X = x and Blender Y = -y.
Every solid is sheared so its top face lands exactly on its collision rect while its south face shows below it.
"""

import json
import math
import random

import bpy
from mathutils import Matrix, Vector

SPEC = None


def load_spec(path):
    global SPEC
    with open(path) as f:
        SPEC = json.load(f)
    return SPEC


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SPEC['render']['samples']
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 1
    scene.cycles.transparent_max_bounces = 2
    scene.cycles.use_adaptive_sampling = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = SPEC['render']['look']
    scene.view_settings.exposure = SPEC['render']['exposure']
    scene.render.use_persistent_data = True
    return scene


def to_blender(x, y, z=0.0):
    return Vector((x, -y, z))


def shear_matrix(top):
    """Lifts each point toward north by `k` per unit of height, then shifts the solid south so its top (at `top`) stays put."""
    k = SPEC['camera']['shear']
    return Matrix(((1, 0, 0, 0), (0, 1, k, -k * top), (0, 0, 1, 0), (0, 0, 0, 1)))


def place(obj, top):
    obj.matrix_world = shear_matrix(top) @ obj.matrix_world
    return obj


def add_sun():
    sun = SPEC['sun']
    data = bpy.data.lights.new('sun', 'SUN')
    data.energy = sun['strength']
    data.angle = math.radians(sun['softness'])
    data.color = sun['color']
    obj = bpy.data.objects.new('sun', data)
    bpy.context.scene.collection.objects.link(obj)
    elev = math.radians(sun['elevation'])
    dx, dy = sun['shadow']
    norm = math.hypot(dx, dy)
    d = Vector((dx / norm * math.cos(elev), -dy / norm * math.cos(elev), -math.sin(elev)))
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*SPEC['sky']['color'], 1)
    bg.inputs['Strength'].default_value = SPEC['sky']['strength']
    bpy.context.scene.world = world
    return obj


def add_camera(cx, cy, span, px):
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = span
    cam.clip_start = 1
    cam.clip_end = 5000
    obj = bpy.data.objects.new('cam', cam)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = to_blender(cx, cy, 2000)
    obj.rotation_euler = (0, 0, 0)
    scene = bpy.context.scene
    scene.camera = obj
    scene.render.resolution_x = px
    scene.render.resolution_y = px
    scene.render.resolution_percentage = 100
    return obj


def move_camera(obj, cx, cy):
    obj.location = to_blender(cx, cy, 2000)


# ---------------------------------------------------------------- materials

def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return nt, bsdf


def _coord(nt, scale=1.0):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    return mp.outputs['Vector']


def _world_coord(nt, scale=1.0):
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
    return mp.outputs['Vector']


def _noise(nt, vec, scale, detail=6, rough=0.55):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(vec, n.inputs['Vector'])
    return n


def _ramp(nt, fac, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1)
    nt.links.new(fac, r.inputs['Fac'])
    return r


def _mix(nt, a, b, fac, blend='MIX'):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = blend
    nt.links.new(fac, m.inputs[0])
    nt.links.new(a, m.inputs[6])
    nt.links.new(b, m.inputs[7])
    return m.outputs[2]


def _bump(nt, bsdf, height, strength):
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = 1.0
    nt.links.new(height, bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


_cache = {}


def material(name):
    if name in _cache:
        return _cache[name]
    mat = bpy.data.materials.new(name)
    MATERIALS[name](mat)
    _cache[name] = mat
    return mat


def _concrete(mat, light, dark, scale=1.0, stain=0.35):
    nt, bsdf = _nodes(mat)
    v = _world_coord(nt, scale)
    fine = _noise(nt, v, 0.9, 8, 0.65)
    broad = _noise(nt, v, 0.035, 4, 0.5)
    pores = nt.nodes.new('ShaderNodeTexVoronoi')
    pores.inputs['Scale'].default_value = 1.3
    nt.links.new(v, pores.inputs['Vector'])
    base = _ramp(nt, broad.outputs['Fac'], [(0.3, dark), (0.7, light)])
    grit = _ramp(nt, fine.outputs['Fac'], [(0.35, (0.55, 0.55, 0.55)), (0.65, (1, 1, 1))])
    col = _mix(nt, base.outputs['Color'], grit.outputs['Color'], _value(nt, stain), 'MULTIPLY')
    nt.links.new(col, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    _bump(nt, bsdf, fine.outputs['Fac'], 0.25)
    return nt, bsdf


def _value(nt, v):
    n = nt.nodes.new('ShaderNodeValue')
    n.outputs[0].default_value = v
    return n.outputs[0]


def _floor(mat):
    nt, bsdf = _nodes(mat)
    v = _world_coord(nt)
    bricks = nt.nodes.new('ShaderNodeTexBrick')
    bricks.offset = 0.0
    bricks.squash = 1.0
    bricks.inputs['Scale'].default_value = 1.0
    bricks.inputs['Brick Width'].default_value = SPEC['floor']['slab']
    bricks.inputs['Row Height'].default_value = SPEC['floor']['slab']
    bricks.inputs['Mortar Size'].default_value = 1.2
    bricks.inputs['Mortar Smooth'].default_value = 0.3
    bricks.inputs['Bias'].default_value = 0.0
    bricks.inputs['Color1'].default_value = (*SPEC['floor']['a'], 1)
    bricks.inputs['Color2'].default_value = (*SPEC['floor']['b'], 1)
    bricks.inputs['Mortar'].default_value = (*SPEC['floor']['seam'], 1)
    nt.links.new(v, bricks.inputs['Vector'])
    fine = _noise(nt, v, 0.7, 8, 0.6)
    broad = _noise(nt, v, 0.004, 5, 0.6)
    spots = _noise(nt, v, 0.03, 3, 0.7)
    grit = _ramp(nt, fine.outputs['Fac'], [(0.3, (0.7, 0.7, 0.7)), (0.7, (1, 1, 1))])
    stains = _ramp(nt, broad.outputs['Fac'], [(0.35, (0.72, 0.7, 0.66)), (0.62, (1, 1, 1))])
    oil = _ramp(nt, spots.outputs['Fac'], [(0.66, (1, 1, 1)), (0.78, (0.62, 0.6, 0.58))])
    col = _mix(nt, bricks.outputs['Color'], grit.outputs['Color'], _value(nt, 0.5), 'MULTIPLY')
    col = _mix(nt, col, stains.outputs['Color'], _value(nt, 1.0), 'MULTIPLY')
    col = _mix(nt, col, oil.outputs['Color'], _value(nt, 0.8), 'MULTIPLY')
    nt.links.new(col, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    nt.links.new(bricks.outputs['Fac'], inv.inputs[1])
    h = nt.nodes.new('ShaderNodeMath')
    h.operation = 'MULTIPLY_ADD'
    nt.links.new(fine.outputs['Fac'], h.inputs[0])
    h.inputs[1].default_value = 0.15
    nt.links.new(inv.outputs[0], h.inputs[2])
    _bump(nt, bsdf, h.outputs[0], 0.6)


def _flat(color, rough=0.6, metal=0.0, emit=None):
    def build(mat):
        nt, bsdf = _nodes(mat)
        v = _world_coord(nt)
        fine = _noise(nt, v, 0.8, 6, 0.6)
        grit = _ramp(nt, fine.outputs['Fac'], [(0.3, tuple(c * 0.8 for c in color)), (0.7, color)])
        nt.links.new(grit.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if emit:
            bsdf.inputs['Emission Color'].default_value = (*emit[0], 1)
            bsdf.inputs['Emission Strength'].default_value = emit[1]
        _bump(nt, bsdf, fine.outputs['Fac'], 0.15)
    return build


def _hazard(mat):
    nt, bsdf = _nodes(mat)
    v = _world_coord(nt)
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'DIAGONAL'
    wave.inputs['Scale'].default_value = 0.03
    wave.inputs['Distortion'].default_value = 0.0
    nt.links.new(v, wave.inputs['Vector'])
    sharp = _ramp(nt, wave.outputs['Fac'], [(0.48, (0.9, 0.62, 0.04)), (0.52, (0.05, 0.05, 0.05))])
    sharp.color_ramp.interpolation = 'CONSTANT'
    fine = _noise(nt, v, 0.6, 6, 0.6)
    worn = _ramp(nt, fine.outputs['Fac'], [(0.25, (0.6, 0.6, 0.6)), (0.6, (1, 1, 1))])
    col = _mix(nt, sharp.outputs['Color'], worn.outputs['Color'], _value(nt, 0.6), 'MULTIPLY')
    nt.links.new(col, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.7


def _sandstone(mat):
    nt, bsdf = _nodes(mat)
    v = _world_coord(nt)
    bricks = nt.nodes.new('ShaderNodeTexBrick')
    bricks.inputs['Brick Width'].default_value = 25
    bricks.inputs['Row Height'].default_value = 12.5
    bricks.inputs['Mortar Size'].default_value = 0.6
    bricks.inputs['Color1'].default_value = (0.62, 0.48, 0.34, 1)
    bricks.inputs['Color2'].default_value = (0.7, 0.55, 0.4, 1)
    bricks.inputs['Mortar'].default_value = (0.42, 0.35, 0.28, 1)
    nt.links.new(v, bricks.inputs['Vector'])
    fine = _noise(nt, v, 0.9, 8, 0.65)
    grit = _ramp(nt, fine.outputs['Fac'], [(0.3, (0.75, 0.75, 0.75)), (0.7, (1, 1, 1))])
    col = _mix(nt, bricks.outputs['Color'], grit.outputs['Color'], _value(nt, 0.7), 'MULTIPLY')
    nt.links.new(col, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    _bump(nt, bsdf, fine.outputs['Fac'], 0.3)


def _roof(mat):
    nt, bsdf = _concrete(mat, (0.36, 0.37, 0.38), (0.28, 0.29, 0.3), 1.0, 0.5)


def _leaf(mat):
    nt, bsdf = _nodes(mat)
    v = _world_coord(nt)
    n = _noise(nt, v, 0.25, 4, 0.6)
    col = _ramp(nt, n.outputs['Fac'], [(0.3, (0.05, 0.13, 0.03)), (0.55, (0.13, 0.27, 0.06)), (0.75, (0.3, 0.42, 0.1))])
    rnd = nt.nodes.new('ShaderNodeObjectInfo')
    tint = _ramp(nt, rnd.outputs['Random'], [(0.0, (0.75, 0.8, 0.7)), (1.0, (1.1, 1.05, 0.9))])
    c = _mix(nt, col.outputs['Color'], tint.outputs['Color'], _value(nt, 1.0), 'MULTIPLY')
    nt.links.new(c, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.7
    bsdf.inputs['Subsurface Weight'].default_value = 0.1
    _bump(nt, bsdf, n.outputs['Fac'], 0.8)


def _paint(color):
    def build(mat):
        nt, bsdf = _nodes(mat)
        v = _world_coord(nt)
        n = _noise(nt, v, 0.15, 6, 0.6)
        worn = _ramp(nt, n.outputs['Fac'], [(0.35, (0.0, 0.0, 0.0)), (0.5, (1, 1, 1))])
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        nt.links.new(worn.outputs['Color'], bsdf.inputs['Alpha'])
        bsdf.inputs['Roughness'].default_value = 0.6
        mat.blend_method = 'HASHED'
    return build


def _water_edge(mat):
    nt, bsdf = _nodes(mat)
    bsdf.inputs['Base Color'].default_value = (0.04, 0.12, 0.16, 1)
    bsdf.inputs['Roughness'].default_value = 0.2


MATERIALS = {
    'floor': _floor,
    'concrete': lambda m: _concrete(m, (0.62, 0.62, 0.6), (0.5, 0.5, 0.49)),
    'concrete_dark': lambda m: _concrete(m, (0.44, 0.45, 0.46), (0.35, 0.36, 0.37)),
    'roof': _roof,
    'sandstone': _sandstone,
    'hazard': _hazard,
    'metal': _flat((0.32, 0.34, 0.37), 0.4, 0.8),
    'metal_dark': _flat((0.12, 0.13, 0.14), 0.5, 0.7),
    'metal_light': _flat((0.62, 0.64, 0.66), 0.35, 0.9),
    'rail': _flat((0.85, 0.6, 0.05), 0.45, 0.3),
    'soil': _flat((0.09, 0.065, 0.045), 0.95),
    'leaf': _leaf,
    'paint_yellow': _paint((0.85, 0.6, 0.06)),
    'paint_white': _paint((0.8, 0.8, 0.78)),
    'grate': _flat((0.08, 0.085, 0.09), 0.6, 0.8),
    'terracotta': _flat((0.5, 0.25, 0.16), 0.8),
    'skylight': _flat((0.25, 0.4, 0.5), 0.1, 0.0),
}


# ---------------------------------------------------------------- geometry
# Everything goes into one bmesh per material, sheared vertex by vertex, so a map of thousands of parts stays a few dozen objects.

import bmesh  # noqa: E402
from mathutils import noise  # noqa: E402

_meshes = {}


def _bm(mat):
    if mat not in _meshes:
        _meshes[mat] = bmesh.new()
    return _meshes[mat]


def _commit(part, mat, top, smooth=False):
    """Shears a part built in game-aligned Blender space about `top` and merges it into its material's mesh."""
    bm = _bm(mat)
    shear = shear_matrix(top)
    for v in part.verts:
        v.co = shear @ v.co
    for f in part.faces:
        f.smooth = smooth
    tmp = bpy.data.meshes.new('tmp')
    part.to_mesh(tmp)
    part.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def flush(prefix='geo'):
    """Turns every material's merged mesh into one object."""
    for mat, bm in _meshes.items():
        mesh = bpy.data.meshes.new(f'{prefix}_{mat}')
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(material(mat))
        obj = bpy.data.objects.new(f'{prefix}_{mat}', mesh)
        bpy.context.scene.collection.objects.link(obj)
    _meshes.clear()


def box(name, x, y, w, h, z0, z1, mat, top=None, bevel=0.0):
    """An axis-aligned box over game rect (x, y, w, h) from height z0 to z1, sheared about `top` (its solid's top)."""
    part = bmesh.new()
    bmesh.ops.create_cube(part, size=1.0)
    bmesh.ops.scale(part, vec=(w, h, z1 - z0), verts=part.verts)
    bmesh.ops.translate(part, vec=to_blender(x + w / 2, y + h / 2, (z0 + z1) / 2), verts=part.verts)
    if bevel > 0:
        bmesh.ops.bevel(part, geom=list(part.edges), offset=min(bevel, w / 3, h / 3, (z1 - z0) / 3), segments=2, affect='EDGES', profile=0.5)
    _commit(part, mat, z1 if top is None else top)


def cylinder(name, x, y, r, z0, z1, mat, top=None, verts=20):
    part = bmesh.new()
    bmesh.ops.create_cone(part, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(part, vec=to_blender(x, y, (z0 + z1) / 2), verts=part.verts)
    _commit(part, mat, z1 if top is None else top, smooth=True)


def hcylinder(name, x0, y0, x1, y1, r, z, mat, top):
    """A horizontal pipe from (x0, y0) to (x1, y1) at height z."""
    length = math.hypot(x1 - x0, y1 - y0)
    part = bmesh.new()
    bmesh.ops.create_cone(part, cap_ends=True, segments=12, radius1=r, radius2=r, depth=length)
    rot = Matrix.Rotation(-math.atan2(y1 - y0, x1 - x0), 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    bmesh.ops.transform(part, matrix=rot, verts=part.verts)
    bmesh.ops.translate(part, vec=to_blender((x0 + x1) / 2, (y0 + y1) / 2, z), verts=part.verts)
    _commit(part, mat, top, smooth=True)


def blob(name, x, y, z, r, mat, top, rng):
    """A lumpy leaf clump."""
    part = bmesh.new()
    bmesh.ops.create_icosphere(part, subdivisions=2, radius=r)
    sx, sy, sz = 1 + rng.uniform(-0.2, 0.2), 1 + rng.uniform(-0.2, 0.2), 0.6 + rng.uniform(-0.1, 0.2)
    seed = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))
    for v in part.verts:
        n = noise.noise(v.co * (2.2 / r) + seed)
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) * (1 + 0.3 * n)
    bmesh.ops.translate(part, vec=to_blender(x, y, z), verts=part.verts)
    _commit(part, mat, top, smooth=True)


def plane(name, x, y, w, h, z, mat):
    part = bmesh.new()
    vs = [part.verts.new(to_blender(px, py, z)) for px, py in ((x, y + h), (x + w, y + h), (x + w, y), (x, y))]
    part.faces.new(vs)
    _commit(part, mat, 0)


def ring_paint(name, cx, cy, r, width, z, mat, segments=96):
    """A painted annulus on the floor."""
    part = bmesh.new()
    angles = [i * math.tau / segments for i in range(segments)]
    outer = [part.verts.new(to_blender(cx + math.cos(a) * r, cy + math.sin(a) * r, z)) for a in angles]
    inner = [part.verts.new(to_blender(cx + math.cos(a) * (r - width), cy + math.sin(a) * (r - width), z)) for a in angles]
    for i in range(segments):
        j = (i + 1) % segments
        part.faces.new((outer[i], inner[i], inner[j], outer[j]))
    _commit(part, mat, 0)
