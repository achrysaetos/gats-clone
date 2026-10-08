"""Guns, one real model per class, built on the game's part rectangles (GUN_PARTS: x along the barrel, y across).

Every gun lies on its left side, so the camera above sees its profile the way the HUD silhouettes draw it: sights and
optics north of the barrel (-y), grip, magazine and bipod south (+y). Coordinates here are game units in that frame
(x forward, y south, z toward the camera); Blender's y is the negative of y.

Three anchors tie every model to the game:
- the barrel, or the muzzle device on it, ends exactly at the muzzle the game spawns bullets from (check-sprites);
- the pistol grip sits under the soldier's right hand and a fore-end or support surface under the left (GRIP in
  soldier.py), which `check_hands` enforces for every one-gun model;
- nothing leaves the catalog's gun box, which GUN_PARTS sizes.

A gun bakes three frames over one box: 0 the gun without its moving parts, 1 the magazine or ammo box alone, 2 the
pump fore-end or bolt handle alone (an empty frame when the gun has none). The painter draws 1 under 0, so the
receiver covers the magazine's top, then 2 over it. Guns are flat (no shear) and lit from above, since the painter
turns them with the holder.
"""

import contextlib
import math

from . import common as C
from .soldier import GRIP, GRIP_SLACK

INK = (0.05, 0.05, 0.055)
# The plane the gun's centre line lies in, high enough that every part stays above the floor.
ZC = 4.0
ALONG = (0.0, math.pi / 2, 0.0)
BODY, MAG, ACTION = 0, 1, 2
# Where the hands hold the gun, in this module's frame (y south).
HAND = {side: (GRIP[side][0], -GRIP[side][1]) for side in 'RL'}
GX, FX = HAND['R'][0], HAND['L'][0]
# Model distance kept from the gun box's edge: the outline and antialiasing take the rest.
EDGE = 1.0
KNOWN = {'suppressor', 'compensator', 'brake', 'heavyBarrel', 'coils', 'extendedMag', 'drum', 'redDot', 'scope',
         'bigScope', 'laser', 'stock', 'shortStock', 'noStock', 'foregrip', 'launcher', 'bipod', 'carryHandle',
         'cylinder', 'motor'}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


class Rect:
    def __init__(self, p, R):
        self.x0, self.x1 = p['x'] * R, (p['x'] + p['w']) * R
        self.y0, self.y1 = p['y'] * R, (p['y'] + p['h']) * R
        self.w, self.h = self.x1 - self.x0, self.y1 - self.y0
        self.cy = (self.y0 + self.y1) / 2


class Parts:
    """One gun's rectangles by role. `c` is the receiver's centre line and `bh` its half height."""

    def __init__(self, rects):
        self.by = {}
        for role, r in rects:
            self.by.setdefault(role, []).append(r)
        self.body = self.by['body'][0]
        self.barrels = sorted(self.by['barrel'], key=lambda r: r.cy)
        self.mag = self.one('mag')
        self.optic = self.one('optic')
        self.tube = self.one('tube')
        self.bipod = self.one('bipod')
        self.accent = self.one('accent')
        self.c, self.bh = self.body.cy, self.body.h / 2

    def one(self, role):
        return self.by.get(role, [None])[0]


class Gun:
    """Collects a gun's geometry into one kit per frame and measures the pieces the hands hold."""

    def __init__(self, b, gun):
        self.gun = gun
        self.attach = set(gun['attachments'])
        unknown = self.attach - KNOWN
        if unknown:
            raise RuntimeError(f'{b.name}: no model for attachments {sorted(unknown)}')
        self.kits = [C.Kit(), C.Kit(), C.Kit()]
        self.spans = {}
        self.dz = 0.0
        self.top = 2.0
        rects = [(p['role'], Rect(p, b.R)) for p in gun['parts']]
        self.reach = max(r.x1 for _, r in rects)
        # the catalog's gunBox: 2 units of padding around every part, and the origin
        self.limit = max(max(-r.y0, r.y1) for _, r in rects) + 2 - EDGE
        self.rear = min(0.0, min(r.x0 for _, r in rects)) - 2 + EDGE
        self.rects = rects
        m = self.m = {}
        m['steel'] = C.mat('steel', (0.032, 0.034, 0.038), rough=0.45, metal=0.5, grime=0.12, grime_scale=1.5, ao=0.35, rim=0.35)
        m['dark'] = C.mat('dark', (0.012, 0.012, 0.014), rough=0.5, metal=0.3, grime=0.0, rim=0.15)
        m['poly'] = C.mat('poly', (0.02, 0.02, 0.022), rough=0.7, grime=0.12, grime_scale=1.2, ao=0.35, rim=0.4)
        m['can'] = C.mat('can', (0.022, 0.022, 0.024), rough=0.55, metal=0.4, grime=0.1, rim=0.45)
        m['wood'] = C.wood('wood', (0.13, 0.055, 0.022), ink=0.15, ao=0.3)
        m['tan'] = C.mat('tan', (0.2, 0.16, 0.095), rough=0.75, grime=0.18, grime_scale=1.4, ao=0.35, rim=0.3)
        m['olive'] = C.mat('olive', (0.07, 0.08, 0.045), rough=0.6, metal=0.3, grime=0.2, grime_scale=1.4, ao=0.35, rim=0.4)
        m['glass'] = C.mat('glass', (0.02, 0.06, 0.11), rough=0.05, coat=1.0, grime=0.0)
        m['brass'] = C.mat('brass', (0.55, 0.36, 0.1), rough=0.3, metal=1.0, grime=0.1, rim=0.3)
        m['copper'] = C.mat('copper', (0.6, 0.22, 0.08), rough=0.3, metal=1.0, grime=0.05, rim=0.3)
        m['red'] = C.mat('lens', (0.8, 0.04, 0.03), rough=0.2, grime=0.0)
        m['accent'] = C.mat('accent', C.scalec(C.srgb(gun['accent']), 0.8), rough=0.6, grime=0.08)

    def has(self, name):
        return name in self.attach

    def low(self, y):
        """y, kept inside the gun box's south edge."""
        return min(y, self.limit)

    # ------------------------------------------------ primitives, in the gun's frame

    def box(self, m, x0, x1, y0, y1, t, z=0.0, bevel=0.6, f=BODY):
        self.kits[f].box('solid', self.m[m], ((x0 + x1) / 2, -(y0 + y1) / 2, ZC + self.dz + z), (x1 - x0, y1 - y0, 2 * t), bevel=bevel)

    def tube(self, m, x0, x1, y, r, r1=None, z=0.0, f=BODY, segs=18):
        self.kits[f].cyl('solid', self.m[m], ((x0 + x1) / 2, -y, ZC + self.dz + z), r, x1 - x0, rot=ALONG, segs=segs, radius2=r1)

    def disc(self, m, x, y, r, t, z=0.0, f=BODY, segs=20):
        self.kits[f].cyl('solid', self.m[m], (x, -y, ZC + self.dz + z), r, 2 * t, segs=segs, bevel=min(0.3, r * 0.2))

    def slab(self, m, pts, t, z=0.0, bevel=0.4, f=BODY):
        self.kits[f].poly('solid', self.m[m], [(x, -y) for x, y in pts], ZC + self.dz + z - t, ZC + self.dz + z + t, bevel=bevel)

    @contextlib.contextmanager
    def part(self, name):
        """Records the footprint (x0, x1, y0, y1) of the geometry built inside, for check_hands."""
        before = [{k: len(g['v']) for k, g in kit.groups.items()} for kit in self.kits]
        yield
        vs = [v for kit, b in zip(self.kits, before) for k, g in kit.groups.items() for v in g['v'][b.get(k, 0):]]
        self.spans[name] = (min(v.x for v in vs), max(v.x for v in vs), min(-v.y for v in vs), max(-v.y for v in vs))

    def check_hands(self, where):
        """The swap contract's gun half: the grip lies under the right hand and the fore-end under the left, each within
        GRIP_SLACK (1 unit, 2 px) of the hand's point, measured on the built geometry's footprint."""
        for side, name in (('R', 'grip'), ('L', 'fore')):
            if name not in self.spans:
                raise RuntimeError(f'{where}: the model has no {name}')
            x0, x1, y0, y1 = self.spans[name]
            hx, hy = HAND[side]
            miss = math.hypot(max(x0 - hx, 0, hx - x1), max(y0 - hy, 0, hy - y1))
            if miss > GRIP_SLACK:
                raise RuntimeError(f'{where}: the {name} is {miss:.2f} units from the {side} hand at {HAND[side]} (limit {GRIP_SLACK})')


# ---------------------------------------------------------------- shared pieces

def grip(g, top, m, length=8.0, width=4.6, rake=0.3):
    """A pistol grip hanging south from `top`, raked back, centred under the right hand."""
    bot = g.low(top + length)
    r = rake * (bot - top)
    hw = width / 2
    with g.part('grip'):
        g.slab(m, [(GX - hw + r / 2, top), (GX + hw + r / 2, top), (GX + hw - r / 2 + 0.3, bot), (GX - hw - r / 2, bot)], 1.7, bevel=0.7)
    # a stippled panel
    g.slab('dark' if m != 'wood' else 'wood', [(GX - hw + r / 2 + 1.0, top + 1.2), (GX + hw + r / 2 - 1.2, top + 1.2),
                                            (GX + hw - r / 2 - 0.9, bot - 0.8), (GX - hw - r / 2 + 1.0, bot - 0.8)], 0.3, z=1.6, bevel=0.1)
    return bot, r


def guard(g, top, room=5.0):
    """The trigger guard under `top`, ahead of the grip, no longer than `room`."""
    x0 = GX + 1.6
    x1 = x0 + clamp(room, 2.0, 4.8)
    drop = min(2.4, g.limit - top)
    g.box('steel', x0, x1 + 0.6, top + drop - 0.7, top + drop, 0.9, bevel=0.25)
    g.box('steel', x1, x1 + 0.7, top - 0.2, top + drop, 0.9, bevel=0.25)
    g.slab('dark', [(x0 + 1.0, top - 0.2), (x0 + 1.9, top - 0.2), (x0 + 1.4, top + drop - 1.0), (x0 + 0.9, top + drop - 1.0)], 0.6, bevel=0.1)


def wire_stock(g, top, bot, x_front, m='steel'):
    """A folding wire stock from the receiver back to a butt plate near the origin."""
    xb = max(g.rear, 0.6) + 0.6
    g.slab(m, [(x_front, top), (x_front, top + 0.9), (xb, top + 1.1), (xb, top + 0.2)], 0.8, bevel=0.2)
    g.slab(m, [(x_front, bot - 0.9), (x_front, bot), (xb, g.low(bot + 1.6)), (xb, g.low(bot + 1.6) - 0.9)], 0.8, bevel=0.2)
    g.box('poly', xb - 1.2, xb + 0.6, top - 0.4, g.low(bot + 2.2), 1.6, bevel=0.5)


def solid_stock(g, x_front, top, bot, butt_top, butt_bot, m, length=None):
    """A buttstock from the receiver's rear (`x_front`) back to a recoil pad at the origin."""
    xb = max(g.rear, 0.0) if length is None else x_front - length
    g.slab(m, [(x_front, top), (xb + 1.6, butt_top), (xb + 1.0, butt_top), (xb + 1.0, butt_bot), (xb + 3.2, butt_bot), (x_front, bot)], 2.0, bevel=0.7)
    g.box('dark', xb, xb + 1.2, butt_top + 0.2, butt_bot - 0.2, 2.1, bevel=0.4)


def red_dot(g, x0, x1, base):
    """A red-dot sight on a rail whose top is `base`, as tall as the gun box leaves room for."""
    tip = max(base - 3.6, -g.limit)
    g.box('dark', x0 + 0.6, x1 - 0.6, base - 1.0, base + 0.1, 1.2, bevel=0.2)
    g.box('poly', x0, x1, tip, base - 0.8, 1.6, bevel=0.6)
    g.box('glass', x0 + 0.8, x1 - 1.2, tip + 0.6, base - 1.4, 0.2, z=1.55, bevel=0.1)
    g.disc('red', x1 - 0.8, (tip + base - 0.8) / 2, 0.45, 0.2, z=1.6)


def scope(g, x0, x1, cy, r, base, rings=True):
    """A telescopic sight from x0 (eyepiece) to x1 (objective) on rings down to `base`."""
    w = x1 - x0
    main = r * 0.62
    g.tube('dark', x0, x0 + 0.2 * w, cy, r * 0.82, main)
    g.tube('steel', x0 + 0.2 * w, x0 + 0.62 * w, cy, main)
    g.tube('steel', x0 + 0.62 * w, x0 + 0.76 * w, cy, main, r)
    g.tube('dark', x0 + 0.76 * w, x1, cy, r)
    g.tube('glass', x1 - 0.5, x1, cy, r * 0.8, z=0.05)
    mid = x0 + 0.42 * w
    g.box('dark', mid - 1.0, mid + 1.0, max(cy - main - 1.4, -g.limit), cy, 1.0, bevel=0.3)
    g.disc('dark', mid, cy, 1.1, 0.5, z=main + 0.2)
    if rings:
        for x in (x0 + 0.3 * w, x0 + 0.7 * w):
            g.box('dark', x - 0.9, x + 0.9, cy, base, 1.3, bevel=0.3)


def barrel(g, x0, cy, r, device=None, sight=False):
    """A barrel from x0 to the muzzle with its muzzle device. Returns the barrel's radius."""
    reach = g.reach
    if g.has('heavyBarrel'):
        r *= 1.35
    end = reach
    if g.has('suppressor'):
        s0 = reach - max(9.0, 0.45 * (reach - x0))
        sr = max(r * 1.9, r + 1.4)
        g.tube('can', s0, reach, cy, sr)
        for x in (s0 + 0.6, reach - 1.4):
            g.tube('dark', x, x + 0.8, cy, sr * 1.04)
        end = s0 + 0.5
    elif g.has('brake') or g.has('compensator') or device == 'brake':
        big = g.has('brake') or g.has('compensator')
        n = 3 if big else 2
        length = (5.5 if big else 3.6) * (1.1 if r > 1.6 else 1.0)
        half = r * (1.75 if big else 1.45)
        b0 = reach - length
        g.box('steel', b0, reach, cy - half, cy + half, half * 0.95, bevel=0.5)
        for i in range(n):
            x = b0 + (i + 0.6) * length / (n + 0.4)
            g.box('dark', x, x + length / (n + 0.4) * 0.45, cy - half + 0.4, cy + half - 0.4, 0.3, z=half * 0.95 - 0.1, bevel=0.0)
        end = b0 + 0.5
    g.tube('steel', x0, end, cy, r)
    if g.has('heavyBarrel'):
        for dy in (-0.4, 0.4):
            g.box('dark', x0 + 2, end - 1.5, cy + dy * r - 0.18, cy + dy * r + 0.18, 0.2, z=r * 0.9, bevel=0.0)
    if end == reach:
        if device == 'hider':
            g.tube('dark', reach - 3.0, reach, cy, r * 1.35)
            g.box('steel', reach - 2.4, reach - 0.4, cy - 0.3, cy + 0.3, 0.2, z=r * 1.3, bevel=0.0)
        elif device == 'nut':
            g.tube('dark', reach - 1.6, reach, cy, r * 1.3)
    if sight:
        sx = end - 3.0
        g.slab('steel', [(sx - 1.4, cy - r + 0.3), (sx + 0.6, cy - r + 0.3), (sx + 0.1, cy - r - 1.9), (sx - 0.8, cy - r - 1.9)], 0.6, bevel=0.15)
    return r


def foregrip(g, x1, top):
    bot = g.low(top + 6.5)
    g.slab('poly', [(x1 - 4.2, top - 0.4), (x1, top - 0.4), (x1 - 0.5, bot), (x1 - 3.7, bot)], 1.5, bevel=0.6)


def bipod(g, px, top, bot):
    """Bipod legs deployed south from a clamp at (px, top)."""
    bot = g.low(bot)
    g.box('dark', px - 1.2, px + 1.2, top - 0.6, top + 1.4, 1.8, bevel=0.4)
    for dx, z in ((-2.6, -0.6), (2.2, 0.6)):
        g.slab('steel', [(px - 0.5, top + 0.8), (px + 0.5, top + 0.8), (px + dx + 0.5, bot - 0.8), (px + dx - 0.5, bot - 0.8)], 0.6, z=z, bevel=0.15)
        g.box('dark', px + dx - 1.0, px + dx + 1.0, bot - 1.0, bot, 0.8, z=z, bevel=0.3)


def accent(g, P):
    a = P.accent
    if a:
        g.box('accent', a.x0, a.x1, a.cy - a.h * 0.22, a.cy + a.h * 0.22, 0.4, z=g.top - 0.2, bevel=0.05)


def mag_curve(g, m, top, curve, m_name='poly'):
    """A box magazine from `top` to the bottom of its rectangle (deeper when extended), curving forward, or a drum."""
    if g.has('drum'):
        r = min(5.5, (g.limit - top) / 2.1)
        cx, cy = (m.x0 + m.x1) / 2 + 1.0, g.limit - r
        g.box(m_name, m.x0, m.x1, top, cy, 1.4, bevel=0.4, f=MAG)
        g.disc(m_name, cx, cy, r, 2.0, f=MAG, segs=28)
        g.disc('dark', cx, cy, r * 0.62, 0.2, z=1.95, f=MAG, segs=28)
        g.disc(m_name, cx, cy, r * 0.25, 0.4, z=2.0, f=MAG)
        return
    bot = g.low(m.y1 + (5.0 if g.has('extendedMag') else 0.0))
    cv = curve * (bot - top)
    g.slab(m_name, [(m.x0, top), (m.x1, top), (m.x1 + cv, bot - 0.8), (m.x0 + cv * 1.3, bot - 0.8)], 1.4, bevel=0.4, f=MAG)
    g.box('dark', m.x0 + cv * 1.3 - 0.4, m.x1 + cv + 0.4, bot - 1.0, bot, 1.6, bevel=0.3, f=MAG)
    for k in range(3):
        y = top + (k + 1.5) * (bot - top) / 5
        s = cv * (y - top) / (bot - top)
        g.box('dark', m.x0 + 0.6 + s, m.x1 - 0.6 + s, y, y + 0.35, 0.2, z=1.35, bevel=0.0, f=MAG)


# ---------------------------------------------------------------- classes

def pistol(g, P):
    b, c, bh = P.body, P.c, P.bh
    br = clamp(P.barrels[0].h * 0.3, 1.0, 1.9)
    top, slide_bot, frame_bot = c - bh, c + 0.3 * bh, c + 0.62 * bh
    revolver = g.has('cylinder')
    g.top = 2.0
    if revolver:
        cx0, cx1 = b.x0 + 0.2 * b.w, b.x0 + 0.6 * b.w
        with g.part('fore'):
            g.box('steel', b.x0, b.x1, top + 0.25 * bh, slide_bot, 1.6, bevel=0.6)
        g.box('steel', cx0, cx1, top, slide_bot + 0.3 * bh, 2.6, bevel=1.3)
        for dy in (-0.45, 0.0, 0.45):
            g.box('dark', cx0 + 0.8, cx1 - 0.8, c + dy * bh - 0.3, c + dy * bh + 0.3, 0.3, z=2.45, bevel=0.0)
        g.slab('dark', [(b.x0 - 1.8, top - 0.2), (b.x0 - 0.6, top - 0.4), (b.x0 + 1.2, top + 0.4 * bh), (b.x0 - 0.2, top + 0.6 * bh)], 1.0)
        rb = barrel(g, cx1 - 0.5, P.barrels[0].cy, br * 1.15, sight=True)
        g.box('steel', cx1, g.reach - 0.3, c - rb - 0.7, c - rb * 0.5, 0.7, bevel=0.2)
        g.tube('steel', cx1, cx1 + 0.55 * (g.reach - cx1), c + rb + 0.6, 0.6)
    else:
        with g.part('fore'):
            g.box('steel', b.x0, b.x1, top, slide_bot, 2.0, bevel=0.8)
        for i in range(4):
            x = b.x0 + 0.9 + i * 0.9
            g.box('dark', x, x + 0.4, top + 0.6, slide_bot - 0.6, 0.25, z=1.85, bevel=0.0)
        g.box('dark', b.x0 + 0.5 * b.w, b.x0 + 0.72 * b.w, top + 0.35 * bh, c + 0.05 * bh, 0.25, z=1.85, bevel=0.1)
        g.box('steel', b.x1 - 2.2, b.x1 - 0.8, top - 0.8, top + 0.4, 0.7, bevel=0.2)
        g.box('dark', b.x0 + 0.6, b.x0 + 2.0, top - 0.7, top + 0.4, 0.8, bevel=0.2)
        barrel(g, b.x1 - 0.5, P.barrels[0].cy, br)
    g.slab('steel' if revolver else 'poly', [(b.x0 + 0.6, slide_bot - 0.2), (b.x1 - 1.2, slide_bot - 0.2), (b.x1 - 1.2, frame_bot - 0.4),
                                            (b.x1 - 2.2, frame_bot), (b.x0 + 2.5, frame_bot)], 1.8)
    guard(g, frame_bot, 4.6)
    bot, rake = grip(g, slide_bot - 0.4, 'poly', length=2.4 * bh)
    if not revolver:
        hw = 1.6
        g.slab('steel', [(GX - hw + rake / 2, slide_bot), (GX + hw + rake / 2, slide_bot), (GX + hw - rake / 2, bot - 0.6), (GX - hw - rake / 2, bot - 0.6)], 1.3, f=MAG)
        g.box('dark', GX - 2.6 - rake / 2, GX + 2.3 - rake / 2, bot - 0.7, bot, 1.9, bevel=0.3, f=MAG)
    if g.has('laser'):
        lx, ly1 = b.x1 - 1.8, g.low(frame_bot + 1.8)
        g.box('poly', lx - 6.0, lx, frame_bot - 0.6, ly1, 1.4, bevel=0.4)
        g.disc('red', lx - 0.2, (frame_bot - 0.6 + ly1) / 2, 0.55, 0.2, z=1.35)
    if g.has('stock'):
        wire_stock(g, top + 0.3 * bh, slide_bot + 0.5, b.x0 + 0.5)


def smg(g, P):
    b, m, c, bh = P.body, P.mag, P.c, P.bh
    top, mid = c - 0.75 * bh, c + 0.45 * bh
    g.top = 2.2
    g.box('steel', b.x0, m.x0 - 1.0, top, mid, 2.2, bevel=1.0)
    with g.part('fore'):
        g.box('steel', m.x0 - 1.0, b.x1, top, mid, 2.2, bevel=1.0)
    g.box('dark', b.x0 + 2, b.x1 - 2, top - 0.9, top + 0.1, 1.0, bevel=0.2)
    g.box('dark', b.x0 + 0.35 * b.w, b.x0 + 0.55 * b.w, top + 0.3 * bh, c - 0.05 * bh, 0.25, z=2.05, bevel=0.1)
    g.disc('steel', b.x1 - 3.0, top + 0.6, 0.8, 0.5, z=2.2)
    g.box('poly', m.x0 - 0.8, m.x1 + 0.8, mid - 0.5, g.low(mid + 2.0), 1.8, bevel=0.5)
    guard(g, mid, m.x0 - 1.4 - (GX + 1.6))
    grip(g, mid - 0.4, 'poly', length=8.0)
    mag_curve(g, m, mid - 0.5, 0.12)
    barrel(g, b.x1 - 1.0, P.barrels[0].cy, clamp(P.barrels[0].h * 0.28, 1.0, 2.0), device='nut', sight=True)
    wire_stock(g, top + 0.4, mid - 0.2, b.x0 + 0.4)
    if g.has('redDot'):
        red_dot(g, b.x0 + 3.0, b.x0 + 8.5, top - 0.8)
    if g.has('foregrip'):
        foregrip(g, b.x1 - 1.0, mid)


def assault(g, P):
    b, m, o, c, bh = P.body, P.mag, P.optic, P.c, P.bh
    top, ur, lr = c - bh, c + 0.2 * bh, c + 0.65 * bh
    g.top = 2.3
    if g.has('shortStock'):
        g.tube('steel', 3.0, b.x0 + 0.5, c - 0.3 * bh, 1.3)
        solid_stock(g, 8.5, top + 0.35 * bh, c + 0.55 * bh, top + 0.3 * bh, g.low(c + 1.5 * bh), 'poly', length=5.5)
    else:
        solid_stock(g, b.x0 + 0.5, top + 0.25 * bh, c + 0.45 * bh, top + 0.15 * bh, g.low(c + 1.55 * bh), 'poly')
    g.box('steel', b.x0, FX - 1.5, top, ur, 2.2, bevel=0.9)
    g.box('dark', b.x0 + 1, b.x1 - 0.5, top - 0.9, top + 0.1, 1.0, bevel=0.2)
    for i in range(int((b.x1 - b.x0 - 2) / 1.6)):
        x = b.x0 + 1.3 + i * 1.6
        g.box('steel', x, x + 0.7, top - 0.9, top - 0.4, 1.05, bevel=0.0)
    g.box('dark', b.x0 + 0.45 * (FX - 1.5 - b.x0), FX - 3.0, top + 0.35 * bh, ur - 0.4, 0.25, z=2.05, bevel=0.1)
    g.box('steel', b.x0 - 1.2, b.x0 + 1.0, top + 0.2, top + 1.2, 1.0, bevel=0.3)
    g.box('steel', b.x0 + 1, FX - 1.0, ur - 0.3, lr, 2.0, bevel=0.6)
    g.box('steel', m.x0 - 0.8, m.x1 + 0.8, ur - 0.3, g.low(lr + 1.4), 2.0, bevel=0.5)
    with g.part('fore'):
        g.box('poly', FX - 1.5, b.x1, c - 0.8 * bh, c + 0.75 * bh, 2.3, bevel=1.0)
    for i in range(int((b.x1 - FX - 1) / 2.2)):
        x = FX + 0.5 + i * 2.2
        g.box('dark', x, x + 1.1, c - 0.4 * bh, c + 0.35 * bh, 0.25, z=2.2, bevel=0.1)
    guard(g, lr, m.x0 - 1.4 - (GX + 1.6))
    grip(g, lr - 0.6, 'poly', length=8.5)
    mag_curve(g, m, lr - 0.5, 0.28)
    if g.has('scope'):
        scope(g, o.x0 - 1.0, o.x1 + 2.0, o.cy, min(o.h * 0.75, 3.0), top - 0.9)
    else:
        g.box('dark', o.x0 + 1.0, o.x1 - 1.0, o.y1 - 0.4, top - 0.8, 1.2, bevel=0.2)
        g.box('poly', o.x0, o.x1, o.y0, o.y1, 1.9, bevel=0.7)
        g.box('glass', o.x0 + 0.8, o.x1 - 0.8, o.y0 + 0.7, o.y1 - 0.7, 0.2, z=1.85, bevel=0.1)
    r = barrel(g, b.x1 - 1.0, P.barrels[0].cy, clamp(P.barrels[0].h * 0.3, 1.0, 1.8), device='hider')
    if not g.has('suppressor'):
        fx = b.x1 + 2.0
        g.slab('steel', [(fx, c - r), (fx + 2.6, c - r), (fx + 2.0, top - 1.2), (fx + 0.8, top - 1.2)], 0.7, bevel=0.2)
        g.box('steel', fx - 0.2, fx + 2.8, c - r - 0.2, c + r + 0.6, r + 0.4, bevel=0.3)
    if g.has('launcher'):
        ly, lr_ = c + 0.75 * bh + 2.0, 2.1
        lx1 = min(b.x1 + 9.0, g.reach - 6.0)
        g.tube('steel', FX + 1.0, lx1, ly, lr_)
        g.tube('dark', lx1 - 1.0, lx1, ly, lr_ * 1.1)
        g.box('poly', FX + 1.0, FX + 4.5, ly, g.low(ly + lr_ + 1.8), 1.4, bevel=0.4)
    if g.has('foregrip'):
        foregrip(g, b.x1 - 1.0, c + 0.75 * bh)


def shotgun(g, P):
    b, c, bh, t = P.body, P.c, P.bh, P.tube
    rx0, rx1 = b.x0 - 1.8, FX - 2.5
    top, rbot = c - 0.8 * bh, c + 0.55 * bh
    multi = len(P.barrels) > 1
    pumped = g.gun['cycle'] == 'pump'
    furniture = 'wood'
    g.top = 2.3
    if not g.has('noStock'):
        solid_stock(g, rx0 + 0.5, top + 0.2 * bh, rbot, top + 0.4 * bh, g.low(c + 1.35 * bh), furniture)
    g.box('steel', rx0, rx1, top, rbot, 2.3, bevel=1.0)
    g.box('dark', rx0 + 0.45 * (rx1 - rx0), rx1 - 1.2, top + 0.3 * bh, c + 0.1 * bh, 0.25, z=2.15, bevel=0.1)
    guard(g, rbot, 4.6)
    grip(g, rbot - 0.6, furniture, length=7.5)
    if multi:
        r = clamp(P.barrels[0].h * 0.28, 1.4, 2.6)
        ys = [p.cy * 0.5 for p in P.barrels]
    else:
        r = clamp(P.barrels[0].h * 0.28, 1.4, 2.3)
        ys = [P.barrels[0].cy]
    for y in ys:
        rb = barrel(g, rx1 - 0.5, y, r)
    g.box('steel', rx1, g.reach - 0.5, min(ys) - rb - 0.6, min(ys) - rb + 0.3, 0.5, bevel=0.15)
    g.disc('steel', g.reach - 1.2, min(ys) - rb - 0.6, 0.5, 0.4, z=0.2)
    under = max(ys) + rb
    if not multi and not g.has('drum'):
        tr = clamp(t.h * 0.4, 1.0, 1.8)
        ty = under + tr - 0.3
        g.tube('steel', rx1 - 0.5, t.x1, ty, tr)
        g.tube('steel', t.x1 - 0.9, t.x1, ty, tr * 1.12)
        under = ty + tr
    fe0, fe1 = FX - 2.5, min(FX + 8.5, g.reach - 3.5)
    y0, y1 = min(ys) - rb * 0.8, g.low(under + 0.7)
    f = ACTION if pumped else BODY
    with g.part('fore'):
        g.box('poly' if g.has('coils') else furniture, fe0, fe1, y0, y1, rb + 1.0, bevel=0.8, f=f)
    if pumped:
        for i in range(int((fe1 - fe0 - 1.0) / 1.3)):
            x = fe0 + 0.9 + i * 1.3
            g.box('dark', x, x + 0.45, y0 + 0.6, y1 - 0.6, 0.2, z=rb + 0.9, bevel=0.0, f=f)
    if g.has('drum'):
        r = min(5.5, (g.limit - rbot) / 1.9)
        cx, cy = rx1 - r * 0.4, g.limit - r
        g.box('steel', cx - 2.0, cx + 2.0, rbot - 0.5, cy, 1.5, bevel=0.4, f=MAG)
        g.disc('steel', cx, cy, r, 1.9, f=MAG, segs=28)
        g.disc('dark', cx, cy, r * 0.6, 0.2, z=1.85, f=MAG, segs=28)
        g.disc('steel', cx, cy, r * 0.22, 0.4, z=1.9, f=MAG)
    if g.has('redDot'):
        red_dot(g, rx0 + 2.0, rx1 - 1.0, top)
    if g.has('scope'):
        scope(g, rx0 + 0.5, rx1 + 5.0, max(top - 2.9, 1.5 - g.limit), 1.5, top)
    if g.has('coils'):
        c0, c1 = fe1 + 1.0, g.reach - 4.0
        y = ys[0]
        for k in (-1, 1):
            g.box('steel', fe1 - 1.0, g.reach - 1.0, y + k * (rb + 1.2) - 0.45, y + k * (rb + 1.2) + 0.45, 0.6, bevel=0.15)
        n = int((c1 - c0) / 2.0)
        for i in range(n):
            x = c0 + i * (c1 - c0) / max(1, n - 1) - 0.45
            g.tube('copper', x, x + 0.9, y, rb * 1.55)


def sniper(g, P):
    b, o, c, bh = P.body, P.optic, P.c, P.bh
    bolt = g.gun['cycle'] == 'bolt'
    furniture = 'tan' if bolt else 'poly'
    rr, ry = 0.62 * bh, c - 0.1 * bh
    g.top = rr
    solid_stock(g, b.x0 + 0.5, c - 0.55 * bh, c + 0.45 * bh, c - 0.85 * bh, g.low(c + 1.7 * bh), furniture)
    g.slab(furniture, [(b.x0 + 0.5, c + 0.35 * bh), (GX - 2.0, c + 0.55 * bh), (7.5, g.low(c + 0.85 * bh)), (b.x0 - 3.0, c + 0.3 * bh)], 2.0, bevel=0.6)
    with g.part('fore'):
        g.box(furniture, FX - 3.5, b.x1, c - 0.75 * bh, c + 0.85 * bh, 2.0, bevel=1.1)
    for i in range(int((b.x1 - FX - 1) / 2.4)):
        x = FX + 0.6 + i * 2.4
        g.box('dark', x, x + 1.3, c - 0.3 * bh, c + 0.45 * bh, 0.25, z=1.9, bevel=0.1)
    g.tube('steel', b.x0 - 0.5, FX - 0.5, ry, rr)
    g.tube('dark', b.x0 - 2.0, b.x0, ry, rr * 0.7)
    g.box('dark', b.x0 + 3.0, b.x0 + 6.5, ry - 0.5, ry + 0.5, 0.3, z=rr - 0.15, bevel=0.1)
    g.box('steel', b.x0 + 1, FX - 3.5, c + 0.3 * bh, c + 0.7 * bh, 1.8, bevel=0.5)
    m0, m1 = FX - 3.8, FX + 0.6
    guard(g, c + 0.65 * bh, m0 - 0.6 - (GX + 1.6))
    grip(g, c + 0.4 * bh, furniture, length=8.0)
    mag_bot = g.low(c + bh + (6.5 if g.has('extendedMag') else 3.2))
    g.box('steel', m0, m1, c + 0.5 * bh, mag_bot, 1.6, bevel=0.5, f=MAG)
    g.box('dark', m0 - 0.3, m1 + 0.3, mag_bot - 0.8, mag_bot, 1.7, bevel=0.3, f=MAG)
    barrel(g, b.x1 - 2.0, P.barrels[0].cy, clamp(P.barrels[0].h * 0.42, 1.0, 1.8), device='brake')
    scope(g, o.x0, o.x1, o.cy, o.h / 2 * (0.98 if g.has('bigScope') else 0.8), ry - rr + 0.2)
    if bolt:
        hx = o.x0 - 0.6
        kx, ky = hx - 1.6, g.low(c + bh + 1.6) - 0.6
        z = rr + 0.5
        g.tube('steel', b.x0 - 0.3, hx + 1.6, ry, rr * 0.55, z=0.2, f=ACTION)
        g.slab('steel', [(hx - 0.2, ry), (hx + 1.2, ry), (kx + 0.6, ky), (kx - 0.6, ky)], 0.6, z=z, bevel=0.2, f=ACTION)
        g.disc('steel', kx, ky, 1.3, 0.9, z=z, f=ACTION)
    else:
        g.box('steel', FX - 3.0, FX - 1.2, c + 0.3 * bh, c + 0.85 * bh, 0.5, z=rr, bevel=0.2)
    if g.has('bipod'):
        bipod(g, b.x1 + 3.0, c + 0.85 * bh - 1.0, c + bh + 9.0)


def lmg(g, P):
    b, m, c, bh = P.body, P.mag, P.c, P.bh
    top, rbot, rx1 = c - 0.8 * bh, c + 0.5 * bh, FX - 1.0
    g.top = 2.5
    solid_stock(g, b.x0 + 0.5, top + 0.25 * bh, rbot, top + 0.3 * bh, g.low(c + 1.2 * bh), 'poly')
    g.box('steel', b.x0, rx1 + 0.5, top, rbot, 2.5, bevel=1.2)
    g.box('steel', b.x0 + 3.0, rx1 + 4.0, c - bh, top + 0.8, 2.35, bevel=0.8)
    g.disc('dark', b.x0 + 3.2, c - 0.9 * bh, 0.8, 0.3, z=2.4)
    g.box('dark', b.x0 + 4.5, rx1 + 2.5, top + 0.9, top + 1.4, 0.25, z=2.35, bevel=0.0)
    g.box('dark', b.x0 + 0.5, b.x0 + 2.2, c - bh - 1.2, top + 0.2, 1.0, bevel=0.2)
    with g.part('fore'):
        g.box('steel', FX - 1.5, b.x1, c - 0.6 * bh, c + 0.6 * bh, 2.4, bevel=0.9)
    for i in range(int((b.x1 - FX) / 1.8)):
        for dy in (-0.28, 0.28):
            g.disc('dark', FX + 0.6 + i * 1.8, c + dy * bh, 0.45, 0.2, z=2.35, segs=10)
    guard(g, rbot, m.x0 - 0.6 - (GX + 1.6))
    grip(g, rbot - 0.6, 'poly', length=8.0)
    by0, by1 = max(m.y0 + 0.6, rbot), g.low(m.y1)
    g.box('olive', m.x0, m.x1, by0, by1, 2.4, bevel=0.7, f=MAG)
    g.box('olive', m.x0 - 0.3, m.x1 + 0.3, by0, by0 + 1.1, 2.6, bevel=0.4, f=MAG)
    g.box('dark', (m.x0 + m.x1) / 2 - 1.5, (m.x0 + m.x1) / 2 + 1.5, by1 - 1.4, by1 - 0.5, 0.3, z=2.4, bevel=0.1, f=MAG)
    for k in range(4):
        y = rbot - 1.6 + k * 1.25
        g.tube('brass', m.x0 + 1.6, m.x0 + 4.4, min(y, by0 + 0.8), 0.55, z=2.9, f=MAG, segs=10)
    if len(P.barrels) > 1:
        k = 0.45 if len(P.barrels) > 2 else 0.55
        ys = [p.cy * k for p in P.barrels]
        r = clamp(P.barrels[0].h * 0.22, 1.2, 1.9)
        for y in ys:
            rb = barrel(g, b.x1 - 1.0, y, r, device='nut')
        for x in (b.x1 + 3.0, (b.x1 + g.reach) / 2, g.reach - 4.0):
            g.box('steel', x, x + 1.2, min(ys) - rb - 0.5, max(ys) + rb + 0.5, rb + 0.4, bevel=0.3)
        if g.has('motor'):
            g.box('steel', b.x1 - 1.5, b.x1 + 2.5, min(ys) - rb - 1.0, max(ys) + rb + 1.0, 2.6, bevel=0.8)
            for i in range(4):
                g.box('dark', b.x1 - 1.0 + i * 0.9, b.x1 - 0.6 + i * 0.9, min(ys), max(ys), 0.2, z=2.55, bevel=0.0)
        cy, under = 0.0, max(ys) + rb
    else:
        cy = P.barrels[0].cy
        rb = barrel(g, b.x1 - 1.0, cy, clamp(P.barrels[0].h * 0.3, 1.2, 2.2), device='hider')
        shield = g.reach - max(6.0, 0.3 * (g.reach - b.x1))
        g.tube('steel', b.x1 - 1.0, shield, cy, rb * 1.45)
        for i in range(int((shield - b.x1) / 1.7)):
            g.disc('dark', b.x1 + 0.6 + i * 1.7, cy, 0.45, 0.2, z=rb * 1.4, segs=10)
        under = cy + rb * 1.45
    if g.has('carryHandle'):
        hx0, hx1, hy = b.x1 + 1.0, b.x1 + 8.0, cy - rb * 1.45 - 3.4
        g.box('steel', hx0, hx1, hy, hy + 1.0, 0.9, bevel=0.3)
        for x in (hx0, hx1 - 1.2):
            g.box('steel', x, x + 1.2, hy, cy - rb, 0.9, bevel=0.3)
    if g.has('redDot'):
        red_dot(g, b.x0 + 6.0, b.x0 + 11.0, c - bh)
    if g.has('foregrip'):
        foregrip(g, b.x1 - 1.0, c + 0.6 * bh)
    if P.bipod:
        bipod(g, (P.bipod.x0 + P.bipod.x1) / 2, under - 0.6, P.bipod.y1)


CLASSES = {'pistol': pistol, 'smg': smg, 'assault': assault, 'shotgun': shotgun, 'sniper': sniper, 'lmg': lmg}


def build(b):
    """Model `gun:<id>`; frame 0, 1 or 2 keeps that frame's pieces (GUN_FRAMES)."""
    gun = b.spec['guns'][b.arg[0]]
    g = Gun(b, gun)
    model = CLASSES[gun['base']]
    if gun['hands'] == 2:
        # a whole gun in each hand, exempt from the hand check: the north one sits lower, under the south one's grip
        for south, dz in ((False, -2.0), (True, 0.0)):
            g.dz = dz
            P = Parts([(role, r) for role, r in g.rects if (r.cy > 0) == south])
            model(g, P)
            accent(g, P)
    else:
        P = Parts(g.rects)
        model(g, P)
        accent(g, P)
        g.check_hands(b.name)
    b.kit = g.kits[b.frame]
    return C.Model(z_ref=None, overhead=True, outline=(INK, 0.8))
