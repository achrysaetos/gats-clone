"""Bakes one map's static scenery into tiles.

blender -b -P art/blender/bake_map.py -- <spec.json> <map id> <out dir> [tile like 3,4 ...]
Writes <out dir>/<cx>_<cy>.png for every tile (or only the listed ones), each covering tilePx / pxPerUnit game units.
"""

import math
import os
import random
import sys
import time
import zlib

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
import scene as S  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
spec_path, map_id, out_dir = argv[:3]
only = {tuple(int(v) for v in t.split(',')) for t in argv[3:]}
spec = S.load_spec(spec_path)
M = next(m for m in spec['maps'] if m['id'] == map_id)
H = spec['heights']
K = spec['camera']['shear']
size = M['size']
CURB = 18


def seeded(*xs):
    return random.Random(zlib.crc32(repr(tuple(round(x, 3) for x in xs)).encode()))


def overlaps(a, b, pad=0):
    return a[0] < b[0] + b[2] + pad and a[0] + a[2] + pad > b[0] and a[1] < b[1] + b[3] + pad and a[1] + a[3] + pad > b[1]


WALLS = [(w['x'], w['y'], w['w'], w['h']) for w in M['walls']]
KEEP_OUT = [(c['x'], c['y'], c['size'], c['size']) for c in M['crates']] + [
    (s['x'], s['y'], s['w'], s['h']) for side in ('red', 'blue', 'ffa') for s in M['spawns'][side]]


def clear(r, pad, keep_out=True):
    """True when floor rect `r` sits on the map, `pad` away from every wall (and from crates and spawns)."""
    if any(overlaps(r, w, pad) for w in WALLS):
        return False
    if keep_out and any(overlaps(r, k, pad) for k in KEEP_OUT):
        return False
    return 0 <= r[0] and 0 <= r[1] and r[0] + r[2] <= size and r[1] + r[3] <= size


# ---------------------------------------------------------------- the ground

def ground():
    S.plane(0, 0, size, size, 0, 'floor')
    m = spec['bake']['margin']
    for x, y, w, h in [(-m, -m, size + 2 * m, m), (-m, size, size + 2 * m, m), (-m, 0, m, size), (size, 0, m, size)]:
        S.plane(x, y, w, h, 0, 'quay')
    top = H['curb']
    for x, y, w, h in [(-CURB, -CURB, size + 2 * CURB, CURB), (-CURB, size, size + 2 * CURB, CURB), (-CURB, 0, CURB, size), (size, 0, CURB, size)]:
        S.box(x, y, w, h, 0, top, 'concrete_cap', top, bevel=1.0)
    t = 4
    for x, y, w, h in [(-CURB, -CURB, size + 2 * CURB, t), (-CURB, size + CURB - t, size + 2 * CURB, t),
                       (-CURB, -CURB, t, size + 2 * CURB), (size + CURB - t, -CURB, t, size + 2 * CURB)]:
        S.box(x, y, w, h, top, top + 0.4, 'hazard', top)
    # The quay's lip over the water, and bollards along it.
    lip = 5
    for x, y, w, h in [(-m, -m, size + 2 * m, lip), (-m, size + m - lip, size + 2 * m, lip), (-m, -m, lip, size + 2 * m), (size + m - lip, -m, lip, size + 2 * m)]:
        S.box(x, y, w, h, 0, 1.5, 'concrete_dark', 1.5, bevel=0.6)
    edge = -m + lip + 9
    for k in range(int(size / 320) + 1):
        a = 160 + k * 320
        if a > size:
            break
        for bx, by in [(a, edge), (a, size - edge), (edge, a), (size - edge, a)]:
            S.cylinder(bx, by, 5, 0, 9, 'metal_dark', 9, 16)
            S.cylinder(bx, by, 6.5, 9, 10.5, 'metal_dark', 10.5, 16)


# ---------------------------------------------------------------- cover

def hazard_end(x, y, w, h, top, along_x, length=12):
    """Worn hazard bands across both ends of a cover piece's top."""
    if along_x and w > 3 * length:
        for ex in (x + 1, x + w - length - 1):
            S.box(ex, y + 1.5, length, h - 3, top, top + 0.3, 'hazard', top)
    elif not along_x and h > 3 * length:
        for ey in (y + 1, y + h - length - 1):
            S.box(x + 1.5, ey, w - 3, length, top, top + 0.3, 'hazard', top)


def south_face(x, w, y_south, z0, z1, mat, top, depth=0.5):
    """A panel standing proud of a south face."""
    S.box(x, y_south, w, depth, z0, z1, mat, top)


def segments(start, length, target):
    n = max(1, round(length / target))
    return [(start + length * i / n, length / n) for i in range(n)]


def barrier(x, y, w, h, r):
    """Precast concrete barrier sections: overhanging cap, chipped bevels, lifting pockets, hazard ends, sometimes a rail."""
    top = H['concrete']
    along_x = w >= h
    cap = 3.0
    lip = 1.6
    for s0, sl in segments(x if along_x else y, w if along_x else h, 100):
        sx, sy, sw, sh = (s0, y, sl, h) if along_x else (x, s0, w, sl)
        S.box(sx + lip, sy + lip, sw - 2 * lip, sh - 2 * lip, 0, top - cap, 'concrete', top, bevel=2.5)
        S.box(sx, sy, sw, sh, top - cap, top, 'concrete_cap', top, bevel=1.0)
        S.box(sx + lip - 1, sy + lip - 1, sw - 2 * lip + 2, sh - 2 * lip + 2, 0, 3, 'concrete_dark', top, bevel=0.5)
        # Lifting pockets on the visible south face of each section.
        ys = sy + sh - lip
        if sw >= 40:
            for px in (sx + sw * 0.25 - 3, sx + sw * 0.75 - 3):
                south_face(px, 6, ys, top - 18, top - 11, 'metal_dark', top)
        # Lifting eyes on top.
        if along_x and sw >= 60:
            for px in (sx + sw * 0.3, sx + sw * 0.7):
                S.box(px - 2, sy + sh / 2 - 2, 4, 4, top, top + 0.8, 'metal_dark', top)
        elif not along_x and sh >= 60:
            for py in (sy + sh * 0.3, sy + sh * 0.7):
                S.box(sx + sw / 2 - 2, py - 2, 4, 4, top, top + 0.8, 'metal_dark', top)
    hazard_end(x, y, w, h, top, along_x)
    # Hazard bands on the south face: both ends of a long face, or across a short end.
    if along_x:
        for ex in (x + lip, x + w - lip - 10):
            south_face(ex, 10, y + h - lip, 6, top - cap - 1, 'hazard', top)
    else:
        south_face(x + lip + 2, w - 2 * lip - 4, y + h - lip, top - 20, top - 12, 'hazard', top)
    if r.random() < 0.4 and max(w, h) >= 150:
        n = int(max(w, h) // 60)
        for k in range(n + 1):
            t = k / n
            px, py = (x + 8 + t * (w - 16), y + h / 2) if along_x else (x + w / 2, y + 8 + t * (h - 16))
            S.cylinder(px, py, 1.3, top, top + 9, 'rail', top, 10)
        if along_x:
            S.hcylinder(x + 8, y + h / 2, x + w - 8, y + h / 2, 1.2, top + 9, 'rail', top)
        else:
            S.hcylinder(x + w / 2, y + 8, x + w / 2, y + h - 8, 1.2, top + 9, 'rail', top)


def stone_wall(x, y, w, h, r):
    """Dressed stone wall or block under a coping of separate slabs."""
    top = H['sandstone']
    cap = 4.0
    lip = 1.6
    S.box(x + lip, y + lip, w - 2 * lip, h - 2 * lip, 0, top - cap, 'sandstone', top, bevel=1.5)
    along_x = w >= h
    for s0, sl in segments(x if along_x else y, w if along_x else h, 50):
        sx, sy, sw, sh = (s0, y, sl, h) if along_x else (x, s0, w, sl)
        S.box(sx, sy, sw, sh, top - cap, top, 'sandstone_cap', top, bevel=1.0)
    S.box(x + lip - 1, y + lip - 1, w - 2 * lip + 2, h - 2 * lip + 2, 0, 4, 'concrete_dark', top, bevel=0.5)
    if max(w, h) >= 300 and min(w, h) >= 80:
        # A long, wide wall carries a rail along one side of its top.
        off = 8
        n = int(max(w, h) // 70)
        for k in range(n + 1):
            t = k / n
            px, py = (x + 10 + t * (w - 20), y + off) if along_x else (x + off, y + 10 + t * (h - 20))
            S.cylinder(px, py, 1.3, top, top + 9, 'rail', top, 10)
        if along_x:
            S.hcylinder(x + 10, y + off, x + w - 10, y + off, 1.2, top + 9, 'rail', top)
        else:
            S.hcylinder(x + off, y + 10, x + off, y + h - 10, 1.2, top + 9, 'rail', top)


def fan_unit(x, y, w, h, z, top, fans):
    """A packaged AC unit: a light casing, louvred sides, fan grilles flush in its top."""
    hgt = 12
    S.box(x, y, w, h, z, z + hgt, 'metal_light', top, bevel=0.8)
    south_face(x + 3, w - 6, y + h, z + 2, z + hgt - 2, 'slats', top, 0.3)
    along_x = w >= h
    for k in range(fans):
        fx, fy = (x + w * (k + 0.5) / fans, y + h / 2) if along_x else (x + w / 2, y + h * (k + 0.5) / fans)
        fr = min(w / fans if along_x else w, h if along_x else h / fans) * 0.4
        S.cylinder(fx, fy, fr + 1, z + hgt, z + hgt + 0.6, 'metal', top, 28)
        S.cylinder(fx, fy, fr, z + hgt + 0.1, z + hgt + 0.7, 'grille', top, 28)
        for a in range(4):
            ang = a * math.pi / 4
            dx, dy = math.cos(ang) * fr, math.sin(ang) * fr
            S.hcylinder(fx - dx, fy - dy, fx + dx, fy + dy, 0.45, z + hgt + 0.9, 'metal', top, 6)
        S.cylinder(fx, fy, fr * 0.22, z + hgt + 0.7, z + hgt + 1.3, 'metal_dark', top, 12)


def rooftop(x, y, w, h, mat, r):
    """A building seen from above: walls, parapet coping, sunken deck and a few well-placed pieces of plant."""
    top = H[mat]
    stone = mat == 'sandstone'
    para = 9
    S.box(x, y, w, h, 0, top - 7, 'sandstone' if stone else 'building', top, bevel=1.0)
    S.box(x - 1, y - 1, w + 2, h + 2, 0, 4, 'concrete_dark', top)
    cap = 'sandstone_cap' if stone else 'concrete_cap'
    for px, py, pw, ph in [(x, y, w, para), (x, y + h - para, w, para), (x, y + para, para, h - 2 * para), (x + w - para, y + para, para, h - 2 * para)]:
        S.box(px, py, pw, ph, top - 7, top, cap, top, bevel=0.8)
    deck = top - 6
    S.box(x + para, y + para, w - 2 * para, h - 2 * para, top - 7, deck, 'roof', top)
    # South face: a louvred plant-room panel and downpipes at the corners.
    if w >= 120:
        px = x + w * r.uniform(0.25, 0.6)
        south_face(px, 34, y + h, 10, top - 12, 'slats', top, 0.6)
    for dx in (x + 4, x + w - 7):
        S.box(dx, y + h, 3, 2, 0, top - 4, 'metal', top)

    placed = []
    inner = (x + para + 5, y + para + 5, w - 2 * para - 10, h - 2 * para - 10)

    def put(aw, ah, spots):
        for ax, ay in spots:
            cand = (ax, ay, aw, ah)
            if (cand[0] >= inner[0] and cand[1] >= inner[1] and cand[0] + aw <= inner[0] + inner[2] and cand[1] + ah <= inner[1] + inner[3]
                    and not any(overlaps(cand, p, 8) for p in placed)):
                placed.append(cand)
                return cand
        return None

    def spots(aw, ah, n=24):
        ix, iy, iw, ih = inner
        anchors = [(ix, iy), (ix + iw - aw, iy), (ix, iy + ih - ah), (ix + iw - aw, iy + ih - ah),
                   (ix + (iw - aw) / 2, iy), (ix + (iw - aw) / 2, iy + ih - ah), (ix, iy + (ih - ah) / 2), (ix + iw - aw, iy + (ih - ah) / 2)]
        r.shuffle(anchors)
        return anchors + [(r.uniform(ix, ix + iw - aw), r.uniform(iy, iy + ih - ah)) for _ in range(n)]

    area = inner[2] * inner[3]
    units = 1 + (area > 90000) + (area > 160000)
    for _ in range(units):
        aw, ah = r.choice([(78, 40), (40, 78), (56, 40)])
        if inner[2] < aw or inner[3] < ah:
            aw, ah = 40, 34
        c = put(aw, ah, spots(aw, ah))
        if c:
            fan_unit(*c, deck, top, 2 if max(aw, ah) >= 56 else 1)
    # Roof hatch.
    c = put(26, 26, spots(26, 26))
    if c:
        S.box(c[0], c[1], 26, 26, deck, deck + 3, 'metal', top, bevel=0.5)
        S.box(c[0] + 3, c[1] + 3, 20, 20, deck + 3, deck + 3.6, 'metal_dark', top)
    # Mushroom vents.
    for _ in range(1 + int(area > 60000)):
        c = put(12, 12, spots(12, 12))
        if c:
            S.cylinder(c[0] + 6, c[1] + 6, 3.5, deck, deck + 6, 'metal', top, 14)
            S.cylinder(c[0] + 6, c[1] + 6, 5.5, deck + 6, deck + 7.5, 'metal_light', top, 18)
    # A skylight on bigger roofs.
    if area > 50000 and r.random() < 0.7:
        sw, sh = r.choice([(64, 36), (36, 64)])
        c = put(sw, sh, spots(sw, sh))
        if c:
            S.box(c[0], c[1], sw, sh, deck, deck + 4, 'metal_dark', top, bevel=0.5)
            S.box(c[0] + 2.5, c[1] + 2.5, sw - 5, sh - 5, deck + 4, deck + 4.6, 'skylight', top)
    # A pipe run along one parapet, on blocks.
    if r.random() < 0.7:
        if r.random() < 0.5:
            py = y + para + 5 if r.random() < 0.5 else y + h - para - 5
            S.hcylinder(x + para + 6, py, x + w - para - 6, py, 2.2, deck + 3, 'metal', top)
            for k in range(int((w - 2 * para) // 50) + 1):
                S.box(x + para + 8 + k * 50, py - 3, 4, 6, deck, deck + 2, 'metal_dark', top)
        else:
            px = x + para + 5 if r.random() < 0.5 else x + w - para - 5
            S.hcylinder(px, y + para + 6, px, y + h - para - 6, 2.2, deck + 3, 'metal', top)
            for k in range(int((h - 2 * para) // 50) + 1):
                S.box(px - 3, y + para + 8 + k * 50, 6, 4, deck, deck + 2, 'metal_dark', top)


def planter(x, y, w, h, r):
    """A precast planter overflowing with dense shrubs."""
    top = H['planter']
    S.box(x, y, w, h, 0, top, 'concrete', top, bevel=1.0)
    S.box(x - 0.6, y - 0.6, w + 1.2, h + 1.2, 0, 3, 'concrete_dark', top, bevel=0.4)
    inset = 5
    S.box(x + inset, y + inset, w - 2 * inset, h - 2 * inset, top - 3, top + 0.3, 'soil', top)
    iw, ih = w - 2 * inset, h - 2 * inset
    n = max(4, int(iw * ih / 55))
    for k in range(n):
        br = r.uniform(6.5, 12.0)
        m = br * 0.7
        z = top + r.uniform(-1.0, 5.0)
        north = K * (z + br * 0.6 - top)
        if iw < 2 * m or ih < 2 * m + north:
            continue
        bx = r.uniform(x + inset + m, x + w - inset - m)
        by = r.uniform(y + inset + m + north, y + h - inset - m)
        S.blob(bx, by, z, br, 'leaf', top, r, 0.75)


# ---------------------------------------------------------------- floor dressing

def chevrons(cx, cy, dx, dy, s=14):
    """A pair of painted chevrons pointing along (dx, dy)."""
    px, py = -dy, dx
    for k in (0, 1):
        ox, oy = cx + dx * k * s * 1.1, cy + dy * k * s * 1.1
        tip = (ox + dx * s * 0.5, oy + dy * s * 0.5)
        a = (ox - dx * s * 0.5 + px * s, oy - dy * s * 0.5 + py * s)
        b = (ox - dx * s * 0.5 - px * s, oy - dy * s * 0.5 - py * s)
        S.strip([a, tip, b], 4.5, 0.3, 'paint_yellow')


def markings(r):
    for wall in M['walls']:
        x, y, w, h = wall['x'], wall['y'], wall['w'], wall['h']
        if wall['material'] == 'planter' or min(w, h) < 150:
            continue
        off, t = 24, 5
        sides = [((x - off, y - off, w + 2 * off, t), (1, 0)), ((x - off, y + h + off - t, w + 2 * off, t), (1, 0)),
                 ((x - off, y - off, t, h + 2 * off), (0, 1)), ((x + w + off - t, y - off, t, h + 2 * off), (0, 1))]
        for rect, (dx, dy) in sides:
            if clear(rect, 4, keep_out=False):
                S.plane(*rect, 0.3, 'paint_yellow')
                if r.random() < 0.3:
                    mx, my = rect[0] + rect[2] / 2, rect[1] + rect[3] / 2
                    mx, my = mx + (dy * 22 if dx == 0 else 0) * (1 if mx > x + w / 2 else -1), my + (dx * 22 if dy == 0 else 0) * (1 if my > y + h / 2 else -1)
                    if clear((mx - 20, my - 20, 40, 40), 6):
                        chevrons(mx, my, dx, dy)
    for side in ('red', 'blue', 'ffa'):
        for s in M['spawns'][side]:
            x, y, w, h = s['x'], s['y'], s['w'], s['h']
            t = 4
            for rect in [(x, y, w, t), (x, y + h - t, w, t), (x, y, t, h), (x + w - t, y, t, h)]:
                S.plane(*rect, 0.3, 'paint_white')
    for z in M['zones']:
        S.ring_paint(z['x'], z['y'], z['r'], 5, 0.35, 'paint_white')
        S.ring_paint(z['x'], z['y'], z['r'] - 14, 2.5, 0.35, 'paint_yellow')


def tyre_marks(r):
    for _ in range(int(size * size / 360000)):
        for _ in range(12):
            cx, cy = r.uniform(100, size - 100), r.uniform(100, size - 100)
            length = r.uniform(140, 300)
            if not clear((cx - length / 2, cy - length / 2, length, length), 10):
                continue
            ang = r.uniform(0, math.tau)
            bend = r.uniform(-1.2, 1.2) / length
            for lane in (-8, 8):
                pts = []
                for i in range(13):
                    s = (i / 12 - 0.5) * length
                    a = ang + bend * s
                    pts.append((cx + math.cos(a) * s - math.sin(ang) * lane, cy + math.sin(a) * s + math.cos(ang) * lane))
                S.strip(pts, 3.4, 0.2, 'rubber')
            break


def drains(r):
    """Grates near wall feet, a few manholes, and trench drains along some buildings."""
    for _ in range(int(size * size / 260000)):
        for _ in range(30):
            gw, gh = r.choice([(24, 24), (36, 18), (18, 36)])
            wx, wy, ww, wh = r.choice(WALLS)
            side = r.randrange(4)
            gap = r.uniform(14, 40)
            gx, gy = [(r.uniform(wx, wx + ww - gw), wy - gap - gh), (r.uniform(wx, wx + ww - gw), wy + wh + gap),
                      (wx - gap - gw, r.uniform(wy, wy + wh - gh)), (wx + ww + gap, r.uniform(wy, wy + wh - gh))][side]
            if clear((gx, gy, gw, gh), 12):
                grate(gx, gy, gw, gh)
                break
    for _ in range(int(size * size / 1200000)):
        for _ in range(20):
            gx, gy = r.uniform(40, size - 40), r.uniform(40, size - 40)
            if clear((gx - 18, gy - 18, 36, 36), 30):
                S.cylinder(gx, gy, 15, -0.2, 0.4, 'metal_dark', 0.4, 28)
                S.cylinder(gx, gy, 12, -0.2, 0.5, 'slats', 0.5, 28)
                break
    for wall in M['walls']:
        x, y, w, h = wall['x'], wall['y'], wall['w'], wall['h']
        if min(w, h) < 150 or wall['material'] == 'planter' or seeded(x, y, 7).random() > 0.5:
            continue
        rect = (x + 10, y + h + 8, w - 20, 8)
        if clear(rect, 2):
            grate(*rect)


def grate(x, y, w, h):
    S.box(x - 2, y - 2, w + 4, h + 4, -0.2, 0.45, 'metal_dark', 0.45)
    S.box(x, y, w, h, -0.2, 0.5, 'slats', 0.5)


DECALS = ('paint_yellow', 'paint_white', 'rubber')


def build():
    S.reset()
    S.add_sun()
    ground()
    for wall in M['walls']:
        x, y, w, h, mat = wall['x'], wall['y'], wall['w'], wall['h'], wall['material']
        r = seeded(x, y, w, h)
        if mat == 'planter':
            planter(x, y, w, h, r)
        elif min(w, h) >= 150:
            rooftop(x, y, w, h, mat, r)
        elif mat == 'sandstone':
            stone_wall(x, y, w, h, r)
        else:
            barrier(x, y, w, h, r)
    r = seeded(size, len(M['walls']))
    markings(r)
    tyre_marks(r)
    drains(r)
    S.flush()
    for name in DECALS:
        obj = bpy.data.objects.get(f'geo_{name}')
        if obj:
            obj.visible_shadow = False


def render():
    bake = spec['bake']
    span = bake['tilePx'] / bake['pxPerUnit']
    origin = -bake['margin']
    count = math.ceil((size + 2 * bake['margin']) / span)
    cam = S.add_camera(0, 0, span, bake['tilePx'])
    os.makedirs(out_dir, exist_ok=True)
    for cy in range(count):
        for cx in range(count):
            if only and (cx, cy) not in only:
                continue
            path = os.path.join(out_dir, f'{cx}_{cy}.png')
            started = time.time()
            S.move_camera(cam, origin + (cx + 0.5) * span, origin + (cy + 0.5) * span)
            bpy.context.scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            print(f'tile {cx},{cy} in {time.time() - started:.1f}s', flush=True)


t0 = time.time()
build()
print(f'built {len(bpy.data.objects)} objects in {time.time() - t0:.1f}s', flush=True)
render()
