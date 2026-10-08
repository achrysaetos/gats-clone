"""Zombies on the soldier's rig, each kind with its own body plan in units of its radius and colors (ZOMBIE_LOOK).

Walkers and plated reach forward; runners lean in with their arms pumping; bloaters carry a swollen gut on short arms.
Brutes hunch under a slab of shoulder, head sunk between them, with long heavy arms hanging forward to the knuckles.
The Colossus is a humped giant with bone spikes along its back and one club arm far bigger than the other.
"""

import math

from . import common as C
from . import rig as Rg

INK = (0.06, 0.05, 0.05)

# hip and shoulder height, half shoulder width, arm and leg segment lengths, hunch (degrees), head radius and how
# far forward it sits, torso half-sizes (x, y, z), limb thickness, hand and foot targets (radius units), steel plates
# on the back and shoulder pads.
BASE = dict(hip=0.5, sh=1.05, sw=0.7, ua=0.5, fa=0.55, lean=18, head=0.34, neck=0.1, torso=(0.42, 0.74, 0.36), limb=0.18,
            hands=((1.25, -0.5, 0.95), (1.15, 0.6, 0.92)), feet=((-0.3, -0.38), (0.25, 0.38)), big_arm=1.0,
            armor=0, shoulders=False)
PLANS = {
    'walker': {},
    'plated': dict(armor=4),
    'runner': dict(lean=35, sw=0.5, torso=(0.36, 0.52, 0.34), limb=0.14, hands=((-0.35, -0.75, 0.6), (0.75, 0.6, 0.85)), feet=((-0.65, -0.3), (0.6, 0.3))),
    'bloater': dict(lean=4, sw=0.55, ua=0.36, fa=0.38, head=0.3, torso=(0.5, 0.7, 0.42), hands=((0.55, -0.85, 0.75), (0.6, 0.85, 0.72))),
    'brute': dict(hip=0.42, sh=0.92, sw=0.6, ua=0.62, fa=0.72, lean=42, head=0.27, neck=-0.02, torso=(0.45, 0.52, 0.4), limb=0.22,
                  hands=((1.2, -0.66, 0.12), (1.25, 0.64, 0.15)), feet=((-0.35, -0.48), (0.2, 0.5)), shoulders=True),
    'colossus': dict(hip=0.4, sh=0.9, sw=0.6, ua=0.55, fa=0.6, lean=38, head=0.19, neck=-0.12, torso=(0.48, 0.56, 0.42), limb=0.19,
                     hands=((1.0, -0.8, 0.1), (0.85, 0.6, 0.35)), feet=((-0.4, -0.45), (0.15, 0.45)), big_arm=1.75, armor=3, shoulders=True),
}


def plan(kind):
    return {**BASE, **PLANS[kind]}


def bones(p):
    hip, sh, sw = p['hip'], p['sh'], p['sw']
    out = [
        Rg.Bone('hips', None, (0, 0, hip), (0, 0, hip + 0.1)),
        Rg.Bone('spine', 'hips', (0, 0, hip + 0.1), (0, 0, sh)),
        Rg.Bone('head', 'spine', (0, 0, sh), (0, 0, sh + 0.3)),
    ]
    for side, y in (('R', -1), ('L', 1)):
        out += [
            Rg.Bone(f'upper_arm.{side}', 'spine', (0, sw * y, sh - 0.08), (0, sw * y, sh - 0.08 - p['ua'])),
            Rg.Bone(f'forearm.{side}', f'upper_arm.{side}', (0, sw * y, sh - 0.08 - p['ua']), (0, sw * y, sh - 0.08 - p['ua'] - p['fa'])),
            Rg.Bone(f'hand.{side}', f'forearm.{side}', (0, sw * y, sh - 0.08 - p['ua'] - p['fa']), (0, sw * y, sh - 0.2 - p['ua'] - p['fa'])),
            Rg.Bone(f'thigh.{side}', 'hips', (0, 0.3 * y, hip), (0.03, 0.33 * y, hip / 2)),
            Rg.Bone(f'shin.{side}', f'thigh.{side}', (0.03, 0.33 * y, hip / 2), (0, 0.33 * y, 0.06)),
            Rg.Bone(f'foot.{side}', f'shin.{side}', (0, 0.33 * y, 0.06), (0.2, 0.33 * y, 0.06)),
        ]
    return out


LIMBS = {f'{kind}.{side}': Rg.Limb(*(f'{b}.{side}' for b in names))
         for side in 'RL' for kind, names in (('arm', ('upper_arm', 'forearm', 'hand')), ('leg', ('thigh', 'shin', 'foot')))}


def build(b):
    kind = b.arg[0]
    z = b.spec['zombies'][kind]
    r = z['radius']
    p = plan(kind)
    body_c, arm_c, eye_c = C.srgb(z['body']), C.srgb(z['arm']), C.srgb(z['eye'])
    bright_eyes = max(eye_c) > 0.3
    k16 = 16 / r
    skin = C.mat(f'skin-{kind}', body_c, rough=0.7, grime=0.35, grime_scale=0.25 * k16, ink=0.5, ao=0.4, bump=0.3)
    arm = C.mat(f'arm-{kind}', arm_c, rough=0.75, grime=0.3, grime_scale=0.4 * k16, ink=0.5, ao=0.35)
    rag = C.mat(f'rag-{kind}', C.mixc(C.scalec(body_c, 0.35), (0.05, 0.045, 0.04), 0.5), rough=0.95, grime=0.4, grime_scale=1.0, ink=0.4, ao=0.3)
    wound = C.mat('wound', (0.18, 0.02, 0.02), rough=0.35, grime=0.3, grime_scale=1.5)
    eye = C.mat(f'eye-{kind}', eye_c, rough=0.2, grime=0.0, emit=eye_c if bright_eyes else None, strength=6.0)
    steel = C.mat('zplate', (0.12, 0.125, 0.13), rough=0.4, metal=0.8, grime=0.35, grime_scale=1.0, ink=0.45, ao=0.3)
    bone = C.mat('bone', (0.55, 0.5, 0.4), rough=0.6, grime=0.2, ink=0.3)
    boil = C.mat('boil', C.mixc(body_c, (1.0, 0.8, 0.4), 0.5), rough=0.3, grime=0.0, ink=0.2)
    rnd = b.rnd
    rig = Rg.Rig(bones(p), LIMBS)
    hip, sh, sw, th = p['hip'], p['sh'], p['sw'], p['limb']
    tx, ty, tz = p['torso']

    # legs and feet
    for side in 'RL':
        t, s = rig.bones[f'thigh.{side}'], rig.bones[f'shin.{side}']
        rig.kit(f'thigh.{side}').limb('solid', rag, tuple(t.head), tuple(t.tail), th * 1.15, th)
        rig.kit(f'shin.{side}').limb('solid', arm, tuple(s.head), tuple(s.tail), th, th * 0.85)
        rig.kit(f'foot.{side}').sphere('solid', arm, (s.tail.x + 0.08, s.tail.y, 0.06), th, scale=(1.6, 1, 0.6))
    hk = rig.kit('hips')
    hk.box('solid', rag, (0, 0, hip + 0.05), (tx * 1.5, ty * 1.3, 0.22), bevel=0.08)

    # torso with a torn shirt and wounds, built around the spine's middle
    sk = rig.kit('spine')
    mid = hip + 0.1 + (sh - hip - 0.1) * 0.62
    sk.box('solid', skin, (0, 0, mid), (tx * 2, ty * 2, tz * 2), bevel=min(tx, tz) * 0.65, segments=3)
    sk.box('solid', rag, (-tx * 0.45, 0.08, mid + tz * 0.5), (tx * 0.9, ty * 1.3, tz * 1.1), rot=(0, 0, 0.25), bevel=0.12)
    for _ in range(2 + int(r // 14)):
        a = rnd.uniform(0, 2 * math.pi)
        sk.sphere('solid', wound, (0.25 * tx * math.cos(a) - 0.1, 0.6 * ty * math.sin(a), mid + tz * 0.95), 0.09 * rnd.uniform(0.8, 1.4), scale=(1.4, 1, 0.4))
    if kind == 'bloater':
        sk.sphere('solid', skin, (0.25, 0, mid - 0.15), 0.85, scale=(1.0, 1.05, 0.8), segs=24)
        for _ in range(9):
            a, d = rnd.uniform(0, 2 * math.pi), rnd.uniform(0.3, 0.8)
            sk.sphere('solid', boil, (0.25 + d * math.cos(a) * 0.8, d * math.sin(a) * 0.85, mid - 0.15 + 0.68 * math.sqrt(max(0, 1 - d * d))), rnd.uniform(0.09, 0.16))
    if kind in ('brute', 'colossus'):
        # the trapezius slab and hump the head sinks into
        sk.sphere('solid', skin, (-0.12, 0, sh - 0.02), sw * 0.95, scale=(0.75, 0.95, 0.55), segs=24)
        for y in (-1, 1):
            sk.sphere('solid', arm, (0.0, sw * y, sh - 0.06), th * 2.1, scale=(1.15, 1.0, 0.85), segs=18)
    if kind == 'colossus':
        sk.sphere('solid', skin, (-0.35, 0.05, sh - 0.12), 0.5, scale=(1.0, 1.0, 0.75), segs=24)
        for i in range(6):
            t = i / 5
            sk.cyl('solid', bone, (-0.15 - 0.45 * t, (t - 0.5) * 0.25, sh + 0.22 - 0.15 * t), 0.08, 0.38, radius2=0.0, rot=(0, -0.7 - 0.3 * t, 0), segs=8)
    if p['shoulders'] and kind not in ('brute', 'colossus'):
        for y in (-1, 1):
            sk.sphere('solid', arm, (-0.02, sw * y, sh - 0.04), 0.4, scale=(1.1, 1.0, 0.8))
    for i in range(p['armor']):
        t = (i + 0.5) / max(1, p['armor'])
        y = (t - 0.5) * 2 * ty * 1.05
        side = abs(y) > ty * 0.6
        sk.box('solid', steel, (-0.1 if not side else 0.0, y, mid + tz + (0.06 if side else 0.02)), (0.5, 0.34, 0.1), rot=(0.3 * (1 if y > 0 else -1) * side, 0, 0), bevel=0.04)

    # head, eyes forward, jaw wound
    hd = rig.kit('head')
    hr = p['head']
    hc = (hr * 0.6, 0, sh + p['neck'] + hr * 0.8)
    hd.sphere('solid', skin, hc, hr, scale=(1.1, 1.0, 0.95))
    for y in (-0.36, 0.36):
        hd.sphere('solid', eye, (hc[0] + hr * 0.9, y * hr, hc[2] + 0.1 * hr), 0.22 * hr)
    hd.box('solid', wound, (hc[0] + hr * 0.95, 0, hc[2] - 0.4 * hr), (0.06, 0.6 * hr, 0.06), bevel=0.02)

    # arms with bony fingers; the colossus's right arm is a club
    for side in 'RL':
        big = p['big_arm'] if side == 'R' else 1.0
        u, f, h = (rig.bones[f'{n}.{side}'] for n in ('upper_arm', 'forearm', 'hand'))
        rig.kit(f'upper_arm.{side}').limb('solid', arm, tuple(u.head), tuple(u.tail), th * 1.1 * big, th * big)
        rig.kit(f'forearm.{side}').limb('solid', arm, tuple(f.head), tuple(f.tail), th * 1.05 * big, th * 0.85 * big)
        hk2 = rig.kit(f'hand.{side}')
        hk2.sphere('solid', arm, (h.head.x, h.head.y, h.head.z - 0.04), th * 0.9 * big, scale=(1.2, 1.1, 0.9))
        for kf in (-1, 0, 1):
            hk2.limb('solid', bone, (h.head.x, h.head.y + kf * 0.07 * big, h.head.z - 0.05), (h.head.x, h.head.y + kf * 0.09 * big, h.head.z - 0.05 - 0.2 * big), 0.035 * big, 0.012 * big, joints=False)
        if big > 1:
            for i in range(3):
                hk2.cyl('solid', bone, (h.head.x + (i - 1) * 0.08, h.head.y, h.head.z + 0.12 * big), 0.05, 0.2, radius2=0.0, segs=8)

    lean = p['lean']
    pose = {'spine': (0, lean, 0), 'head': (0, -lean * 0.75, 0)}
    for i, side in enumerate('RL'):
        y = 1 if side == 'L' else -1
        hx, hy, hz = p['hands'][i]
        pose[f'arm.{side}'] = (hx, hy, hz)
        pose[f'arm.{side}.pole'] = (-0.3, y, -0.5)
        fx, fy = p['feet'][i]
        pose[f'leg.{side}'] = (fx, fy, 0.06)
        pose[f'leg.{side}.pole'] = (1, 0, 0)
    armature = rig.build(b.root, b.colls, pose)
    armature.scale = (r, r, r)
    return C.Model(z_ref=sh * r * math.cos(math.radians(lean)), contact=True, outline=(INK, 1.0), freeze=True)
