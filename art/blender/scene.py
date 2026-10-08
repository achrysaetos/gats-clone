"""Shared scene rules for the map light-layer bake: units, camera, sun, the oblique shear and the floor materials.

One Blender unit is one game unit. Game x runs east and game y runs south, so Blender X = x and Blender Y = -y.
Every caster is sheared about its piece's top, the way the kit sprites are, so its shadow starts at the sprite's drawn foot.
Shading reads world position, so a layer cut into tiles would meet without seams.
"""

import json
import math

import bmesh
import bpy

from device import use_device
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
    use_device(scene)
    scene.cycles.samples = SPEC['light']['samples']
    scene.cycles.seed = 1
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.denoising_prefilter = 'ACCURATE'
    scene.cycles.max_bounces = 3
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 1
    scene.cycles.transparent_max_bounces = 4
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.filter_width = 1.5
    scene.cycles.adaptive_threshold = 0.02
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 30
    scene.view_settings.view_transform = SPEC['render']['view']
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


def add_sun(mood):
    """The sun and sky, scaled and tinted by the map's `mood` (day or dusk)."""
    sun = SPEC['sun']
    data = bpy.data.lights.new('sun', 'SUN')
    data.energy = sun['strength'] * mood['sun']
    data.angle = math.radians(sun['softness'])
    data.color = mood.get('sun_color', sun['color'])
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
    bg.inputs['Color'].default_value = (*mood.get('sky_color', SPEC['sky']['color']), 1)
    bg.inputs['Strength'].default_value = SPEC['sky']['strength'] * mood['sky']
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


# ---------------------------------------------------------------- shader graph helpers
# Each helper takes and returns sockets, so a material reads as the arithmetic it does.

class G:
    def __init__(self, mat):
        mat.use_nodes = True
        self.mat = mat
        self.nt = mat.node_tree
        for n in list(self.nt.nodes):
            self.nt.nodes.remove(n)
        out = self.node('ShaderNodeOutputMaterial')
        self.bsdf = self.node('ShaderNodeBsdfPrincipled')
        self.link(self.bsdf.outputs['BSDF'], out.inputs['Surface'])
        self._pos = None

    def node(self, kind):
        return self.nt.nodes.new(kind)

    def link(self, a, b):
        self.nt.links.new(a, b)

    def _in(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.link(v, sock)
        else:
            sock.default_value = v

    def pos(self):
        if self._pos is None:
            self._pos = self.node('ShaderNodeNewGeometry')
        return self._pos.outputs['Position']

    def geo(self, name):
        self.pos()
        return self._pos.outputs[name]

    def scaled(self, vec, sx, sy=None, sz=None, offset=(0, 0, 0)):
        m = self.node('ShaderNodeMapping')
        m.inputs['Scale'].default_value = (sx, sx if sy is None else sy, sx if sz is None else sz)
        self._in(m.inputs['Location'], offset)
        self.link(vec, m.inputs['Vector'])
        return m.outputs['Vector']

    def vmath(self, op, a, b=None, scale=None):
        n = self.node('ShaderNodeVectorMath')
        n.operation = op
        self._in(n.inputs[0], a)
        if b is not None:
            self._in(n.inputs[1], b)
        if scale is not None:
            self._in(n.inputs['Scale'], scale)
        return n.outputs['Value'] if op in ('LENGTH', 'DOT_PRODUCT', 'DISTANCE') else n.outputs['Vector']

    def math(self, op, a, b=0.0, c=None, clamp=False):
        n = self.node('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        self._in(n.inputs[0], a)
        self._in(n.inputs[1], b)
        if c is not None:
            self._in(n.inputs[2], c)
        return n.outputs[0]

    def remap(self, v, a, b, lo=0.0, hi=1.0, smooth=False):
        n = self.node('ShaderNodeMapRange')
        if smooth:
            n.interpolation_type = 'SMOOTHSTEP'
        self._in(n.inputs['Value'], v)
        n.inputs['From Min'].default_value = a
        n.inputs['From Max'].default_value = b
        n.inputs['To Min'].default_value = lo
        n.inputs['To Max'].default_value = hi
        return n.outputs['Result']

    def noise(self, vec, scale, detail=4.0, rough=0.55, out='Fac'):
        n = self.node('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        self.link(vec, n.inputs['Vector'])
        return n.outputs[out]

    def voronoi(self, vec, scale, feature='F1', out='Distance', rand=1.0):
        n = self.node('ShaderNodeTexVoronoi')
        n.feature = feature
        n.inputs['Scale'].default_value = scale
        n.inputs['Randomness'].default_value = rand
        self.link(vec, n.inputs['Vector'])
        return n.outputs[out]

    def white(self, vec, out='Value'):
        n = self.node('ShaderNodeTexWhiteNoise')
        n.noise_dimensions = '3D'
        self.link(vec, n.inputs['Vector'])
        return n.outputs[out]

    def rgb(self, c):
        n = self.node('ShaderNodeRGB')
        n.outputs[0].default_value = (*c, 1)
        return n.outputs[0]

    def mix(self, a, b, fac, blend='MIX'):
        m = self.node('ShaderNodeMix')
        m.data_type = 'RGBA'
        m.blend_type = blend
        self._in(m.inputs[0], fac)
        self._in(m.inputs[6], (*a, 1) if isinstance(a, tuple) else a)
        self._in(m.inputs[7], (*b, 1) if isinstance(b, tuple) else b)
        return m.outputs[2]

    def shade(self, col, fac):
        """Multiplies `col` by `fac` (a float socket or number)."""
        m = self.node('ShaderNodeMix')
        m.data_type = 'RGBA'
        m.blend_type = 'MULTIPLY'
        m.inputs[0].default_value = 1.0
        self._in(m.inputs[6], col)
        c = self.node('ShaderNodeCombineColor')
        for i in range(3):
            self._in(c.inputs[i], fac)
        self.link(c.outputs[0], m.inputs[7])
        return m.outputs[2]

    def ramp(self, fac, stops, constant=False):
        r = self.node('ShaderNodeValToRGB')
        if constant:
            r.color_ramp.interpolation = 'CONSTANT'
        els = r.color_ramp.elements
        els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
        els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
        for p, c in stops[1:-1]:
            e = els.new(p)
            e.color = (*c, 1)
        self._in(r.inputs['Fac'], fac)
        return r.outputs['Color']

    def ao(self, distance, samples=8):
        n = self.node('ShaderNodeAmbientOcclusion')
        n.samples = samples
        n.inputs['Distance'].default_value = distance
        return n.outputs['AO']

    def bump(self, height, strength, distance=1.0, normal=None):
        b = self.node('ShaderNodeBump')
        b.inputs['Strength'].default_value = strength
        b.inputs['Distance'].default_value = distance
        self.link(height, b.inputs['Height'])
        if normal is not None:
            self.link(normal, b.inputs['Normal'])
        return b.outputs['Normal']

    def out(self, color, rough=0.8, normal=None, metal=0.0, alpha=None):
        self._in(self.bsdf.inputs['Base Color'], color)
        self._in(self.bsdf.inputs['Roughness'], rough)
        self.bsdf.inputs['Metallic'].default_value = metal
        if normal is not None:
            self.link(normal, self.bsdf.inputs['Normal'])
        if alpha is not None:
            self._in(self.bsdf.inputs['Alpha'], alpha)
            self.mat.blend_method = 'HASHED'


# ---------------------------------------------------------------- materials
# The light layer is about 0.5 px per game unit, so every material here is low-frequency: tone, stains, grime and paint.
# Grain, joints and hairline cracks belong to the tiling floor detail the client multiplies over it.

_cache = {}


def material(name):
    if name not in _cache:
        mat = bpy.data.materials.new(name)
        MATERIALS[name](mat)
        _cache[name] = mat
    return _cache[name]


def _floor(a, b, slab, grime_reach=30):
    """Poured slabs: a tone per slab, broad mottling, oil in a few slabs, and grime pooling where things meet the floor."""
    def build(mat):
        f = SPEC['floor']
        g = G(mat)
        p = g.pos()
        cell = g.vmath('SNAP', p, (slab, slab, 1e6))
        rv = g.white(cell)
        col = g.mix(tuple(a), tuple(b), rv)
        broad = g.noise(g.scaled(p, 1.0), 0.0035, 4, 0.55)
        col = g.mix(col, g.shade(col, 0.78), g.remap(broad, 0.42, 0.68, 0.0, 1.0, True))
        stain = g.noise(g.scaled(p, 1.0, offset=(91, 7, 0)), 0.012, 5, 0.6)
        col = g.mix(col, g.shade(col, 0.82), g.remap(stain, 0.55, 0.7, 0.0, 0.8, True))
        occl = g.ao(grime_reach, 8)
        grime = g.mix(col, g.rgb(f['grime']), 1.0, 'MULTIPLY')
        dirt = g.noise(g.scaled(p, 1.0), 0.06, 3, 0.6)
        col = g.mix(col, grime, g.math('MULTIPLY', g.remap(occl, 0.45, 0.95, 1.0, 0.0), g.remap(dirt, 0.3, 0.7, 0.6, 1.0)))
        oilp = g.noise(g.scaled(p, 1.0, offset=(37, 11, 0)), 0.03, 3, 0.62)
        oil = g.math('MULTIPLY', g.remap(oilp, 0.66, 0.74, 0.0, 1.0, True), g.remap(rv, 0.6, 0.9, 0.0, 1.0))
        col = g.mix(col, (0.12, 0.105, 0.09), g.math('MULTIPLY', oil, 0.6))
        g.out(col, 0.9)
    return build


def _paint(color, wear=0.5):
    """Floor paint faded by sun and traffic: patchy coverage that lets the floor through."""
    def build(mat):
        g = G(mat)
        p = g.pos()
        n = g.noise(g.scaled(p, 1.0), 0.05, 6, 0.65)
        g.out(g.rgb(color), 0.7, None, 0.0, g.remap(n, 0.3 * wear, 0.3 * wear + 0.3, 0.25, 0.92))
    return build


def _hazard(mat):
    """Diagonal yellow and black bands about 14 units wide, worn the way floor paint wears."""
    g = G(mat)
    p = g.pos()
    wave = g.node('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'DIAGONAL'
    wave.inputs['Scale'].default_value = 0.025
    wave.inputs['Distortion'].default_value = 0.0
    g.link(p, wave.inputs['Vector'])
    col = g.ramp(wave.outputs['Fac'], [(0.5, (0.72, 0.48, 0.05)), (0.5001, (0.03, 0.03, 0.03))], constant=True)
    n = g.noise(g.scaled(p, 1.0), 0.05, 6, 0.65)
    g.out(col, 0.7, None, 0.0, g.remap(n, 0.2, 0.5, 0.35, 0.95))


def _smudge(color, peak):
    """A soft-edged dark patch: tyre marks, the grime that seats a grate, the dust round a rubble pile."""
    def build(mat):
        g = G(mat)
        p = g.pos()
        n = g.noise(g.scaled(p, 1.0), 0.12, 5, 0.6)
        g.out(g.rgb(color), 0.9, None, 0.0, g.remap(n, 0.35, 0.65, 0.0, peak))
    return build


def _caster(mat):
    """What stands in for a piece: seen by the sun, the sky and the lamps, never by the camera."""
    g = G(mat)
    g.out(g.rgb((0.3, 0.3, 0.3)), 0.9)


MATERIALS = {
    'floor': lambda m: _floor(SPEC['floor']['a'], SPEC['floor']['b'], SPEC['floor']['slab'])(m),
    'asphalt': lambda m: _floor(SPEC['floor']['asphalt'], [c * 1.12 for c in SPEC['floor']['asphalt']], 360, 24)(m),
    'quay': lambda m: _floor(SPEC['floor']['quay'], SPEC['floor']['quay'], 40, 26)(m),
    'paint_yellow': _paint((0.62, 0.45, 0.08)),
    'paint_white': _paint((0.72, 0.71, 0.68), 0.6),
    'hazard': _hazard,
    'rubber': _smudge((0.035, 0.032, 0.03), 0.4),
    'grime': _smudge((0.05, 0.045, 0.04), 0.7),
    'dust': _smudge((0.55, 0.53, 0.49), 0.5),
    'caster': _caster,
}

# Materials painted onto the floor: they take light and shadow but cast none.
DECALS = ('paint_yellow', 'paint_white', 'hazard', 'rubber', 'grime', 'dust')


# ---------------------------------------------------------------- geometry
# Everything goes into one bmesh per material, sheared vertex by vertex, so a map of thousands of parts stays a few dozen objects.

_meshes = {}


def _commit(part, mat, top, smooth=False):
    """Shears a part built in game-aligned Blender space about `top` and merges it into its material's mesh."""
    shear = shear_matrix(top)
    for v in part.verts:
        v.co = shear @ v.co
    for f in part.faces:
        f.smooth = smooth(f) if callable(smooth) else smooth
    tmp = bpy.data.meshes.new('tmp')
    part.to_mesh(tmp)
    part.free()
    _meshes.setdefault(mat, bmesh.new()).from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def flush(prefix='geo'):
    """Turns every material's merged mesh into one object; casters stay out of the camera and decals cast nothing."""
    for mat, bm in _meshes.items():
        mesh = bpy.data.meshes.new(f'{prefix}_{mat}')
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(material(mat))
        obj = bpy.data.objects.new(f'{prefix}_{mat}', mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.visible_camera = mat != 'caster'
        obj.visible_shadow = mat not in DECALS
    _meshes.clear()


def box(x, y, w, h, z0, z1, mat, top=None):
    """An axis-aligned box over game rect (x, y, w, h) from height z0 to z1, sheared about `top` (its piece's top)."""
    part = bmesh.new()
    bmesh.ops.create_cube(part, size=1.0)
    bmesh.ops.scale(part, vec=(w, h, z1 - z0), verts=part.verts)
    bmesh.ops.translate(part, vec=to_blender(x + w / 2, y + h / 2, (z0 + z1) / 2), verts=part.verts)
    _commit(part, mat, z1 if top is None else top)


def cylinder(x, y, r, z0, z1, mat, top=None, verts=20):
    part = bmesh.new()
    bmesh.ops.create_cone(part, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(part, vec=to_blender(x, y, (z0 + z1) / 2), verts=part.verts)
    _commit(part, mat, z1 if top is None else top, smooth=lambda f: abs(f.normal.z) < 0.5)


def poly(points, z, mat):
    """A flat floor decal through game-space points, listed clockwise on screen."""
    part = bmesh.new()
    part.faces.new([part.verts.new(to_blender(px, py, z)) for px, py in reversed(points)])
    _commit(part, mat, 0)


def plane(x, y, w, h, z, mat):
    poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], z, mat)


def strip(points, width, z, mat):
    """A flat band of `width` along a game-space polyline."""
    part = bmesh.new()
    left, right = [], []
    for i, (px, py) in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1
        nx, ny = -dy / d * width / 2, dx / d * width / 2
        left.append(part.verts.new(to_blender(px + nx, py + ny, z)))
        right.append(part.verts.new(to_blender(px - nx, py - ny, z)))
    for i in range(len(points) - 1):
        f = part.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    _commit(part, mat, 0)
