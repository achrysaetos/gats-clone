"""Zombies: one hunched body plan scaled by the kind's radius, in the kind's own colors (ZOMBIE_LOOK), so kinds stay
apart by color and size. Built facing +X with the arms reaching forward."""

import math

from . import common as C

INK = (0.06, 0.05, 0.05)


def build(b):
    kind = b.arg[0]
    z = b.spec['zombies'][kind]
    r = z['radius']
    kit = b.kit
    body_c, arm_c = C.srgb(z['body']), C.srgb(z['arm'])
    eye_c = C.srgb(z['eye'])
    bright_eyes = max(eye_c) > 0.3
    skin = C.mat(f'skin-{kind}', body_c, rough=0.7, grime=0.35, grime_scale=0.25 / r * 16, ink=0.5, ao=0.4, bump=0.3)
    arm = C.mat(f'arm-{kind}', arm_c, rough=0.75, grime=0.3, grime_scale=0.4 / r * 16, ink=0.5, ao=0.35)
    rag = C.mat(f'rag-{kind}', C.mixc(C.scalec(body_c, 0.35), (0.05, 0.045, 0.04), 0.5), rough=0.95, grime=0.4, grime_scale=1.0, ink=0.4, ao=0.3)
    wound = C.mat('wound', (0.18, 0.02, 0.02), rough=0.35, grime=0.3, grime_scale=1.5)
    eye = C.mat(f'eye-{kind}', eye_c, rough=0.2, grime=0.0, emit=eye_c if bright_eyes else None, strength=6.0)
    steel = C.mat('zplate', (0.12, 0.125, 0.13), rough=0.4, metal=0.8, grime=0.35, grime_scale=1.0, ink=0.45, ao=0.3)
    bone = C.mat('bone', (0.55, 0.5, 0.4), rough=0.6, grime=0.2, ink=0.3)
    rnd = b.rnd

    def p(x, y, zz):
        return (x * r, y * r, zz * r)

    shoulder = 1.1
    slim = 0.8 if kind == 'runner' else 1.0
    lean = 0.35 if kind == 'runner' else 0.2
    # legs and feet
    for y, x in ((0.38, 0.25), (-0.38, -0.3)):
        kit.limb('solid', rag, p(x * 0.3, y * slim, 0.55), p(x, y * slim, 0.12), 0.2 * r)
        kit.sphere('solid', arm, p(x + 0.08, y * slim, 0.08), 0.18 * r, scale=(1.5, 1, 0.6))
    # torso, hunched forward, with a torn shirt over the back and a wound
    torso = C.M(p(-0.05, 0, 0.82), (0, lean, 0))
    kit.box('solid', skin, (0, 0, 0), (0.85 * r, 1.45 * r * slim, 0.75 * r), bevel=0.28 * r, segments=3, matrix=torso)
    kit.box('solid', rag, (-0.22 * r, 0.1 * r, 0.2 * r), (0.4 * r, 0.9 * r * slim, 0.45 * r), rot=(0, 0, 0.25), bevel=0.15 * r, matrix=torso)
    for i in range(2 + int(r // 14)):
        a = rnd.uniform(0, 2 * math.pi)
        kit.sphere('solid', wound, p(-0.1 + 0.25 * math.cos(a), 0.45 * math.sin(a) * slim, 1.12), 0.09 * r * rnd.uniform(0.8, 1.4), scale=(1.4, 1, 0.4))
    if kind == 'bloater':
        kit.sphere('solid', skin, p(0.05, 0, 0.75), 0.95 * r, scale=(1.0, 1.05, 0.72), segs=24)
        for i in range(9):
            a = rnd.uniform(0, 2 * math.pi)
            d = rnd.uniform(0.35, 0.8)
            kit.sphere('solid', C.mat('boil', C.mixc(body_c, (1.0, 0.8, 0.4), 0.5), rough=0.3, grime=0.0, ink=0.2), p(0.05 + d * math.cos(a) * 0.9, d * math.sin(a) * 0.95, 0.75 + 0.62 * math.sqrt(max(0, 1 - d * d))), rnd.uniform(0.09, 0.16) * r)
    # head with eyes looking forward
    kit.sphere('solid', skin, p(0.48, 0, 1.12), 0.36 * r, scale=(1.1, 1.0, 0.95))
    for y in (-0.13, 0.13):
        kit.sphere('solid', eye, p(0.8, y, 1.16), 0.075 * r)
    kit.box('solid', wound, p(0.83, 0, 1.0), (0.06 * r, 0.22 * r, 0.06 * r), bevel=0.02 * r)
    # arms: reaching forward, or pumping at the sides for a runner
    if kind == 'runner':
        arms = (((0.0, 0.62, shoulder - 0.08), (-0.45, 0.78, 0.8), (-0.2, 0.7, 0.55)), ((0.0, -0.62, shoulder - 0.08), (0.35, -0.8, 0.85), (0.75, -0.55, 0.85)))
    else:
        arms = (((0.05, 0.68, shoulder - 0.1), (0.55, 0.78, 0.98), (1.08, 0.6, 0.95)), ((0.05, -0.68, shoulder - 0.1), (0.62, -0.74, 0.98), (1.15, -0.5, 0.98)))
    thick = 1.35 if z['shoulders'] else 1.0
    for sh, el, ha in arms:
        kit.limb('solid', arm, p(*sh), p(*el), 0.19 * r * thick, 0.16 * r * thick)
        kit.limb('solid', arm, p(*el), p(*ha), 0.16 * r * thick, 0.13 * r * thick)
        for k in (-1, 0, 1):
            kit.limb('solid', bone, p(*ha), p(ha[0] + 0.2, ha[1] + k * 0.08, ha[2] - 0.03), 0.035 * r, 0.015 * r, joints=False)
    if z['shoulders']:
        for y in (-0.72, 0.72):
            kit.sphere('solid', arm, p(-0.02, y, shoulder - 0.02), 0.42 * r, scale=(1.1, 1.0, 0.8))
    # armor plates bolted on: count from the kind's armor
    plates = z['armor']
    for i in range(plates):
        t = (i + 0.5) / max(1, plates)
        y = (t - 0.5) * 1.4 * slim
        side = abs(y) > 0.45
        kit.box('solid', steel, p(-0.15 if not side else 0.0, y, shoulder + (0.12 if side else 0.05)), (0.55 * r, 0.36 * r, 0.12 * r), rot=(0.25 * (1 if y > 0 else -1) * side, 0, 0), bevel=0.04 * r)
    if kind == 'colossus':
        for i in range(5):
            y = (i - 2) * 0.22
            kit.cyl('solid', bone, p(-0.3, y, shoulder + 0.1), 0.07 * r, 0.32 * r, radius2=0.0, rot=(0.3 * (i - 2) * -0.5, -0.5, 0), segs=8)
    return C.Model(z_ref=shoulder * r, contact=True, outline=(INK, 1.0))
