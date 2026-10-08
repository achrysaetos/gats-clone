"""Crates, walls, the turret pad and turrets, the core and thrown items.

Footprint sprites (crates, walls, pad, core) have their origin at the footprint's top-left corner: Blender x runs
0..w and y runs 0..-h, and the top face (z_ref) lands exactly on the footprint. Turrets and thrown items are turned by
the painter, so they face +X around the origin, lit from above and unsheared.
"""

import math

from . import common as C

INK = (0.06, 0.06, 0.065)

PINE = (0.36, 0.2, 0.08)
DARK_WOOD = (0.2, 0.12, 0.06)
STEEL = (0.09, 0.095, 0.1)
YELLOW = (0.85, 0.55, 0.02)
BLACK = (0.02, 0.02, 0.02)


def steel(name='steel', color=STEEL, rough=0.4):
    return C.mat(name, color, rough=rough, metal=0.8, grime=0.35, grime_scale=0.6, ink=0.25, ao=0.35)


def paint(name, color, rough=0.5):
    return C.mat(name, color, rough=rough, metal=0.2, grime=0.35, grime_scale=0.35, ink=0.2, ao=0.4, bump=0.2)


def concrete(name='concrete', color=(0.27, 0.265, 0.25)):
    return C.mat(name, color, rough=0.9, grime=0.4, grime_scale=0.25, ao=0.45, bump=0.4)


# ---------------------------------------------------------------- crates

def plank(kit, b, material, center, size, stage, splinter, rot_z=0.0):
    """A board that splits, tilts and goes missing with damage. Breaks leave splinters."""
    rnd = b.rnd
    miss, brk = ((0.0, 0.0), (0.15, 0.45), (0.45, 0.5))[stage]
    roll = rnd.random()
    if roll < miss:
        return
    cx, cy, cz = center
    lx, ly, lz = size
    long_x = lx >= ly
    if roll < miss + brk:
        length = lx if long_x else ly
        cut = rnd.uniform(0.25, 0.75)
        gap = rnd.uniform(1.0, 3.0 + stage * 3)
        for side, frac in ((-1, cut), (1, 1 - cut)):
            if stage == 2 and rnd.random() < 0.4:
                continue
            piece = max(1.5, length * frac - gap / 2)
            off = side * (length / 2 - piece / 2)
            tilt = rnd.uniform(-0.12, 0.12) * stage
            drop = rnd.uniform(0, 2.5) * stage
            loc = (cx + (off if long_x else 0), cy + (0 if long_x else off), cz - drop)
            dims = (piece, ly, lz) if long_x else (lx, piece, lz)
            rot = (tilt if not long_x else 0, tilt if long_x else 0, rot_z + rnd.uniform(-0.05, 0.05) * stage)
            kit.box('solid', material, loc, dims, rot=rot, bevel=0.3)
            end = (loc[0] - side * piece / 2 if long_x else loc[0], loc[1] if long_x else loc[1] - side * piece / 2, loc[2] + lz / 2)
            for _ in range(2 + stage):
                a = rnd.uniform(-0.6, 0.6) + (0 if long_x else math.pi / 2) + (math.pi if side > 0 else 0)
                ln = rnd.uniform(1.5, 3.5)
                kit.box('solid', splinter, (end[0] + math.cos(a) * ln / 2, end[1] + math.sin(a) * ln / 2, end[2] - 0.3), (ln, 0.5, 0.5), rot=(0, rnd.uniform(-0.3, 0.3), a))
        return
    kit.box('solid', material, center, size, rot=(0, 0, rot_z), bevel=0.3)


def on_floor(b, h, x, y, r):
    """Clamps a floor point so an item of reach r stays inside the frame once the shear has moved the floor south by
    shear * h (h is the footprint's z_ref)."""
    box, k = b.entry['box'], b.spec['camera']['shear'] * h
    x = min(max(x, box['x'] + r), box['x'] + box['w'] - r)
    y = min(max(y, -(box['y'] + box['h']) + k + r), -box['y'] + k - r)
    return x, y


def debris(kit, b, material, size, count, h, height=0.6, spread=7.0):
    """Broken boards and chips lying on the floor around a footprint, inside the frame."""
    rnd = b.rnd
    for _ in range(count):
        side = rnd.choice(('s', 's', 'w', 'e', 'n'))
        if side == 's':
            x, y = rnd.uniform(0, size), -size - rnd.uniform(1, spread + 6)
        elif side == 'n':
            x, y = rnd.uniform(0, size), rnd.uniform(-1, 3)
        elif side == 'w':
            x, y = rnd.uniform(-4, 1), -rnd.uniform(0, size)
        else:
            x, y = size + rnd.uniform(-1, 4), -rnd.uniform(0, size)
        ln = rnd.uniform(2, 7)
        x, y = on_floor(b, h, x, y, ln / 2 + 1.5)
        kit.box('solid', material, (x, y, height), (ln, rnd.uniform(0.8, 2.5), rnd.uniform(0.6, 1.4)), rot=(rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), rnd.uniform(0, math.pi)), bevel=0.2)


def wood_crate(b, size, h, stage, lid=None, label=None):
    kit = b.kit
    rnd = b.rnd
    boards = C.wood('pine', PINE)
    frame = C.wood('pine-frame', C.scalec(PINE, 0.8))
    inside = C.mat('crate-inside', (0.03, 0.02, 0.012), rough=0.9, grime=0.2, ao=0.6)
    splinter = C.mat('splinter', (0.62, 0.45, 0.25), rough=0.8, grime=0.2)
    bracket = steel('bracket', (0.06, 0.06, 0.065))
    top_mat = lid or boards
    c = size / 2
    rim = 4.5
    # the hollow: a dark box that shows wherever boards are missing
    kit.box('solid', inside, (c, -c, (h - 5 if stage < 2 else h * 0.4) / 2), (size - 3, size - 3, h - 5 if stage < 2 else h * 0.4))
    # corner posts and the top frame
    for x in (rim / 2, size - rim / 2):
        for y in (-rim / 2, -size + rim / 2):
            post_h = h if stage < 2 or rnd.random() < 0.5 else h * rnd.uniform(0.4, 0.8)
            kit.box('solid', frame, (x, y, post_h / 2), (rim, rim, post_h), bevel=0.6)
            if stage < 2:
                kit.box('solid', bracket, (x, y, h + 0.25), (rim + 0.6, rim + 0.6, 0.6), bevel=0.2)
    for i, (cx, cy, lx, ly) in enumerate(((c, -rim / 2, size - 2 * rim, rim), (c, -size + rim / 2, size - 2 * rim, rim), (rim / 2, -c, rim, size - 2 * rim), (size - rim / 2, -c, rim, size - 2 * rim))):
        plank(kit, b, frame, (cx, cy, h - 0.9), (lx, ly, 1.8), max(0, stage - 1) if i < 2 else stage, splinter)
    # top boards between the frame
    n = 4 if size < 50 else 5
    pw = (size - 2 * rim) / n
    for i in range(n):
        plank(kit, b, top_mat, (c, -rim - pw * (i + 0.5), h - 1.2), (size - 2 * rim - 0.4, pw - 0.7, 1.6), stage, splinter)
    if stage < 2 and not label:
        plank(kit, b, frame, (c, -c, h - 0.1), (size * 1.25, rim * 0.9, 1.2), stage, splinter, rot_z=math.pi / 4)
    # the south face the camera sees: horizontal boards and a mid rail
    rows = 3
    for i in range(rows):
        z = (i + 0.5) * h / rows
        plank(kit, b, boards, (c, -size + 0.6, z), (size - 2 * rim, 1.4, h / rows - 0.7), stage, splinter)
    for i in range(rows):
        z = (i + 0.5) * h / rows
        plank(kit, b, boards, (c, -0.6, z), (size - 2 * rim, 1.4, h / rows - 0.7), 0, splinter)
        for x in (0.6, size - 0.6):
            plank(kit, b, boards, (x, -c, z), (1.4, size - 2 * rim, h / rows - 0.7), 0, splinter)
    if label and stage < 2:
        C.text(label, size * 0.15, (c, -c, h + 0.45), C.mat('stencil', (0.012, 0.01, 0.008), rough=0.9, grime=0.3, grime_scale=2.0), b.colls['solid'], b.root, rot=(0, 0, 0))
    if stage == 2:
        debris(kit, b, boards, size, 9, h)
        debris(kit, b, splinter, size, 8, h, height=0.4)
    elif stage == 1:
        debris(kit, b, splinter, size, 4, h, height=0.4)


def metal_crate(b, size, h, stage, body_color, trim=None, label=None):
    kit = b.kit
    rnd = b.rnd
    body = paint(f'crate-paint-{size}', body_color)
    dark = steel('crate-steel', (0.05, 0.052, 0.055))
    inside = C.mat('crate-inside', (0.03, 0.02, 0.012), rough=0.9, grime=0.2, ao=0.6)
    scorch = C.mat('scorch', (0.015, 0.012, 0.01), rough=0.95, grime=0.5, grime_scale=1.5)
    c = size / 2
    lean = (0.0, 0.08, 0.18)[stage]
    # the four walls, peeled outward a little more with each stage, around a dark inside
    kit.box('solid', inside, (c, -c, h * 0.3), (size - 4, size - 4, h * 0.6))
    for i, (cx, cy, lx, ly, ax, sgn) in enumerate(((c, -1.5, size, 3, 0, 1), (c, -size + 1.5, size, 3, 0, -1), (1.5, -c, 3, size - 6, 1, -1), (size - 1.5, -c, 3, size - 6, 1, 1))):
        tilt = lean * rnd.uniform(0.5, 1.0) * (2.2 if i == 1 else 1.0)
        rot = (sgn * tilt, 0, 0) if ax == 0 else (0, sgn * tilt, 0)
        wall_h = h - 4 if stage < 2 else h * rnd.uniform(0.55, 0.85)
        pivot = C.M((cx, cy, 0), rot)
        kit.box('solid', body, (0, 0, wall_h / 2), (lx, ly, wall_h), bevel=0.8, matrix=pivot)
        kit.box('solid', dark, (0, 0, wall_h * 0.62), (lx + (0.6 if ax == 0 else 0.4), ly + (0.4 if ax == 0 else 0.6), 2.0), bevel=0.4, matrix=pivot)
    # the lid: dented and skewed at stage 1, blown off at stage 2
    if stage < 2:
        tilt = (0.0, 0.05)[stage]
        lid = C.M((c + rnd.uniform(-1, 1) * stage, -c + rnd.uniform(-1, 1) * stage, h - 2.2), (tilt, -tilt * 0.6, rnd.uniform(-0.04, 0.04) * stage))
        kit.box('solid', body, (0, 0, 0), (size + 0.6, size + 0.6, 4.4), bevel=1.2, matrix=lid)
        kit.box('solid', paint(f'crate-inset-{size}', C.scalec(body_color, 0.7)), (0, 0, 2.3), (size - 10, size - 10, 0.5), bevel=0.3, matrix=lid)
        for y in (-size * 0.3, size * 0.3):
            kit.box('solid', dark, (0, y, 2.5), (size - 4, 3, 1.2), bevel=0.4, matrix=lid)
        if trim:
            stripe = C.stripes('hazard', YELLOW, BLACK, 2.5, ao=0.3)
            for (x, y, lx, ly) in ((0, size / 2 - 1.6, size, 3.2), (0, -size / 2 + 1.6, size, 3.2), (size / 2 - 1.6, 0, 3.2, size - 6.4), (-size / 2 + 1.6, 0, 3.2, size - 6.4)):
                kit.box('solid', stripe, (x, y, 2.3), (lx, ly, 0.6), matrix=lid)
            kit.cyl('solid', paint('emblem', (0.7, 0.18, 0.03)), (0, 0, 2.6), size * 0.14, 0.8, matrix=lid)
        if label:
            C.text(label, size * 0.13, (c, -c - size * 0.18, h + 0.7), C.mat('stencil-white', (0.7, 0.7, 0.65), rough=0.9, grime=0.5, grime_scale=2.0), b.colls['solid'], b.root)
        if stage == 1:
            kit.sphere('solid', scorch, (c + size * 0.2, -c + size * 0.15, h + 0.3), size * 0.2, scale=(1.4, 1, 0.08))
            bare = C.mat('bare-metal', (0.5, 0.5, 0.48), rough=0.3, metal=1.0, grime=0.2)
            for _ in range(7):
                x, y = rnd.uniform(5, size - 5), -rnd.uniform(5, size - 5)
                kit.cyl('solid', bare, (x, y, h + 0.25), 1.6, 0.3, segs=8)
                kit.cyl('solid', scorch, (x, y, h + 0.45), 0.8, 0.3, segs=8)
            for _ in range(4):
                a = rnd.uniform(0, math.pi)
                kit.box('solid', bare, (rnd.uniform(8, size - 8), -rnd.uniform(8, size - 8), h + 0.3), (rnd.uniform(5, 10), 0.4, 0.2), rot=(0, 0, a))
    else:
        for _ in range(3):
            kit.box('solid', body, (rnd.uniform(4, size - 4), -rnd.uniform(4, size - 4), rnd.uniform(2, h * 0.5)), (rnd.uniform(6, 12), rnd.uniform(4, 9), 1.2), rot=(rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(0, 3)), bevel=0.3)
        kit.box('solid', inside, (c, -c, h * 0.62), (size - 8, size - 8, 0.4))
        for _ in range(6):
            kit.box('solid', rnd.choice((dark, body)), (rnd.uniform(9, size - 9), -rnd.uniform(9, size - 9), h * 0.62 + 1.5), (rnd.uniform(5, 9), rnd.uniform(3, 6), 3), rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3)), bevel=0.6)
        for _ in range(4):
            kit.sphere('solid', scorch, (rnd.uniform(6, size - 6), -rnd.uniform(6, size - 6), h - 3.5), size * rnd.uniform(0.08, 0.14), scale=(1.5, 1, 0.12))
        debris(kit, b, dark, size, 8, h)
        debris(kit, b, body, size, 6, h)


# ---------------------------------------------------------------- walls

def jagged(rnd, x0, y0, x1, y1, depth, step=3.0, notches=0):
    """A rectangle's outline (Blender XY, counter-clockwise) broken inward by up to `depth`, with a few deep notches."""
    pts = []
    corners = ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
    deep = set(rnd.sample(range(4 * 8), notches)) if notches else set()
    k = 0
    for i in range(4):
        (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
        n = max(2, int(math.hypot(bx - ax, by - ay) / step))
        nx, ny = -(by - ay), bx - ax
        ln = math.hypot(nx, ny)
        nx, ny = nx / ln, ny / ln
        for j in range(n):
            t = j / n
            d = rnd.uniform(0, depth)
            if (k % 32) in deep:
                d += depth * rnd.uniform(2, 4)
            k += 1
            pts.append((ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d))
    return pts


def cracks(kit, b, material, x0, y0, x1, y1, z, count):
    """Dark hairline cracks wandering across a top face."""
    rnd = b.rnd
    for _ in range(count):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y1, y0)
        a = rnd.uniform(0, 2 * math.pi)
        for _ in range(rnd.randint(3, 6)):
            ln = rnd.uniform(2, 5)
            nx, ny = x + math.cos(a) * ln, y + math.sin(a) * ln
            if not (x0 < nx < x1 and y1 < ny < y0):
                break
            kit.box('solid', material, ((x + nx) / 2, (y + ny) / 2, z), (ln + 0.4, 0.55, 0.3), rot=(0, 0, a))
            x, y = nx, ny
            a += rnd.uniform(-0.8, 0.8)


def rubble(kit, b, material, size, count, h, big=3.5):
    rnd = b.rnd
    for _ in range(count):
        side = rnd.random()
        if side < 0.6:
            x, y = rnd.uniform(-2, size + 2), -size - rnd.uniform(0, 14)
        else:
            x, y = rnd.choice((rnd.uniform(-5, 1), size + rnd.uniform(-1, 5))), -rnd.uniform(0, size)
        s = rnd.uniform(0.8, big)
        x, y = on_floor(b, h, x, y, s * 1.2 + 1.5)
        kit.box('solid', material, (x, y, s * 0.4), (s * rnd.uniform(1, 1.8), s * rnd.uniform(0.8, 1.5), s), rot=(rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 3)), bevel=s * 0.25)


def build_siege_wall(b):
    """A concrete block with steel corner guards and a hazard band: chipped and cracked at stage 1, broken down to a
    rubble-strewn stump with bent rebar at stage 2."""
    stage = int(b.arg[0])
    kit = b.kit
    rnd = b.rnd
    size = b.entry['box']['w'] - 12
    h = 40.0
    stone = concrete()
    broken = concrete('concrete-broken', (0.33, 0.32, 0.3))
    crack = C.mat('crack', (0.03, 0.03, 0.03), rough=1.0, grime=0.0)
    trim = C.stripes('hazard', YELLOW, BLACK, 3.0, ao=0.3)
    guard = steel()
    rebar = C.mat('rebar', (0.12, 0.06, 0.03), rough=0.7, metal=0.6, grime=0.3)
    if stage == 0:
        kit.box('solid', stone, (size / 2, -size / 2, h / 2 - 1), (size, size, h - 2), bevel=1.5)
        kit.box('solid', stone, (size / 2, -size / 2, h - 1.5), (size - 4, size - 4, 3), bevel=1.0)
    elif stage == 1:
        kit.poly('solid', stone, jagged(rnd, 0, 0, size, -size, 0.8, notches=4), 0, h - 2.5, bevel=0.8)
        kit.poly('solid', stone, jagged(rnd, 2.5, -2.5, size - 2.5, -size + 2.5, 1.0, notches=3), h - 3, h, bevel=0.8)
        cracks(kit, b, crack, 3, -3, size - 3, -size + 3, h + 0.05, 5)
    else:
        kit.poly('solid', stone, jagged(rnd, 0, 0, size, -size, 1.2, step=4.0, notches=2), 0, h * 0.42, bevel=0.8)
        kit.poly('solid', broken, jagged(rnd, 3, -2, size - 4, -size * 0.7, 2.0, step=5.0, notches=2), h * 0.4, h * 0.68, bevel=1.0)
        kit.poly('solid', broken, jagged(rnd, 8, -6, size * 0.6, -size * 0.45, 1.5, step=5.0, notches=1), h * 0.66, h * 0.86, bevel=1.0)
        cracks(kit, b, crack, 6, -4, size - 6, -size * 0.65, h * 0.68 + 0.05, 3)
    if stage < 2:
        kit.box('solid', trim, (size / 2, -size + 0.1 + (0.6 if stage else 0), h * 0.72), (size - 6, 0.8, 4), bevel=0.2)
        for i, x in enumerate((1.2, size - 1.2)):
            for j, y in enumerate((-1.2, -size + 1.2)):
                if stage == 1 and i == j:
                    continue
                kit.box('solid', guard, (x, y, h / 2 - 1), (3.2, 3.2, h - 2), bevel=0.6)
    if stage >= 1:
        rubble(kit, b, broken, size, 10 if stage == 1 else 28, h, big=2.5 if stage == 1 else 5.0)
    if stage == 2:
        for _ in range(7):
            x, y = rnd.uniform(6, size - 6), -rnd.uniform(6, size * 0.65)
            kit.limb('solid', rebar, (x, y, h * 0.5), (x + rnd.uniform(-5, 5), y + rnd.uniform(-5, 5), h * rnd.uniform(0.75, 0.98)), 0.6, joints=False)
        kit.box('solid', guard, (size - 4, -size - 6, 1.0), (16, 3.2, 2.0), rot=(0, 0, 0.4), bevel=0.5)
    return C.Model(z_ref=h, contact=1.0)


def build_engineer_wall(b):
    """A deployable steel barricade along the footprint's long side, hazard rail on top."""
    kit = b.kit
    w, hgt = b.entry['box']['w'] - 12, b.entry['box']['h'] - 12 - 18
    along_x = w >= hgt
    length, thick = (w, hgt) if along_x else (hgt, w)
    h = 32.0
    panel = paint('barricade', (0.17, 0.2, 0.24))
    dark = steel('barricade-steel', (0.05, 0.052, 0.056))
    rail = C.stripes('hazard', YELLOW, BLACK, 3.0, ao=0.3)
    frame = C.M((0, 0, 0), (0, 0, 0)) if along_x else C.M((thick, 0, 0), (0, 0, -math.pi / 2))
    kit.box('solid', dark, (length / 2, -thick / 2, 2), (length, thick, 4), bevel=0.8, matrix=frame)
    n = max(1, round(length / 30))
    seg = length / n
    for i in range(n):
        x = (i + 0.5) * seg
        kit.box('solid', panel, (x, -thick / 2, h / 2), (seg - 3, thick - 4, h - 4), bevel=1.2, matrix=frame)
        kit.box('solid', dark, (x, -thick / 2, h - 3.6), (seg - 8, thick - 9, 0.8), bevel=0.3, matrix=frame)
        kit.box('solid', dark, (x, -thick + 1.6, h * 0.45), (seg - 10, 0.6, h * 0.35), bevel=0.2, matrix=frame)
    for i in range(n + 1):
        x = min(max(i * seg, 2.5), length - 2.5)
        kit.box('solid', dark, (x, -thick / 2, h / 2), (5, thick, h), bevel=1.0, matrix=frame)
    kit.box('solid', rail, (length / 2, -thick / 2, h - 0.8), (length - 2, 4, 1.8), bevel=0.4, matrix=frame)
    return C.Model(z_ref=h, contact=1.0)


def octagon(cx, cy, r):
    return [(cx + r * math.cos(math.pi / 8 + i * math.pi / 4), cy + r * math.sin(math.pi / 8 + i * math.pi / 4)) for i in range(8)]


def build_pad(b):
    """A low steel plate a turret bolts onto."""
    kit = b.kit
    size = b.entry['box']['w'] - 12
    h = 5.0
    plate = steel('pad', (0.12, 0.125, 0.13))
    dark = steel('pad-dark', (0.04, 0.042, 0.045))
    trim = C.stripes('hazard', YELLOW, BLACK, 2.5, ao=0.3)
    c = size / 2
    kit.poly('solid', plate, octagon(c, -c, size / 2 / math.cos(math.pi / 8) - 1), 0, h, bevel=0.8)
    kit.poly('solid', trim, octagon(c, -c, size * 0.42), h - 0.2, h + 0.3)
    kit.poly('solid', plate, octagon(c, -c, size * 0.37), h, h + 0.6, bevel=0.3)
    kit.cyl('solid', dark, (c, -c, h + 0.8), size * 0.25, 1.2, segs=32)
    for i in range(8):
        a = i * math.pi / 4
        kit.cyl('solid', dark, (c + math.cos(a) * size * 0.31, -c + math.sin(a) * size * 0.31, h + 0.8), 1.0, 1.0, segs=8)
    return C.Model(z_ref=h, contact=1.0)


# ---------------------------------------------------------------- turrets

def build_turret(b):
    kind = b.arg[0]
    look = b.spec['turrets'][kind]
    kit = b.kit
    head = C.mat(f'head-{kind}', C.srgb(look['head']), rough=0.45, metal=0.5, grime=0.3, grime_scale=0.6, ink=0.35, ao=0.4)
    barrel = C.mat(f'barrel-{kind}', C.srgb(look['barrel']), rough=0.35, metal=0.8, grime=0.15, ink=0.3)
    accent = C.mat(f'accent-{kind}', C.srgb(look['accent']), rough=0.5, grime=0.2)
    glow = C.mat(f'glow-{kind}', C.srgb(look['ammo']), rough=0.3, grime=0.0, emit=C.srgb(look['ammo']), strength=8.0)
    dark = steel('turret-dark', (0.03, 0.032, 0.035))
    kit.cyl('solid', dark, (0, 0, 2), 15, 4, segs=32, bevel=0.8)
    if kind == 'sentry':
        kit.box('solid', head, (1, 0, 8), (20, 18, 8), bevel=3)
        for y in (-3.6, 3.6):
            kit.cyl('solid', barrel, (23, y, 9), 1.9, 26, rot=(0, math.pi / 2, 0), segs=12)
            kit.cyl('solid', dark, (35, y, 9), 2.4, 4, rot=(0, math.pi / 2, 0), segs=12)
        kit.box('solid', accent, (-3, 0, 12.3), (8, 14, 0.8), bevel=0.3)
        kit.box('solid', dark, (-2, -11, 8), (10, 5, 6), bevel=1)
        kit.sphere('solid', glow, (11.5, 0, 9.5), 1.8)
        kit.box('solid', glow, (-8.5, 0, 9), (0.8, 10, 1.5))
    elif kind == 'cannon':
        kit.cyl('solid', head, (0, 0, 8), 13, 9, segs=32, bevel=2.5)
        kit.cyl('solid', barrel, (21, 0, 9), 3.8, 30, rot=(0, math.pi / 2, 0), segs=16)
        kit.cyl('solid', dark, (35, 0, 9), 5.0, 6, rot=(0, math.pi / 2, 0), segs=16, bevel=0.8)
        kit.box('solid', accent, (-4, 0, 12.8), (6, 18, 0.8), bevel=0.3)
        for y in (-7, 7):
            kit.sphere('solid', glow, (8, y, 12), 1.5)
    elif kind == 'scatter':
        kit.box('solid', head, (0, 0, 8), (20, 22, 8), bevel=3.5)
        for a in (-0.28, 0, 0.28):
            m = C.M((8, 0, 9), (0, 0, -a))
            kit.cyl('solid', barrel, (11, 0, 0), 2.4, 20, rot=(0, math.pi / 2, 0), segs=12, matrix=m)
            kit.cyl('solid', glow, (21.2, 0, 0), 1.6, 0.6, rot=(0, math.pi / 2, 0), segs=12, matrix=m)
        kit.box('solid', accent, (-6, 0, 12.3), (5, 16, 0.8), bevel=0.3)
        kit.box('solid', glow, (2, 0, 12.4), (1.2, 12, 0.6))
    else:
        kit.cyl('solid', head, (0, 0, 7), 12, 7, segs=32, bevel=2)
        m = C.M((6, 0, 12), (0, 0.9, 0))
        kit.cyl('solid', barrel, (0, 0, 0), 6.5, 18, segs=24, matrix=m)
        kit.cyl('solid', dark, (0, 0, -8.5), 7.5, 3, segs=24, matrix=m)
        kit.cyl('solid', glow, (0, 0, 9.1), 5.2, 0.4, segs=24, matrix=m)
        kit.cyl('solid', C.mat('bore', (0.005, 0.005, 0.005), rough=0.9, grime=0.0), (0, 0, 9.3), 4.6, 0.4, segs=24, matrix=m)
        kit.box('solid', accent, (-7, 0, 10.8), (4, 14, 0.8), bevel=0.3)
    return C.Model(z_ref=None, overhead=True, outline=(INK, 0.8))


# ---------------------------------------------------------------- core

def octahedron(kit, material, center, r, h):
    cx, cy, cz = center
    kit.cyl('solid', material, (cx, cy, cz + h / 4), r, h / 2, radius2=0.0, segs=4, rot=(0, 0, math.pi / 4))
    kit.cyl('solid', material, (cx, cy, cz - h / 4), 0.0, h / 2, radius2=r, segs=4, rot=(0, 0, math.pi / 4))


def build_core(b):
    """The objective: a steel platform with hazard edges, a glowing ring and a floating crystal."""
    kit = b.kit
    size = b.entry['box']['w'] - 12
    c = size / 2
    h = 10.0
    plate = steel('core-plate', (0.13, 0.135, 0.145))
    dark = steel('core-dark', (0.035, 0.037, 0.04))
    trim = C.stripes('hazard', YELLOW, BLACK, 3.0, ao=0.3)
    cyan = (0.05, 0.75, 1.0)
    ring = C.mat('core-ring', cyan, rough=0.2, grime=0.0, emit=cyan, strength=1.2)
    crystal = C.mat('crystal', (0.02, 0.45, 0.8), rough=0.1, metal=0.3, grime=0.0, emit=(0.1, 0.7, 1.0), strength=1.0, coat=1.0, ink=0.6)
    vent = steel('core-vent', (0.06, 0.065, 0.07))
    kit.poly('solid', plate, [(2, -10), (10, -2), (size - 10, -2), (size - 2, -10), (size - 2, -size + 10), (size - 10, -size + 2), (10, -size + 2), (2, -size + 10)], 0, h, bevel=1.0)
    for (x, y, lx, ly) in ((c, -3.5, size * 0.5, 3), (c, -size + 3.5, size * 0.5, 3), (3.5, -c, 3, size * 0.5), (size - 3.5, -c, 3, size * 0.5)):
        kit.box('solid', trim, (x, y, h + 0.3), (lx, ly, 1.0), bevel=0.2)
    for x, y in ((12, -12), (size - 12, -12), (12, -size + 12), (size - 12, -size + 12)):
        kit.box('solid', vent, (x, y, h + 4), (14, 14, 8), bevel=1.5)
        for k in range(4):
            kit.box('solid', dark, (x - 4.5 + k * 3, y, h + 8.1), (1.2, 10, 0.4))
    kit.cyl('solid', dark, (c, -c, h + 0.6), 30, 1.2, segs=48)
    kit.cyl('solid', ring, (c, -c, h + 1.4), 25, 0.8, segs=48)
    kit.cyl('solid', dark, (c, -c, h + 1.9), 22, 0.8, segs=48)
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        kit.box('solid', dark, (c + math.cos(a) * 25, -c + math.sin(a) * 25, h + 2.0), (5, 2.2, 1.2), rot=(0, 0, a + math.pi / 2))
    kit.poly('solid', plate, octagon(c, -c, 13), h, h + 6, bevel=1.2)
    kit.poly('solid', dark, octagon(c, -c, 10), h + 6, h + 6.8)
    octahedron(kit, crystal, (c, -c, h + 20), 8.5, 18)
    return C.Model(z_ref=h, contact=1.0)


# ---------------------------------------------------------------- thrown

def build_thrown(b):
    kind = b.arg[0]
    kit = b.kit
    dark = steel('thrown-dark', (0.03, 0.03, 0.032))
    lever = steel('lever', (0.25, 0.25, 0.26), rough=0.3)
    if kind == 'grenade':
        body = paint('grenade', (0.12, 0.16, 0.06), rough=0.45)
        led = C.mat('led-red', (1.0, 0.1, 0.05), grime=0.0, emit=(1.0, 0.08, 0.03), strength=10)
        kit.sphere('solid', body, (0, 0, 5), 5.5, scale=(1.1, 1, 1), segs=20)
        kit.box('solid', dark, (0, 0, 5), (12.4, 1.0, 9), bevel=0.3)
        kit.box('solid', lever, (3, 2.5, 10.2), (8, 1.6, 0.8), bevel=0.3)
        kit.cyl('solid', dark, (-5.5, 0, 5), 2.2, 3, rot=(0, math.pi / 2, 0), segs=12)
        kit.sphere('solid', led, (-6.9, 0, 5.8), 0.9)
    elif kind == 'fragGrenade':
        body = paint('frag', (0.08, 0.1, 0.05), rough=0.5)
        led = C.mat('led-orange', (1.0, 0.45, 0.05), grime=0.0, emit=(1.0, 0.4, 0.02), strength=10)
        kit.sphere('solid', body, (0, 0, 5), 5.6, scale=(1.25, 1, 1), segs=16)
        for i in range(-2, 3):
            kit.box('solid', dark, (i * 2.4, 0, 5), (0.6, 11.4, 10.5), bevel=0.2)
        kit.box('solid', dark, (0, 0, 5), (14, 0.6, 10.5), bevel=0.2)
        kit.box('solid', lever, (2.5, 2.8, 10.4), (9, 1.6, 0.8), bevel=0.3)
        kit.cyl('solid', dark, (-7, 0, 5), 2.2, 3, rot=(0, math.pi / 2, 0), segs=12)
        kit.sphere('solid', led, (-8.4, 0, 5.8), 0.9)
    elif kind == 'gasGrenade':
        body = paint('gas', (0.4, 0.42, 0.38), rough=0.5)
        band = C.mat('gas-band', (0.55, 0.85, 0.1), grime=0.0, emit=(0.5, 0.9, 0.05), strength=6)
        kit.cyl('solid', body, (0, 0, 4.5), 4.5, 15, rot=(0, math.pi / 2, 0), segs=20, bevel=0.8)
        kit.cyl('solid', band, (-2.5, 0, 4.5), 4.7, 1.5, rot=(0, math.pi / 2, 0), segs=20)
        kit.cyl('solid', band, (2.5, 0, 4.5), 4.7, 1.5, rot=(0, math.pi / 2, 0), segs=20)
        kit.cyl('solid', dark, (8.5, 0, 4.5), 2.8, 2.5, rot=(0, math.pi / 2, 0), segs=12)
        kit.box('solid', lever, (3, 0, 9.4), (10, 1.6, 0.8), bevel=0.3)
    else:
        body = steel('mine', (0.1, 0.11, 0.08))
        led = C.mat('led-red', (1.0, 0.1, 0.05), grime=0.0, emit=(1.0, 0.08, 0.03), strength=12)
        kit.cyl('solid', body, (0, 0, 1.6), 11.5, 3.2, segs=32, bevel=1.0)
        kit.cyl('solid', dark, (0, 0, 3.5), 6.5, 1.2, segs=32, bevel=0.3)
        for i in range(6):
            a = i * math.pi / 3
            kit.box('solid', dark, (math.cos(a) * 9, math.sin(a) * 9, 3.3), (3, 1.2, 0.6), rot=(0, 0, a))
        kit.sphere('solid', led, (0, 0, 4.4), 1.4)
    return C.Model(z_ref=None, overhead=True, outline=(INK, 0.7))
