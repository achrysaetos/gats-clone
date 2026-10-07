"""Effects baked procedurally: muzzle flashes from additive emissive petals, the explosion and smoke from noise-driven
volumes, and decals from noisy flat shapes. All are lit from above, since the painter may turn them."""

import math

import bpy

from . import common as C


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


def build_muzzle(b):
    """A star of tapered flame spikes around a white-hot core, different in each of the four frames."""
    kit = b.kit
    rnd = b.rnd
    outer = petal_material('flash-outer', (1.0, 0.32, 0.04), 0.12)
    mid = petal_material('flash-mid', (1.0, 0.62, 0.15), 0.16)
    core = petal_material('flash-core', (1.0, 0.92, 0.7), 0.4)
    reach = (36, 28, 40, 24)[b.frame % 4] * rnd.uniform(0.95, 1.05)

    def spike(material, angle, length, width, z=4.0):
        m = C.M((1.5, 0, z), (0, 0, angle), (1, 1, 0.25))
        kit.cyl('solid', material, (length / 2, 0, 0), width, length, radius2=0.0, rot=(0, math.pi / 2, 0), segs=12, matrix=m)

    kit.sphere('solid', core, (3.5, 0, 4), 5.0, scale=(1.2, 1, 0.3), segs=20)
    kit.sphere('solid', mid, (7, 0, 3.5), 8.0, scale=(1.2, 1, 0.25), segs=20)
    spike(core, 0, reach * 0.55, 3.2, 4.5)
    spike(mid, 0, reach * 0.8, 5.0)
    spike(outer, 0, reach, 7.5, 3.0)
    for side in (-1, 1):
        a = side * rnd.uniform(0.55, 0.9)
        spike(mid, a, reach * rnd.uniform(0.3, 0.42), 2.6)
        spike(outer, a, reach * rnd.uniform(0.4, 0.5), 3.8, 3.0)
    for _ in range(1 + b.frame % 3):
        a = rnd.uniform(-0.3, 0.3)
        spike(outer, a, reach * rnd.uniform(0.6, 0.95), 2.2, 3.5)
    return C.Model(z_ref=None, overhead=True, samples=32, soften=1.4)


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
    """Soot that thins toward the rim in noisy, streaky patches."""
    m, nt, out = _tree(name)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.012, 0.01, 0.009, 1)
    bsdf.inputs['Roughness'].default_value = 0.95
    r = _radius(nt)
    n = _noise4(nt, 0.05, w, 6, 0.65)
    streak = _noise4(nt, 0.5, w + 2, 2, 0.4)
    rr = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', n, 0.5), radius * 0.9))
    rr = _math(nt, 'ADD', rr, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', streak, 0.5), radius * 0.35))
    alpha = _maprange(nt, rr, radius * 0.05, radius * 1.0, 0.72, 0.0, smooth=False)
    nt.links.new(alpha, bsdf.inputs['Alpha'])
    nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    return m


def build_decal(b):
    kind = b.entry['model']
    kit = b.kit
    rnd = b.rnd
    half = -b.entry['box']['x']
    if kind == 'scorch':
        m = soot_material(f'soot{b.frame}', half * 0.85, 5.0 + b.frame * 11.3)
        kit.box('solid', m, (0, 0, 0.05), (half * 2, half * 2, 0.1))
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
