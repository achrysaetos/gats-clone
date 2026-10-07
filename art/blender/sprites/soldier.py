"""The armored trooper: built facing +X with the gun held forward, scaled to the player radius.

Team regions are near-white so the painter's multiply tint gives the team color; gear is dark gunmetal.
The shoulder line sits at SHOULDER, the height the shear keeps on the collision circle.
"""

from . import common as C

SHOULDER = 22.0
INK = (0.07, 0.07, 0.08)

TEAM = (0.75, 0.75, 0.75)


def materials():
    return {
        'team': C.mat('team', TEAM, rough=0.42, grime=0.1, grime_scale=0.5, coat=0.35, ink=0.55, ao=0.45),
        'cloth': C.mat('cloth', C.scalec(TEAM, 0.72), rough=0.85, grime=0.2, grime_scale=0.8, ink=0.5, ao=0.4),
        'gear': C.mat('gear', (0.03, 0.032, 0.036), rough=0.55, metal=0.2, grime=0.1, ink=0.4),
        'helmet': C.mat('helmet', (0.028, 0.03, 0.034), rough=0.28, metal=0.35, grime=0.1, coat=0.7, ink=0.3),
        'visor': C.mat('visor', (0.01, 0.012, 0.016), rough=0.08, grime=0.0, coat=1.0),
        'glove': C.mat('glove', (0.018, 0.018, 0.02), rough=0.7, grime=0.0, ink=0.3),
        'strap': C.mat('strap', (0.045, 0.042, 0.036), rough=0.85, grime=0.15, ink=0.3),
        'plate': C.mat('plate', (0.1, 0.105, 0.115), rough=0.35, metal=0.7, grime=0.25, coat=0.3, ink=0.45, ao=0.3),
        'edge': C.mat('plate-edge', (0.22, 0.22, 0.23), rough=0.3, metal=0.8, grime=0.1),
        'pouch': C.mat('pouch', (0.055, 0.055, 0.042), rough=0.9, grime=0.2, grime_scale=1.0, ink=0.4, ao=0.3),
    }


AIM_ARMS = (((0, -14, 21.5), (7, -15.5, 17.5), (13, -3, 20)), ((1, 14, 21.5), (12, 12.5, 18), (23, 1.5, 20.5)))


def body(kit, m, s=1.0):
    """The trooper without armor tiers, facing +X. s scales from the 24-unit player radius."""
    def p(x, y, z):
        return (x * s, y * s, z * s)

    # boots and legs, in a shooter's stance: left foot forward
    for y, x in ((7.5, 3.5), (-7.5, -4.5)):
        kit.box('solid', m['gear'], p(x, y, 3), (12 * s, 7 * s, 6 * s), bevel=2 * s)
        kit.limb('team', m['cloth'], p(x - 2, y, 5), p(-1 + x * 0.2, y * 0.85, 13), 3.8 * s)
    kit.box('solid', m['gear'], p(-1, 0, 13.5), (15 * s, 24 * s, 5 * s), bevel=2 * s)
    # torso, backpack, shoulder pads
    kit.box('team', m['team'], p(-1.5, 0, 18.5), (17 * s, 28 * s, 12 * s), bevel=5 * s, segments=3)
    kit.box('team', m['team'], p(-11.5, 0, 20), (8 * s, 18 * s, 12 * s), bevel=3 * s)
    kit.box('solid', m['gear'], p(-15.2, 0, 20), (1.5 * s, 12 * s, 7 * s), bevel=0.6 * s)
    for y in (-14, 14):
        kit.sphere('team', m['team'], p(-1, y, 23), 8.2 * s, scale=(1.12, 1.0, 0.78), segs=20)
    # arms: right hand on the grip, left hand on the fore-end
    for sh, el, ha in AIM_ARMS:
        kit.limb('team', m['team'], p(*sh), p(*el), 4.6 * s, 4.2 * s)
        kit.limb('team', m['cloth'], p(*el), p(*ha), 4.0 * s, 3.4 * s)
        kit.sphere('solid', m['glove'], p(*ha), 3.6 * s, scale=(1.25, 1, 0.9))
    # helmet with a visor slot facing forward
    kit.sphere('solid', m['gear'], p(1, 0, 23.5), 5.0 * s)
    kit.sphere('solid', m['helmet'], p(2, 0, 28), 7.8 * s, scale=(1.12, 1.0, 0.85), segs=24)
    kit.box('solid', m['visor'], p(8.6, 0, 27.2), (3.0 * s, 9.5 * s, 3.0 * s), bevel=1.1 * s)
    kit.box('solid', m['gear'], p(-1.5, 0, 34.4), (6 * s, 1.6 * s, 1.0 * s), bevel=0.4 * s)


def armor(kit, m, tier, s=1.0):
    """The vest, plates and pads of one armor tier, laid over the back, chest and shoulders. Each tier is drawn alone
    over base and team, so each one carries its whole kit."""
    def p(x, y, z):
        return (x * s, y * s, z * s)

    role = tier
    # every tier: shoulder straps and a row of pouches across the back
    for y in (-6.5, 6.5):
        kit.box(role, m['strap'], p(-3, y, 26.2), (22 * s, 3.4 * s, 1.2 * s), bevel=0.5 * s)
    kit.box(role, m['strap'], p(-11.5, 0, 26.4), (5 * s, 18 * s, 1.0 * s), bevel=0.4 * s)
    for y in (-6, 0, 6):
        kit.box(role, m['pouch'], p(-11.5, y, 27.0), (6 * s, 5 * s, 2.6 * s), bevel=1.0 * s)
    if tier == 'armorLight':
        for y in (-5, 5):
            kit.box(role, m['pouch'], p(8.0, y, 22.0), (3.4 * s, 5 * s, 5 * s), bevel=0.9 * s)
        return
    # medium: a plate carrier over the back and chest, and a collar behind the helmet
    kit.box(role, m['plate'], p(-6, 0, 26.0), (14 * s, 22 * s, 2.4 * s), bevel=1.6 * s)
    kit.box(role, m['edge'], p(-6.5, 0, 27.3), (9 * s, 15 * s, 0.6 * s), bevel=0.3 * s)
    kit.box(role, m['plate'], p(-11.5, 0, 27.6), (6 * s, 20 * s, 3.0 * s), bevel=1.2 * s)
    for y in (-6, 0, 6):
        kit.box(role, m['pouch'], p(8.0, y, 21.5), (3.8 * s, 5.0 * s, 6 * s), bevel=0.9 * s)
    if tier == 'armorMedium':
        return
    # heavy: pauldrons over the outer half of each pad, a neck guard and forearm guards
    for y in (-1, 1):
        kit.sphere(role, m['plate'], p(-1.5, y * 16.5, 26.0), 6.8 * s, scale=(1.3, 1.0, 0.6), segs=20)
        kit.box(role, m['edge'], p(-1.5, y * 20.5, 25.2), (14 * s, 1.8 * s, 3.4 * s), bevel=0.8 * s)
    kit.box(role, m['plate'], p(-5.5, 0, 31.0), (4 * s, 15 * s, 3.5 * s), bevel=1.4 * s)
    for a, b in ((AIM_ARMS[0][1], AIM_ARMS[0][2]), (AIM_ARMS[1][1], AIM_ARMS[1][2])):
        kit.limb(role, m['plate'], p(*a), p(*b), 4.5 * s, 3.9 * s, joints=False)


def build(b):
    s = b.R / 24
    m = materials()
    body(b.kit, m, s)
    for tier in C.ARMOR:
        armor(b.kit, m, tier, s)
    return C.Model(z_ref=SHOULDER * s, outline=(INK, 1.0))


def build_downed(b):
    """Knocked down on the back, head east, limbs out. Rotated by the painter, so lit from above and not sheared."""
    s = b.R / 24
    m = materials()
    kit = b.kit

    def p(x, y, z):
        return (x * s, y * s, z * s)

    kit.box('team', m['team'], p(0, 0, 6), (26 * s, 26 * s, 10 * s), bevel=4.5 * s, segments=3)
    kit.box('solid', m['gear'], p(-14, 0, 5), (6 * s, 22 * s, 7 * s), bevel=2 * s)
    for y in (-13, 13):
        kit.sphere('team', m['team'], p(8, y, 7), 7.2 * s, scale=(1.0, 1.0, 0.75))
    kit.sphere('solid', m['helmet'], p(17, 2, 6.5), 7.6 * s, scale=(1.1, 1.0, 0.85), segs=24)
    kit.box('solid', m['visor'], p(18, 2, 13.2), (8 * s, 3 * s, 1.2 * s), bevel=0.5 * s, rot=(0, 0, 0.2))
    for a, e, h in (((8, -14, 7), (2, -25, 4.5), (-5, -31, 3.5)), ((8, 14, 7), (17, 23, 4.5), (26, 21, 3.5))):
        kit.limb('team', m['team'], p(*a), p(*e), 4.2 * s, 3.8 * s)
        kit.limb('team', m['cloth'], p(*e), p(*h), 3.8 * s, 3.3 * s)
        kit.sphere('solid', m['glove'], p(*h), 3.4 * s)
    for a, k, f in (((-14, -7, 5), (-24, -10, 4.5), (-33, -15, 4)), ((-14, 7, 5), (-25, 9, 4.5), (-34, 7, 4))):
        kit.limb('team', m['cloth'], p(*a), p(*k), 4.4 * s, 4.0 * s)
        kit.limb('team', m['cloth'], p(*k), p(*f), 4.0 * s, 3.6 * s)
        kit.box('solid', m['gear'], p(f[0] - 2, f[1], f[2] + 1), (6 * s, 7 * s, 10 * s), bevel=2 * s)
    return C.Model(z_ref=None, overhead=True, contact=True)
