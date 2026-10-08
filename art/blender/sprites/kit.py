"""The map kit: one model per piece in src/shared/kit.ts, and the train.

Every piece is built unturned in its footprint (Blender x 0..w, y 0..-h, z up from the floor), then the root takes the
piece's quarter turns clockwise and the footprint's new top-left lands back on the origin. The bake freezes the meshes
and writes the shear into their vertices about the piece's height, so the top lands on the footprint and the south face
hangs below it. Long sun shadows are not baked here: the map's light layer casts them.
"""

import math

from mathutils import Matrix, Vector

from . import common as C
from .props import BLACK, YELLOW, concrete, jagged, metal_crate, paint, steel, wood_crate

TAU = math.pi * 2
WHITE_PAINT = (0.62, 0.61, 0.57)


def turn_matrix(w, h, turns):
    """Quarter turns clockwise on screen, with the turned footprint's top-left back on the origin."""
    m = Matrix.Rotation(-turns * math.pi / 2, 4, 'Z')
    corners = [m @ Vector((x, y, 0)) for x in (0, w) for y in (0, -h)]
    dx = -min(c.x for c in corners)
    dy = -max(c.y for c in corners)
    return Matrix.Translation((dx, dy, 0)) @ m


class P:
    """What a piece builder gets: the kit, the piece's unturned footprint and height, its damage stage and a seeded rng."""

    def __init__(self, b, w, h, height, stage):
        self.b, self.k, self.rnd = b, b.kit, b.rnd
        self.w, self.h, self.H, self.stage = w, h, height, stage


def mats():
    return {
        'stone': concrete('kit-concrete', (0.31, 0.305, 0.29)),
        'cap': concrete('kit-concrete-cap', (0.36, 0.355, 0.335)),
        'chip': concrete('kit-concrete-chip', (0.44, 0.43, 0.41)),
        'hazard': C.stripes('hazard', YELLOW, BLACK, 3.0, ao=0.3),
        'steel': steel('kit-steel', (0.11, 0.115, 0.12)),
        'dark': steel('kit-dark', (0.035, 0.037, 0.04)),
        'yellow': paint('kit-yellow', (0.78, 0.5, 0.03)),
        'groove': C.mat('kit-groove', (0.04, 0.04, 0.04), rough=1.0, grime=0.0),
        'white': paint('kit-white', WHITE_PAINT),
    }


def clamp_in(p, x, y, r, slack=3.0):
    """Keeps a floor item of reach r within `slack` of the footprint, so it stays in frame at any turn."""
    return min(max(x, -slack + r), p.w + slack - r), min(max(y, -p.h - slack + r), slack - r)


# ---------------------------------------------------------------- concrete

def chips(p, m, count):
    """Lighter broken aggregate where corners and top edges were knocked off."""
    for _ in range(count):
        side = p.rnd.random()
        x = p.rnd.uniform(1, p.w - 1) if side < 0.6 else p.rnd.choice((0.6, p.w - 0.6))
        y = p.rnd.choice((-0.6, -p.h + 0.6)) if side < 0.6 else -p.rnd.uniform(1, p.h - 1)
        s = p.rnd.uniform(1.5, 3.5)
        p.k.box('solid', m['chip'], (x, y, p.H - p.rnd.uniform(0.5, 2.5)), (s, s * 0.8, s * 0.7), rot=(p.rnd.uniform(0, 1), p.rnd.uniform(0, 1), p.rnd.uniform(0, 3)), bevel=0.4)


def wall(p):
    """A precast concrete wall: chipped body, a lighter cap, joints every 50, steel corner angles, hazard stripes on its foot and ends."""
    m = mats()
    w, h, H, k = p.w, p.h, p.H, p.k
    k.poly('solid', m['stone'], jagged(p.rnd, 0, 0, w, -h, 0.5, step=5.0, notches=2), 0, H - 4, bevel=0.8)
    k.poly('solid', m['cap'], jagged(p.rnd, 0.8, -0.8, w - 0.8, -h + 0.8, 0.6, step=4.0, notches=3), H - 4.5, H, bevel=0.8)
    for x in range(50, int(w), 50):
        k.box('solid', m['groove'], (x, -h / 2, H / 2), (0.9, h + 0.5, H + 0.4))
    for y in (0.35, -h - 0.35):
        k.box('solid', m['hazard'], (w / 2, y, 4.5), (w - 3, 0.6, 7))
    for x in (-0.35, w + 0.35):
        k.box('solid', m['hazard'], (x, -h / 2, H * 0.45), (0.6, h - 4, H * 0.7))
    for x in (0.8, w - 0.8):
        for y in (-0.8, -h + 0.8):
            k.box('solid', m['steel'], (x, y, H / 2), (2.2, 2.2, H + 0.2), bevel=0.3)
    for x in range(25, int(w), 50):
        k.cyl('solid', m['dark'], (x, -h / 2, H + 0.2), 1.6, 0.8, segs=10)
    chips(p, m, int(w / 18) + 2)


def pillar(p):
    m = mats()
    w, h, H, k = p.w, p.h, p.H, p.k
    k.poly('solid', m['stone'], jagged(p.rnd, 0, 0, w, -h, 0.4, step=4.0, notches=1), 0, H - 5, bevel=0.8)
    k.box('solid', m['steel'], (w / 2, -h / 2, H - 2.5), (w + 0.6, h + 0.6, 5), bevel=0.6)
    k.box('solid', m['dark'], (w / 2, -h / 2, H + 0.2), (w - 8, h - 8, 0.6), bevel=0.2)
    for x in (-0.35, w + 0.35):
        k.box('solid', m['hazard'], (x, -h / 2, 7), (0.6, h - 2, 12))
    for y in (0.35, -h - 0.35):
        k.box('solid', m['hazard'], (w / 2, y, 7), (w - 2, 0.6, 12))
    for x in (0.8, w - 0.8):
        for y in (-0.8, -h + 0.8):
            k.box('solid', m['steel'], (x, y, H / 2), (2.2, 2.2, H), bevel=0.3)
    chips(p, m, 3)


def broken_wall(p):
    """A wall shot down to a jagged stump with bent rebar, its rubble spilling round its foot."""
    m = mats()
    w, h, H, k, rnd = p.w, p.h, p.H, p.k, p.rnd
    rebar = C.mat('rebar', (0.12, 0.06, 0.03), rough=0.7, metal=0.6, grime=0.3)
    crack = C.mat('crack', (0.03, 0.03, 0.03), rough=1.0, grime=0.0)
    x = 0.0
    while x < w - 2:
        seg = rnd.uniform(12, 28)
        top = H * rnd.uniform(0.45, 1.0) * (1 - 0.2 * p.stage)
        k.poly('solid', m['stone'], jagged(rnd, x, 0, min(w, x + seg), -h, 1.0, step=4.0, notches=1), 0, top, bevel=0.8)
        band = min(seg, w - x) - 1
        k.box('solid', m['hazard'], (x + 0.5 + band / 2, -h - 0.3, 4.5), (band, 0.6, 7))
        x += seg - 0.5
    for _ in range(6):
        bx, by = rnd.uniform(4, w - 4), -rnd.uniform(4, h - 4)
        k.limb('solid', rebar, (bx, by, H * 0.4), (bx + rnd.uniform(-4, 4), by + rnd.uniform(-3, 3), H * rnd.uniform(0.85, 1.0)), 0.6, joints=False)
    for _ in range(4):
        k.box('solid', crack, (rnd.uniform(5, w - 5), -h / 2, H * 0.45 + 0.05), (rnd.uniform(4, 9), 0.5, 0.3), rot=(0, 0, rnd.uniform(-0.6, 0.6)))
    rubble_pile(p, m, 26, big=4.5, height=H * 0.25)
    chips(p, m, 10 * p.stage)


def rubble_pile(p, m, count, big=4.0, height=0.0):
    rnd = p.rnd
    dust = C.mat('dust', (0.5, 0.48, 0.44), rough=1.0, grime=0.4, grime_scale=1.2)
    for _ in range(count):
        s = rnd.uniform(0.8, big)
        x, y = clamp_in(p, rnd.uniform(-3, p.w + 3), rnd.uniform(-p.h - 3, 3), s * 1.3)
        z = s * 0.35 + (height * rnd.random() if 0 < x < p.w and -p.h < y < 0 else 0)
        p.k.box('solid', rnd.choice((m['stone'], m['stone'], m['cap'], m['chip'])), (x, y, z), (s * rnd.uniform(1, 1.8), s * rnd.uniform(0.8, 1.4), s), rot=(rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 3)), bevel=s * 0.25)
    for _ in range(4):
        x, y = clamp_in(p, rnd.uniform(0, p.w), rnd.uniform(-p.h, 0), 9)
        p.k.sphere('solid', dust, (x, y, 0.05), 1.0, scale=(rnd.uniform(5, 9), rnd.uniform(4, 7), 0.15))


def rubble(p):
    m = mats()
    rebar = C.mat('rebar', (0.12, 0.06, 0.03), rough=0.7, metal=0.6, grime=0.3)
    rubble_pile(p, m, 130, big=6.0)
    for _ in range(4):
        x, y = clamp_in(p, p.rnd.uniform(10, p.w - 10), -p.rnd.uniform(10, p.h - 10), 8)
        a = p.rnd.uniform(0, math.pi)
        p.k.limb('solid', rebar, (x, y, 1.0), (x + math.cos(a) * 12, y + math.sin(a) * 12, p.rnd.uniform(1, 4)), 0.5, joints=False)


def lowwall(p):
    """A Jersey-style barrier painted in hazard bands."""
    m = mats()
    w, h, H, k = p.w, p.h, p.H, p.k
    k.box('solid', m['stone'], (w / 2, -h / 2, 5), (w, h, 10), bevel=1.0)
    k.box('solid', m['stone'], (w / 2, -h / 2, 11), (w - 1, h - 4, 4), bevel=1.0)
    k.box('solid', m['cap'], (w / 2, -h / 2, (13 + H) / 2), (w - 1.5, h - 9, H - 13), bevel=1.2)
    for y in (-4.4, -h + 4.4):
        k.box('solid', m['hazard'], (w / 2, y + (0.25 if y > -h / 2 else -0.25), 21), (w - 6, 0.5, 13))
    k.box('solid', m['hazard'], (w / 2, -h / 2, H + 0.1), (w - 4, h - 11, 0.4))
    for x in range(0, int(w) + 1, 100):
        for xx in (x + 0.3, x - 0.3):
            if 0 < xx < w:
                k.box('solid', m['groove'], (xx, -h / 2, H / 2), (0.6, h + 0.3, H + 0.3))
    chips(p, m, 4)
    if p.stage:
        worn(p, m)


def worn(p, m):
    """Rounds have bitten into a concrete piece: edge chips, dark craters in its top and, worn further, bare rebar and spilled rubble."""
    w, h, H, k, rnd = p.w, p.h, p.H, p.k, p.rnd
    crater = C.mat('crater', (0.05, 0.048, 0.045), rough=1.0, grime=0.2, ao=0.6)
    rebar = C.mat('rebar', (0.12, 0.06, 0.03), rough=0.7, metal=0.6, grime=0.3)
    chips(p, m, 7 * p.stage)
    for _ in range(5 * p.stage):
        x, y, r = rnd.uniform(6, w - 6), -rnd.uniform(3, h - 3), rnd.uniform(2.0, 3.6) * (1 + 0.5 * (p.stage - 1))
        k.sphere('solid', crater, (x, y, H - r * 0.25), 1.0, scale=(r, r * 0.8, r * 0.5))
    if p.stage > 1:
        for _ in range(4):
            x, y = rnd.uniform(8, w - 8), -rnd.uniform(5, h - 5)
            k.limb('solid', rebar, (x, y, H * 0.7), (x + rnd.uniform(-3, 3), y + rnd.uniform(-2, 2), H + rnd.uniform(3, 6)), 0.9, joints=False)
    rubble_pile(p, m, 14 * p.stage, big=3.5)


# The share of each course's bags shot away at each wear stage, bottom course first.
SANDBAG_LOSS = {1: (0.0, 0.15, 0.45), 2: (0.1, 0.45, 0.85)}


def sandbags(p):
    w, h, k, rnd = p.w, p.h, p.k, p.rnd
    burlap = [C.mat(f'burlap-{i}', c, rough=0.95, grime=0.45, grime_scale=1.4, ink=0.25, ao=0.5, bump=0.6) for i, c in enumerate(((0.42, 0.36, 0.24), (0.37, 0.32, 0.21), (0.46, 0.4, 0.27)))]
    length, width, tall = 19.0, 11.5, 9.0
    courses = [(4.5, (-6.2, -h + 6.2)), (13.2, (-6.2, -h + 6.2)), (22.4, (-h / 2,))]
    for ci, (z, rows) in enumerate(courses):
        for y in rows:
            x = length / 2 + 0.5 + (length / 2 if ci % 2 else 0)
            while x < w - length / 2 + 0.5:
                if p.stage and rnd.random() < SANDBAG_LOSS[p.stage][ci]:
                    x += length
                    continue
                k.sphere('solid', rnd.choice(burlap), (x + rnd.uniform(-0.6, 0.6), y + rnd.uniform(-0.5, 0.5), z), 1.0, scale=(length / 2, width / 2, tall / 2 * (1.2 if ci == 2 else 1)), rot=(rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(-0.08, 0.08)), segs=14)
                x += length
            if ci % 2:
                k.sphere('solid', rnd.choice(burlap), (length / 4 + 0.5, y, z), 1.0, scale=(length / 4, width / 2, tall / 2), segs=12)
    if p.stage:
        sand = C.mat('spilled-sand', (0.36, 0.3, 0.19), rough=1.0, grime=0.35, grime_scale=1.6)
        for _ in range(3 * p.stage):
            x, y = clamp_in(p, rnd.uniform(6, w - 6), -h + rnd.uniform(-3, 4), 9)
            k.sphere('solid', sand, (x, y, 0.1), 1.0, scale=(rnd.uniform(6, 10), rnd.uniform(3.5, 5.5), 0.8))
        for _ in range(2 * p.stage):
            x, y = clamp_in(p, rnd.uniform(8, w - 8), rnd.choice((1.5, -h - 1.5)), 9)
            k.sphere('solid', rnd.choice(burlap), (x, y, 1.8), 1.0, scale=(length / 2.3, width / 2.2, 1.8), rot=(0, 0, rnd.uniform(-0.5, 0.5)), segs=12)


def railing(p):
    m = mats()
    w, h, H, k = p.w, p.h, p.H, p.k
    y = -h / 2
    xs = [2 + i * (w - 4) / 4 for i in range(5)]
    for x in xs:
        k.box('solid', m['steel'], (x, y, H / 2), (2.4, 2.4, H), bevel=0.4)
        k.box('solid', m['dark'], (x, y, 0.4), (5, 6, 0.8), bevel=0.2)
    k.box('solid', m['yellow'], (w / 2, y, H - 1.2), (w - 1, 3, 2.4), bevel=0.6)
    k.box('solid', m['yellow'], (w / 2, y, H * 0.55), (w - 3, 1.8, 1.8), bevel=0.4)
    k.box('solid', m['hazard'], (w / 2, y, 2.5), (w - 3, 1.2, 4))


# ---------------------------------------------------------------- containers and crates

CONTAINER = {'blue': (0.06, 0.15, 0.32), 'rust': (0.33, 0.1, 0.035), 'grey': (0.27, 0.28, 0.29)}


def container(p, color, label=None):
    """A corrugated shipping container: ribbed roof and sides, corner castings, doors with lock bars at the south end."""
    w, h, H, k, rnd = p.w, p.h, p.H, p.k, p.rnd
    body = paint(f'container-{color}', CONTAINER[color])
    rib = paint(f'container-rib-{color}', C.scalec(CONTAINER[color], 1.25))
    dark = steel('container-steel', (0.045, 0.047, 0.05))
    k.box('solid', body, (w / 2, -h / 2, H / 2 - 0.5), (w - 3, h - 3, H - 1), bevel=0.6)
    y = -7.0
    while y > -h + 7:
        k.box('solid', rib, (w / 2, y, H - 0.4), (w - 9, 3.6, 1.2), bevel=0.4)
        for x in (1.0, w - 1.0):
            k.box('solid', rib, (x, y, H / 2), (1.4, 3.6, H - 10), bevel=0.4)
        y -= 8.0
    for x in range(8, int(w) - 4, 8):
        k.box('solid', rib, (x, -1.0, H / 2), (3.6, 1.4, H - 10), bevel=0.4)
    for x in (2.5, w - 2.5):
        for yy in (-2.5, -h + 2.5):
            k.box('solid', dark, (x, yy, H / 2), (5, 5, H), bevel=0.5)
            for z in (2.5, H - 2.5):
                k.box('solid', dark, (x, yy, z), (6.5, 6.5, 5), bevel=0.8)
    for x in (2.5, w - 2.5):
        k.box('solid', dark, (x, -h / 2, H - 2), (4, h - 8, 4))
        k.box('solid', dark, (x, -h / 2, 2), (4, h - 8, 4))
    # the doors on the south end, each with two lock bars and handles
    door = paint(f'container-door-{color}', C.scalec(CONTAINER[color], 0.9))
    for x in (w * 0.27, w * 0.73):
        k.box('solid', door, (x, -h + 1.0, H / 2), (w / 2 - 6, 1.2, H - 9), bevel=0.4)
        for bx in (x - 8, x + 8):
            k.cyl('solid', dark, (bx, -h - 0.2, H / 2), 0.9, H - 8, segs=8)
            k.box('solid', dark, (bx + 2, -h - 0.6, H * 0.45), (4, 1, 1.6))
    k.box('solid', dark, (w / 2, -h - 0.1, H / 2), (1.2, 1.4, H - 8))
    stencil = C.mat('stencil-white', (0.7, 0.7, 0.65), rough=0.9, grime=0.5, grime_scale=2.0)
    C.text(label or f'SKR {rnd.randint(1000, 9999)}', 13, (w / 2, -h * 0.28, H + 0.35), stencil, p.b.colls['solid'], p.b.root, rot=(0, 0, -math.pi / 2))
    k.box('solid', p_hazard(), (w / 2, -h + 9, H + 0.3), (w - 12, 4, 0.4))


def p_hazard():
    return C.stripes('hazard', YELLOW, BLACK, 3.0, ao=0.3)


def x_brace(p, wood, x0, x1, y, z0, z1, thick=1.2):
    """Two crossed boards over the face at y between x0..x1 and z0..z1."""
    dx, dz = x1 - x0, z1 - z0
    ln = math.hypot(dx, dz) - 1
    a = math.atan2(dz, dx)
    for s in (1, -1):
        p.k.box('solid', wood, ((x0 + x1) / 2, y, (z0 + z1) / 2), (ln, thick, 3.2), rot=(0, s * a, 0), bevel=0.3)


def crate_block(p, x, y, size, z0, tall, wood, frame, corner):
    """A closed crate standing in a stack: boards, a frame, X-bracing on its south face and top, steel corners."""
    k = p.k
    c = (x + size / 2, y - size / 2)
    k.box('solid', wood, (c[0], c[1], z0 + tall / 2), (size - 1, size - 1, tall), bevel=0.4)
    for i in range(4):
        k.box('solid', p.rnd.choice((wood, frame)), (c[0], y - 1 - (size - 2) * (i + 0.5) / 4, z0 + tall + 0.3), (size - 5, (size - 2) / 4 - 0.8, 0.8), bevel=0.2)
    for xx in (x + 2, x + size - 2):
        k.box('solid', frame, (xx, c[1], z0 + tall + 0.6), (3.6, size - 1, 1.2), bevel=0.3)
    for yy in (y - 2, y - size + 2):
        k.box('solid', frame, (c[0], yy, z0 + tall + 0.6), (size - 1, 3.6, 1.2), bevel=0.3)
    ln = math.hypot(size, size) - 6
    k.box('solid', frame, (c[0], c[1], z0 + tall + 1.0), (ln, 3.2, 0.8), rot=(0, 0, math.pi / 4), bevel=0.2)
    x_brace(p, frame, x + 2, x + size - 2, y - size - 0.1, z0 + 2, z0 + tall - 2)
    for xx in (x + 1.2, x + size - 1.2):
        for yy in (y - 1.2, y - size + 1.2):
            k.box('solid', corner, (xx, yy, z0 + tall - 1.5), (3.6, 3.6, 3.6), bevel=0.3)


def crate_stack(p):
    w, h, H, rnd = p.w, p.h, p.H, p.rnd
    wood = C.wood('pine-stack', (0.4, 0.24, 0.1))
    frame = C.wood('pine-stack-frame', (0.3, 0.17, 0.07))
    corner = steel('bracket', (0.06, 0.06, 0.065))
    low = H / 2
    for x in (0.0, 50.0):
        for y in (0.0, -50.0):
            crate_block(p, x + 0.5, y - 0.5, 49, 0, low - rnd.uniform(0, 3), wood, frame, corner)
    tops = rnd.choice(((0, 0), (0, -50), (50, 0)))
    crate_block(p, tops[0] + 1, tops[1] - 1, 48, low, H - low, wood, frame, corner)
    crate_block(p, 50 - tops[0] + 4, -50 - tops[1] - 4, 42, low, H - low - 6, wood, frame, corner)


def pallet(p):
    w, h, k = p.w, p.h, p.k
    wood = C.wood('pallet', (0.48, 0.34, 0.18), dark=0.6)
    for x in (3, w / 2, w - 3):
        k.box('solid', wood, (x, -h / 2, 2.7), (5, h, 3.8), bevel=0.3)
    for i in range(6):
        k.box('solid', wood, (w / 2, -2.5 - i * (h - 5) / 5, p.H - 0.6), (w, 6.5, 1.2), bevel=0.3)
    for y in (-3, -h / 2, -h + 3):
        k.box('solid', wood, (w / 2, y, 0.5), (w, 6, 1.0), bevel=0.2)


def wood(p, label=None):
    wood_crate(p.b, p.w, p.H, p.stage, label=label)
    if p.stage < 2:
        frame = C.wood('pine-frame', C.scalec((0.36, 0.2, 0.08), 0.8))
        x_brace(p, frame, 4.5, p.w - 4.5, -p.w - 0.9, 1.5, p.H - 1.5)


def drop(p):
    metal_crate(p.b, p.w, p.H, p.stage, (0.62, 0.42, 0.04), trim=True)
    if p.stage < 2:
        beacon = C.mat('drop-beacon', (1.0, 0.8, 0.25), rough=0.3, grime=0.0, emit=(1.0, 0.72, 0.18), strength=9.0)
        k = p.k
        k.cyl('solid', steel('drop-base'), (p.w - 12, -12, p.H + 1.0), 4.5, 2, segs=16)
        k.sphere('solid', beacon, (p.w - 12, -12, p.H + 2.5), 3.4, scale=(1, 1, 0.8))
        k.box('solid', beacon, (p.w / 2, -p.w + 1.7, p.H * 0.55), (p.w - 18, 0.6, 2.0))


# ---------------------------------------------------------------- barrels

def drum(p, body, lid_mat=None, open_top=False):
    k = p.k
    r, H = p.w / 2 - 1.2, p.H
    cx, cy = p.w / 2, -p.h / 2
    rim = steel('drum-rim', (0.08, 0.08, 0.085))
    k.cyl('solid', body, (cx, cy, H / 2 - 0.3), r, H - 0.6, segs=28, bevel=0.6)
    for z in (H * 0.33, H * 0.66):
        k.cyl('solid', body, (cx, cy, z), r + 0.55, 1.6, segs=28, bevel=0.4)
    k.cyl('solid', rim, (cx, cy, H - 0.6), r + 0.3, 1.2, segs=28, bevel=0.3)
    if open_top:
        k.cyl('solid', C.mat('soot', (0.02, 0.018, 0.016), rough=1.0, grime=0.3), (cx, cy, H - 0.2), r - 0.6, 0.6, segs=28)
        return cx, cy, r
    k.cyl('solid', lid_mat or body, (cx, cy, H - 0.4), r - 1.4, 0.6, segs=28)
    for a, rr in ((0.6, 2.2), (3.6, 1.5)):
        k.cyl('solid', rim, (cx + math.cos(a) * r * 0.6, cy + math.sin(a) * r * 0.6, H + 0.1), rr, 1.0, segs=10)
    return cx, cy, r


def barrel(p):
    drum(p, paint('barrel-grey', (0.26, 0.28, 0.3)))


def fuel_barrel(p):
    """Red fuel drum with a hazard diamond on its lid and side; damaged, it is dented, holed and leaking."""
    k, rnd = p.k, p.rnd
    red = paint('barrel-red', (0.55, 0.045, 0.025))
    if p.stage == 1:
        puddle = C.mat('fuel-puddle', (0.04, 0.03, 0.02), rough=0.15, grime=0.2)
        x, y = clamp_in(p, p.w / 2 - 6, -p.h - 2, 7, slack=5)
        k.sphere('solid', puddle, (x, y, 0.05), 1.0, scale=(8, 6, 0.12))
    cx, cy, r = drum(p, red)
    diamond = paint('hazard-diamond', (0.85, 0.62, 0.05))
    ink = C.mat('stencil', (0.012, 0.01, 0.008), rough=0.9, grime=0.3, grime_scale=2.0)
    k.box('solid', diamond, (cx, cy, p.H + 0.05), (7, 7, 0.4), rot=(0, 0, math.pi / 4))
    k.box('solid', ink, (cx, cy, p.H + 0.3), (2.2, 4.6, 0.3), rot=(0, 0, 0.2))
    k.box('solid', diamond, (cx, cy - r - 0.3, p.H * 0.5), (6, 0.5, 6), rot=(0, math.pi / 4, 0))
    if p.stage == 1:
        scorch = C.mat('scorch', (0.015, 0.012, 0.01), rough=0.95, grime=0.5, grime_scale=1.5)
        hole = C.mat('crate-inside', (0.03, 0.02, 0.012), rough=0.9, grime=0.2, ao=0.6)
        k.sphere('solid', scorch, (cx + 3, cy + 2, p.H + 0.2), 5, scale=(1.3, 1, 0.1))
        for _ in range(3):
            a = rnd.uniform(-2.6, -0.5)
            k.cyl('solid', hole, (cx + math.cos(a) * r, cy + math.sin(a) * r, rnd.uniform(8, p.H - 8)), 1.4, 1.5, rot=(math.pi / 2, 0, a + math.pi / 2), segs=8)
        k.box('solid', red, (cx - r * 0.5, cy - r * 0.7, p.H * 0.55), (10, 2.0, 7), rot=(0, 0.2, -0.5), bevel=0.4)


def fire_barrel(p):
    k, rnd = p.k, p.rnd
    rust = C.mat('barrel-rust', (0.2, 0.08, 0.03), rough=0.85, metal=0.4, grime=0.55, grime_scale=1.2, ink=0.25, ao=0.4)
    cx, cy, r = drum(p, rust, open_top=True)
    coal = C.mat('coals', (0.9, 0.35, 0.05), rough=0.8, grime=0.0, emit=(1.0, 0.36, 0.06), strength=10.0)
    ash = C.mat('ash', (0.06, 0.05, 0.045), rough=1.0, grime=0.4)
    for _ in range(16):
        a, d = rnd.uniform(0, TAU), rnd.uniform(0, r - 3)
        k.sphere('solid', rnd.choice((coal, coal, ash)), (cx + math.cos(a) * d, cy + math.sin(a) * d, p.H - 0.2), rnd.uniform(1.4, 2.6), scale=(1, 1, 0.6), segs=8)
    for a in (-1.2, -1.9):
        k.box('solid', coal, (cx + math.cos(a) * r, cy + math.sin(a) * r, p.H * 0.28), (3.5, 1.0, 2.0), rot=(0, 0, a + math.pi / 2))


# ---------------------------------------------------------------- props

def planter(p):
    w, h, H, k, rnd = p.w, p.h, p.H, p.k, p.rnd
    m = mats()
    soil = C.mat('soil', (0.06, 0.045, 0.032), rough=0.95, grime=0.5, grime_scale=1.2, bump=0.6)
    leaves = [C.mat(f'leaf-{i}', c, rough=0.7, grime=0.5, grime_scale=1.6, ink=0.35, ao=0.7, bump=0.6) for i, c in enumerate(((0.045, 0.1, 0.02), (0.08, 0.15, 0.03), (0.12, 0.19, 0.04)))]
    t = 5.0
    k.box('solid', m['cap'], (w / 2, -h / 2, H / 2), (w, h, H), bevel=1.2)
    k.box('solid', soil, (w / 2, -h / 2, H - 2), (w - 2 * t, h - 2 * t, 4.4))
    for y in (0.3, -h - 0.3):
        k.box('solid', m['hazard'], (w / 2, y, 4), (w - 4, 0.6, 5))
    n = int(w * h / 260)
    for _ in range(n):
        x, y = rnd.uniform(t + 6, w - t - 6), -rnd.uniform(t + 6, h - t - 6)
        s = rnd.uniform(5, 9)
        k.sphere('solid', rnd.choice(leaves), (x, y, H + s * 0.15), s, scale=(1 + rnd.uniform(-0.2, 0.2), 1 + rnd.uniform(-0.2, 0.2), 0.55), segs=10)


def forklift(p):
    """A yellow forklift, forks to the south: counterweight, overhead guard, mast and forks."""
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    body = paint('forklift-yellow', (0.82, 0.5, 0.02))
    black = C.mat('rubber', (0.025, 0.025, 0.027), rough=0.9, grime=0.2, ink=0.3, ao=0.4)
    seat = C.mat('seat', (0.04, 0.04, 0.045), rough=0.6, grime=0.3, ink=0.3, ao=0.4)
    for x in (9, w - 9):
        for y in (-30, -88):
            k.cyl('solid', black, (x, y, 10), 10, 9, rot=(0, math.pi / 2, 0), segs=20, bevel=1.5)
    k.box('solid', body, (w / 2, -60, 22), (w - 22, 80, 26), bevel=3)
    k.box('solid', body, (w / 2, -14, 24), (w - 8, 26, 34), bevel=5)
    k.box('solid', m['hazard'], (w / 2, -1.2, 26), (w - 16, 1.0, 14))
    k.box('solid', seat, (w / 2, -50, 38), (24, 16, 8), bevel=3)
    k.box('solid', seat, (w / 2, -40, 46), (24, 5, 14), bevel=2)
    k.cyl('solid', seat, (w / 2, -70, 42), 7, 1.5, rot=(0.6, 0, 0), segs=16)
    for x in (16, w - 16):
        for y in (-30, -82):
            k.box('solid', m['dark'], (x, y, (36 + H - 2) / 2), (3, 3, H - 2 - 36), bevel=0.5)
    k.box('solid', m['dark'], (w / 2, -56, H - 1.5), (w - 30, 55, 3), bevel=0.8)
    for i in range(6):
        k.box('solid', m['steel'], (w / 2, -33 - i * 9.5, H + 0.2), (w - 34, 2, 1.2))
    for x in (22, w - 22):
        k.box('solid', m['dark'], (x, -104, H / 2 - 4), (5, 5, H - 8), bevel=0.8)
    k.box('solid', m['steel'], (w / 2, -104, H - 10), (w - 38, 4, 4))
    k.box('solid', m['steel'], (w / 2, -107, 12), (w - 30, 2.5, 18), bevel=0.4)
    for x in (24, w - 24):
        k.box('solid', m['dark'], (x, -116, 2.5), (6, 18, 2), bevel=0.4)
    k.cyl('solid', C.mat('beacon-orange', (1.0, 0.5, 0.1), rough=0.3, grime=0.0, emit=(1.0, 0.45, 0.05), strength=3.0), (w - 18, -32, H + 2), 2.2, 3, segs=12)


def ac(p):
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    shell = paint('ac-shell', (0.5, 0.51, 0.5))
    grille = C.mat('grille', (0.035, 0.037, 0.04), rough=0.6, metal=0.4)
    k.box('solid', m['dark'], (w / 2, -h / 2, 1.5), (w - 2, h - 2, 3), bevel=0.4)
    k.box('solid', shell, (w / 2, -h / 2, (H + 3) / 2), (w - 3, h - 3, H - 3), bevel=1.5)
    cx, cy, r = 25, -h / 2, h / 2 - 6
    k.cyl('solid', grille, (cx, cy, H + 0.1), r, 0.6, segs=32)
    k.cyl('solid', m['steel'], (cx, cy, H + 0.5), r + 1.2, 0.8, segs=32, radius2=r + 1.2)
    for i in range(5):
        k.box('solid', m['steel'], (cx, cy, H + 0.7), (r * 1.8, 1.0, 0.4), rot=(0, 0, i * math.pi / 5))
    for i in range(4):
        k.box('solid', m['steel'], (cx, cy, H + 0.9), (r * 0.9, 3.2, 0.4), rot=(0.4, 0, i * math.pi / 2 + 0.3))
    k.cyl('solid', m['dark'], (cx, cy, H + 1.2), 3, 1.2, segs=12)
    for i in range(6):
        k.box('solid', grille, (w - 17, -8 - i * 6.2, H + 0.1), (22, 2.4, 0.4))
    for i in range(5):
        k.box('solid', m['steel'], (w / 2, -h + 0.9, 8 + i * 6), (w - 10, 1.2, 1.8))
    copper = C.mat('copper', (0.45, 0.2, 0.08), rough=0.35, metal=0.9, grime=0.3)
    k.cyl('solid', copper, (w - 0.5, -h / 2 + 5, 8), 1.4, 12, segs=10)
    k.cyl('solid', copper, (w - 0.5, -h / 2 - 2, 8), 1.0, 12, segs=10)


def generator(p):
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    shell = paint('generator-shell', (0.3, 0.34, 0.24))
    grille = C.mat('grille', (0.035, 0.037, 0.04), rough=0.6, metal=0.4)
    k.box('solid', m['dark'], (w / 2, -h / 2, 3), (w, h, 6), bevel=0.6)
    k.box('solid', shell, (w / 2, -h / 2, (5 + H - 3) / 2), (w - 4, h - 4, H - 8), bevel=2.0)
    k.box('solid', shell, (w / 2 - 6, -h / 2, H - 4), (w - 26, h - 12, 2), bevel=0.8)
    for i in range(7):
        k.box('solid', grille, (12 + i * 5.5, -h / 2, H - 2.6), (2.6, h - 22, 0.4))
    k.cyl('solid', m['dark'], (w - 12, -14, H - 3), 4.5, 6, segs=16)
    k.cyl('solid', C.mat('soot', (0.02, 0.018, 0.016), rough=1.0, grime=0.3), (w - 12, -14, H - 0.2), 3.2, 0.6, segs=16)
    k.box('solid', m['hazard'], (w / 2, -h + 1.6, H - 9), (w - 8, 0.6, 4))
    k.box('solid', m['hazard'], (w / 2, -0.4, H - 9), (w - 8, 0.6, 4))
    panel = C.mat('panel', (0.08, 0.085, 0.09), rough=0.4, metal=0.3)
    k.box('solid', panel, (w - 22, -h + 1.4, 20), (24, 1.2, 16), bevel=0.4)
    for i, col in enumerate(((0.1, 0.9, 0.2), (0.9, 0.6, 0.05), (0.9, 0.1, 0.05))):
        k.cyl('solid', C.mat(f'led-{i}', col, rough=0.3, grime=0.0, emit=col, strength=4.0), (w - 30 + i * 5, -h + 0.6, 24), 1.0, 1.0, rot=(math.pi / 2, 0, 0), segs=8)
    for i in range(6):
        k.box('solid', grille, (16 + i * 8, -h + 1.6, 18), (5, 0.6, 18))
    k.cyl('solid', m['yellow'], (14, -h + 10, H - 2), 3, 2.2, segs=12)


def terminal(p):
    """A console: steel cabinet, screen tilted toward the south face, keyboard ledge, warning lights and cable runs."""
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    shell = paint('terminal-shell', (0.18, 0.2, 0.23))
    screen = C.mat('terminal-screen', (0.3, 0.85, 0.95), rough=0.2, grime=0.0, emit=(0.3, 0.82, 0.92), strength=5.0)
    bezel = C.mat('bezel', (0.02, 0.022, 0.025), rough=0.4, metal=0.3)
    k.box('solid', shell, (w / 2, -9, H / 2), (w - 4, 16, H), bevel=1.5)
    k.box('solid', shell, (w / 2, -(17 + h - 3) / 2, 14), (w - 6, h - 20, 28), bevel=1.5)
    k.box('solid', m['hazard'], (w / 2, -h + 2.7, 5), (w - 10, 0.6, 7))
    k.box('solid', shell, (w / 2, -h + 9, 29), (w - 10, 12, 3), bevel=1.0)
    for i in range(10):
        k.box('solid', m['dark'], (14 + i * 5, -h + 9, 30.8), (3.6, 7, 0.6))
    tilt = C.M((w / 2, -22, 37), (0.95, 0, 0))
    k.box('solid', bezel, (0, 0, 0), (w - 14, 20, 2.4), bevel=0.6, matrix=tilt)
    k.box('solid', screen, (0, 0, 1.25), (w - 20, 15, 0.3), matrix=tilt)
    for i in range(4):
        k.box('solid', C.mat('scanline', (0.1, 0.5, 0.6), rough=0.3, grime=0.0, emit=(0.15, 0.6, 0.75), strength=2.0), (-(w - 20) / 2 + 8 + i * 4, 3 - i * 2, 1.45), (10 + i * 3, 0.8, 0.1), matrix=tilt)
    red = C.mat('led-red', (0.95, 0.1, 0.05), rough=0.3, grime=0.0, emit=(1.0, 0.12, 0.05), strength=5.0)
    k.cyl('solid', red, (8, -6, H + 0.4), 2.2, 1.2, segs=12)
    k.cyl('solid', C.mat('led-0', (0.1, 0.9, 0.2), rough=0.3, grime=0.0, emit=(0.1, 0.9, 0.2), strength=4.0), (w - 8, -6, H + 0.4), 2.2, 1.2, segs=12)
    cable = C.mat('rubber', (0.025, 0.025, 0.027), rough=0.9, grime=0.2, ink=0.3, ao=0.4)
    for i, x in enumerate((w * 0.3, w * 0.5)):
        k.limb('solid', cable, (x, -2, 2), (x + 6 + i * 4, 3, 1.2), 1.2, joints=False)


def lamp(p):
    w, h, k = p.w, p.h, p.k
    m = mats()
    warm = C.mat('lamp-lens', (1.0, 0.85, 0.6), rough=0.3, grime=0.0, emit=(1.0, 0.82, 0.55), strength=8.0)
    k.box('solid', m['dark'], (w / 2, -h / 2, 1.5), (18, 12, 3), bevel=0.8)
    k.box('solid', warm, (w / 2, -h / 2, 3.1), (14, 8, 0.4), bevel=0.2)
    for x in (w / 2 - 5, w / 2, w / 2 + 5):
        k.box('solid', m['steel'], (x, -h / 2, 3.5), (0.8, 10, 0.6))


def alarm(p):
    w, h, k = p.w, p.h, p.k
    m = mats()
    red = C.mat('alarm-dome', (0.9, 0.08, 0.04), rough=0.25, grime=0.0, emit=(1.0, 0.1, 0.04), strength=6.0)
    k.cyl('solid', m['dark'], (w / 2, -h / 2, 1.2), 7, 2.4, segs=20, bevel=0.5)
    k.sphere('solid', red, (w / 2, -h / 2, 2.4), 5, scale=(1, 1, 0.8), segs=16)
    k.box('solid', m['steel'], (w / 2, -h / 2, 5.2), (11, 1.0, 0.8))


def signal(p):
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    red = C.mat('signal-lens', (0.95, 0.08, 0.05), rough=0.2, grime=0.0, emit=(1.0, 0.1, 0.05), strength=7.0)
    k.box('solid', m['stone'], (w / 2, -h / 2, 3), (16, 16, 6), bevel=0.8)
    k.box('solid', m['hazard'], (w / 2, -h / 2 - 8.3, 3), (14, 0.6, 5))
    k.cyl('solid', m['steel'], (w / 2, -h / 2, (6 + H - 16) / 2), 1.8, H - 22, segs=12)
    k.box('solid', m['dark'], (w / 2, -h / 2, H - 8), (11, 8, 16), bevel=1.2)
    for z in (H - 4, H - 12):
        k.cyl('solid', red if z > H - 8 else C.mat('signal-off', (0.15, 0.03, 0.02), rough=0.3, grime=0.0), (w / 2, -h / 2 - 4.2, z), 2.8, 0.8, rot=(math.pi / 2, 0, 0), segs=16)
        k.box('solid', m['dark'], (w / 2, -h / 2 - 5.5, z + 2.6), (7, 3, 0.6))


def gantry(p):
    """An overhead box truss: hazard-striped top chords, a lattice between them, bottom chords and cross frames."""
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    beam = steel('gantry-steel', (0.13, 0.14, 0.16))
    depth = 30.0
    for y in (-4.0, -h + 4.0):
        k.box('solid', beam, (w / 2, y, H - 3), (w, 8, 6), bevel=0.6)
        k.box('solid', m['hazard'], (w / 2, y, H + 0.1), (w - 2, 5, 0.4))
        k.box('solid', beam, (w / 2, y, H - depth), (w, 6, 5), bevel=0.6)
    bay = 50.0
    n = int(w / bay)
    for i in range(n + 1):
        x = min(max(i * bay, 3), w - 3)
        k.box('solid', beam, (x, -h / 2, H - 2), (4, h - 8, 4))
        for y in (-4.0, -h + 4.0):
            k.box('solid', beam, (x, y, H - depth / 2), (3, 3, depth))
        if i < n:
            ln = math.hypot(bay, h - 8)
            a = math.atan2(h - 8, bay) * (1 if i % 2 else -1)
            k.box('solid', m['dark'], (x + bay / 2, -h / 2, H - 1), (ln, 2.2, 2.2), rot=(0, 0, a))
            for y in (-4.0, -h + 4.0):
                d = math.hypot(bay, depth)
                k.box('solid', m['dark'], (x + bay / 2, y, H - depth / 2), (d, 2.0, 2.0), rot=(0, math.atan2(depth, bay) * (1 if i % 2 else -1), 0))
    for i in range(1, int(w / 100)):
        k.box('solid', m['steel'], (i * 100, -h / 2, H + 0.3), (8, h - 2, 0.8), bevel=0.2)


def gantry_post(p):
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    beam = steel('gantry-steel', (0.13, 0.14, 0.16))
    k.box('solid', m['stone'], (w / 2, -h / 2, 4), (w, h, 8), bevel=1.0)
    for y in (0.3, -h - 0.3):
        k.box('solid', m['hazard'], (w / 2, y, 4), (w - 3, 0.6, 7))
    for x in (-0.3, w + 0.3):
        k.box('solid', m['hazard'], (x, -h / 2, 4), (0.6, h - 3, 7))
    c = 6.0
    for x in (c, w - c):
        for y in (-c, -h + c):
            k.box('solid', beam, (x, y, H / 2 + 4), (5, 5, H - 8), bevel=0.5)
    z = 14.0
    while z < H - 6:
        for y in (-c, -h + c):
            k.box('solid', beam, (w / 2, y, z), (w - 2 * c, 2.5, 2.5))
        for x in (c, w - c):
            k.box('solid', beam, (x, -h / 2, z), (2.5, h - 2 * c, 2.5))
        z += 24
    span = w - 2 * c
    a = math.atan2(24, span)
    z = 14.0
    while z + 24 < H - 6:
        k.box('solid', m['dark'], (w / 2, -h + c, z + 12), (math.hypot(span, 24), 1.8, 1.8), rot=(0, a, 0))
        k.box('solid', m['dark'], (w / 2, -c, z + 12), (math.hypot(span, 24), 1.8, 1.8), rot=(0, -a, 0))
        z += 24
    k.box('solid', beam, (w / 2, -h / 2, H - 2), (w, h, 4), bevel=0.8)
    k.box('solid', m['hazard'], (w / 2, -h / 2, H + 0.1), (w - 6, h - 6, 0.4))
    for x in (8, w - 8):
        for y in (-8, -h + 8):
            k.cyl('solid', m['dark'], (x, y, H + 0.4), 1.6, 0.8, segs=8)


def pipes(p):
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    grey = steel('pipe-grey', (0.32, 0.33, 0.34), rough=0.35)
    yellow = paint('pipe-yellow', (0.7, 0.48, 0.05))
    runs = ((-5.0, 4.6, grey), (-13.5, 3.6, yellow), (-20.5, 3.0, grey))
    for y, r, mat in runs:
        z = H - r
        k.cyl('solid', mat, (w / 2, y, z), r, w, rot=(0, math.pi / 2, 0), segs=16)
        for x in range(25, int(w), 50):
            k.cyl('solid', m['dark'], (x, y, z), r + 1.0, 2.2, rot=(0, math.pi / 2, 0), segs=16)
    for x in range(10, int(w), 100):
        k.box('solid', m['steel'], (x, -h / 2, H - 0.4), (3, h, 1.2))
        k.box('solid', m['hazard'], (x, -h / 2, H + 0.3), (3, h - 4, 0.3))


def roof(p):
    """A metal roof: ribbed deck panels, skylights, vents and an edge flashing striped in hazard paint at the corners."""
    w, h, H, k, rnd = p.w, p.h, p.H, p.k, p.rnd
    m = mats()
    deck = paint('roof-deck', (0.2, 0.21, 0.22), rough=0.55)
    seam = steel('roof-seam', (0.27, 0.28, 0.3))
    glass = C.mat('skylight', (0.12, 0.17, 0.2), rough=0.08, metal=0.3, grime=0.2, grime_scale=0.8)
    k.box('solid', deck, (w / 2, -h / 2, H - 3), (w - 1, h - 1, 6), bevel=0.6)
    x = 7.0
    while x < w - 4:
        k.box('solid', seam, (x, -h / 2, H + 0.4), (1.4, h - 6, 1.2), bevel=0.3)
        x += 12.5
    for y in (-1.5, -h + 1.5):
        k.box('solid', m['steel'], (w / 2, y, H + 0.3), (w, 3, 1.6), bevel=0.4)
    for x in (1.5, w - 1.5):
        k.box('solid', m['steel'], (x, -h / 2, H + 0.3), (3, h, 1.6), bevel=0.4)
    for x, sx in ((0, 1), (w, -1)):
        for y, sy in ((0, -1), (-h, 1)):
            k.box('solid', m['hazard'], (x + sx * 9, y + sy * 1.5, H + 1.2), (16, 2.6, 0.3))
            k.box('solid', m['hazard'], (x + sx * 1.5, y + sy * 9, H + 1.2), (2.6, 16, 0.3))
    lights = max(1, int(w * h / 18000))
    for i in range(lights):
        sx = w * (i + 0.5) / lights
        sy = -h * rnd.uniform(0.3, 0.7)
        k.box('solid', m['steel'], (sx, sy, H + 0.6), (26, 38, 1.6), bevel=0.4)
        k.box('solid', glass, (sx, sy, H + 1.3), (22, 34, 0.6))
        k.box('solid', m['steel'], (sx, sy, H + 1.7), (1.2, 34, 0.5))
    for _ in range(max(1, int(w * h / 15000))):
        vx, vy = rnd.uniform(15, w - 15), -rnd.uniform(15, h - 15)
        k.cyl('solid', m['steel'], (vx, vy, H + 2), 4.5, 4, segs=16)
        k.cyl('solid', m['dark'], (vx, vy, H + 4.4), 5.5, 1.2, segs=16, radius2=3.0)


# ---------------------------------------------------------------- floor fittings

def vent(p):
    w, h, k = p.w, p.h, p.k
    m = mats()
    well = C.mat('grille', (0.035, 0.037, 0.04), rough=0.6, metal=0.4)
    slat = steel('vent-slat', (0.22, 0.23, 0.24), rough=0.4)
    k.box('solid', m['steel'], (w / 2, -h / 2, 0.6), (w, h, 1.2), bevel=0.4)
    k.box('solid', well, (w / 2, -h / 2, 0.9), (w - 6, h - 6, 0.4))
    for i in range(9):
        k.box('solid', slat, (w / 2, -4.5 - i * (h - 9) / 8, 1.3), (w - 7, 2.4, 0.4), rot=(0.5, 0, 0))
    for x in (3, w - 3):
        for y in (-3, -h + 3):
            k.cyl('solid', m['dark'], (x, y, 1.3), 0.9, 0.4, segs=8)


def grate(p):
    w, h, k = p.w, p.h, p.k
    m = mats()
    well = C.mat('grille', (0.035, 0.037, 0.04), rough=0.6, metal=0.4)
    bar = steel('grate-bar', (0.2, 0.205, 0.21), rough=0.45)
    k.box('solid', m['steel'], (w / 2, -h / 2, 0.5), (w, h, 1.0), bevel=0.3)
    k.box('solid', well, (w / 2, -h / 2, 0.8), (w - 5, h - 5, 0.3))
    x = 4.0
    while x < w - 3:
        k.box('solid', bar, (x, -h / 2, 1.1), (1.0, h - 5, 0.4))
        x += 3.2
    for y in (-h / 3, -2 * h / 3):
        k.box('solid', bar, (w / 2, y, 1.2), (w - 5, 1.2, 0.4))


def drain(p):
    w, h, k = p.w, p.h, p.k
    m = mats()
    well = C.mat('grille', (0.035, 0.037, 0.04), rough=0.6, metal=0.4)
    k.box('solid', m['stone'], (w / 2, -h / 2, 0.4), (w, h, 0.8), bevel=0.4)
    k.box('solid', m['steel'], (w / 2, -h / 2, 0.7), (w - 4, h - 8, 0.4))
    x = 5.0
    while x < w - 4:
        k.box('solid', well, (x, -h / 2, 0.95), (2.0, h - 12, 0.2))
        x += 4.0


def helipad(p):
    w, h, k = p.w, p.h, p.k
    m = mats()
    pad = C.mat('helipad', (0.12, 0.125, 0.13), rough=0.85, grime=0.35, grime_scale=0.5, bump=0.3)
    yellow = C.mat('pad-yellow', (0.78, 0.55, 0.05), rough=0.7, grime=0.4, grime_scale=1.2)
    white = C.mat('pad-white', (0.75, 0.74, 0.7), rough=0.7, grime=0.4, grime_scale=1.2)
    c = w / 2
    k.box('solid', pad, (c, -c, 0.3), (w - 2, h - 2, 0.6), bevel=0.3)
    segs = 48
    for i in range(segs):
        if i % 2:
            continue
        a = (i + 0.5) / segs * TAU
        k.box('solid', yellow, (c + math.cos(a) * 118, -c + math.sin(a) * 118, 0.7), (14, 7, 0.2), rot=(0, 0, a + math.pi / 2))
    k.cyl('solid', white, (c, -c, 0.65), 104, 0.2, segs=96)
    k.cyl('solid', pad, (c, -c, 0.7), 96, 0.2, segs=96)
    for x in (c - 28, c + 28):
        k.box('solid', white, (x, -c, 0.8), (12, 80, 0.2))
    k.box('solid', white, (c, -c, 0.8), (56, 12, 0.2))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        k.cyl('solid', C.mat('pad-light', (1.0, 0.75, 0.3), rough=0.3, grime=0.0, emit=(1.0, 0.7, 0.25), strength=4.0), (c + math.cos(a) * 135, -c + math.sin(a) * 135, 0.9), 2.5, 1.2, segs=12)
    for y in (2.5, -h + 2.5):
        k.box('solid', m['hazard'], (c, y, 0.75), (w - 4, 4, 0.3))


def track(p):
    """Rails on concrete sleepers over ballast, running along the footprint's long side."""
    w, h, k, rnd = p.w, p.h, p.k, p.rnd
    ballast = C.mat('ballast', (0.2, 0.19, 0.175), rough=1.0, grime=0.6, grime_scale=2.5, bump=1.0, ao=0.4)
    sleeper = concrete('sleeper', (0.38, 0.37, 0.35))
    rail = steel('rail', (0.17, 0.15, 0.13), rough=0.5)
    shine = C.mat('rail-top', (0.62, 0.62, 0.62), rough=0.18, metal=1.0, grime=0.1)
    k.box('solid', ballast, (w / 2, -h / 2, 0.5), (w - 4, h, 1.0))
    for _ in range(60):
        k.sphere('solid', ballast, (rnd.uniform(4, w - 4), -rnd.uniform(1, h - 1), 1.0), rnd.uniform(1.0, 2.2), scale=(1, 1, 0.5), segs=6)
    for i in range(6):
        y = -12.5 - i * 25
        k.box('solid', sleeper, (w / 2, y, 2.0), (w - 10, 9, 2.6), bevel=0.6)
        for x in (26, w - 26):
            k.box('solid', rail, (x, y, 3.4), (8, 7, 0.6))
    for x in (26, w - 26):
        k.box('solid', rail, (x, -h / 2, 4.6), (3.4, h, 2.4))
        k.box('solid', shine, (x, -h / 2, 5.9), (1.8, h, 0.3))


def buffer(p):
    """A buffer stop across the end of a track, its two buffers facing east."""
    w, h, H, k = p.w, p.h, p.H, p.k
    m = mats()
    frame = paint('buffer-red', (0.5, 0.06, 0.03))
    k.box('solid', m['stone'], (w / 2 - 6, -h / 2, 4), (w - 12, h - 4, 8), bevel=1.0)
    k.box('solid', frame, (w - 8, -h / 2, H / 2 + 2), (8, h - 10, H - 4), bevel=1.0)
    k.box('solid', m['hazard'], (w - 3.7, -h / 2, H / 2 + 4), (0.6, h - 16, H - 14))
    for y in (-h / 2 + 30, -h / 2 - 30):
        k.cyl('solid', m['steel'], (w - 1.5, y, 22), 6, 6, rot=(0, math.pi / 2, 0), segs=16)
        k.cyl('solid', m['dark'], (w + 1.2, y, 22), 8, 1.6, rot=(0, math.pi / 2, 0), segs=20, bevel=0.4)
        k.box('solid', frame, (w / 2 - 4, y, H / 2), (math.hypot(w - 12, H - 8), 4, 4), rot=(0, -math.atan2(H - 8, w - 12), 0))


# ---------------------------------------------------------------- the train

def loco(p):
    """A locomotive heading east: cab and sloped nose at the east end, roof radiators, yellow bands and lamps."""
    L, A, H, k = p.w, p.h, p.H, p.k
    m = mats()
    body = paint('train-grey', (0.42, 0.43, 0.44))
    cab = paint('train-white', (0.62, 0.62, 0.6))
    band = paint('train-yellow', (0.8, 0.52, 0.03))
    glass = C.mat('cab-glass', (0.05, 0.07, 0.09), rough=0.1, metal=0.4, grime=0.1)
    grille = C.mat('grille', (0.035, 0.037, 0.04), rough=0.6, metal=0.4)
    head = C.mat('headlamp', (1.0, 0.9, 0.7), rough=0.2, grime=0.0, emit=(1.0, 0.85, 0.6), strength=10.0)
    amber = C.mat('marker-amber', (1.0, 0.55, 0.1), rough=0.3, grime=0.0, emit=(1.0, 0.5, 0.08), strength=6.0)
    y0, y1 = -15.0, -A + 15.0
    wide = y0 - y1
    k.box('solid', m['dark'], (L / 2, -A / 2, 10), (L - 10, wide + 6, 20), bevel=1.0)
    k.box('solid', body, (L / 2 - 30, -A / 2, (20 + H - 2) / 2), (L - 80, wide, H - 22), bevel=3.0)
    k.box('solid', cab, (L - 45, -A / 2, (20 + H) / 2), (50, wide, H - 20), bevel=4.0)
    nose = C.M((L - 30, -A / 2, 52), (0, -0.55, 0))
    k.box('solid', cab, (0, 0, 0), (30, wide - 6, 60), bevel=5.0, matrix=nose)
    k.box('solid', glass, (L - 26, -A / 2, H - 12), (14, wide - 20, 10), rot=(0, -0.5, 0), bevel=1.0)
    for y in (y0 + 6, y1 - 6):
        k.box('solid', glass, (L - 50, y, H - 22), (26, 0.8, 14))
    for x in (40, 95, 150):
        k.box('solid', grille, (x, -A / 2, H - 1.4), (44, wide - 22, 0.6))
        for i in range(8):
            k.box('solid', m['steel'], (x - 19 + i * 5.4, -A / 2, H - 0.8), (1.2, wide - 22, 0.6))
    k.cyl('solid', m['dark'], (190, -A / 2 + 18, H), 5, 4, segs=16)
    k.box('solid', band, (L / 2 - 30, y1 - 0.4, 34), (L - 82, 0.8, 9))
    k.box('solid', band, (L / 2 - 30, y0 + 0.4, 34), (L - 82, 0.8, 9))
    k.box('solid', m['hazard'], (12, -A / 2, H - 2), (10, wide - 4, 1.0))
    k.box('solid', m['hazard'], (L - 3, -A / 2, 20), (2, wide - 4, 10))
    for y in (-A / 2 + 30, -A / 2 - 30):
        k.cyl('solid', head, (L - 1.2, y, 32), 4, 1.2, rot=(0, math.pi / 2, 0), segs=16)
    for x in range(30, int(L) - 30, 50):
        for y in (y0 + 3.6, y1 - 3.6):
            k.box('solid', amber, (x, y, 19), (6, 0.6, 1.6))
    k.box('solid', m['dark'], (L / 2 - 30, -A / 2, H - 0.4), (8, wide - 4, 1.2))


def freight_car(p, color):
    """A flatcar carrying a corrugated container, couplers at both ends and amber marker lamps along the deck."""
    L, A, H, k, rnd = p.w, p.h, p.H, p.k, p.rnd
    m = mats()
    amber = C.mat('marker-amber', (1.0, 0.55, 0.1), rough=0.3, grime=0.0, emit=(1.0, 0.5, 0.08), strength=6.0)
    deck = steel('deck', (0.09, 0.09, 0.095))
    y0, y1 = -15.0, -A + 15.0
    wide = y0 - y1
    k.box('solid', m['dark'], (L / 2, -A / 2, 10), (L - 6, wide + 6, 20), bevel=1.0)
    k.box('solid', deck, (L / 2, -A / 2, 23), (L - 4, wide + 8, 6), bevel=0.8)
    for x in (1, L - 1):
        k.box('solid', m['hazard'], (x, -A / 2, 23), (1.4, wide, 5))
        k.box('solid', m['steel'], (x, -A / 2, 16), (8, 10, 6), bevel=0.8)
    for x in range(25, int(L), 50):
        for y in (y0 + 4.6, y1 - 4.6):
            k.box('solid', amber, (x, y, 21), (6, 0.6, 1.6))
    body = paint(f'container-{color}', CONTAINER[color])
    rib = paint(f'container-rib-{color}', C.scalec(CONTAINER[color], 1.25))
    dark = steel('container-steel', (0.045, 0.047, 0.05))
    x0, x1 = 12.0, L - 12.0
    k.box('solid', body, ((x0 + x1) / 2, -A / 2, (26 + H) / 2), (x1 - x0, wide - 4, H - 26), bevel=0.6)
    x = x0 + 6
    while x < x1 - 4:
        k.box('solid', rib, (x, -A / 2, H + 0.4), (3.6, wide - 10, 1.2), bevel=0.4)
        for y in (y0 - 1, y1 + 1):
            k.box('solid', rib, (x, y, (26 + H) / 2), (3.6, 1.4, H - 34), bevel=0.4)
        x += 8
    for x in (x0 + 2.5, x1 - 2.5):
        for y in (y0 - 4, y1 + 4):
            k.box('solid', dark, (x, y, (26 + H) / 2), (5, 5, H - 26), bevel=0.5)
    stencil = C.mat('stencil-white', (0.7, 0.7, 0.65), rough=0.9, grime=0.5, grime_scale=2.0)
    C.text(f'SKR {rnd.randint(1000, 9999)}', 14, ((x0 + x1) / 2, -A / 2, H + 1.0), stencil, p.b.colls['solid'], p.b.root)


# ---------------------------------------------------------------- dispatch

PIECES = {
    'wall': wall, 'wall.long': wall, 'wall.short': wall, 'wall.thick': wall, 'wall.post': pillar, 'wall.broken': broken_wall,
    'lowwall': lowwall, 'sandbags': sandbags, 'railing': railing,
    'container.blue': lambda p: container(p, 'blue'), 'container.rust': lambda p: container(p, 'rust'), 'container.grey': lambda p: container(p, 'grey'),
    'crate': wood, 'crate.big': lambda p: wood(p, label='SUPPLY'), 'crate.drop': drop, 'crate.stack': crate_stack,
    'crate.metal': lambda p: metal_crate(p.b, p.w, p.H, 0, (0.2, 0.24, 0.2), label='AMMO'),
    'pallet': pallet, 'barrel': barrel, 'barrel.red': fuel_barrel, 'barrel.fire': fire_barrel,
    'planter': planter, 'planter.long': planter, 'forklift': forklift, 'ac': ac, 'generator': generator,
    'gantry': gantry, 'gantry.post': gantry_post, 'pipes': pipes, 'roof': roof, 'roof.s': roof, 'roof.wide': roof,
    'lamp': lamp, 'alarm': alarm, 'signal': signal, 'terminal': terminal,
    'vent': vent, 'grate': grate, 'drain': drain, 'helipad': helipad, 'track': track, 'buffer': buffer, 'rubble': rubble,
}


def build_piece(b):
    """`kit:<piece>:<turn>:<stage>`: the piece built in its footprint, turned, with its top on the footprint."""
    piece_id, turn, stage = b.arg[0], int(b.arg[1]), int(b.arg[2])
    d = b.spec['kit'][piece_id]
    p = P(b, d['w'], d['h'], d['height'], stage)
    PIECES[piece_id](p)
    b.root.matrix_world = turn_matrix(d['w'], d['h'], turn)
    overhead = d.get('overhead', False)
    flat = d['height'] == 0
    return C.Model(z_ref=float(d['height']), contact=0.0 if overhead else 0.45 if flat else 1.0, freeze=True)


def build_train(b):
    """`train:<part>:<turn>`: turn 0 travels east, turn 1 south."""
    part, turn = b.arg[0], int(b.arg[1])
    t = b.spec['train']
    p = P(b, t[part], t['across'], t['height'], 0)
    (loco if part == 'loco' else lambda q: freight_car(q, 'rust' if b.rnd.random() < 0.5 else 'grey'))(p)
    b.root.matrix_world = turn_matrix(p.w, p.h, turn)
    return C.Model(z_ref=float(t['height']), contact=1.0, freeze=True)

