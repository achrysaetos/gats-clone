"""The armoured trooper: one rig, posed by actions, baked in segments the painter stacks.

`torso` is the waist up with the arms and gun hands (by aim), `act` is the same waist up in the moves that take a hand
off the grip or snap the head (reloads, flinches, throws, knife), `legs` is the pelvis down (by movement), `full` is
both (the sun shadow), `downed` lies on the floor, and `die` falls from standing into the body that stays. The gun is
not part of the model: the painter draws it under the torso at the origin along the aim, and every pose that holds it
keeps the hands on GRIP, which the bake checks.

Team parts are near-white so the painter's multiply tint gives the team color: the shoulder plates, arms, chest shell,
backpack, thigh plates, knee pads and helmet stripe. Armour tiers are kit laid over the chest, collar and flanks, never
over those panels. Built at the 24-unit player radius and scaled to the real one.
"""

import math

from . import common as C
from . import rig as Rg

SHOULDER = 22.0
INK = (0.07, 0.07, 0.08)
TEAM = (0.75, 0.75, 0.75)
# How far the painter pushes the gun back at full kick (stage.ts RECOIL = R * 0.22), at the 24-unit scale.
KICK = 24 * 0.22
# Where the hands hold the gun in model space: the right hand on the pistol grip, the left on the fore-end. Every gun
# model puts its grip and fore-end here, so any pose that holds the gun holds every gun.
GRIP = {'R': (12.5, -6.0, 19.5), 'L': (21.5, 1.5, 20.0)}
# How far a holding hand may miss its grip, in game units (2 px at the catalog's 2 px per unit).
GRIP_SLACK = 1.0

BONES = [
    Rg.Bone('hips', None, (0, 0, 12), (0, 0, 15)),
    Rg.Bone('spine', 'hips', (0, 0, 15), (0, 0, 25)),
    Rg.Bone('head', 'spine', (1, 0, 25), (1, 0, 33)),
]
for side, y in (('R', -1), ('L', 1)):
    BONES += [
        Rg.Bone(f'upper_arm.{side}', 'spine', (-1, 13 * y, 22.5), (-1.5, 15 * y, 11.5)),
        Rg.Bone(f'forearm.{side}', f'upper_arm.{side}', (-1.5, 15 * y, 11.5), (-0.5, 15 * y, -0.5)),
        Rg.Bone(f'hand.{side}', f'forearm.{side}', (-0.5, 15 * y, -0.5), (-0.5, 15 * y, -3.5)),
        Rg.Bone(f'thigh.{side}', 'hips', (0, 6 * y, 12), (0.5, 6.5 * y, 6.6)),
        Rg.Bone(f'shin.{side}', f'thigh.{side}', (0.5, 6.5 * y, 6.6), (0, 6.5 * y, 1.8)),
        Rg.Bone(f'foot.{side}', f'shin.{side}', (0, 6.5 * y, 1.8), (5, 6.5 * y, 1.8)),
    ]
LIMBS = {f'{kind}.{side}': Rg.Limb(*(f'{b}.{side}' for b in bones))
         for side in 'RL' for kind, bones in (('arm', ('upper_arm', 'forearm', 'hand')), ('leg', ('thigh', 'shin', 'foot')))}


# ---------------------------------------------------------------- actions

def pose(holds='RL', **over):
    """The aim stance with overrides: bladed torso, hands on GRIP, feet planted. `holds` names the hands that must stay
    on the gun; the bake fails if one misses its grip by more than GRIP_SLACK."""
    p = {
        'spine': (0, 6, -15), 'head': (0, -4, 13),
        'arm.R': GRIP['R'], 'arm.R.pole': (-0.3, -1, -0.5),
        'arm.L': GRIP['L'], 'arm.L.pole': (0, 1, -0.6),
        'leg.R': (-1.5, -7.5, 1.8), 'leg.R.pole': (1, -0.15, 0),
        'leg.L': (2.5, 7.5, 1.8), 'leg.L.pole': (1, 0.15, 0),
        'holds': holds,
    }
    p.update(over)
    return p


def shift(v, dx=0.0, dy=0.0, dz=0.0):
    return (v[0] + dx, v[1] + dy, v[2] + dz)


def gun_moved(dx, dz, **over):
    """The aim with the gun, and so both hands on it, moved by dx along the aim and dz up. `gun` records the move so the
    grip check measures against the moved grips."""
    return pose(gun=(dx, 0, dz), **{'arm.R': shift(GRIP['R'], dx, 0, dz), 'arm.L': shift(GRIP['L'], dx, 0, dz)}, **over)


def kicked(t, nod):
    """The aim with the hands pushed back by t of a full kick (the gun the painter kicks by the same share) and the head
    nodding back by `nod` degrees."""
    return gun_moved(-KICK * t, 0.4 * t, head=(0, -4 - nod, 13))


def breathe():
    """The aim on an in-breath: hands and head ride up a touch. The spine stays still so the baked armour still fits."""
    return gun_moved(-0.2, 0.6, head=(0, -6, 13))


def left_hand(points, heads, pole=(-0.4, 1, -0.6)):
    """Frames where the right hand keeps the grip and the left hand visits `points` while the head looks at `heads`."""
    return [pose(holds='R', head=h, **{'arm.L': p, 'arm.L.pole': pole}) for p, h in zip(points, heads)]


LOOK_DOWN = (0, 16, 4)
LOOK_HIP = (0, 10, 25)

RELOADS = {
    # left hand cups under the grip, drops to the belt, slaps a magazine home, then racks the slide over the top
    'pistol': left_hand(
        [(14, 1, 16.5), (2, 12, 14), (6, 8, 16), (14, 0, 16.5), (18, -4, 22.5), (12.5, -4, 22.5)],
        [LOOK_DOWN, LOOK_HIP, LOOK_DOWN, LOOK_DOWN, (0, 6, 8), (0, 2, 8)]),
    # left hand to the magazine, out and down, to the chest pouch, back up, seats it, then works the charging handle
    'mag': left_hand(
        [(19.5, -4, 17.5), (13, 4, 13), (7, 6, 20), (15, -1, 16), (19.5, -4, 18), (14, -9, 22)],
        [LOOK_DOWN, LOOK_DOWN, LOOK_HIP, LOOK_DOWN, LOOK_DOWN, (0, 0, 2)]),
    # shells from the belt into the port under the gun twice, then a pump back and forward
    'pump': left_hand(
        [(3, 9, 14), (15, -2, 17), (3, 9, 14), (15, -2, 17), (16.5, 1.5, 20), (21.5, 1.5, 20)],
        [LOOK_HIP, LOOK_DOWN, LOOK_HIP, LOOK_DOWN, (0, 4, 8), (0, 0, 10)]),
    # top cover up, the box off the side and down, a fresh box up and on, cover shut
    'box': left_hand(
        [(15, 0, 24), (17, -7, 17), (8, 2, 13), (13, -5, 15), (17, -7, 17.5), (15, 0, 23)],
        [(0, 6, 6), LOOK_DOWN, LOOK_HIP, LOOK_DOWN, LOOK_DOWN, (0, 6, 6)]),
}


def flinch(front):
    """Two frames of a hit: the head snaps away from the blow and the hands lose the grip a little, then settle."""
    s = 1 if front else -1
    return [
        pose(holds='', head=(0, -4 - 22 * s, 13), **{'arm.R': shift(GRIP['R'], -2.5 * s, -1.5, 1.2), 'arm.L': shift(GRIP['L'], -3 * s, 1.5, 1.5)}),
        pose(holds='', head=(0, -4 - 9 * s, 13), **{'arm.R': shift(GRIP['R'], -1 * s, -0.5, 0.5), 'arm.L': shift(GRIP['L'], -1.2 * s, 0.5, 0.6)}),
    ]


def right_hand(points, heads, pole=(-0.3, -1, -0.2)):
    """Frames where the left hand keeps the fore-end and the right hand leaves the grip to throw or stab."""
    return [pose(holds='L', head=h, **{'arm.R': p, 'arm.R.pole': pole}) for p, h in zip(points, heads)]


THROW = right_hand([(-6, -19, 25), (13, -12, 31), (22, -3, 21)], [(0, -2, 22), (0, -8, 0), (0, 4, 4)], pole=(-0.5, -1, 0.4))
KNIFE = right_hand([(5, -19, 22), (27, -8, 20), (20, 11, 19)], [(0, -2, 6), (0, 0, 14), (0, 0, 22)])


def run_cycle(n=8, stride=17, lift=5):
    """n frames of a jog: feet swing forward lifted and push back planted, the pelvis bobs and turns with the stride."""
    frames = []
    for i in range(n):
        phi = 2 * math.pi * i / n
        legs = {}
        for side, y, ph in (('R', -1, phi), ('L', 1, phi + math.pi)):
            legs[f'leg.{side}'] = (stride * math.sin(ph), 7 * y, 1.8 + lift * max(0.0, math.cos(ph)))
            legs[f'leg.{side}.pole'] = (1, 0.1 * y, 0.2)
        frames.append(pose(hips=(0.8, 0, -0.9 + 0.7 * math.cos(2 * phi)), hips_rot=(0, 6, 10 * math.sin(phi)), **legs))
    return frames


def strafe_cycle(n=8):
    """n frames of a side-step to the left (+y): the trailing foot swings in behind the leading one and plants wide.
    Played backwards it steps right."""
    frames = []
    for i in range(n):
        phi = 2 * math.pi * i / n
        legs = {}
        for side, y, ph, x in (('R', -1, phi, -2.5), ('L', 1, phi + math.pi, 3.5)):
            legs[f'leg.{side}'] = (x + 2 * math.cos(ph), 7.5 * y + 6 * math.sin(ph), 1.8 + 4 * max(0.0, math.cos(ph)))
            legs[f'leg.{side}.pole'] = (1, 0.3 * y, 0.1)
        frames.append(pose(hips=(0, 0.6 * math.sin(phi), -0.6 + 0.6 * math.cos(2 * phi)), hips_rot=(4 * math.sin(phi), 3, -18), **legs))
    return frames


def dash_strip():
    """A dash in three frames: the push off, the long flight with both feet up, the skid with the front foot braced."""
    return [
        pose(hips=(2, 0, -2.2), hips_rot=(0, 16, 0), **{'leg.R': (-17, -7, 3.5), 'leg.L': (12, 7.5, 1.8)}),
        pose(hips=(3, 0, -1.2), hips_rot=(0, 14, 0), **{'leg.R': (-14, -7, 7), 'leg.L': (17, 7.5, 5.5)}),
        pose(hips=(-1, 0, -2.6), hips_rot=(0, -6, 0), **{'leg.R': (-6, -8, 1.8), 'leg.L': (19, 8.5, 1.8), 'leg.L.pole': (1, 0.3, 0.4)}),
    ]


def lying(face_up, hips_xy, turn, arms, legs, roll=0.0, spine=(0, 0, 0), head=(0, 0, 0)):
    """A body on the floor: the pelvis tipped onto its back (face_up) or front, centred near the origin, limbs placed."""
    tip = -88 if face_up else 86
    p = pose(holds='', hips=(hips_xy[0], hips_xy[1], -8.5), hips_rot=(roll, tip, turn), spine=spine, head=head)
    p.update(arms)
    p.update(legs)
    return p


def lerp(a, b, t):
    """A pose part way from a to b: every number eased, so a fall can be keyed by its first and last frames."""
    out = {}
    for k in b:
        if k in ('holds', 'gun'):
            continue
        va, vb = a.get(k, vb_default(k, b[k])), b[k]
        out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
    return out


def vb_default(k, v):
    return (0, 0, 0) if k in ('hips', 'hips_rot', 'spine', 'head') else v


def fall(end, mid, ease=(0.0, 0.18, 0.42, 0.7, 0.9, 1.0)):
    """Six frames from the stance into `end` through `mid` (the half-way body, staggering), the last frame the body."""
    start = pose(holds='')
    out = []
    for t in ease:
        out.append(lerp(start, mid, t / 0.42) if t <= 0.42 else lerp(mid, end, (t - 0.42) / 0.58))
    return out


BODY_BACK = lying(True, (6, 0), 0, head=(0, 0, 25),
                  arms={'arm.L': (-18, 22, 3), 'arm.L.pole': (1, 1, 0.5), 'arm.R': (-6, -24, 3), 'arm.R.pole': (1, -1, 0.5)},
                  legs={'leg.R': (30, -10, 3), 'leg.R.pole': (0, 0, 1), 'leg.L': (28, 9, 3), 'leg.L.pole': (0, 0, 1)})
BODY_FRONT = lying(False, (-6, 2), 20, head=(0, 0, -50),
                   arms={'arm.L': (16, 20, 3), 'arm.L.pole': (0, 1, 1), 'arm.R': (-8, -16, 3), 'arm.R.pole': (0, -1, 1)},
                   legs={'leg.R': (-30, -12, 3), 'leg.R.pole': (0, 0, -1), 'leg.L': (-29, 10, 3), 'leg.L.pole': (0, 0, -1)})
BODY_SPUN = lying(True, (4, -2), -25, roll=70, spine=(0, 25, 0), head=(0, 25, 0),
                  arms={'arm.L': (14, -18, 4), 'arm.L.pole': (0, 0, 1), 'arm.R': (10, -24, 3), 'arm.R.pole': (0, -1, 1)},
                  legs={'leg.R': (20, -22, 3), 'leg.R.pole': (1, -1, 0), 'leg.L': (14, -16, 7), 'leg.L.pole': (1, -1, 0)})

DIE = {
    # thrown back by the blow: knees give, arms fly up, onto the back
    'dieBack': fall(BODY_BACK, pose(holds='', hips=(3, 0, -3), hips_rot=(0, -30, 0), head=(0, -40, 0),
                                    **{'arm.L': (0, 18, 30), 'arm.R': (2, -18, 30), 'leg.R': (8, -8, 2), 'leg.L': (10, 8, 2)})),
    # folds forward over the gun and down onto the front
    'dieForward': fall(BODY_FRONT, pose(holds='', hips=(-2, 0, -4), hips_rot=(0, 35, 10), head=(0, 30, 0),
                                        **{'arm.L': (18, 12, 8), 'arm.R': (14, -12, 8), 'leg.R': (-10, -8, 2), 'leg.L': (-4, 9, 4)})),
    # spun half round by the hit and down on the side
    'dieSpin': fall(BODY_SPUN, pose(holds='', hips=(1, -1, -2.5), hips_rot=(30, 10, -80), head=(0, 10, -30),
                                    **{'arm.L': (6, 24, 20), 'arm.R': (-4, -22, 18), 'leg.R': (4, -9, 2), 'leg.L': (-6, 10, 5)})),
}


def crawl_cycle(n=4):
    """A downed soldier dragging themself forward on the elbows, legs trailing."""
    frames = []
    for i in range(n):
        s = math.sin(2 * math.pi * i / n)
        frames.append(lying(False, (-6, 0), 0, spine=(0, -12, 0), head=(0, -30, 0),
                            arms={'arm.L': (18 + 7 * s, 11, 3), 'arm.L.pole': (0, 1, 0.3), 'arm.R': (18 - 7 * s, -12, 3), 'arm.R.pole': (0, -1, 0.4)},
                            legs={'leg.R': (-30, -6 - 2 * s, 3), 'leg.R.pole': (0, -1, -1), 'leg.L': (-29, 9 + 2 * s, 3), 'leg.L.pole': (0.3, 1, -1)}))
    return frames


def revive_strip(n=4):
    """Being picked up: the downed soldier pushes up onto the hands and gets a knee under them."""
    frames = []
    for i in range(n):
        t = i / (n - 1)
        frames.append(pose(holds='', hips=(-6 + 3 * t, 0, -8.5 + 3.5 * t), hips_rot=(0, 86 - 40 * t, 0), spine=(0, -12 - 18 * t, 0), head=(0, -30 - 20 * t, 0),
                           **{'arm.L': (14, 11, 2), 'arm.L.pole': (0, 1, 0.3), 'arm.R': (14, -12, 2), 'arm.R.pole': (0, -1, 0.4),
                              'leg.R': (-24 + 14 * t, -7, 2), 'leg.R.pole': (0.4, -1, 1), 'leg.L': (-26 + 20 * t, 9, 2 + 2 * t), 'leg.L.pole': (1, 0.3, 0)}))
    return frames


ACTIONS = {
    'aim': [pose()],
    'breathe': [breathe()],
    'recoilLight': [kicked(0.5, 3), kicked(0.25, 1.5)],
    'recoilHeavy': [kicked(1.0, 8), kicked(0.5, 4)],
    **{f'reload.{family}': strip for family, strip in RELOADS.items()},
    'flinchFront': flinch(True),
    'flinchBack': flinch(False),
    'throw': THROW,
    'knife': KNIFE,
    'stand': [pose()],
    'run': run_cycle(),
    'strafe': strafe_cycle(),
    'dash': dash_strip(),
    'crawl': crawl_cycle(),
    'revive': revive_strip(),
    **DIE,
}
# The catalog's frame order for each baked segment (catalog.ts SOLDIER mirrors it).
STRIPS = {
    'torso': ['aim', 'breathe', 'recoilLight', 'recoilHeavy'],
    'act': ['reload.pistol', 'reload.mag', 'reload.pump', 'reload.box', 'flinchFront', 'flinchBack', 'throw', 'knife'],
    'legs': ['stand', 'run', 'strafe', 'dash'],
    'full': ['aim'],
    'downed': ['crawl', 'revive'],
    'die': ['dieForward', 'dieBack', 'dieSpin'],
}


def frame_pose(segment, frame):
    poses = [p for action in STRIPS[segment] for p in ACTIONS[action]]
    return poses[frame]


def check_grips(rig, p, where):
    """The swap contract's check: every hand the pose says holds the gun ends within GRIP_SLACK of its grip, which
    moves with the gun's kick."""
    solved = rig.solve(p)
    for side in p.get('holds', ''):
        hand = solved[f'hand.{side}'][0]
        g = shift(GRIP[side], *p.get('gun', (0, 0, 0)))
        miss = math.dist(tuple(hand), g)
        if miss > GRIP_SLACK:
            raise RuntimeError(f'{where}: hand.{side} is {miss:.2f} units from its grip {g} (limit {GRIP_SLACK})')


# ---------------------------------------------------------------- model

def materials():
    return {
        'team': C.mat('team', TEAM, rough=0.3, grime=0.08, grime_scale=0.5, coat=0.6, ink=0.55, ao=0.5),
        'cloth': C.mat('cloth', (0.07, 0.072, 0.05), rough=0.9, grime=0.25, grime_scale=0.8, ink=0.4, ao=0.4),
        'gear': C.mat('gear', (0.03, 0.031, 0.035), rough=0.55, metal=0.2, grime=0.12, ink=0.4, ao=0.4),
        'boot': C.mat('boot', (0.02, 0.019, 0.018), rough=0.7, grime=0.15, grime_scale=1.2, ink=0.35, ao=0.3),
        'helmet': C.mat('helmet', (0.018, 0.019, 0.022), rough=0.22, metal=0.3, grime=0.06, coat=0.9, ink=0.3, ao=0.3),
        'visor': C.mat('visor', (0.012, 0.03, 0.05), rough=0.06, grime=0.0, coat=1.0),
        'glove': C.mat('glove', (0.02, 0.02, 0.022), rough=0.7, grime=0.0, ink=0.3),
        'webbing': C.mat('webbing', (0.12, 0.1, 0.06), rough=0.9, grime=0.25, grime_scale=1.2, ink=0.35, ao=0.35),
        'pouch': C.mat('pouch', (0.2, 0.15, 0.08), rough=0.9, grime=0.25, grime_scale=1.0, ink=0.45, ao=0.4),
        'plate': C.mat('plate', (0.3, 0.31, 0.32), rough=0.35, metal=0.65, grime=0.3, grime_scale=0.8, coat=0.25, ink=0.45, ao=0.35),
        'edge': C.mat('plate-edge', (0.5, 0.5, 0.5), rough=0.3, metal=0.85, grime=0.15),
    }


def mid(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def legs(rig, m):
    h = rig.kit('hips')
    h.box('solid', m['gear'], (-0.5, 0, 13.4), (12, 18, 5), bevel=2.0)
    for y in (-1, 1):
        h.box('solid', m['pouch'], (4.2, 6.3 * y, 13.6), (3, 4.2, 4.2), bevel=0.8)
        h.box('solid', m['pouch'], (-5.8, 6.5 * y, 13.4), (3, 4.4, 4.4), bevel=0.8)
    for side, y in (('R', -1), ('L', 1)):
        th, sh = rig.bones[f'thigh.{side}'], rig.bones[f'shin.{side}']
        t = rig.kit(f'thigh.{side}')
        t.limb('solid', m['cloth'], tuple(th.head), tuple(th.tail), 4.9, 4.3)
        t.box('team', m['team'], (th.head.x * 0.5 + th.tail.x * 0.5 + 1.2, (th.head.y + th.tail.y) / 2 + 2.2 * y, 9.4), (6.5, 3, 6), bevel=1.3)
        s = rig.kit(f'shin.{side}')
        s.limb('solid', m['gear'], tuple(sh.head), tuple(sh.tail), 4.1, 3.6)
        s.sphere('team', m['team'], (sh.head.x + 2.6, sh.head.y, sh.head.z + 0.2), 3.4, scale=(0.8, 1.1, 1.0))
        rig.kit(f'foot.{side}').box('solid', m['boot'], (3.4, 6.5 * y, 2.4), (13, 8, 5), bevel=2.0)


def torso(rig, m):
    s = rig.kit('spine')
    s.box('team', m['team'], (-1, 0, 20.5), (16, 22, 12.5), bevel=5.0, segments=3)
    s.box('solid', m['gear'], (6.6, 0, 20.2), (4, 15, 9), bevel=1.4)
    for y in (-5, 0, 5):
        s.box('solid', m['pouch'], (8.4, y, 19.4), (2.6, 4.3, 5.2), bevel=0.8)
    s.sphere('solid', m['gear'], (0.3, 0, 25.4), 4.8)
    for y in (-1, 1):
        # the big rounded pauldron and the lame under it, kept low and inboard so the arms and hands show
        s.sphere('team', m['team'], (-0.5, 15 * y, 23.5), 7.2, scale=(1.15, 1.0, 0.72), segs=24)
        s.sphere('team', m['team'], (0.7, 17.5 * y, 20.5), 5.6, scale=(1.1, 0.85, 0.72), segs=20)
        s.box('solid', m['webbing'], (-1.5, 6.2 * y, 26.6), (21, 2.6, 1.2), bevel=0.5)
    s.box('team', m['team'], (-11.8, 0, 20.4), (8, 16, 12.5), bevel=2.6)
    s.box('solid', m['gear'], (-12.2, 0, 26.6), (7, 13.5, 1.6), bevel=0.6)
    for y in (-1, 1):
        s.box('solid', m['pouch'], (-11.4, 9.4 * y, 18.5), (5, 3.2, 6.5), bevel=0.9)
    hd = rig.kit('head')
    hd.sphere('solid', m['helmet'], (1.3, 0, 29.4), 7.8, scale=(1.1, 1.0, 0.9), segs=28)
    hd.sphere('team', m['team'], (1.1, 0, 29.55), 7.9, scale=(1.11, 0.2, 0.9), segs=28)
    hd.box('solid', m['visor'], (8.1, 0, 28.2), (3.0, 10, 3.2), bevel=1.2)
    for side in 'RL':
        up, lo, hand = rig.bones[f'upper_arm.{side}'], rig.bones[f'forearm.{side}'], rig.bones[f'hand.{side}']
        rig.kit(f'upper_arm.{side}').limb('team', m['team'], tuple(up.head), tuple(up.tail), 4.5, 4.0)
        f = rig.kit(f'forearm.{side}')
        f.limb('solid', m['cloth'], tuple(lo.head), tuple(lo.tail), 3.6, 3.2)
        f.sphere('team', m['team'], tuple(lo.head), 4.3)
        f.limb('team', m['team'], mid(lo.head, lo.tail, 0.35), mid(lo.head, lo.tail, 0.8), 3.95, 3.6)
        rig.kit(f'hand.{side}').sphere('solid', m['glove'], (hand.head.x, hand.head.y, hand.head.z - 1.5), 3.4, scale=(1.0, 0.95, 1.2))


def armour(rig, m, tier):
    """One armour tier's whole kit (each tier is drawn alone over base and team). It rides the spine only, which no
    torso or act frame moves, so the catalog bakes it once per facing and every frame shares it. Light is chest straps
    and pouches, medium adds a steel chest plate and collar, heavy adds flank plates and a neck guard; none covers the
    team pauldrons, arms, backpack or helmet stripe."""
    k = rig.kit('spine')
    for y in (-3.4, 3.4):
        k.box(tier, m['webbing'], (6.0, y, 24.2), (4, 2.2, 1.2), bevel=0.4)
    if tier == 'armorLight':
        for y in (-6.5, 6.5):
            k.box(tier, m['pouch'], (2.0, y, 26.4), (5, 4.2, 1.8), bevel=0.8)
        return
    k.box(tier, m['plate'], (3.2, 0, 25.5), (8, 12, 2.2), bevel=1.2)
    k.box(tier, m['edge'], (3.2, 0, 26.6), (6, 9, 0.4), bevel=0.2)
    k.box(tier, m['plate'], (-5.6, 0, 27.0), (3.2, 11, 2.6), bevel=1.0)
    if tier == 'armorMedium':
        return
    for y in (-1, 1):
        k.box(tier, m['plate'], (-1, 10.8 * y, 19), (12, 1.8, 7), bevel=0.7)
        k.box(tier, m['edge'], (-1, 11.6 * y, 19), (10, 0.5, 3.5), bevel=0.2)
    k.box(tier, m['plate'], (-4.5, 0, 31.0), (4, 13, 3.4), bevel=1.3)


def build(b):
    """Model `soldier:<segment>`; frame indexes the segment's strip (STRIPS)."""
    segment = b.arg[0]
    s = b.R / 24
    m = materials()
    r = Rg.Rig(BONES, LIMBS)
    p = frame_pose(segment, b.frame)
    check_grips(r, p, f'soldier:{segment} frame {b.frame}')
    if segment in ('legs', 'full', 'downed', 'die'):
        legs(r, m)
    if segment in ('torso', 'act', 'full', 'downed', 'die'):
        torso(r, m)
    if segment == 'torso':
        for tier in C.ARMOR:
            armour(r, m, tier)
    arm = r.build(b.root, b.colls, p)
    arm.scale = (s, s, s)
    if segment in ('downed', 'die'):
        return C.Model(z_ref=None, overhead=True, contact=1.0, outline=(INK, 1.0), freeze=True)
    return C.Model(z_ref=SHOULDER * s, outline=(INK, 1.0), contact=0.7 if segment == 'legs' else 0.0, freeze=True)
