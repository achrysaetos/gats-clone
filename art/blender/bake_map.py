"""Bakes one map's static scenery into tiles.

blender -b -P art/blender/bake_map.py -- <spec.json> <map id> <out dir> [tile filter like 3,4]
Writes <out dir>/<cx>_<cy>.png for every tile, each covering tilePx / pxPerUnit game units.
"""

import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
import scene as S  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
spec_path, map_id, out_dir = argv[:3]
only = tuple(int(v) for v in argv[3].split(',')) if len(argv) > 3 else None
spec = S.load_spec(spec_path)
M = next(m for m in spec['maps'] if m['id'] == map_id)
H = spec['heights']
size = M['size']



def seeded(*xs):
    return random.Random(hash(tuple(int(x) for x in xs)) & 0xffffffff)


def floor():
    S.plane('floor', 0, 0, size, size, 0, 'floor')
    curb = 18
    top = H['curb']
    for name, (x, y, w, h) in {
        'n': (-curb, -curb, size + 2 * curb, curb), 's': (-curb, size, size + 2 * curb, curb),
        'w': (-curb, 0, curb, size), 'e': (size, 0, curb, size),
    }.items():
        S.box(f'curb_{name}', x, y, w, h, -40, top, 'concrete', top, bevel=1.5)
    for name, (x, y, w, h) in {
        'n': (-curb, -curb, size + 2 * curb, 4), 's': (-curb, size + curb - 4, size + 2 * curb, 4),
        'w': (-curb, -curb, 4, size + 2 * curb), 'e': (size + curb - 4, -curb, 4, size + 2 * curb),
    }.items():
        S.box(f'curb_trim_{name}', x, y, w, h, top, top + 0.6, 'hazard', top)


def solid_rects():
    return [(w['x'], w['y'], w['w'], w['h']) for w in M['walls']]


def clear(x, y, w, h, pad):
    for (rx, ry, rw, rh) in solid_rects():
        if x < rx + rw + pad and x + w > rx - pad and y < ry + rh + pad and y + h > ry - pad:
            return False
    for c in M['crates']:
        if x < c['x'] + c['size'] + pad and x + w > c['x'] - pad and y < c['y'] + c['size'] + pad and y + h > c['y'] - pad:
            return False
    return 0 <= x and 0 <= y and x + w <= size and y + h <= size


def barrier(i, x, y, w, h, mat):
    top = H[mat]
    long_x = w >= h
    S.box(f'wall{i}', x, y, w, h, 0, top - 2, 'concrete' if mat == 'concrete' else 'sandstone', top, bevel=1.2)
    cap = 'concrete' if mat == 'concrete' else 'terracotta'
    S.box(f'wall{i}_cap', x, y, w, h, top - 2, top, cap, top, bevel=0.8)
    S.box(f'wall{i}_base', x - 1, y - 1, w + 2, h + 2, 0, 5, 'concrete_dark', top)
    if mat == 'concrete':
        end = 14
        if long_x and w > 3 * end:
            for ex in (x, x + w - end):
                S.box(f'wall{i}_haz{ex}', ex, y + 1, end, h - 2, top, top + 0.5, 'hazard', top)
        elif not long_x and h > 3 * end:
            for ey in (y, y + h - end):
                S.box(f'wall{i}_haz{ey}', x + 1, ey, w - 2, end, top, top + 0.5, 'hazard', top)
        r = seeded(x, y, w)
        if r.random() < 0.5 and max(w, h) >= 150:
            n = int(max(w, h) // 60)
            for k in range(n + 1):
                t = k / n
                px, py = (x + 6 + t * (w - 12), y + h / 2) if long_x else (x + w / 2, y + 6 + t * (h - 12))
                S.cylinder(f'wall{i}_post{k}', px, py, 1.4, top, top + 9, 'rail', top)
            if long_x:
                S.hcylinder(f'wall{i}_rail', x + 6, y + h / 2, x + w - 6, y + h / 2, 1.2, top + 9, 'rail', top)
            else:
                S.hcylinder(f'wall{i}_rail', x + w / 2, y + 6, x + w / 2, y + h - 6, 1.2, top + 9, 'rail', top)


def ac_unit(name, x, y, w, h, z, top, r):
    S.box(name, x, y, w, h, z, z + 14, 'metal_light', top, bevel=1.0)
    fans = 2 if w >= h else 1
    for k in range(fans):
        fx = x + w * (k + 0.5) / fans
        fy = y + h / 2
        fr = min(w / fans, h) * 0.38
        S.cylinder(f'{name}_fan{k}', fx, fy, fr, z + 14, z + 15, 'grate', top, 24)
        S.cylinder(f'{name}_hub{k}', fx, fy, fr * 0.25, z + 15, z + 15.6, 'metal', top, 12)


def rooftop(i, x, y, w, h, mat):
    top = H[mat]
    wall = 'concrete' if mat == 'concrete' else 'sandstone'
    para = 6
    S.box(f'roof{i}_body', x, y, w, h, 0, top - 4, wall, top, bevel=1.0)
    S.box(f'roof{i}_base', x - 1, y - 1, w + 2, h + 2, 0, 5, 'concrete_dark', top)
    cap = 'concrete' if mat == 'concrete' else 'terracotta'
    for k, (px, py, pw, ph) in enumerate([(x, y, w, para), (x, y + h - para, w, para), (x, y + para, para, h - 2 * para), (x + w - para, y + para, para, h - 2 * para)]):
        S.box(f'roof{i}_para{k}', px, py, pw, ph, top - 4, top, cap, top, bevel=0.6)
    S.box(f'roof{i}_deck', x + para, y + para, w - 2 * para, h - 2 * para, top - 5, top - 3.5, 'roof', top)
    if mat == 'concrete':
        S.box(f'roof{i}_haz', x + para, y + para, w - 2 * para, 3, top - 3.5, top - 3.2, 'hazard', top)
    r = seeded(x, y, w, h)
    placed = []

    def free(ax, ay, aw, ah):
        if ax < x + para + 4 or ay < y + para + 4 or ax + aw > x + w - para - 4 or ay + ah > y + h - para - 4:
            return False
        return all(ax >= bx + bw + 6 or ax + aw + 6 <= bx or ay >= by + bh + 6 or ay + ah + 6 <= by for bx, by, bw, bh in placed)

    deck = top - 3.5
    area = (w - 2 * para) * (h - 2 * para)
    for k in range(int(area / 9000) + 1):
        aw, ah = r.choice([(56, 34), (34, 56), (40, 40), (70, 38)])
        for _ in range(20):
            ax, ay = r.uniform(x, x + w - aw), r.uniform(y, y + h - ah)
            if free(ax, ay, aw, ah):
                placed.append((ax, ay, aw, ah))
                ac_unit(f'roof{i}_ac{k}', ax, ay, aw, ah, deck, top, r)
                break
    for k in range(int(area / 6000)):
        vw = r.choice([12, 16, 20])
        for _ in range(12):
            ax, ay = r.uniform(x, x + w - vw), r.uniform(y, y + h - vw)
            if free(ax, ay, vw, vw):
                placed.append((ax, ay, vw, vw))
                S.box(f'roof{i}_vent{k}', ax, ay, vw, vw, deck, deck + 7, 'metal', top, bevel=0.8)
                S.box(f'roof{i}_ventc{k}', ax + 2, ay + 2, vw - 4, vw - 4, deck + 7, deck + 8, 'grate', top)
                break
    if area > 60000 and r.random() < 0.7:
        sw, sh = r.choice([(60, 40), (40, 60)])
        for _ in range(12):
            ax, ay = r.uniform(x, x + w - sw), r.uniform(y, y + h - sh)
            if free(ax, ay, sw, sh):
                placed.append((ax, ay, sw, sh))
                S.box(f'roof{i}_sky', ax, ay, sw, sh, deck, deck + 4, 'metal_dark', top)
                S.box(f'roof{i}_skyg', ax + 3, ay + 3, sw - 6, sh - 6, deck + 4, deck + 5, 'skylight', top)
                break
    if r.random() < 0.6:
        py = y + para + 8 if r.random() < 0.5 else y + h - para - 8
        S.hcylinder(f'roof{i}_pipe', x + para + 4, py, x + w - para - 4, py, 2.5, deck + 3, 'metal', top)


def planter(i, x, y, w, h):
    top = H['planter']
    S.box(f'pl{i}', x, y, w, h, 0, top, 'concrete_dark', top, bevel=1.5)
    inset = 6
    S.box(f'pl{i}_soil', x + inset, y + inset, w - 2 * inset, h - 2 * inset, top - 4, top + 0.5, 'soil', top)
    r = seeded(x, y, w, h)
    n = max(3, int((w - 2 * inset) * (h - 2 * inset) / 260))
    for k in range(n):
        br = r.uniform(7, 13)
        bx = r.uniform(x + inset + br * 0.5, x + w - inset - br * 0.5)
        by = r.uniform(y + inset + br * 0.5, y + h - inset - br * 0.5)
        S.blob(f'pl{i}_b{k}', bx, by, top + br * 0.4, br, 'leaf', top, r)


def markings():
    lines = 0
    for wall in M['walls']:
        x, y, w, h = wall['x'], wall['y'], wall['w'], wall['h']
        if wall['material'] == 'planter' or min(w, h) < 150:
            continue
        off, t = 22, 3
        for (lx, ly, lw, lh) in [(x - off, y - off, w + 2 * off, t), (x - off, y + h + off - t, w + 2 * off, t),
                                 (x - off, y - off, t, h + 2 * off), (x + w + off - t, y - off, t, h + 2 * off)]:
            if clear(lx, ly, lw, lh, 4):
                S.plane(f'mark{lines}', lx, ly, lw, lh, 0.3, 'paint_yellow')
                lines += 1
    for side in ('red', 'blue', 'ffa'):
        for k, s in enumerate(M['spawns'][side]):
            x, y, w, h = s['x'], s['y'], s['w'], s['h']
            t = 4
            for j, (lx, ly, lw, lh) in enumerate([(x, y, w, t), (x, y + h - t, w, t), (x, y, t, h), (x + w - t, y, t, h)]):
                S.plane(f'spawn_{side}{k}_{j}', lx, ly, lw, lh, 0.3, 'paint_white')
    for k, z in enumerate(M['zones']):
        S.ring_paint(f'zone{k}', z['x'], z['y'], z['r'], 5, 0.35, 'paint_white')
        S.ring_paint(f'zone{k}i', z['x'], z['y'], z['r'] - 14, 2.5, 0.35, 'paint_yellow')


def drains():
    r = seeded(size, len(M['walls']))
    for k in range(int(size * size / 250000)):
        for _ in range(20):
            gw, gh = r.choice([(24, 24), (40, 16), (16, 40)])
            gx, gy = r.uniform(0, size - gw), r.uniform(0, size - gh)
            if clear(gx, gy, gw, gh, 30):
                S.box(f'drain{k}', gx, gy, gw, gh, -0.2, 0.4, 'grate', 0.4)
                break
    for k in range(int(size * size / 900000)):
        for _ in range(20):
            gx, gy = r.uniform(30, size - 30), r.uniform(30, size - 30)
            if clear(gx - 16, gy - 16, 32, 32, 30):
                S.cylinder(f'manhole{k}', gx, gy, 15, -0.2, 0.35, 'metal_dark', 0.35, 28)
                break


def build():
    S.reset()
    S.add_sun()
    floor()
    for i, wall in enumerate(M['walls']):
        x, y, w, h, mat = wall['x'], wall['y'], wall['w'], wall['h'], wall['material']
        if mat == 'planter':
            planter(i, x, y, w, h)
        elif min(w, h) >= 150:
            rooftop(i, x, y, w, h, mat)
        else:
            barrier(i, x, y, w, h, mat)
    markings()
    drains()
    S.flush()


def render():
    bake = spec['bake']
    span = bake['tilePx'] / bake['pxPerUnit']
    origin = -bake['margin']
    count = math.ceil((size + 2 * bake['margin']) / span)
    cam = S.add_camera(0, 0, span, bake['tilePx'])
    os.makedirs(out_dir, exist_ok=True)
    for cy in range(count):
        for cx in range(count):
            if only and (cx, cy) != only:
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
