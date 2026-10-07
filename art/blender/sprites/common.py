"""Scene, geometry, materials and layer rendering every sprite bake shares.

One Blender unit is one game unit. Game x runs east and game y runs south, so Blender X = x and Blender Y = -y.
A model is built facing east (+X) around its origin; the bake turns and shears its root per facing.
"""

import math
import random
import struct
import zlib

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROLES = ('solid', 'team', 'armorLight', 'armorMedium', 'armorHeavy')
ARMOR = ('armorLight', 'armorMedium', 'armorHeavy')


def rng(*keys):
    """A generator seeded from stable values (never Python's salted hash())."""
    return random.Random(zlib.crc32('|'.join(str(k) for k in keys).encode()))


def srgb(hexcolor):
    h = hexcolor.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mixc(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scalec(a, k):
    return tuple(x * k for x in a)


# ---------------------------------------------------------------- scene

class Model:
    """How a built model is baked: the height the shear keeps in place (None = flat), overhead light for sprites the
    painter rotates, a soft contact shadow in the base layer, and an optional hook run before each layer renders."""

    def __init__(self, z_ref=None, overhead=False, contact=False, samples=None, on_layer=None, outline=None, soften=0.0):
        self.soften = soften
        self.outline = outline
        self.z_ref = z_ref
        self.overhead = overhead
        self.contact = contact
        self.samples = samples
        self.on_layer = on_layer


def reset(spec, samples=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples or spec['render']['samples']
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.volume_bounces = 0
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.seed = 0
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.use_persistent_data = True
    scene.render.threads_mode = 'AUTO'
    _cache.clear()
    return scene


def look(scene, spec, mode):
    """`lit` is the map's grade; `raw` keeps emitted colors as they are, for glow layers."""
    if mode == 'raw':
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0
    else:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = spec['render']['look']
        scene.view_settings.exposure = spec['render']['exposure']


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def sun_direction(spec, overhead):
    """Where sunlight travels, in Blender axes. `overhead` lights rotated sprites from straight above."""
    if overhead:
        return Vector((0.0, 0.0, -1.0))
    sun = spec['sun']
    elev = math.radians(sun['elevation'])
    dx, dy = sun['shadow']
    n = math.hypot(dx, dy)
    return Vector((dx / n * math.cos(elev), -dy / n * math.cos(elev), -math.sin(elev)))


def add_lights(spec, overhead):
    sun = spec['sun']
    data = bpy.data.lights.new('sun', 'SUN')
    # overhead light gives a flat top the same light the real sun gives it, so rotated sprites match the map
    data.energy = sun['strength'] * (math.sin(math.radians(sun['elevation'])) * 1.2 if overhead else 1.0)
    data.angle = math.radians(sun['softness'] if not overhead else 6.0)
    data.color = sun['color']
    obj = link(bpy.data.objects.new('sun', data))
    d = sun_direction(spec, overhead)
    if overhead:
        d = Vector((-0.12, 0.12, -1)).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    contact = bpy.data.lights.new('contact', 'SUN')
    contact.energy = sun['strength'] * 0.6
    contact.angle = math.radians(25)
    cobj = link(bpy.data.objects.new('contact', contact))
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*spec['sky']['color'], 1)
    bg.inputs['Strength'].default_value = spec['sky']['strength']
    bpy.context.scene.world = world
    return obj, cobj, bg


def add_camera(box, px):
    """An orthographic camera straight down whose image is round(w*px) x round(h*px), anchored on the box's top-left."""
    w, h = round(box['w'] * px), round(box['h'] * px)
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = max(w, h) / px
    cam.clip_start = 1
    cam.clip_end = 4000
    cam.sensor_fit = 'AUTO'
    obj = link(bpy.data.objects.new('cam', cam))
    cx = box['x'] + w / px / 2
    cy = box['y'] + h / px / 2
    obj.location = (cx, -cy, 1000)
    scene = bpy.context.scene
    scene.camera = obj
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    return w, h


def ground(box, coll):
    """A shadow catcher under the whole frame."""
    me = bpy.data.meshes.new('ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new('ground', me), coll)
    obj.scale = (box['w'] * 2 + 400, box['h'] * 2 + 400, 1)
    obj.location = (box['x'] + box['w'] / 2, -(box['y'] + box['h'] / 2), 0)
    obj.is_shadow_catcher = True
    return obj


def frame_matrix(angle, z_ref, shear):
    """Turns the model to face `angle` (clockwise from east on screen), then shears height north so z_ref stays put."""
    rot = Matrix.Rotation(-angle, 4, 'Z')
    if z_ref is None:
        return rot
    k = shear
    sh = Matrix(((1, 0, 0, 0), (0, 1, k, -k * z_ref), (0, 0, 1, 0), (0, 0, 0, 1)))
    return sh @ rot


# ---------------------------------------------------------------- materials

_cache = {}


def _principled(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat, nt, bsdf


def _noise(nt, scale, detail=5, rough=0.6, coord='Object'):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(tc.outputs[coord], n.inputs['Vector'])
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


def _multiply(nt, col, fac_socket):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = 'MULTIPLY'
    m.inputs[0].default_value = 1.0
    nt.links.new(col, m.inputs[6])
    nt.links.new(fac_socket, m.inputs[7])
    return m.outputs[2]


def shade(nt, col, ink=0.0, ao=0.0, ao_dist=3.0):
    """Darkens silhouette edges (an inked look that reads at small sizes) and crevices."""
    if ink > 0:
        lw = nt.nodes.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.5
        r = _ramp(nt, lw.outputs['Facing'], [(0.45, (1, 1, 1)), (0.95, (1 - ink,) * 3)])
        col = _multiply(nt, col, r.outputs['Color'])
    if ao > 0:
        a = nt.nodes.new('ShaderNodeAmbientOcclusion')
        a.inputs['Distance'].default_value = ao_dist
        a.samples = 8
        r = _ramp(nt, a.outputs['AO'], [(0.0, (1 - ao,) * 3), (1.0, (1, 1, 1))])
        col = _multiply(nt, col, r.outputs['Color'])
    return col


def mat(name, color, rough=0.6, metal=0.0, grime=0.25, grime_scale=0.35, emit=None, strength=0.0, coat=0.0, bump=0.0, ink=0.0, ao=0.0):
    """A Principled material: `grime` darkens it in noisy patches, `emit` makes it glow (shown in glow layers),
    `ink` darkens its silhouette edges and `ao` its crevices."""
    if name in _cache:
        return _cache[name]
    m, nt, bsdf = _principled(name)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
    rgb = nt.nodes.new('ShaderNodeRGB')
    rgb.outputs[0].default_value = (*color, 1)
    col = rgb.outputs[0]
    if grime > 0:
        n = _noise(nt, grime_scale, 6, 0.6)
        r = _ramp(nt, n.outputs['Fac'], [(0.35, scalec(color, 1 - grime)), (0.62, color), (0.8, scalec(color, 1 + grime * 0.3))])
        col = r.outputs['Color']
        if bump:
            b = nt.nodes.new('ShaderNodeBump')
            b.inputs['Strength'].default_value = bump
            fine = _noise(nt, grime_scale * 6, 6, 0.7)
            nt.links.new(fine.outputs['Fac'], b.inputs['Height'])
            nt.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(shade(nt, col, ink, ao), bsdf.inputs['Base Color'])
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    _cache[name] = m
    return m


def stripes(name, a, b, width=4.0, rough=0.55, ink=0.0, ao=0.0):
    """Diagonal hazard bands of colors a and b, `width` game units each."""
    if name in _cache:
        return _cache[name]
    m, nt, bsdf = _principled(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    nt.links.new(sep.outputs['X'], add.inputs[0])
    nt.links.new(sep.outputs['Y'], add.inputs[1])
    add2 = nt.nodes.new('ShaderNodeMath')
    add2.operation = 'ADD'
    nt.links.new(add.outputs[0], add2.inputs[0])
    nt.links.new(sep.outputs['Z'], add2.inputs[1])
    div = nt.nodes.new('ShaderNodeMath')
    div.operation = 'DIVIDE'
    nt.links.new(add2.outputs[0], div.inputs[0])
    div.inputs[1].default_value = width * 2
    fr = nt.nodes.new('ShaderNodeMath')
    fr.operation = 'FRACT'
    nt.links.new(div.outputs[0], fr.inputs[0])
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.interpolation = 'CONSTANT'
    r.color_ramp.elements[0].position, r.color_ramp.elements[0].color = 0.0, (*a, 1)
    r.color_ramp.elements[1].position, r.color_ramp.elements[1].color = 0.5, (*b, 1)
    nt.links.new(fr.outputs[0], r.inputs['Fac'])
    n = _noise(nt, 0.4, 6, 0.6)
    g = _ramp(nt, n.outputs['Fac'], [(0.3, (0.6, 0.6, 0.6)), (0.6, (1, 1, 1))])
    col = _multiply(nt, r.outputs['Color'], g.outputs['Color'])
    nt.links.new(shade(nt, col, ink, ao), bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    _cache[name] = m
    return m


def wood(name, color, scale=1.0, dark=0.55, ink=0.3, ao=0.4):
    """Planks with grain along local X."""
    if name in _cache:
        return _cache[name]
    m, nt, bsdf = _principled(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.08 * scale, 1.6 * scale, 1.6 * scale)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = 3.0
    n.inputs['Detail'].default_value = 8
    n.inputs['Distortion'].default_value = 2.0
    nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    r = _ramp(nt, n.outputs['Fac'], [(0.3, scalec(color, dark)), (0.55, color), (0.75, scalec(color, 1.15))])
    nt.links.new(shade(nt, r.outputs['Color'], ink, ao), bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = 0.25
    nt.links.new(n.outputs['Fac'], b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    _cache[name] = m
    return m


# ---------------------------------------------------------------- geometry

def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    from mathutils import Euler
    return Matrix.LocRotScale(Vector(loc), Euler(rot).to_quaternion(), Vector(scale))


def aim(a, b):
    """A matrix at a whose local +Z points to b, and the distance."""
    a, b = Vector(a), Vector(b)
    d = b - a
    q = d.normalized().to_track_quat('Z', 'Y')
    return Matrix.LocRotScale(a, q, Vector((1, 1, 1))), d.length


class Kit:
    """Accumulates primitives per (role, material) and turns each group into one mesh object."""

    def __init__(self):
        self.groups = {}

    def _add(self, role, material, bm, matrix, smooth):
        bm.transform(matrix)
        verts = [v.co.copy() for v in bm.verts]
        faces = [[v.index for v in f.verts] for f in bm.faces]
        bm.free()
        g = self.groups.setdefault((role, material.name), {'mat': material, 'v': [], 'f': [], 's': []})
        off = len(g['v'])
        g['v'].extend(verts)
        g['f'].extend([[i + off for i in f] for f in faces])
        g['s'].extend([smooth] * len(faces))

    def box(self, role, material, loc, size, rot=(0, 0, 0), bevel=0.0, segments=2, matrix=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bm.transform(Matrix.Diagonal((*size, 1)))
        if bevel > 0:
            bv = min(bevel, min(size) * 0.49)
            bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bv, segments=segments, affect='EDGES', profile=0.5)
        self._add(role, material, bm, (matrix or Matrix()) @ M(loc, rot), bevel > 0)

    def cyl(self, role, material, loc, radius, depth, rot=(0, 0, 0), segs=16, radius2=None, bevel=0.0, matrix=None):
        bm = bmesh.new()
        r2 = radius if radius2 is None else radius2
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=radius, radius2=r2, depth=depth)
        if bevel > 0:
            rim = [e for e in bm.edges if not e.is_manifold or len(e.link_faces) == 2 and abs(e.link_faces[0].normal.z) > 0.9 or len(e.link_faces) == 2 and abs(e.link_faces[1].normal.z) > 0.9]
            bmesh.ops.bevel(bm, geom=rim, offset=min(bevel, depth * 0.45, min(radius, r2) * 0.45), segments=2, affect='EDGES', profile=0.5)
        self._add(role, material, bm, (matrix or Matrix()) @ M(loc, rot), True)

    def sphere(self, role, material, loc, radius, scale=(1, 1, 1), rot=(0, 0, 0), segs=16, matrix=None):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=radius)
        self._add(role, material, bm, (matrix or Matrix()) @ M(loc, rot, scale), True)

    def limb(self, role, material, a, b, radius, radius2=None, segs=12, joints=True):
        """A capsule-ish segment from a to b."""
        m, length = aim(a, b)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=radius, radius2=radius if radius2 is None else radius2, depth=length)
        self._add(role, material, bm, m @ Matrix.Translation((0, 0, length / 2)), True)
        if joints:
            self.sphere(role, material, a, radius, segs=segs)
            self.sphere(role, material, b, radius if radius2 is None else radius2, segs=segs)

    def poly(self, role, material, outline, z0, z1, matrix=None, bevel=0.0):
        """A prism from a 2D outline (Blender XY) between heights z0 and z1."""
        bm = bmesh.new()
        verts = [bm.verts.new((x, y, z0)) for x, y in outline]
        face = bm.faces.new(verts)
        if face.normal.z < 0:
            face.normal_flip()
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        moved = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=moved, vec=(0, 0, z1 - z0))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
        self._add(role, material, bm, matrix or Matrix(), False)

    def build(self, root, colls):
        """One object per (role, material), parented to root and linked into its role's collection."""
        objs = {}
        for (role, _), g in sorted(self.groups.items()):
            me = bpy.data.meshes.new(f'{role}.{g["mat"].name}')
            me.from_pydata([tuple(v) for v in g['v']], [], g['f'])
            me.materials.append(g['mat'])
            me.polygons.foreach_set('use_smooth', g['s'])
            me.validate()
            me.set_sharp_from_angle(angle=math.radians(40))
            obj = bpy.data.objects.new(me.name, me)
            obj.parent = root
            link(obj, colls[role])
            objs.setdefault(role, []).append(obj)
        return objs


def text(body, size, loc, material, coll, root, rot=(0, 0, 0), extrude=0.05):
    """Stencil text from Blender's built-in font, flat on whatever it sits on."""
    cu = bpy.data.curves.new('text', 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.extrude = extrude
    cu.materials.append(material)
    obj = bpy.data.objects.new('text', cu)
    obj.location = loc
    obj.rotation_euler = rot
    obj.parent = root
    link(obj, coll)
    return obj


# ---------------------------------------------------------------- layers and output

def read_png(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1].copy()


def outline(a, color, width=1.0):
    """Puts a dark rim of `width` pixels under a sprite's silhouette, so it reads against any floor."""
    alpha = a[..., 3]
    grown = alpha.copy()
    steps = int(math.ceil(width))
    for dy in range(-steps, steps + 1):
        for dx in range(-steps, steps + 1):
            dist = math.hypot(dx, dy)
            if dist == 0 or dist > width + 0.5:
                continue
            k = min(1.0, width + 0.5 - dist)
            shifted = np.zeros_like(alpha)
            h, w = alpha.shape
            shifted[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = alpha[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
            grown = np.maximum(grown, shifted * k)
    out_a = alpha + grown * (1 - alpha)
    safe = np.where(out_a > 1e-5, out_a, 1.0)
    rgb = (a[..., :3] * alpha[..., None] + np.array(color, np.float32) * (grown * (1 - alpha))[..., None]) / safe[..., None]
    return np.concatenate([rgb, out_a[..., None]], axis=2)


def blur(a, sigma):
    """Gaussian blur of straight-alpha RGBA, done on premultiplied color so edges don't darken."""
    r = int(math.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pm = np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], axis=2)
    for axis in (0, 1):
        pad = [(0, 0)] * 3
        pad[axis] = (r, r)
        p = np.pad(pm, pad)
        pm = sum(k[i] * np.take(p, range(i, i + pm.shape[axis]), axis=axis) for i in range(2 * r + 1))
    alpha = pm[..., 3:4]
    return np.concatenate([pm[..., :3] / np.where(alpha > 1e-5, alpha, 1.0), alpha], axis=2)


def edge_fade(w, h, px):
    """1 inside, easing to 0 over the last `px` pixels at each edge."""
    def ramp(n):
        d = np.minimum(np.arange(n) + 0.5, n - 0.5 - np.arange(n)) / px
        d = np.clip(d, 0, 1)
        return d * d * (3 - 2 * d)
    return np.outer(ramp(h), ramp(w)).astype(np.float32)


def over(top, under):
    """Straight-alpha `top` over `under`."""
    ta, ua = top[..., 3:4], under[..., 3:4]
    out_a = ta + ua * (1 - ta)
    rgb = (top[..., :3] * ta + under[..., :3] * ua * (1 - ta)) / np.where(out_a > 1e-5, out_a, 1.0)
    return np.concatenate([rgb, out_a], axis=2)


def write_png(path, rgba):
    """Writes straight-alpha float RGBA (rows top to bottom) as an 8-bit PNG, byte for byte reproducible."""
    h, w, _ = rgba.shape
    data = (np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)
    raw = b''.join(b'\x00' + data[y].tobytes() for y in range(h))

    def chunk(tag, body):
        return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', zlib.crc32(tag + body) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def render_to(path):
    scene = bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
