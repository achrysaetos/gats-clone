"""Zombies on the soldier's rig: one shared anatomy in units of the kind's radius, a body plan per kind, and a few
kind-only parts (EXTRAS). Colors come from ZOMBIE_LOOK; the materials share the soldier's glossy, inked look.

From straight above a hunched body shows its back, so the back carries the detail: a torn shirt with skin, raw flesh
and ribs showing through, the spine ridge, and each kind's own mark.

- walker: hunched, both arms reaching ahead, one higher, the jaw hanging.
- runner: thin and bare-backed, thrown forward with the arms swept back past the hips.
- plated: a walker in bolted scrap armour, a skull cap, pauldrons, a back plate and bracers.
- bloater: a swollen belly and a cluster of glossy sacs over the back, short arms, the head sunk in.
- brute: a slab of shoulder and hump, the head low between them, long knuckle arms with iron cuffs.
- colossus: a humped giant with steel plates driven into its back, bone spikes along the spine and one club arm.
"""

import math

from mathutils import Vector

from . import common as C
from . import rig as Rg

INK = (0.06, 0.05, 0.05)
# How far, in radius units, a model's eyes may sit from the spot the painter puts their night glow.
EYE_SLACK = 0.04

# Radius units. hip and sh: hip and shoulder height; sw: half shoulder width; ua, fa: arm segments; lean: hunch in
# degrees; head: head radius, neck: head height over the shoulder, reach: how far ahead of the neck the head sits;
# torso: chest half-sizes (depth, width, height); limb: limb radius; hands (x, y, z) and feet (x, y) are pose targets;
# big_arm scales the right arm; shirt: how much of the back the shirt covers (0 bare) and shirt_c its linear colour;
# plates: scrap steel pieces; cuffs: iron shackles on the wrists.
BASE = dict(hip=0.5, sh=1.05, sw=0.64, ua=0.55, fa=0.62, lean=26, head=0.31, neck=0.02, reach=0.22, torso=(0.38, 0.6, 0.38),
            limb=0.165, hands=((1.32, -0.42, 0.98), (1.16, 0.55, 0.8)), feet=((-0.3, -0.34), (0.28, 0.34)), big_arm=1.0,
            shirt=1.0, shirt_c=(0.075, 0.09, 0.115), plates=0, cuffs=False)
PLANS = {
    'walker': {},
    'plated': dict(plates=1, shirt_c=(0.05, 0.045, 0.04), limb=0.17, torso=(0.4, 0.62, 0.4)),
    'runner': dict(lean=48, sw=0.5, ua=0.5, fa=0.55, head=0.32, reach=0.3, torso=(0.32, 0.46, 0.34), limb=0.12, shirt=0.0,
                   hands=((-0.55, -0.72, 0.62), (-0.35, 0.72, 0.7)), feet=((-0.7, -0.28), (0.62, 0.28))),
    'bloater': dict(lean=6, sw=0.6, ua=0.38, fa=0.42, head=0.3, neck=0.02, reach=0.1, torso=(0.5, 0.66, 0.42),
                    hands=((0.8, -0.82, 0.72), (0.75, 0.84, 0.66)), shirt=0.6, shirt_c=(0.32, 0.29, 0.22)),
    'brute': dict(hip=0.42, sh=0.92, sw=0.6, ua=0.62, fa=0.72, lean=42, head=0.25, neck=-0.06, reach=0.2, torso=(0.42, 0.52, 0.4),
                  limb=0.22, hands=((1.05, -0.68, 0.12), (1.1, 0.66, 0.15)), feet=((-0.35, -0.46), (0.2, 0.48)), shirt=0.0, cuffs=True),
    'colossus': dict(hip=0.4, sh=0.9, sw=0.6, ua=0.55, fa=0.6, lean=38, head=0.19, neck=-0.12, reach=0.16, torso=(0.46, 0.54, 0.42),
                     limb=0.19, hands=((0.92, -0.76, 0.1), (0.8, 0.58, 0.35)), feet=((-0.4, -0.45), (0.15, 0.45)), big_arm=1.75,
                     shirt=0.0, plates=3, cuffs=True),
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
        big = p['big_arm'] if side == 'R' else 1.0
        ua, fa = p['ua'] * big ** 0.3, p['fa'] * big ** 0.3
        out += [
            Rg.Bone(f'upper_arm.{side}', 'spine', (0, sw * y, sh - 0.08), (0, sw * y, sh - 0.08 - ua)),
            Rg.Bone(f'forearm.{side}', f'upper_arm.{side}', (0, sw * y, sh - 0.08 - ua), (0, sw * y, sh - 0.08 - ua - fa)),
            Rg.Bone(f'hand.{side}', f'forearm.{side}', (0, sw * y, sh - 0.08 - ua - fa), (0, sw * y, sh - 0.2 - ua - fa)),
            Rg.Bone(f'thigh.{side}', 'hips', (0, 0.28 * y, hip), (0.03, 0.31 * y, hip / 2)),
            Rg.Bone(f'shin.{side}', f'thigh.{side}', (0.03, 0.31 * y, hip / 2), (0, 0.31 * y, 0.06)),
            Rg.Bone(f'foot.{side}', f'shin.{side}', (0, 0.31 * y, 0.06), (0.2, 0.31 * y, 0.06)),
        ]
    return out


LIMBS = {f'{kind}.{side}': Rg.Limb(*(f'{b}.{side}' for b in names))
         for side in 'RL' for kind, names in (('arm', ('upper_arm', 'forearm', 'hand')), ('leg', ('thigh', 'shin', 'foot')))}


def materials(kind, z, p):
    body, limb, eye = C.srgb(z['body']), C.srgb(z['arm']), C.srgb(z['eye'])
    k = 16 / z['radius']
    return {
        'skin': C.mat(f'z-skin-{kind}', body, rough=0.36, coat=0.5, grime=0.3, grime_scale=0.3 * k, bump=0.2, ink=0.55, ao=0.5),
        'limb': C.mat(f'z-limb-{kind}', limb, rough=0.4, coat=0.45, grime=0.3, grime_scale=0.45 * k, ink=0.55, ao=0.45),
        'rag': C.mat(f'z-rag-{kind}', C.mixc(p['shirt_c'], C.scalec(body, 0.3), 0.2), rough=0.9, grime=0.4, grime_scale=1.2 * k, ink=0.45, ao=0.45),
        'pants': C.mat('z-pants', (0.045, 0.045, 0.05), rough=0.85, grime=0.35, grime_scale=1.0 * k, ink=0.4, ao=0.4),
        'flesh': C.mat('z-flesh', (0.36, 0.035, 0.04), rough=0.28, coat=0.6, grime=0.35, grime_scale=2.0 * k, ink=0.35, ao=0.5),
        'gore': C.mat('z-gore', (0.1, 0.01, 0.012), rough=0.2, coat=0.8, grime=0.0),
        'bone': C.mat('z-bone', (0.66, 0.6, 0.47), rough=0.45, coat=0.25, grime=0.25, grime_scale=2.0 * k, ink=0.4, ao=0.4),
        'claw': C.mat('z-claw', (0.09, 0.075, 0.06), rough=0.35, coat=0.4, grime=0.0, ink=0.2),
        'eye': C.mat(f'z-eye-{kind}', eye, rough=0.2, grime=0.0, emit=eye if max(eye) > 0.3 else None, strength=6.0),
        'plate': C.mat('z-plate', (0.27, 0.27, 0.28), rough=0.38, metal=0.7, coat=0.2, grime=0.45, grime_scale=1.2 * k, ink=0.45, ao=0.4),
        'rust': C.mat('z-rust', (0.3, 0.12, 0.05), rough=0.75, metal=0.3, grime=0.4, grime_scale=1.8 * k, ink=0.4, ao=0.4),
        'edge': C.mat('z-edge', (0.55, 0.55, 0.55), rough=0.3, metal=0.85, grime=0.15),
        'sac': C.mat(f'z-sac-{kind}', C.mixc(body, (0.42, 0.62, 0.06), 0.72), rough=0.12, coat=1.0, grime=0.25, grime_scale=1.5 * k, ink=0.3, ao=0.35),
        'vein': C.mat('z-vein', (0.22, 0.06, 0.1), rough=0.3, coat=0.5, grime=0.0),
    }


class Back:
    """A body ellipsoid (the chest, the brute's slab, the hump): points on its surface and a matrix whose +Z is the
    outward normal there, so patches, ribs and plates lie on it. az is degrees round from the front (+X, 180 is the
    middle of the back), el degrees up from its middle."""

    def __init__(self, centre, size):
        self.c, self.s = Vector(centre), Vector(size)

    def at(self, az, el, lift=0.0):
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
        n = Vector((d.x / self.s.x, d.y / self.s.y, d.z / self.s.z)).normalized()
        p = self.c + Vector((d.x * self.s.x, d.y * self.s.y, d.z * self.s.z)) + n * lift
        return p, C.aim(p, p + n)[0]


def torso(rig, p, m, rnd):
    hip, sh, sw, th = p['hip'], p['sh'], p['sw'], p['limb']
    tx, ty, tz = p['torso']
    sk = rig.kit('spine')
    mid = hip + 0.1 + (sh - hip - 0.1) * 0.6
    back = Back((0, 0, mid), (tx, ty, tz))
    shirt = p['shirt']
    sk.sphere('solid', m['rag'] if shirt else m['skin'], (0, 0, mid), 1.0, scale=(tx, ty, tz), segs=28)
    sk.sphere('solid', m['skin'], (0.04, 0, hip + 0.16), 1.0, scale=(tx * 0.85, ty * 0.78, 0.22), segs=20)
    for y in (-1, 1):
        sk.sphere('solid', m['limb'], (0, sw * y, sh - 0.07), th * 1.55, scale=(1.1, 1.0, 0.9), segs=18)
        sk.limb('solid', m['skin'], (0, ty * 0.5 * y, sh - 0.02), (0, (sw - th) * y, sh - 0.06), th * 1.1, th * 1.2)
    sk.limb('solid', m['skin'], (0.02, 0, sh - 0.1), (p['reach'] * 0.6, 0, sh + p['neck'] + 0.05), p['head'] * 0.5)
    if shirt:
        # rips through the shirt: skin round raw flesh, ribs across the biggest; the left shoulder torn bare
        holes = [(200, 12, 0.24, True), (148, -18, 0.16, False), (228, -30, 0.13, False)][:max(1, round(3 * shirt))]
        for az, el, size, ribs in holes:
            _, mx = back.at(az + rnd.uniform(-8, 8), el + rnd.uniform(-5, 5), -0.02)
            sk.sphere('solid', m['skin'], (0, 0, 0), size, scale=(1.0, 0.7, 0.2), matrix=mx)
            sk.sphere('solid', m['skin'], (size * 0.4, size * 0.35, 0), size * 0.6, scale=(1.0, 0.8, 0.2), matrix=mx)
            sk.sphere('solid', m['flesh'], (0, 0, 0.02), size * 0.6, scale=(1.0, 0.65, 0.2), matrix=mx)
            if ribs:
                for i in (-1, 0, 1):
                    sk.limb('solid', m['bone'], tuple(mx @ Vector((-size * 0.45, i * size * 0.22, 0.06))),
                            tuple(mx @ Vector((size * 0.5, i * size * 0.22 + 0.03, 0.06))), 0.028, joints=False, segs=8)
        _, mx = back.at(115, 50, -0.01)
        sk.sphere('solid', m['skin'], (0, 0, 0), 0.2, scale=(1.0, 0.9, 0.25), matrix=mx)
        for i in range(5):
            # a ragged hem hanging off the waist
            _, mx = back.at(130 + i * 25 + rnd.uniform(-6, 6), -62, 0.0)
            sk.cyl('solid', m['rag'], (0, 0, 0), 0.08, 0.16, radius2=0.0, rot=(math.pi / 2 + 0.4, 0, 0), segs=4, matrix=mx)
    else:
        # bare back: shoulder blades, ribs along the flanks, a raw wound
        for y in (-1, 1):
            _, mx = back.at(180 - 35 * y, 30, -0.04)
            sk.sphere('solid', m['skin'], (0, 0, 0), 0.22, scale=(1.0, 0.8, 0.35), matrix=mx)
            for i in range(3):
                _, mx = back.at(180 - 62 * y, 10 - i * 18, -0.01)
                sk.sphere('solid', m['bone'], (0, 0, 0), 0.16, scale=(0.25, 1.0, 0.22), rot=(0, 0, 0.5 * y), matrix=mx)
        _, mx = back.at(205 + rnd.uniform(-10, 10), -20, -0.02)
        sk.sphere('solid', m['flesh'], (0, 0, 0), 0.2, scale=(1.0, 0.7, 0.22), matrix=mx)
    for i in range(7):
        # the spine ridge, knuckled vertebrae down the middle of the back
        _, mx = back.at(180, 62 - i * 17, 0.0)
        sk.sphere('solid', m['bone'] if (not shirt or i in (2, 3)) else m['skin'], (0, 0, 0), 0.065, scale=(1.0, 1.3, 0.7), matrix=mx)
    hk = rig.kit('hips')
    hk.sphere('solid', m['pants'], (0, 0, hip + 0.04), 1.0, scale=(tx * 0.95, ty * 0.85, 0.18), segs=20)
    return back, mid


def head_centre(p):
    return Vector((p['reach'], 0, p['sh'] + p['neck'] + p['head'] * 0.8))


def eyes(p):
    """Both eyes' centres in rest pose, right then left."""
    hr = p['head']
    return [head_centre(p) + Vector((hr * 0.9, y * hr, hr * 0.08)) for y in (-0.38, 0.38)]


def check_eyes(kind, p, z, shear):
    """The night eyes the painter draws (ZOMBIE_LOOK eyes: ahead, apart, and lift north from the shear) must sit on
    the model's eyes, so a pose or head change that moves them fails the bake instead of leaving glows off the face."""
    rig = Rg.Rig(bones(p), LIMBS)
    pos, rot = rig.solve(pose(p))['head']
    rest = rig.bones['head'].head
    z_ref = p['sh'] * math.cos(math.radians(p['lean']))
    want = z['eyes']
    for e, side in zip(eyes(p), (-1, 1)):
        w = pos + rot @ (e - rest)
        got = (w.x, w.y * side, shear * (w.z - z_ref))
        miss = math.dist(got, (want['ahead'], want['apart'], want['lift']))
        if miss > EYE_SLACK:
            raise RuntimeError(f'zombie:{kind}: an eye sits at ahead {got[0]:.2f}, apart {got[1]:.2f}, lift {got[2]:.2f} (radius '
                               f'units), {miss:.2f} from ZOMBIE_LOOK.{kind}.eyes (limit {EYE_SLACK})')


def head(rig, p, m, rnd):
    hd = rig.kit('head')
    hr = p['head']
    hc = head_centre(p)
    hd.sphere('solid', m['skin'], tuple(hc), hr, scale=(1.1, 0.95, 0.95), segs=20)
    hd.sphere('solid', m['skin'], tuple(hc + Vector((hr * 0.72, 0, hr * 0.28))), hr * 0.5, scale=(0.6, 1.5, 0.45))
    # hanging jaw: dark mouth and the jaw dropped below it
    hd.sphere('solid', m['gore'], tuple(hc + Vector((hr * 0.85, 0, -hr * 0.3))), hr * 0.38, scale=(0.6, 1.0, 0.6))
    hd.sphere('solid', m['limb'], tuple(hc + Vector((hr * 0.62, 0, -hr * 0.78))), hr * 0.42, scale=(1.1, 1.3, 0.5))
    for e in eyes(p):
        hd.sphere('solid', m['eye'], tuple(e), 0.2 * hr)
    # a patch of scalp torn off the crown, skull showing
    a = rnd.uniform(-0.6, 0.6)
    top = hc + Vector((-hr * 0.15, math.sin(a) * hr * 0.4, hr * 0.85))
    hd.sphere('solid', m['bone'], tuple(top), hr * 0.42, scale=(1.0, 0.8, 0.35))
    hd.sphere('solid', m['flesh'], tuple(top + Vector((-hr * 0.2, 0, -0.01))), hr * 0.32, scale=(0.5, 0.9, 0.32))
    return hc


def arms(rig, p, m):
    th = p['limb']
    for side in 'RL':
        big = p['big_arm'] if side == 'R' else 1.0
        u, f, h = (rig.bones[f'{n}.{side}'] for n in ('upper_arm', 'forearm', 'hand'))
        uk = rig.kit(f'upper_arm.{side}')
        uk.limb('solid', m['limb'], tuple(u.head), tuple(u.tail), th * 1.15 * big, th * 0.95 * big)
        if side == 'R' and p['shirt']:
            # what is left of a sleeve, ragged at the elbow
            end = u.head.lerp(u.tail, 0.75)
            uk.limb('solid', m['rag'], tuple(u.head), tuple(end), th * 1.32, th * 1.18)
            for i in range(4):
                a = i * math.pi / 2 + 0.4
                uk.cyl('solid', m['rag'], tuple(end + Vector((math.cos(a) * th, math.sin(a) * th, -th * 0.35))), th * 0.32, th * 0.7, radius2=0.0, rot=(math.pi, 0, 0), segs=4)
        fk = rig.kit(f'forearm.{side}')
        fk.limb('solid', m['limb'], tuple(f.head), tuple(f.tail), th * 1.05 * big, th * 0.85 * big)
        if side == 'L' and p['shirt']:
            fk.sphere('solid', m['flesh'], tuple(f.head.lerp(f.tail, 0.5) + Vector((-th * 0.7, 0, 0))), th * 0.55, scale=(0.5, 1.0, 1.6))
        if p['cuffs']:
            c = f.head.lerp(f.tail, 0.72)
            fk.cyl('solid', m['plate'], tuple(c), th * 0.98 * big, th * 0.5, segs=14, bevel=0.015)
            fk.limb('solid', m['plate'], tuple(c + Vector((th * 0.9 * big, 0, 0))), tuple(c + Vector((th * 1.5 * big, 0, -th))), th * 0.16, segs=6)
        hk = rig.kit(f'hand.{side}')
        hz = h.head.z - 0.05
        hk.sphere('solid', m['limb'], (h.head.x, h.head.y, hz), th * 1.05 * big, scale=(1.0, 1.15, 0.8))
        n = 4 if big == 1 else 3
        fr = th * 0.36 * big
        fl = big ** -0.4
        for i in range(n):
            # thick fingers splayed along the reach and hooked under, claws on the ends
            sp = (i - (n - 1) / 2) / max(1, n - 1)
            a = Vector((h.head.x - th * 0.3 * big, h.head.y + sp * th * 1.2 * big, hz - th * 0.3 * big))
            b = a + Vector((-th * 0.15 * big, sp * th * 0.5 * big, -th * 0.9 * big * fl))
            c = b + Vector((-th * 0.6 * big * fl, sp * th * 0.15 * big, -th * 0.4 * big * fl))
            hk.limb('solid', m['limb'], tuple(a), tuple(b), fr, fr * 0.85, segs=8)
            hk.limb('solid', m['limb'], tuple(b), tuple(c), fr * 0.85, fr * 0.7, segs=8)
            hk.limb('solid', m['claw'], tuple(c), tuple(c + (c - b) * 0.5), fr * 0.6, fr * 0.1, segs=6, joints=False)
        if big > 1:
            for i in range(3):
                hk.cyl('solid', m['bone'], (h.head.x + (i - 1) * 0.1, h.head.y, hz + 0.16 * big), 0.06, 0.24, radius2=0.0, segs=8)


def legs(rig, p, m):
    th = p['limb']
    for side in 'RL':
        t, s = rig.bones[f'thigh.{side}'], rig.bones[f'shin.{side}']
        rig.kit(f'thigh.{side}').limb('solid', m['pants'], tuple(t.head), tuple(t.tail), th * 1.2, th * 1.05)
        sk = rig.kit(f'shin.{side}')
        sk.limb('solid', m['pants'] if side == 'L' else m['limb'], tuple(s.head), tuple(s.tail), th * 1.0, th * 0.85)
        rig.kit(f'foot.{side}').sphere('solid', m['limb'], (s.tail.x + 0.09, s.tail.y, 0.06), th, scale=(1.7, 1.0, 0.6))


def plated(rig, p, m, back, mid, hc, rnd):
    """Bolted scrap armour: a skull cap, pauldrons, a back plate over the shirt and bracers. The rips stay visible at
    the plate's edges."""
    sk = rig.kit('spine')
    for y in (-1, 1):
        pad = Vector((-0.05, p['sw'] * y, p['sh'] + 0.02))
        sk.sphere('solid', m['plate'], tuple(pad), 0.27, scale=(1.25, 1.0, 0.62), rot=(0.35 * y, 0, 0), segs=20)
        sk.box('solid', m['edge'], tuple(pad + Vector((0, 0.16 * y, -0.05))), (0.5, 0.05, 0.08), rot=(0.35 * y, 0, 0), bevel=0.02)
        for x in (-0.15, 0.15):
            sk.sphere('solid', m['edge'], tuple(pad + Vector((x, 0, 0.16))), 0.035)
    for az, el, size, rot in ((180, 18, (0.58, 0.62, 0.07), 0.08), (178, -28, (0.44, 0.5, 0.07), -0.12)):
        _, mx = back.at(az, el, 0.02)
        sk.box('solid', m['plate'], (0, 0, 0), size, rot=(0, 0, rot), bevel=0.03, matrix=mx)
        sk.box('solid', m['rust'], (size[0] * 0.25, -size[1] * 0.2, 0.035), (size[0] * 0.3, size[1] * 0.3, 0.01), rot=(0, 0, 0.4), matrix=mx)
        for cx in (-1, 1):
            for cy in (-1, 1):
                sk.sphere('solid', m['edge'], (cx * size[0] * 0.38, cy * size[1] * 0.4, 0.04), 0.035, matrix=mx)
    for y in (-1, 1):
        _, mx = back.at(180 - 40 * y, 52, 0.0)
        sk.box('solid', m['rag'], (0, 0, 0), (0.5, 0.08, 0.04), rot=(0, 0, 0), matrix=mx)
    hd = rig.kit('head')
    hr = p['head']
    hd.sphere('solid', m['plate'], tuple(hc + Vector((-hr * 0.1, 0, hr * 0.2))), hr * 1.08, scale=(1.08, 1.0, 0.8), segs=20)
    hd.box('solid', m['edge'], tuple(hc + Vector((-hr * 0.1, 0, hr * 0.95))), (hr * 1.7, hr * 0.22, hr * 0.12), bevel=0.02)
    for side in 'RL':
        f = rig.bones[f'forearm.{side}']
        rig.kit(f'forearm.{side}').cyl('solid', m['plate'], tuple(f.head.lerp(f.tail, 0.55)), p['limb'] * 1.25, p['fa'] * 0.5, segs=12, bevel=0.03)


def bloater(rig, p, m, back, mid, hc, rnd):
    """A gut swollen past the hips and a cluster of glossy sacs over the back and shoulders, veined where they join."""
    sk = rig.kit('spine')
    sk.sphere('solid', m['skin'], (0.2, 0, mid - 0.22), 0.78, scale=(1.0, 1.0, 0.8), segs=28)
    sacs = [(180, 15, 0.46), (218, 38, 0.34), (142, 42, 0.34), (245, -8, 0.3), (118, -2, 0.3), (195, -32, 0.3), (165, 62, 0.24), (80, 35, 0.22)]
    for az, el, size in sacs:
        _, mx = back.at(az + rnd.uniform(-6, 6), el + rnd.uniform(-5, 5), -size * 0.45)
        sk.sphere('solid', m['sac'], (0, 0, 0), size, scale=(1.0, 1.0, 0.95), segs=20, matrix=mx)
        for i in range(2):
            a = rnd.uniform(0, 2 * math.pi)
            sk.limb('solid', m['vein'], tuple(mx @ Vector((math.cos(a) * size * 0.3, math.sin(a) * size * 0.3, size * 0.88))),
                    tuple(mx @ Vector((math.cos(a) * size * 0.95, math.sin(a) * size * 0.95, size * 0.15))), 0.018, joints=False, segs=6)
    for i in range(6):
        a, d = rnd.uniform(-1.2, 1.2), rnd.uniform(0.3, 0.75)
        pos = Vector((0.2 + 0.78 * math.cos(a) * d, 0.78 * math.sin(a) * d, mid - 0.22 + 0.62 * math.sqrt(max(0, 1 - d * d))))
        sk.sphere('solid', m['flesh'], tuple(pos), rnd.uniform(0.06, 0.1), scale=(1, 1, 0.5))


def brute(rig, p, m, back, mid, hc, rnd):
    """The trapezius slab and hump the head sinks into, a torn harness strap across it, and raw gashes."""
    sk = rig.kit('spine')
    sw, sh, th = p['sw'], p['sh'], p['limb']
    slab = Back((-0.12, 0, sh - 0.02), (sw * 0.71, sw * 0.9, sw * 0.52))
    sk.sphere('solid', m['skin'], tuple(slab.c), 1.0, scale=tuple(slab.s), segs=28)
    for y in (-1, 1):
        sk.sphere('solid', m['limb'], (0.0, sw * y, sh - 0.06), th * 2.0, scale=(1.15, 1.0, 0.85), segs=20)
    _, mx = slab.at(180, 35, 0.0)
    sk.box('solid', m['rag'], (0, 0, 0), (0.16, 1.15, 0.06), rot=(0, 0, 0.55), bevel=0.02, matrix=mx)
    sk.box('solid', m['plate'], (0, 0.08, 0.04), (0.13, 0.13, 0.04), rot=(0, 0, 0.55), bevel=0.01, matrix=mx)
    for az, el, rz in ((145, 20, 0.4), (215, 45, -0.5), (200, 0, 0.2)):
        _, mx = slab.at(az, el, -0.015)
        sk.sphere('solid', m['flesh'], (0, 0, 0), 0.16, scale=(1.4, 0.75, 0.22), rot=(0, 0, rz), matrix=mx)
        sk.sphere('solid', m['gore'], (0, 0, 0.02), 0.09, scale=(1.5, 0.45, 0.22), rot=(0, 0, rz), matrix=mx)
    for i in range(5):
        _, mx = slab.at(180, 70 - i * 18, 0.0)
        sk.sphere('solid', m['skin'], (0, 0, 0), 0.07, scale=(1.0, 1.4, 0.7), matrix=mx)
    return slab


def colossus(rig, p, m, back, mid, hc, rnd):
    """The brute's slab grown huge: a hump, steel plates driven into it, bone spikes erupting along the ridge."""
    brute(rig, p, m, back, mid, hc, rnd)
    sk = rig.kit('spine')
    sh = p['sh']
    hump = Back((-0.35, 0.05, sh - 0.12), (0.5, 0.5, 0.375))
    sk.sphere('solid', m['skin'], tuple(hump.c), 1.0, scale=tuple(hump.s), segs=28)
    for i, (az, el) in enumerate(((140, 25), (220, 20), (180, -15))[:p['plates']]):
        _, mx = hump.at(az, el, 0.0)
        sk.sphere('solid', m['flesh'], (0, 0, -0.01), 0.22, scale=(1.25, 1.15, 0.22), matrix=mx)
        sk.box('solid', m['plate'], (0, 0, 0.03), (0.32, 0.27, 0.07), rot=(0.12, -0.18, 0.35 * (i - 1)), bevel=0.03, matrix=mx)
        sk.box('solid', m['rust'], (0.06, -0.05, 0.07), (0.12, 0.1, 0.01), rot=(0, 0, 0.6), matrix=mx)
        for cx in (-1, 1):
            sk.sphere('solid', m['edge'], (cx * 0.11, 0.09 * cx, 0.075), 0.03, matrix=mx)
    for i in range(7):
        # spikes up the ridge of the hump and on to the slab, leaning back
        az, el = 180 + (i % 2 * 2 - 1) * 12, 75 - i * 14
        _, mx = hump.at(az, el, -0.02)
        ln = 0.32 + 0.12 * math.sin(i * 1.7)
        sk.sphere('solid', m['flesh'], (0, 0, 0), 0.09, scale=(1.2, 1.2, 0.4), matrix=mx)
        sk.cyl('solid', m['bone'], (0, 0, ln / 2), 0.075, ln, radius2=0.0, rot=(0.25 * (i % 2 * 2 - 1), -0.35, 0), segs=8, matrix=mx)


EXTRAS = {'plated': plated, 'bloater': bloater, 'brute': brute, 'colossus': colossus}


def pose(p):
    lean = p['lean']
    out = {'spine': (0, lean, 0), 'head': (0, -lean * 0.8, 0)}
    for i, side in enumerate('RL'):
        y = 1 if side == 'L' else -1
        out[f'arm.{side}'] = p['hands'][i]
        out[f'arm.{side}.pole'] = (-0.3, y, -0.5)
        fx, fy = p['feet'][i]
        out[f'leg.{side}'] = (fx, fy, 0.06)
        out[f'leg.{side}.pole'] = (1, 0, 0)
    return out


def build(b):
    kind = b.arg[0]
    z = b.spec['zombies'][kind]
    r = z['radius']
    p = plan(kind)
    check_eyes(kind, p, z, b.spec['camera']['shear'])
    m = materials(kind, z, p)
    rig = Rg.Rig(bones(p), LIMBS)
    back, mid = torso(rig, p, m, b.rnd)
    hc = head(rig, p, m, b.rnd)
    arms(rig, p, m)
    legs(rig, p, m)
    if kind in EXTRAS:
        EXTRAS[kind](rig, p, m, back, mid, hc, b.rnd)
    armature = rig.build(b.root, b.colls, pose(p))
    armature.scale = (r, r, r)
    return C.Model(z_ref=p['sh'] * r * math.cos(math.radians(p['lean'])), contact=True, outline=(INK, 1.0), freeze=True)
