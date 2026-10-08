"""The armoured trooper: one rig, posed by actions, baked in segments the painter stacks.

`legs` is the pelvis down (run cycle by movement direction), `torso` is the waist up with the arms and gun hands (by
aim), `full` is both (the sun shadow), and `downed` and `dead` lie on the floor. The gun is not part of the model: the
painter draws it at the origin along the aim, and the aim, recoil and reload poses keep the hands where its grip and
fore-end are. Built at the 24-unit player radius and scaled to the real one.

Team parts are near-white so the painter's multiply tint gives the team color. Armour tiers are steel and olive kits
laid over the back, chest and collar, leaving the shoulder pads, upper arms, chest panel and helmet stripe in team color.
"""

import math

from . import common as C
from . import rig as Rg

SHOULDER = 22.0
INK = (0.07, 0.07, 0.08)
TEAM = (0.75, 0.75, 0.75)
# How far the painter pushes the gun back at full kick (stage.ts RECOIL = R * 0.22), at the 24-unit scale.
KICK = 24 * 0.22

BONES = [
    Rg.Bone('hips', None, (0, 0, 12), (0, 0, 15)),
    Rg.Bone('spine', 'hips', (0, 0, 15), (0, 0, 25)),
    Rg.Bone('head', 'spine', (1, 0, 25), (1, 0, 33)),
]
for side, y in (('R', -1), ('L', 1)):
    BONES += [
        Rg.Bone(f'upper_arm.{side}', 'spine', (-1, 13 * y, 22.5), (-1.5, 15 * y, 12.7)),
        Rg.Bone(f'forearm.{side}', f'upper_arm.{side}', (-1.5, 15 * y, 12.7), (-0.5, 15 * y, 1.7)),
        Rg.Bone(f'hand.{side}', f'forearm.{side}', (-0.5, 15 * y, 1.7), (-0.5, 15 * y, -1.3)),
        Rg.Bone(f'thigh.{side}', 'hips', (0, 6 * y, 12), (0.5, 6.5 * y, 6.6)),
        Rg.Bone(f'shin.{side}', f'thigh.{side}', (0.5, 6.5 * y, 6.6), (0, 6.5 * y, 1.8)),
        Rg.Bone(f'foot.{side}', f'shin.{side}', (0, 6.5 * y, 1.8), (5, 6.5 * y, 1.8)),
    ]
LIMBS = {f'{kind}.{side}': Rg.Limb(*(f'{b}.{side}' for b in bones))
         for side in 'RL' for kind, bones in (('arm', ('upper_arm', 'forearm', 'hand')), ('leg', ('thigh', 'shin', 'foot')))}


# ---------------------------------------------------------------- actions

def pose(**over):
    """The aim stance with overrides: bladed torso, right hand on the grip, left hand on the fore-end, feet planted."""
    p = {
        'spine': (0, 6, -15), 'head': (0, -4, 13),
        'arm.R': (12.5, -6, 19.5), 'arm.R.pole': (-0.3, -1, -0.5),
        'arm.L': (21.5, 1.5, 20), 'arm.L.pole': (0, 1, -0.6),
        'leg.R': (-1.5, -7.5, 1.8), 'leg.R.pole': (1, -0.15, 0),
        'leg.L': (2.5, 7.5, 1.8), 'leg.L.pole': (1, 0.15, 0),
    }
    p.update(over)
    return p


def kicked(t):
    """The aim with the hands pushed back by t of a full kick, matching the gun the painter kicks by the same amount."""
    base = pose()
    return pose(head=(0, -4 - 6 * t, 13),
                **{'arm.R': (base['arm.R'][0] - KICK * t, -5, 19.5 + 0.4 * t), 'arm.L': (base['arm.L'][0] - KICK * t, 1.5, 20 + 0.4 * t)})


def reload_strip():
    """Left hand: to the magazine, out and down to the hip pouch, back up with a fresh one, seat it, back to the fore-end."""
    look = (0, 16, 4)
    keys = [
        dict(l=(22, -6, 19), head=look),
        dict(l=(10, 7, 15), head=look),
        dict(l=(-1, 12.5, 13.5), head=(0, 10, 25)),
        dict(l=(11, 3, 17), head=look),
        dict(l=(22, -6, 19.5), head=look),
        dict(l=(21, 0.5, 20), head=(0, 4, 10)),
    ]
    return [pose(head=k['head'], **{'arm.L': k['l'], 'arm.L.pole': (-0.4, 1, -0.6), 'arm.R': (11, -5, 19)}) for k in keys]


def run_cycle(n=8):
    """n frames of a jog: feet swing forward lifted and push back planted, the pelvis bobs and turns with the stride."""
    frames = []
    for i in range(n):
        phi = 2 * math.pi * i / n
        legs = {}
        for side, y, ph in (('R', -1, phi), ('L', 1, phi + math.pi)):
            x = 17 * math.sin(ph)
            lift = 5 * max(0.0, math.cos(ph))
            legs[f'leg.{side}'] = (x, 7 * y, 1.8 + lift)
            legs[f'leg.{side}.pole'] = (1, 0.1 * y, 0.2)
        frames.append(pose(hips=(0.8, 0, -0.9 + 0.7 * math.cos(2 * phi)), hips_rot=(0, 6, 10 * math.sin(phi)), **legs))
    return frames


def lying(face_up, hips_xy, turn, arms, legs, roll=0.0, spine=(0, 0, 0), head=(0, 0, 0)):
    """A body on the floor: the pelvis tipped onto its back (face_up) or front, centred near the origin, limbs placed."""
    tip = -88 if face_up else 86
    p = pose(hips=(hips_xy[0], hips_xy[1], -8.5), hips_rot=(roll, tip, turn), spine=spine, head=head)
    for k, v in {**arms, **legs}.items():
        p[k] = v
    return p


ACTIONS = {
    'idle': [pose()],
    'aim': [pose()],
    'recoil': [kicked(1.0), kicked(0.5)],
    'reload': reload_strip(),
    'run': run_cycle(),
    'downed': [lying(False, (-6, 0), 0, spine=(0, -12, 0), head=(0, -30, 0),
                     arms={'arm.L': (24, 10, 3), 'arm.L.pole': (0, 1, 0.3), 'arm.R': (8, -15, 3), 'arm.R.pole': (-0.5, -1, 0.4)},
                     legs={'leg.R': (-30, -6, 3), 'leg.R.pole': (0, -1, -1), 'leg.L': (-24, 12, 3), 'leg.L.pole': (0.3, 1, -1)})],
    'death': [
        lying(True, (6, 0), 0, head=(0, 0, 25),
              arms={'arm.L': (-18, 22, 3), 'arm.L.pole': (1, 1, 0.5), 'arm.R': (-6, -24, 3), 'arm.R.pole': (1, -1, 0.5)},
              legs={'leg.R': (30, -10, 3), 'leg.R.pole': (0, 0, 1), 'leg.L': (28, 9, 3), 'leg.L.pole': (0, 0, 1)}),
        lying(False, (-6, 2), 20, head=(0, 0, -50),
              arms={'arm.L': (16, 20, 3), 'arm.L.pole': (0, 1, 1), 'arm.R': (-8, -16, 3), 'arm.R.pole': (0, -1, 1)},
              legs={'leg.R': (-30, -12, 3), 'leg.R.pole': (0, 0, -1), 'leg.L': (-29, 10, 3), 'leg.L.pole': (0, 0, -1)}),
        lying(True, (4, -2), -25, roll=70, spine=(0, 25, 0), head=(0, 25, 0),
              arms={'arm.L': (14, -18, 4), 'arm.L.pole': (0, 0, 1), 'arm.R': (10, -24, 3), 'arm.R.pole': (0, -1, 1)},
              legs={'leg.R': (20, -22, 3), 'leg.R.pole': (1, -1, 0), 'leg.L': (14, -16, 7), 'leg.L.pole': (1, -1, 0)}),
    ],
}
# The catalog's frame order for each baked segment.
STRIPS = {'legs': ['idle', 'run'], 'torso': ['aim', 'recoil', 'reload'], 'full': ['aim'], 'downed': ['downed'], 'dead': ['death']}


def frame_pose(segment, frame):
    poses = [p for action in STRIPS[segment] for p in ACTIONS[action]]
    return poses[frame]


# ---------------------------------------------------------------- model

def materials():
    return {
        'team': C.mat('team', TEAM, rough=0.42, grime=0.1, grime_scale=0.5, coat=0.35, ink=0.5, ao=0.45),
        'cloth': C.mat('cloth', C.scalec(TEAM, 0.66), rough=0.85, grime=0.2, grime_scale=0.8, ink=0.5, ao=0.4),
        'gear': C.mat('gear', (0.035, 0.036, 0.04), rough=0.55, metal=0.2, grime=0.12, ink=0.4),
        'boot': C.mat('boot', (0.022, 0.02, 0.019), rough=0.7, grime=0.15, grime_scale=1.2, ink=0.35, ao=0.3),
        'helmet': C.mat('helmet', (0.03, 0.032, 0.036), rough=0.28, metal=0.35, grime=0.1, coat=0.7, ink=0.3),
        'visor': C.mat('visor', (0.01, 0.012, 0.016), rough=0.08, grime=0.0, coat=1.0),
        'glove': C.mat('glove', (0.02, 0.02, 0.022), rough=0.7, grime=0.0, ink=0.3),
        'webbing': C.mat('webbing', (0.105, 0.11, 0.06), rough=0.9, grime=0.25, grime_scale=1.2, ink=0.35, ao=0.35),
        'pouch': C.mat('pouch', (0.13, 0.135, 0.075), rough=0.9, grime=0.25, grime_scale=1.0, ink=0.4, ao=0.35),
        'plate': C.mat('plate', (0.3, 0.31, 0.32), rough=0.35, metal=0.65, grime=0.3, grime_scale=0.8, coat=0.25, ink=0.45, ao=0.35),
        'edge': C.mat('plate-edge', (0.5, 0.5, 0.5), rough=0.3, metal=0.85, grime=0.15),
    }


def legs(rig, m):
    k = rig.kit('hips')
    k.box('solid', m['gear'], (-0.5, 0, 13.2), (12, 17, 5), bevel=2.0)
    for side, y in (('R', -1), ('L', 1)):
        th = rig.bones[f'thigh.{side}']
        rig.kit(f'thigh.{side}').limb('team', m['cloth'], tuple(th.head), tuple(th.tail), 4.6, 4.0)
        rig.kit(f'thigh.{side}').box('team', m['team'], (th.head.x * 0.5 + th.tail.x * 0.5 + 0.5, th.head.y * 0.5 + th.tail.y * 0.5 + 1.8 * y, 9.6), (6, 2.6, 5), bevel=1.1)
        sh = rig.bones[f'shin.{side}']
        rig.kit(f'shin.{side}').limb('solid', m['gear'], tuple(sh.head), tuple(sh.tail), 3.9, 3.4)
        rig.kit(f'shin.{side}').sphere('solid', m['boot'], (sh.head.x + 2.2, sh.head.y, sh.head.z + 0.3), 2.9, scale=(0.9, 1.15, 1.0))
        rig.kit(f'foot.{side}').box('solid', m['boot'], (3, 6.5 * y, 2.2), (11.5, 7.2, 4.6), bevel=1.9)


def torso(rig, m):
    k = rig.kit('spine')
    k.box('team', m['team'], (-1.5, 0, 19.5), (17, 23, 12), bevel=4.5, segments=3)
    k.box('team', m['team'], (6.4, 0, 20.2), (3, 12, 8), bevel=1.4)
    k.box('team', m['cloth'], (-11.2, 0, 20.5), (8, 17, 12), bevel=3)
    k.box('solid', m['gear'], (-15, 0, 19.5), (1.5, 11, 6), bevel=0.6)
    k.sphere('solid', m['gear'], (0.5, 0, 24.6), 4.6)
    for y in (-13, 13):
        k.sphere('team', m['team'], (-1.5, y, 23.6), 7.2, scale=(1.15, 1.0, 0.8), segs=20)
    h = rig.kit('head')
    h.sphere('solid', m['helmet'], (1.5, 0, 29), 7.0, scale=(1.12, 1.0, 0.88), segs=24)
    h.sphere('team', m['team'], (1.3, 0, 29.15), 7.15, scale=(1.13, 0.26, 0.89), segs=24)
    h.box('solid', m['visor'], (7.9, 0, 28.0), (3.0, 9.0, 3.0), bevel=1.1)
    for side in 'RL':
        up, lo = rig.bones[f'upper_arm.{side}'], rig.bones[f'forearm.{side}']
        rig.kit(f'upper_arm.{side}').limb('team', m['team'], tuple(up.head), tuple(up.tail), 4.0, 3.6)
        rig.kit(f'forearm.{side}').limb('team', m['cloth'], tuple(lo.head), tuple(lo.tail), 3.5, 3.1)
        hand = rig.bones[f'hand.{side}']
        rig.kit(f'hand.{side}').sphere('solid', m['glove'], (hand.head.x, hand.head.y, hand.head.z - 1.5), 3.3, scale=(1.0, 0.95, 1.2))


def armour(rig, m, tier):
    """One armour tier's whole kit (each tier is drawn alone over base and team). It rides the spine only, which no
    torso frame moves, so the catalog bakes it once per facing and every frame shares it."""
    k = rig.kit('spine')
    for y in (-5.2, 5.2):
        k.box(tier, m['webbing'], (-2.5, y, 25.4), (22, 2.6, 1.2), bevel=0.5)
    if tier == 'armorLight':
        for y in (-5.5, 5.5):
            k.box(tier, m['pouch'], (-11.2, y, 26.6), (5.5, 5, 2.6), bevel=1.0)
        for y in (-4.5, 4.5):
            k.box(tier, m['pouch'], (7.9, y, 18.5), (3.4, 4.6, 5), bevel=0.9)
        return
    # medium: a steel back plate over the pack, a collar behind the helmet, magazine pouches on the chest
    k.box(tier, m['plate'], (-9.5, 0, 26.2), (12, 15, 2.4), bevel=1.4)
    k.box(tier, m['edge'], (-9.5, 0, 27.5), (8, 10, 0.5), bevel=0.25)
    k.box(tier, m['plate'], (-5.5, 0, 27.2), (3.5, 12, 3.2), bevel=1.2)
    for y in (-5, 0, 5):
        k.box(tier, m['pouch'], (8.0, y, 17.6), (3.6, 4.4, 6), bevel=0.9)
    if tier == 'armorMedium':
        return
    # heavy: steel cops on the outer rim of each pad (the pad tops stay team), a neck guard, a spine plate
    for y in (-1, 1):
        k.sphere(tier, m['plate'], (-1.5, 18.3 * y, 22.6), 5.4, scale=(1.5, 0.6, 0.85), segs=20)
        k.box(tier, m['edge'], (-1.5, 20.6 * y, 22.2), (12, 1.2, 2.4), bevel=0.5)
    k.box(tier, m['plate'], (-4.5, 0, 31.0), (4, 13, 3.4), bevel=1.3)
    k.box(tier, m['plate'], (-15.6, 0, 22.5), (2.2, 14, 9), bevel=1.0)
    for x in (-3.5, 1.5):
        k.box(tier, m['plate'], (x, 0, 26.4), (4, 9, 1.6), bevel=0.6)


def build(b):
    """Model `soldier:<segment>`; frame indexes the segment's strip (STRIPS)."""
    segment = b.arg[0]
    s = b.R / 24
    m = materials()
    r = Rg.Rig(BONES, LIMBS)
    if segment in ('legs', 'full', 'downed', 'dead'):
        legs(r, m)
    if segment in ('torso', 'full', 'downed', 'dead'):
        torso(r, m)
    if segment == 'torso':
        for tier in C.ARMOR:
            armour(r, m, tier)
    arm = r.build(b.root, b.colls, frame_pose(segment, b.frame))
    arm.scale = (s, s, s)
    if segment in ('downed', 'dead'):
        return C.Model(z_ref=None, overhead=True, contact=1.0, outline=(INK, 1.0), freeze=True)
    return C.Model(z_ref=SHOULDER * s, outline=(INK, 1.0), contact=0.7 if segment == 'legs' else 0.0, freeze=True)
