"""Effects baked procedurally: muzzle flashes from additive emissive petals, the explosion, smoke and fire from
noise-driven volumes, decals from noisy flat shapes, and debris (planks, chunks, casings and the piles they leave) from
small boxes. All are lit from above, since the painter may turn them."""

import math

import bpy

from . import common as C
from .props import PINE, concrete, paint, steel


def _tree(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def _maprange(nt, value, a, b, c, d, smooth=True):
    n = nt.nodes.new('ShaderNodeMapRange')
    n.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
    nt.links.new(value, n.inputs['Value'])
    n.inputs['From Min'].default_value = a
    n.inputs['From Max'].default_value = b
    n.inputs['To Min'].default_value = c
    n.inputs['To Max'].default_value = d
    return n.outputs['Result']


def _noise4(nt, scale, w, detail=6, rough=0.6, coord='Object'):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.noise_dimensions = '4D'
    n.inputs['Scale'].default_value = scale
    n.inputs['W'].default_value = w
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(tc.outputs[coord], n.inputs['Vector'])
    return n.outputs['Fac']


def _radius(nt, squash=1.0):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1, 1, squash)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    vm = nt.nodes.new('ShaderNodeVectorMath')
    vm.operation = 'LENGTH'
    nt.links.new(mp.outputs['Vector'], vm.inputs[0])
    return vm.outputs['Value']


# ---------------------------------------------------------------- muzzle flash

def petal_material(name, color, strength):
    """Emission that adds up through layers and fades toward a petal's rim."""
    m, nt, out = _tree(name)
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.6
    fall = _math(nt, 'POWER', _math(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'], clamp=True), 2.0)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    nt.links.new(_math(nt, 'MULTIPLY', fall, strength), em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(tr.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    return m


# Each class's flash: the forward jet's reach and half-width, the hot core's radius, the side flares' angle and share of the
# reach (a muzzle brake throws them wide), and how many thin extra jets scatter within `spread` of the barrel.
MUZZLES = {
    'pistol': dict(reach=24, width=5.5, core=4.0, side=(0.75, 0.38), spikes=1, spread=0.25),
    'smg': dict(reach=20, width=4.5, core=3.4, side=(0.6, 0.3), spikes=2, spread=0.2),
    'assault': dict(reach=36, width=6.5, core=4.6, side=(0.9, 0.42), spikes=2, spread=0.18),
    'shotgun': dict(reach=32, width=10.0, core=6.0, side=(0.55, 0.6), spikes=6, spread=0.5),
    'sniper': dict(reach=48, width=5.5, core=5.0, side=(1.5, 0.36), spikes=1, spread=0.08),
    'lmg': dict(reach=40, width=8.0, core=5.5, side=(1.0, 0.45), spikes=3, spread=0.3),
}


def build_muzzle(b):
    """A star of tapered flame spikes around a white-hot core, shaped by the gun class and different in each frame."""
    p = MUZZLES[b.arg[0]]
    kit = b.kit
    rnd = b.rnd
    outer = petal_material('flash-outer', (1.0, 0.32, 0.04), 0.12)
    mid = petal_material('flash-mid', (1.0, 0.62, 0.15), 0.16)
    core = petal_material('flash-core', (1.0, 0.92, 0.7), 0.4)
    reach = p['reach'] * (1.0, 0.82, 1.1)[b.frame % 3] * rnd.uniform(0.95, 1.05)
    w = p['width']

    def spike(material, angle, length, width, z=4.0):
        m = C.M((1.5, 0, z), (0, 0, angle), (1, 1, 0.25))
        kit.cyl('solid', material, (length / 2, 0, 0), width, length, radius2=0.0, rot=(0, math.pi / 2, 0), segs=12, matrix=m)

    kit.sphere('solid', core, (p['core'] * 0.7, 0, 4), p['core'], scale=(1.2, 1, 0.3), segs=20)
    kit.sphere('solid', mid, (p['core'] * 1.4, 0, 3.5), p['core'] * 1.6, scale=(1.2, 1, 0.25), segs=20)
    spike(core, 0, reach * 0.55, w * 0.45, 4.5)
    spike(mid, 0, reach * 0.8, w * 0.7)
    spike(outer, 0, reach, w, 3.0)
    angle, share = p['side']
    for side in (-1, 1):
        a = side * angle * rnd.uniform(0.9, 1.1)
        spike(mid, a, reach * share * 0.8, w * 0.36)
        spike(outer, a, reach * share, w * 0.5, 3.0)
    for _ in range(p['spikes']):
        a = rnd.uniform(-p['spread'], p['spread'])
        spike(outer, a, reach * rnd.uniform(0.6, 0.95), w * 0.3, 3.5)
    return C.Model(z_ref=None, overhead=True, samples=32, soften=1.2)


# ---------------------------------------------------------------- volumes

def volume_material(name, radius, w, density, smoke, fire, squash=1.0, scale=0.045):
    """A noisy ball of smoke that fades out at `radius`, with fire glowing in its hot core. Returns the material and
    the emission-strength socket the base layer switches off."""
    m, nt, out = _tree(name)
    r = _radius(nt, squash)
    edge = _maprange(nt, r, radius * 0.45, radius, 1.0, 0.0)
    n = _noise4(nt, scale, w, 7, 0.62)
    lumps = _maprange(nt, n, 0.38, 0.62, 0.0, 1.0)
    dens = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', edge, lumps), density)
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (*smoke, 1)
    vol.inputs['Anisotropy'].default_value = 0.2
    nt.links.new(dens, vol.inputs['Density'])
    heat = _math(nt, 'MULTIPLY', _maprange(nt, r, radius * 0.1, radius * 0.75, 1.0, 0.0), _maprange(nt, n, 0.35, 0.7, 0.2, 1.0))
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.25, 0.02, 0.0, 1)
    els[1].position, els[1].color = 1.0, (1.0, 0.92, 0.6, 1)
    e = els.new(0.45)
    e.color = (1.0, 0.35, 0.03, 1)
    nt.links.new(heat, ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], vol.inputs['Emission Color'])
    strength = nt.nodes.new('ShaderNodeValue')
    strength.outputs[0].default_value = fire
    nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'POWER', heat, 1.5), strength.outputs[0]), vol.inputs['Emission Strength'])
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return m, strength.outputs[0]


def _volume_scene():
    scene = bpy.context.scene
    scene.cycles.volume_step_rate = 1.0
    scene.cycles.volume_max_steps = 256
    scene.cycles.volume_bounces = 1


def build_explosion(b):
    """Sixteen frames: a white-hot fireball that swells, burns out to orange and leaves a rolling, thinning cloud of
    smoke with flung debris. The base layer is the smoke and debris; the glow layer is the fire."""
    _volume_scene()
    kit = b.kit
    t = b.frame / 15
    radius = 28 + 58 * (1 - (1 - t) ** 2.5)
    fire = 14.0 * max(0.0, 1 - t * 1.15) ** 1.5
    density = 0.05 + 0.1 * min(1.0, t * 3) * (1 - t) ** 1.2
    smoke = C.mixc((0.22, 0.17, 0.13), (0.5, 0.49, 0.47), t)
    vm, strength = volume_material('fireball', radius, 3.1 + t * 1.2, density, smoke, fire, squash=1.1, scale=0.04 * 60 / radius)
    kit.sphere('solid', vm, (0, 0, radius * 0.45), radius, segs=24)
    rnd = C.rng('debris')
    chunk = C.mat('debris', (0.03, 0.028, 0.025), rough=0.8, grime=0.2, ink=0.3)
    for i in range(22):
        a = rnd.uniform(0, 2 * math.pi)
        speed = rnd.uniform(0.5, 1.0)
        d = (12 + 95 * speed * (1 - (1 - t) ** 2)) * (1.0 if t < 0.85 else 0.0)
        s = rnd.uniform(1.2, 3.2)
        if d > 0:
            kit.box('solid', chunk, (math.cos(a) * d, math.sin(a) * d, 4 + 30 * speed * math.sin(math.pi * min(1.0, t * 1.4))), (s, s * 0.7, s * 0.6), rot=(rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3)))

    def on_layer(layer):
        strength.default_value = fire if layer == 'glow' else 0.0
    return C.Model(z_ref=None, overhead=True, samples=32, on_layer=on_layer)


def build_smoke(b):
    """Four puffs, each its own lump of soft grey smoke."""
    _volume_scene()
    vm, _ = volume_material(f'puff{b.frame}', 26, 10 + b.frame * 3.7, 0.4, (0.62, 0.61, 0.6), 0.0, squash=1.6, scale=0.07)
    b.kit.sphere('solid', vm, (0, 0, 12), 28, segs=24)
    return C.Model(z_ref=None, overhead=True, samples=32)


def flame_material(name, length, radius, w):
    """Flame licking north from a burning base: tongues from warped noise, white-yellow at the root, red at the tips."""
    m, nt, out = _tree(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    x, y, z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    warp = _noise4(nt, 0.07, w, 4, 0.55)
    lumps = _noise4(nt, 0.24, w + 3.3, 5, 0.65)
    sway = _noise4(nt, 0.11, w + 7.1, 3, 0.5)
    yy = _math(nt, 'ADD', y, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', warp, 0.5), length * 0.5))
    t = _maprange(nt, yy, 0.0, length, 0.0, 1.0, smooth=False)
    shape = _math(nt, 'ADD', _math(nt, 'MULTIPLY', _math(nt, 'POWER', _math(nt, 'SUBTRACT', 1.0, t), 0.9), radius), 0.01)
    xw = _math(nt, 'ADD', x, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', sway, 0.5), radius * 1.3))
    zc = _math(nt, 'SUBTRACT', z, radius)
    rr = _math(nt, 'SQRT', _math(nt, 'ADD', _math(nt, 'MULTIPLY', xw, xw), _math(nt, 'MULTIPLY', zc, zc)))
    edge = _maprange(nt, _math(nt, 'DIVIDE', rr, shape), 0.35, 1.0, 1.0, 0.0)
    root = _maprange(nt, y, -radius * 0.7, 0.0, 0.0, 1.0)
    heat = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', edge, root), _maprange(nt, lumps, 0.35, 0.7, 0.25, 1.0))
    heat = _math(nt, 'MULTIPLY', heat, _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', t, 0.55)))
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (0.05, 0.04, 0.035, 1)
    nt.links.new(_math(nt, 'MULTIPLY', heat, 0.04), vol.inputs['Density'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.3, 0.02, 0.0, 1)
    els[1].position, els[1].color = 1.0, (1.0, 0.9, 0.55, 1)
    e = els.new(0.45)
    e.color = (1.0, 0.36, 0.03, 1)
    nt.links.new(heat, ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], vol.inputs['Emission Color'])
    nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'POWER', heat, 1.6), 2.6), vol.inputs['Emission Strength'])
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return m


def build_fire(b):
    """A looping burn: flames rising north from the origin, their length and tongues changing every frame."""
    _volume_scene()
    t = b.frame / b.entry['frames']
    length = 40 + 6 * math.sin(t * 2 * math.pi) + b.rnd.uniform(-3, 3)
    radius = 15 + 2 * math.cos(t * 4 * math.pi)
    m = flame_material(f'flame{b.frame}', length, radius, 2.0 + b.frame * 0.55)
    b.kit.box('solid', m, (0, length / 2 - 3, radius), (radius * 3.0, length + radius * 1.6, radius * 2.2))
    return C.Model(z_ref=None, overhead=True, samples=32)


# ---------------------------------------------------------------- decals

def splat_outline(rnd, radius, wobble, n=40):
    pts = []
    phase = [rnd.uniform(0, 6.28) for _ in range(4)]
    for i in range(n):
        a = i / n * 2 * math.pi
        r = radius * (1 + wobble * (0.5 * math.sin(3 * a + phase[0]) + 0.3 * math.sin(5 * a + phase[1]) + 0.2 * math.sin(9 * a + phase[2])) + rnd.uniform(-0.06, 0.06))
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def soot_material(name, radius, w):
    """Burnt brown soot: charred at the heart, browner toward a ragged rim, thinning in streaky patches."""
    m, nt, out = _tree(name)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 0.95
    r = _radius(nt)
    n = _noise4(nt, 0.05, w, 6, 0.65)
    streak = _noise4(nt, 0.5, w + 2, 2, 0.4)
    grit = _noise4(nt, 0.9, w + 5, 3, 0.7)
    rr = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', n, 0.5), radius * 0.7))
    rr = _math(nt, 'ADD', rr, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', streak, 0.5), radius * 0.3))
    rr = _math(nt, 'ADD', rr, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', grit, 0.5), radius * 0.22))
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.012, 0.009, 0.007, 1)
    els[1].position, els[1].color = 1.0, (0.12, 0.07, 0.035, 1)
    mid = els.new(0.5)
    mid.color = (0.045, 0.028, 0.016, 1)
    nt.links.new(_maprange(nt, rr, 0.0, radius, 0.0, 1.0), ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    alpha = _maprange(nt, rr, radius * 0.1, radius * 1.0, 0.85, 0.0, smooth=False)
    nt.links.new(alpha, bsdf.inputs['Alpha'])
    nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    return m


def scorch_cracks(kit, rnd, radius, material):
    """Hairline cracks running out from the blast's heart, forking as they go."""
    for i in range(rnd.randint(5, 7)):
        a = i / 6 * 2 * math.pi + rnd.uniform(-0.4, 0.4)
        x, y = math.cos(a) * radius * 0.12, math.sin(a) * radius * 0.12
        width = 0.6
        reach = radius * rnd.uniform(0.7, 0.95)
        while math.hypot(x, y) < reach:
            ln = rnd.uniform(radius * 0.06, radius * 0.14)
            nx, ny = x + math.cos(a) * ln, y + math.sin(a) * ln
            kit.box('solid', material, ((x + nx) / 2, (y + ny) / 2, 0.15), (ln + 0.3, width, 0.1), rot=(0, 0, a))
            if rnd.random() < 0.25:
                fa = a + rnd.choice((-1, 1)) * rnd.uniform(0.5, 0.9)
                fl = ln * rnd.uniform(0.6, 1.2)
                kit.box('solid', material, (nx + math.cos(fa) * fl / 2, ny + math.sin(fa) * fl / 2, 0.15), (fl, width * 0.6, 0.1), rot=(0, 0, fa))
            x, y = nx, ny
            a += rnd.uniform(-0.45, 0.45)
            width = max(0.35, width * 0.85)


def build_decal(b):
    kind = b.entry['model']
    kit = b.kit
    rnd = b.rnd
    half = -b.entry['box']['x']
    if kind == 'scorch':
        m = soot_material(f'soot{b.frame}', half * 0.85, 5.0 + b.frame * 11.3)
        kit.box('solid', m, (0, 0, 0.05), (half * 2, half * 2, 0.1))
        scorch_cracks(kit, rnd, half * 0.8, C.mat('crack', (0.008, 0.006, 0.005), rough=1.0, grime=0.0))
        return C.Model(z_ref=None, overhead=True)
    color = (0.16, 0.005, 0.004) if kind == 'blood' else (0.32, 0.4, 0.04)
    wet = C.mat(f'{kind}-wet', color, rough=0.15, grime=0.3, grime_scale=0.3, coat=0.6)
    main = half * rnd.uniform(0.32, 0.45)
    kit.poly('solid', wet, splat_outline(rnd, main, 0.35), 0, 0.4)
    for _ in range(rnd.randint(9, 16)):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(main * 0.9, half * 0.88)
        r = rnd.uniform(0.6, 2.6) * (1 - d / half * 0.6)
        kit.poly('solid', wet, splat_outline(rnd, r, 0.25, 14), 0, 0.3, matrix=C.M((math.cos(a) * d, math.sin(a) * d, 0), (0, 0, a), (1.6, 1, 1)))
    for _ in range(3):
        a = rnd.uniform(0, 2 * math.pi)
        ln = rnd.uniform(main * 0.6, half * 0.75 - main * 0.3)
        kit.poly('solid', wet, [(0, -1.1), (ln, -0.25), (ln, 0.25), (0, 1.1)], 0, 0.35, matrix=C.M((math.cos(a) * main * 0.7, math.sin(a) * main * 0.7, 0), (0, 0, a)))
    return C.Model(z_ref=None, overhead=True)


# ---------------------------------------------------------------- debris

BRASS = (0.62, 0.4, 0.1)


def board(kit, rnd, length, width, loc=(0, 0, 0), rot_z=0.0):
    """One plank lying flat along local x at `loc`, split into splinters at the ends, with a nail head near each."""
    boards = C.wood('pine', PINE)
    splinter = C.wood('pine-splinter', C.scalec(PINE, 1.25))
    nail = C.mat('nail', (0.05, 0.05, 0.055), rough=0.4, metal=0.8, grime=0.1)
    m = C.M(loc, (0, 0, rot_z))
    kit.box('solid', boards, (0, 0, 0.8), (length, width, 1.6), bevel=0.3, matrix=m)
    for side in (-1, 1):
        kit.box('solid', nail, (side * (length / 2 - 1.6), rnd.uniform(-0.6, 0.6), 1.7), (0.7, 0.7, 0.2), matrix=m)
        if rnd.random() < 0.3:
            continue
        for _ in range(rnd.randint(2, 3)):
            a = rnd.uniform(-0.5, 0.5) + (0 if side > 0 else math.pi)
            ln = rnd.uniform(1.0, 2.4)
            x, y = side * length / 2, rnd.uniform(-width / 2, width / 2) * 0.8
            kit.box('solid', splinter, (x + math.cos(a) * ln / 2, y + math.sin(a) * ln / 2, 0.9), (ln, 0.45, 0.45), rot=(0, 0, a), matrix=m)


def build_debris(b):
    """Single pieces the painter throws and turns: a plank, a concrete chunk, a spent casing (pistol, rifle, shotgun)."""
    kind = b.arg[0]
    kit, rnd = b.kit, b.rnd
    if kind == 'plank':
        board(kit, rnd, (19, 15, 11)[b.frame], rnd.uniform(3.6, 4.4))
        return C.Model(z_ref=None, overhead=True, contact=0.6)
    if kind == 'chunk':
        stone = concrete('chunk', (0.32, 0.31, 0.29))
        s = (3.6, 3.0, 2.4)[b.frame]
        kit.box('solid', stone, (0, 0, s * 0.4), (s * rnd.uniform(1.0, 1.3), s * rnd.uniform(0.8, 1.1), s * 0.8), rot=(rnd.uniform(0, 0.6), rnd.uniform(0, 0.6), rnd.uniform(0, 3)), bevel=s * 0.25)
        return C.Model(z_ref=None, overhead=True, contact=0.6)
    brass = C.mat('brass', BRASS, rough=0.3, metal=0.6, grime=0.15)
    if b.frame == 2:
        shell = C.mat('shell', (0.45, 0.04, 0.03), rough=0.45, grime=0.15)
        kit.cyl('solid', shell, (0.5, 0, 1.1), 1.1, 4.0, rot=(0, math.pi / 2, 0), segs=12)
        kit.cyl('solid', brass, (-2.0, 0, 1.15), 1.15, 1.2, rot=(0, math.pi / 2, 0), segs=12)
    else:
        ln = (2.8, 3.8)[b.frame]
        kit.cyl('solid', brass, (-0.3, 0, 0.75), 0.75, ln, rot=(0, math.pi / 2, 0), segs=12)
        if b.frame == 1:
            kit.cyl('solid', brass, (ln / 2 + 0.2, 0, 0.75), 0.75, 1.0, radius2=0.45, rot=(0, math.pi / 2, 0), segs=12)
    return C.Model(z_ref=None, overhead=True)


def build_pile(b):
    """What a broken piece leaves on the floor for the rest of the match: a heap of planks, of concrete, or of torn steel."""
    kind = b.arg[0]
    kit, rnd = b.kit, b.rnd
    half = -b.entry['box']['x']
    if kind == 'planks':
        for i in range(rnd.randint(8, 11)):
            da, d = rnd.uniform(0, 2 * math.pi), rnd.uniform(0, half * 0.4)
            board(kit, rnd, rnd.uniform(9, 20), rnd.uniform(3.4, 4.4), (math.cos(da) * d, math.sin(da) * d, i * 0.9), rnd.uniform(0, math.pi))
        chip = C.wood('pine-splinter', C.scalec(PINE, 1.25))
        for _ in range(14):
            a, d = rnd.uniform(0, 2 * math.pi), rnd.uniform(half * 0.2, half * 0.7)
            kit.box('solid', chip, (math.cos(a) * d, math.sin(a) * d, 0.3), (rnd.uniform(0.8, 2.2), 0.6, 0.4), rot=(0, 0, rnd.uniform(0, 3)))
    elif kind == 'rubble':
        stone = concrete('rubble', (0.22, 0.215, 0.2))
        dark = concrete('rubble-dark', (0.14, 0.135, 0.125))
        for i in range(rnd.randint(14, 20)):
            a, d = rnd.uniform(0, 2 * math.pi), min(abs(rnd.gauss(0, half * 0.3)), half * 0.7)
            s = rnd.uniform(1.6, 6.5) * (1 - d / half * 0.6)
            kit.box('solid', stone if i % 3 else dark, (math.cos(a) * d, math.sin(a) * d, s * 0.35), (s * rnd.uniform(1, 1.6), s * rnd.uniform(0.8, 1.3), s * 0.8), rot=(rnd.uniform(0, 0.8), rnd.uniform(0, 0.8), rnd.uniform(0, 3)), bevel=s * 0.25)
        rebar = C.mat('rebar', (0.12, 0.07, 0.04), rough=0.6, metal=0.7, grime=0.3)
        for _ in range(2):
            kit.cyl('solid', rebar, (rnd.uniform(-4, 4), rnd.uniform(-4, 4), 2.5), 0.5, rnd.uniform(10, 16), rot=(math.pi / 2, 0, rnd.uniform(0, math.pi)), segs=8)
    else:
        red = paint('scrap-red', (0.3, 0.03, 0.018))
        iron = steel('scrap')
        for i in range(rnd.randint(4, 6)):
            a, d = rnd.uniform(0, 2 * math.pi), rnd.uniform(0, half * 0.45)
            kit.box('solid', red if i % 2 == 0 else iron, (math.cos(a) * d, math.sin(a) * d, 0.6 + i * 0.3), (rnd.uniform(5, 11), rnd.uniform(4, 9), 0.6), rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3)))
        kit.cyl('solid', iron, (rnd.uniform(-3, 3), rnd.uniform(-3, 3), 0.8), 6.5, 1.0, rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(0.3, 0.5), 0), segs=20)
        for _ in range(8):
            a, d = rnd.uniform(0, 2 * math.pi), rnd.uniform(half * 0.3, half * 0.75)
            kit.box('solid', iron, (math.cos(a) * d, math.sin(a) * d, 0.4), (rnd.uniform(1, 2.5), rnd.uniform(0.8, 1.5), 0.5), rot=(0, 0, rnd.uniform(0, 3)))
    return C.Model(z_ref=None, overhead=True, contact=0.9)
