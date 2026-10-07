"""Shared scene rules for every Skirmish bake: units, camera, sun, the oblique shear and the materials.

One Blender unit is one game unit. Game x runs east and game y runs south, so Blender X = x and Blender Y = -y.
Every solid is sheared so its top face lands exactly on its collision rect while its south face shows below it.
Shading reads world position, so two tiles that share an edge agree pixel for pixel.
"""

import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

SPEC = None
TEXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures')


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
    scene.cycles.adaptive_threshold = 0.02
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 30
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

    def image(self, name, vec, box=False, out='Color'):
        n = self.node('ShaderNodeTexImage')
        path = os.path.join(TEXTURES, name)
        img = bpy.data.images.get(name) or bpy.data.images.load(path)
        img.colorspace_settings.name = 'Non-Color'
        n.image = img
        n.interpolation = 'Linear'
        if box:
            n.projection = 'BOX'
            n.projection_blend = 0.25
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

    def normal_map(self, name, vec, strength, box=False):
        nm = self.node('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = strength
        self.link(self.image(name, vec, box), nm.inputs['Color'])
        return nm.outputs['Normal']

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

_cache = {}


def material(name):
    if name not in _cache:
        mat = bpy.data.materials.new(name)
        MATERIALS[name](mat)
        _cache[name] = mat
    return mat


def _slabs(mat, a, b, slab, grime_reach=26):
    """Sun-bleached poured slabs: per-slab tone, photo grain, pits, grime pooling where things meet the floor, sparse cracks and oil."""
    f = SPEC['floor']
    g = G(mat)
    p = g.pos()
    cell = g.vmath('SNAP', p, (slab, slab, 1e6))
    rnd = g.white(cell, 'Color')
    rv = g.white(cell)
    col = g.mix(tuple(a), tuple(b), rv)
    uv = g.vmath('ADD', g.scaled(p, 1 / 230), g.vmath('SCALE', rnd, scale=7.3))
    grain = g.image('floor.jpg', uv)
    col = g.shade(col, g.remap(grain, 0.0, 1.0, 0.66, 1.14))
    broad = g.noise(g.scaled(p, 1.0), 0.0035, 4, 0.55)
    col = g.mix(col, g.shade(col, 0.74), g.remap(broad, 0.42, 0.68, 0.0, 1.0, True))
    # Pits and grit: a few dark specks per square, too small to read as anything but texture.
    pit_cell = g.voronoi(g.scaled(p, 1.0), 0.3, 'F1', 'Distance')
    pit_rand = g.voronoi(g.scaled(p, 1.0), 0.3, 'F1', 'Color')
    pits = g.math('MULTIPLY', g.remap(pit_cell, 0.07, 0.16, 1.0, 0.0), g.math('GREATER_THAN', g.vmath('DOT_PRODUCT', pit_rand, (1, 0, 0)), 0.55))
    col = g.shade(col, g.math('SUBTRACT', 1.0, g.math('MULTIPLY', pits, 0.45)))
    # Grime and dust where walls, curbs and planters meet the floor.
    occl = g.ao(grime_reach, 8)
    grime = g.mix(col, g.rgb(f['grime']), 1.0, 'MULTIPLY')
    dirt_noise = g.noise(g.scaled(p, 1.0), 0.06, 3, 0.6)
    near = g.math('MULTIPLY', g.remap(occl, 0.3, 0.98, 1.0, 0.0), g.remap(dirt_noise, 0.3, 0.7, 0.55, 1.0))
    col = g.mix(col, grime, near)
    # Cracks: one photo crack net, shown only where a slow noise lets it through.
    cracks = g.image('cracks.png', g.vmath('ADD', g.scaled(p, 1 / 520), g.vmath('SCALE', rnd, scale=0.31)))
    mask = g.remap(g.noise(g.scaled(p, 1.0), 0.0045, 2, 0.5), 0.62, 0.68, 0.0, 1.0)
    col = g.shade(col, g.math('SUBTRACT', 1.0, g.math('MULTIPLY', g.math('MULTIPLY', cracks, mask), 0.4)))
    # Oil: sparse soft drips, mostly in a few slabs.
    oilp = g.noise(g.scaled(p, 1.0, offset=(37, 11, 0)), 0.03, 3, 0.62)
    oil_mask = g.math('MULTIPLY', g.remap(oilp, 0.66, 0.74, 0.0, 1.0, True), g.remap(rv, 0.7, 0.9, 0.0, 1.0))
    col = g.mix(col, (0.16, 0.14, 0.12), g.math('MULTIPLY', oil_mask, 0.55))
    # Seams.
    bricks = g.node('ShaderNodeTexBrick')
    bricks.inputs['Scale'].default_value = 1.0
    bricks.offset = 0.0
    bricks.squash = 1.0
    bricks.inputs['Brick Width'].default_value = slab
    bricks.inputs['Row Height'].default_value = slab
    bricks.inputs['Mortar Size'].default_value = 1.4
    bricks.inputs['Mortar Smooth'].default_value = 0.4
    g.link(p, bricks.inputs['Vector'])
    seam = bricks.outputs['Fac']
    col = g.mix(col, tuple(f['seam']), g.math('MULTIPLY', seam, 0.8))
    nrm = g.normal_map('floor_normal.jpg', uv, 0.5)
    nrm = g.bump(g.math('SUBTRACT', 1.0, seam), 0.5, 1.0, nrm)
    g.out(col, 0.88, nrm)


def _precast(light, wear=0.5, grain_scale=1 / 140):
    """Cast concrete for cover: photo detail, chipped lighter edges on the bevels, grime rising from the foot, rain streaks on faces."""
    def build(mat):
        g = G(mat)
        p = g.pos()
        n = g.geo('Normal')
        col = g.rgb(light)
        det = g.image('wall.jpg', g.scaled(p, grain_scale), box=True)
        col = g.shade(col, g.remap(det, 0.0, 1.0, 0.82, 1.06))
        mott = g.noise(g.scaled(p, 1.0), 0.05, 4, 0.6)
        col = g.shade(col, g.remap(mott, 0.3, 0.7, 0.88, 1.04))
        # Bevel faces lean off-axis: chip them lighter in patches.
        sep = g.node('ShaderNodeSeparateXYZ')
        g.link(n, sep.inputs['Vector'])
        ax = g.math('MAXIMUM', g.math('ABSOLUTE', sep.outputs['X']), g.math('MAXIMUM', g.math('ABSOLUTE', sep.outputs['Y']), g.math('ABSOLUTE', sep.outputs['Z'])))
        edge = g.remap(ax, 0.97, 0.8, 0.0, 1.0)
        chip = g.remap(g.noise(g.scaled(p, 1.0), 0.35, 3, 0.6), 0.45, 0.6, 0.0, 1.0)
        col = g.mix(col, g.shade(col, 1.18), g.math('MULTIPLY', edge, 0.8))
        col = g.mix(col, g.shade(col, 0.55), g.math('MULTIPLY', g.math('MULTIPLY', edge, chip), wear))
        # Vertical faces: streaks and grime toward the foot. Height is world z, which the shear leaves alone.
        side = g.math('SUBTRACT', 1.0, g.math('ABSOLUTE', sep.outputs['Z']))
        streak = g.noise(g.scaled(p, 0.6, 0.6, 0.04), 1.0, 3, 0.5)
        col = g.mix(col, g.shade(col, 0.78), g.math('MULTIPLY', side, g.remap(streak, 0.5, 0.7, 0.0, 0.7)))
        sepp = g.node('ShaderNodeSeparateXYZ')
        g.link(p, sepp.inputs['Vector'])
        foot = g.remap(sepp.outputs['Z'], 0.0, 14.0, 0.62, 1.0, True)
        col = g.shade(col, foot)
        nrm = g.normal_map('wall_normal.jpg', g.scaled(p, grain_scale), 0.6, box=True)
        g.out(col, 0.85, nrm)
    return build


def _blocks(light, dark, course=12.5, block=25):
    """Dressed stone in courses, each block its own tone, joints recessed."""
    def build(mat):
        g = G(mat)
        p = g.pos()
        sep = g.node('ShaderNodeSeparateXYZ')
        g.link(p, sep.inputs['Vector'])
        # Blocks run in x along courses of height z on vertical faces, and in x/y on tops.
        comb = g.node('ShaderNodeCombineXYZ')
        g.link(sep.outputs['X'], comb.inputs['X'])
        n = g.geo('Normal')
        sn = g.node('ShaderNodeSeparateXYZ')
        g.link(n, sn.inputs['Vector'])
        up = g.math('GREATER_THAN', g.math('ABSOLUTE', sn.outputs['Z']), 0.5)
        g.link(g.math('ADD', g.math('MULTIPLY', up, sep.outputs['Y']), g.math('MULTIPLY', g.math('SUBTRACT', 1.0, up), sep.outputs['Z'])), comb.inputs['Y'])
        bricks = g.node('ShaderNodeTexBrick')
        bricks.inputs['Scale'].default_value = 1.0
        bricks.inputs['Brick Width'].default_value = block
        bricks.inputs['Row Height'].default_value = course
        bricks.inputs['Mortar Size'].default_value = 0.7
        bricks.inputs['Mortar Smooth'].default_value = 0.4
        bricks.inputs['Color1'].default_value = (*dark, 1)
        bricks.inputs['Color2'].default_value = (*light, 1)
        bricks.inputs['Mortar'].default_value = (*[c * 0.55 for c in dark], 1)
        g.link(comb.outputs['Vector'], bricks.inputs['Vector'])
        col = bricks.outputs['Color']
        det = g.image('wall.jpg', g.scaled(p, 1 / 90), box=True)
        col = g.shade(col, g.remap(det, 0.0, 1.0, 0.8, 1.08))
        foot = g.remap(sep.outputs['Z'], 0.0, 12.0, 0.65, 1.0, True)
        col = g.shade(col, foot)
        nrm = g.bump(g.math('SUBTRACT', 1.0, bricks.outputs['Fac']), 0.6, 1.0, g.normal_map('wall_normal.jpg', g.scaled(p, 1 / 90), 0.5, box=True))
        g.out(col, 0.9, nrm)
    return build


def _metal(color, rough=0.45, metal=0.6, dirt=0.25):
    def build(mat):
        g = G(mat)
        p = g.pos()
        n = g.noise(g.scaled(p, 1.0), 0.25, 5, 0.6)
        col = g.shade(g.rgb(color), g.remap(n, 0.3, 0.7, 1.0 - dirt, 1.0))
        g.out(col, rough, g.bump(n, 0.08), metal)
    return build


def _grille(mat):
    """The dark well behind a fan's bars."""
    g = G(mat)
    g.out(g.rgb((0.035, 0.037, 0.04)), 0.6, None, 0.4)


def _slats(mat):
    """Bar grating: dark metal with parallel slots that read at a glance."""
    g = G(mat)
    p = g.pos()
    sep = g.node('ShaderNodeSeparateXYZ')
    g.link(p, sep.inputs['Vector'])
    wave = g.math('FRACT', g.math('MULTIPLY', sep.outputs['X'], 1 / 3.2))
    slot = g.math('GREATER_THAN', wave, 0.45)
    col = g.mix((0.2, 0.205, 0.21), (0.012, 0.012, 0.014), slot)
    g.out(col, 0.55, g.bump(g.math('SUBTRACT', 1.0, slot), 0.6), 0.6)


def _hazard(mat):
    g = G(mat)
    p = g.pos()
    wave = g.node('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'DIAGONAL'
    wave.inputs['Scale'].default_value = 0.035
    wave.inputs['Distortion'].default_value = 0.0
    g.link(p, wave.inputs['Vector'])
    col = g.ramp(wave.outputs['Fac'], [(0.5, (0.78, 0.52, 0.05)), (0.5001, (0.04, 0.04, 0.04))], constant=True)
    worn = g.noise(g.scaled(p, 1.0), 0.4, 6, 0.65)
    col = g.mix(col, g.rgb((0.42, 0.41, 0.39)), g.remap(worn, 0.62, 0.72, 0.0, 0.8))
    g.out(col, 0.65, g.bump(worn, 0.15))


def _leaf(mat):
    """Shrubs: leaf clusters from voronoi cells, tone varying per clump, bright new growth on top."""
    g = G(mat)
    p = g.pos()
    clump = g.white(g.vmath('SNAP', p, (9, 9, 9)))
    cells = g.voronoi(g.scaled(p, 1.0), 0.32, 'F1', 'Distance')
    cellc = g.voronoi(g.scaled(p, 1.0), 0.32, 'F1', 'Color')
    sepc = g.node('ShaderNodeSeparateColor')
    g.link(cellc, sepc.inputs['Color'])
    leafv = sepc.outputs['Red']
    base = g.ramp(g.math('ADD', g.math('MULTIPLY', clump, 0.6), g.math('MULTIPLY', leafv, 0.4)),
                  [(0.0, (0.03, 0.075, 0.015)), (0.4, (0.07, 0.16, 0.025)), (0.75, (0.16, 0.28, 0.04)), (1.0, (0.3, 0.38, 0.06))])
    nz = g.node('ShaderNodeSeparateXYZ')
    g.link(g.geo('Normal'), nz.inputs['Vector'])
    top = g.remap(nz.outputs['Z'], 0.4, 1.0, 0.0, 0.5)
    col = g.mix(base, g.rgb((0.42, 0.5, 0.1)), g.math('MULTIPLY', top, leafv))
    col = g.shade(col, g.remap(cells, 0.0, 0.6, 1.05, 0.55))
    col = g.shade(col, g.remap(g.ao(6, 6), 0.2, 1.0, 0.35, 1.0))
    mat.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value = 0.0
    g.out(col, 0.65, g.bump(g.math('SUBTRACT', 1.0, cells), 1.2, 1.0))


def _soil(mat):
    g = G(mat)
    p = g.pos()
    n = g.noise(g.scaled(p, 1.0), 0.6, 6, 0.7)
    col = g.shade(g.rgb((0.06, 0.045, 0.032)), g.remap(n, 0.3, 0.7, 0.6, 1.2))
    g.out(col, 0.95, g.bump(n, 0.6))


def _paint(color, wear=0.5):
    """Floor paint faded by sun and traffic: patchy coverage, floor grain showing through."""
    def build(mat):
        g = G(mat)
        p = g.pos()
        n = g.noise(g.scaled(p, 1.0), 0.12, 6, 0.65)
        fine = g.image('floor.jpg', g.scaled(p, 1 / 90))
        a = g.math('MULTIPLY', g.remap(n, 0.3 * wear, 0.3 * wear + 0.25, 0.0, 0.9), g.remap(fine, 0.15, 0.55, 0.0, 1.0))
        g.out(g.rgb(color), 0.7, None, 0.0, a)
    return build


def _rubber(mat):
    """Tyre marks and scuffs: dark, soft-edged, broken up."""
    g = G(mat)
    p = g.pos()
    n = g.noise(g.scaled(p, 1.0), 0.18, 5, 0.6)
    a = g.remap(n, 0.38, 0.62, 0.0, 0.42)
    g.out(g.rgb((0.035, 0.032, 0.03)), 0.9, None, 0.0, a)


def _glass(mat):
    g = G(mat)
    p = g.pos()
    sep = g.node('ShaderNodeSeparateXYZ')
    g.link(p, sep.inputs['Vector'])
    bars = g.math('GREATER_THAN', g.math('FRACT', g.math('MULTIPLY', sep.outputs['X'], 1 / 12)), 0.92)
    col = g.mix((0.18, 0.26, 0.3), (0.2, 0.2, 0.21), bars)
    g.out(col, 0.12, None, 0.2)


MATERIALS = {
    'floor': lambda m: _slabs(m, SPEC['floor']['a'], SPEC['floor']['b'], SPEC['floor']['slab']),
    'quay': lambda m: _slabs(m, SPEC['floor']['quay'], SPEC['floor']['quay'], 40),
    'roof': lambda m: _slabs(m, (0.17, 0.172, 0.175), (0.2, 0.2, 0.205), 80, 14),
    'concrete': _precast((0.58, 0.57, 0.545)),
    'concrete_cap': _precast((0.66, 0.65, 0.62), wear=0.7),
    'concrete_dark': _precast((0.36, 0.36, 0.355), wear=0.3),
    'building': _precast((0.3, 0.305, 0.31), wear=0.3, grain_scale=1 / 200),
    'sandstone': _blocks((0.62, 0.5, 0.36), (0.52, 0.41, 0.29)),
    'sandstone_cap': _precast((0.7, 0.6, 0.46), wear=0.6),
    'hazard': _hazard,
    'metal': _metal((0.3, 0.31, 0.32)),
    'metal_dark': _metal((0.09, 0.095, 0.1), 0.5, 0.5),
    'metal_light': _metal((0.55, 0.56, 0.56), 0.4, 0.5, 0.15),
    'rail': _metal((0.78, 0.55, 0.06), 0.45, 0.2, 0.2),
    'grille': _grille,
    'slats': _slats,
    'soil': _soil,
    'leaf': _leaf,
    'paint_yellow': _paint((0.74, 0.56, 0.12)),
    'paint_white': _paint((0.72, 0.71, 0.68), 0.6),
    'rubber': _rubber,
    'skylight': _glass,
}


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
    """Turns every material's merged mesh into one object."""
    for mat, bm in _meshes.items():
        mesh = bpy.data.meshes.new(f'{prefix}_{mat}')
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(material(mat))
        obj = bpy.data.objects.new(f'{prefix}_{mat}', mesh)
        bpy.context.scene.collection.objects.link(obj)
    _meshes.clear()


def box(x, y, w, h, z0, z1, mat, top=None, bevel=0.0, segments=2):
    """An axis-aligned box over game rect (x, y, w, h) from height z0 to z1, sheared about `top` (its solid's top)."""
    part = bmesh.new()
    bmesh.ops.create_cube(part, size=1.0)
    bmesh.ops.scale(part, vec=(w, h, z1 - z0), verts=part.verts)
    bmesh.ops.translate(part, vec=to_blender(x + w / 2, y + h / 2, (z0 + z1) / 2), verts=part.verts)
    if bevel > 0:
        bmesh.ops.bevel(part, geom=list(part.edges), offset=min(bevel, w / 3, h / 3, (z1 - z0) / 3), segments=segments, affect='EDGES', profile=0.5)
    _commit(part, mat, z1 if top is None else top)


def cylinder(x, y, r, z0, z1, mat, top=None, verts=20):
    part = bmesh.new()
    bmesh.ops.create_cone(part, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(part, vec=to_blender(x, y, (z0 + z1) / 2), verts=part.verts)
    _commit(part, mat, z1 if top is None else top, smooth=lambda f: abs(f.normal.z) < 0.5)


def hcylinder(x0, y0, x1, y1, r, z, mat, top, verts=12):
    """A horizontal pipe from (x0, y0) to (x1, y1) at height z."""
    length = math.hypot(x1 - x0, y1 - y0)
    part = bmesh.new()
    bmesh.ops.create_cone(part, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=length)
    rot = Matrix.Rotation(-math.atan2(y1 - y0, x1 - x0), 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    bmesh.ops.transform(part, matrix=rot, verts=part.verts)
    bmesh.ops.translate(part, vec=to_blender((x0 + x1) / 2, (y0 + y1) / 2, z), verts=part.verts)
    _commit(part, mat, top, smooth=True)


def blob(x, y, z, r, mat, top, rng, flat=0.6):
    """A lumpy leaf clump."""
    part = bmesh.new()
    bmesh.ops.create_icosphere(part, subdivisions=2, radius=r)
    sx, sy, sz = 1 + rng.uniform(-0.2, 0.2), 1 + rng.uniform(-0.2, 0.2), flat + rng.uniform(-0.1, 0.2)
    seed = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))
    for v in part.verts:
        n = noise.noise(v.co * (2.2 / r) + seed)
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) * (1 + 0.35 * n)
    bmesh.ops.translate(part, vec=to_blender(x, y, z), verts=part.verts)
    _commit(part, mat, top, smooth=True)


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
        if f.normal.z < 0:
            f.normal_flip()
    _commit(part, mat, 0)


def ring_paint(cx, cy, r, width, z, mat, segments=96):
    """A painted annulus on the floor."""
    part = bmesh.new()
    angles = [i * math.tau / segments for i in range(segments)]
    outer = [part.verts.new(to_blender(cx + math.cos(a) * r, cy + math.sin(a) * r, z)) for a in angles]
    inner = [part.verts.new(to_blender(cx + math.cos(a) * (r - width), cy + math.sin(a) * (r - width), z)) for a in angles]
    for i in range(segments):
        j = (i + 1) % segments
        f = part.faces.new((outer[i], inner[i], inner[j], outer[j]))
        if f.normal.z < 0:
            f.normal_flip()
    _commit(part, mat, 0)
