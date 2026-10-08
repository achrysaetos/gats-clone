"""Bakes one map's light layer: the floor's colour and paint, the sun shadows of every standing and overhead piece,
contact darkening, and the pools of the lamps that do not pulse.

blender -b -P art/blender/bake_light.py -- <spec.json> <map id> <out.png> [px per unit]
Writes one opaque image covering the map plus its margin, at spec light.pxPerUnit (or the given value, for quick tests).

Pieces stand in as invisible casters, each sheared about its piece's top the way its sprite is, so a shadow leaves the
sprite's drawn foot. Pieces that break cast nothing here: a baked shadow would outlive them. Roofs stand in as solid
blocks, so a roofed room gets no sun or sky and only its lamps light it.
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
spec_path, map_id, out_path = argv[:3]
spec = S.load_spec(spec_path)
M = next(m for m in spec['maps'] if m['id'] == map_id)
size = M['size']
margin = spec['light']['margin']
px_per_unit = float(argv[3]) if len(argv) > 3 else spec['light']['pxPerUnit']

MOODS = {
    'day': {'sun': 1.0, 'sky': 1.0, 'lamps': 1.0},
    'dusk': {'sun': 0.4, 'sun_color': (1.0, 0.62, 0.38), 'sky': 0.45, 'sky_color': (0.36, 0.42, 0.62), 'lamps': 1.4},
}
# Point-light power per unit of light strength and per squared unit of hanging height, so a lamp's pool is as bright at
# its centre as the sunlit floor whatever height it hangs at.
LAMP_POWER = 40.0


def seeded(*xs):
    return random.Random(zlib.crc32(repr(xs).encode()))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ---------------------------------------------------------------- casters
# Each piece's stand-in, in its unturned footprint (x east, y south, origin top-left): boxes (x, y, w, h, z0, z1) and
# vertical cylinders ('cyl', cx, cy, r, z0, z1).

def corner_legs(w, h, H, c, leg):
    return [(x - leg / 2, y - leg / 2, leg, leg, 0, H) for x in (c, w - c) for y in (c, h - c)]


def stand_in(p, w, h, H):
    if p in ('barrel', 'barrel.fire'):
        return [('cyl', w / 2, h / 2, w / 2 - 1.2, 0, H)]
    if p == 'railing':
        posts = [(2 + i * (w - 4) / 4 - 1.2, h / 2 - 1.2, 2.4, 2.4, 0, H) for i in range(5)]
        return posts + [(0, h / 2 - 1.5, w, 3, H - 2.4, H), (0, h / 2 - 1, w, 2, H * 0.55 - 1, H * 0.55 + 1)]
    if p == 'gantry':
        chords = [(0, y, w, 8, H - 6, H) for y in (0, h - 8)] + [(0, y, w, 6, H - 32, H - 27) for y in (1, h - 7)]
        return chords + [(min(max(x - 2, 0), w - 4), 0, 4, h, H - 4, H) for x in range(0, int(w) + 1, 50)]
    if p == 'gantry.post':
        ties = [(6, 6, w - 12, h - 12, z, z + 2.5) for z in range(14, int(H) - 6, 24)]
        return corner_legs(w, h, H, 6, 5) + ties + [(0, 0, w, h, 0, 8), (0, 0, w, h, H - 4, H)]
    if p == 'pipes':
        return [(0, y - r, w, 2 * r, H - 2 * r, H) for y, r in ((5, 4.6), (13.5, 3.6), (20.5, 3.0))]
    if p == 'signal':
        return [(w / 2 - 8, h / 2 - 8, 16, 16, 0, 6), (w / 2 - 2, h / 2 - 2, 4, 4, 0, H - 16), (w / 2 - 5.5, h / 2 - 4, 11, 8, H - 16, H)]
    if p == 'forklift':
        guard = [(x - 1.5, y - 1.5, 3, 3, 36, H) for x in (16, w - 16) for y in (30, 82)]
        return [(11, 20, w - 22, 80, 0, 35), (4, 1, w - 8, 26, 0, 41), (15, 28, w - 30, 56, H - 3, H), (20, 101, w - 40, 6, 0, H - 4)] + guard
    if p == 'wall.broken':
        return [(0, 0, w, h, 0, H * 0.8)]
    return [(0, 0, w, h, 0, H)]


def turn_part(part, box_h):
    """A stand-in part turned a quarter turn clockwise inside a footprint `box_h` tall, as kit.ts turnRect does."""
    if part[0] == 'cyl':
        _, cx, cy, rad, z0, z1 = part
        return ('cyl', box_h - cy, cx, rad, z0, z1)
    x, y, w, h, z0, z1 = part
    return (box_h - y - h, x, h, w, z0, z1)


def casters():
    for pc in M['pieces']:
        if pc['breaks'] or pc['height'] <= 0 or pc['p'] in ROOFS:
            continue
        H = pc['height']
        foot = pc['foot']
        for part in stand_in(pc['p'], pc['w'], pc['h'], H):
            w, h = pc['w'], pc['h']
            for _ in range(pc['r']):
                part = turn_part(part, h)
                w, h = h, w
            if part[0] == 'cyl':
                _, cx, cy, rad, z0, z1 = part
                S.cylinder(foot['x'] + cx, foot['y'] + cy, rad, z0, z1, 'caster', H)
            else:
                x, y, bw, bh, z0, z1 = part
                S.box(foot['x'] + x, foot['y'] + y, bw, bh, z0, z1, 'caster', H)


ROOFS = ('roof', 'roof.s', 'roof.wide')


def roof_shells():
    """A roofed room keeps out the sun and the sky: its roofs stand in as lids with walls down to the floor round the
    roofed area's outside edges, open below so the lamps inside still reach the floor."""
    t = 1.0
    feet = [pc['foot'] for pc in M['pieces'] if pc['p'] in ROOFS]
    roofed = lambda x, y: any(f['x'] < x < f['x'] + f['w'] and f['y'] < y < f['y'] + f['h'] for f in feet)
    for pc in M['pieces']:
        if pc['p'] not in ROOFS:
            continue
        x, y, w, h, H = pc['foot']['x'], pc['foot']['y'], pc['foot']['w'], pc['foot']['h'], pc['height']
        S.box(x, y, w, h, H - t, H, 'caster', H)
        sides = [((x, y, w, t), (x + w / 2, y - 2)), ((x, y + h - t, w, t), (x + w / 2, y + h + 2)),
                 ((x, y, t, h), (x - 2, y + h / 2)), ((x + w - t, y, t, h), (x + w + 2, y + h / 2))]
        for (bx, by, bw, bh), out in sides:
            if not roofed(*out):
                S.box(bx, by, bw, bh, 0.5, H - t, 'caster', H)


# ---------------------------------------------------------------- floor

def floor():
    S.plane(0, 0, size, size, 0, 'asphalt' if M['floor'] == 'asphalt' else 'floor')
    m = margin
    for x, y, w, h in [(-m, -m, size + 2 * m, m), (-m, size, size + 2 * m, m), (-m, 0, m, size), (size, 0, m, size)]:
        S.plane(x, y, w, h, 0, 'quay')
    band = 14
    for x, y, w, h in [(-band, -band, size + 2 * band, band), (-band, size, size + 2 * band, band), (-band, 0, band, size), (size, 0, band, size)]:
        S.plane(x, y, w, h, 0.05, 'hazard')
    lip = 6
    for x, y, w, h in [(-m, -m, size + 2 * m, lip), (-m, size + m - lip, size + 2 * m, lip), (-m, -m, lip, size + 2 * m), (size + m - lip, -m, lip, size + 2 * m)]:
        S.box(x, y, w, h, 0, 2, 'quay', 2)


def along(mark, u, v):
    """Mark-local (u along the way it points, v across) to map space; r = 0 points east, each r a quarter turn clockwise."""
    x, y, w, h, r = mark['x'], mark['y'], mark['w'], mark['h'], mark['r']
    return [(x + u, y + v), (x + v, y + u), (x + w - u, y + h - v), (x + w - v, y + h - u)][r]


def paint():
    for mk in M['marks']:
        x, y, w, h, k = mk['x'], mk['y'], mk['w'], mk['h'], mk['k']
        if k == 'line':
            S.plane(x, y, w, h, 0.06, 'paint_yellow')
        elif k == 'hazard':
            S.plane(x, y, w, h, 0.06, 'hazard')
        elif k == 'box':
            t = 8
            for bx, by, bw, bh in [(x, y, w, t), (x, y + h - t, w, t), (x, y + t, t, h - 2 * t), (x + w - t, y + t, t, h - 2 * t)]:
                S.plane(bx, by, bw, bh, 0.06, 'paint_yellow')
        elif k == 'chevron':
            length, across = (w, h) if mk['r'] % 2 == 0 else (h, w)
            n = max(1, round(length / across))
            step = length / n
            for i in range(n):
                u0 = i * step + step * 0.15
                tip = u0 + step * 0.55
                S.strip([along(mk, u0, across * 0.1), along(mk, tip, across / 2), along(mk, u0, across * 0.9)], across * 0.2, 0.06, 'paint_yellow')


def overlaps(a, b, pad):
    return a[0] < b[0] + b[2] + pad and a[0] + a[2] + pad > b[0] and a[1] < b[1] + b[3] + pad and a[1] + a[3] + pad > b[1]


FLAT_SEATS = {'vent': 'grime', 'grate': 'grime', 'drain': 'grime', 'track': 'grime', 'helipad': 'grime', 'rubble': 'dust'}


def dressing():
    """Grime seating the flat fittings, dust round rubble, and tyre marks across open floor."""
    feet = []
    for pc in M['pieces']:
        f = pc['foot']
        feet.append((f['x'], f['y'], f['w'], f['h']))
        seat = FLAT_SEATS.get(pc['p'])
        if seat:
            S.plane(f['x'] - 6, f['y'] - 6, f['w'] + 12, f['h'] + 12, 0.03, seat)
    rnd = seeded(map_id, size)
    for _ in range(int(size * size / 250_000)):
        x, y = rnd.uniform(60, size - 60), rnd.uniform(60, size - 60)
        a = rnd.uniform(0, math.tau)
        length = rnd.uniform(120, 320)
        bend = rnd.uniform(-0.004, 0.004)
        pts = []
        for i in range(12):
            t = i / 11 * length
            ang = a + bend * t
            pts.append((x + math.cos(ang) * t, y + math.sin(ang) * t))
        bound = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts) - min(p[0] for p in pts), max(p[1] for p in pts) - min(p[1] for p in pts))
        if any(overlaps(bound, f, 10) for f in feet):
            continue
        for off in (-9, 9):
            nx, ny = -math.sin(a) * off, math.cos(a) * off
            S.strip([(px + nx, py + ny) for px, py in pts], 6, 0.04, 'rubber')


# ---------------------------------------------------------------- lamps

def lamps(mood):
    for i, l in enumerate(M['lights']):
        z = min(90.0, l['r'] * 0.3)
        rgb = tuple(0.6 + 0.4 * srgb_to_linear(((l['color'] >> s) & 255) / 255) for s in (16, 8, 0))
        data = bpy.data.lights.new(f'lamp{i}', 'POINT')
        data.energy = LAMP_POWER * l['strength'] * mood['lamps'] * z * z
        data.color = rgb
        data.shadow_soft_size = 6
        obj = bpy.data.objects.new(f'lamp{i}', data)
        obj.location = S.to_blender(l['x'], l['y'], z)
        bpy.context.scene.collection.objects.link(obj)


def main():
    t0 = time.time()
    S.reset()
    mood = MOODS[M['light']]
    S.add_sun(mood)
    floor()
    paint()
    dressing()
    casters()
    roof_shells()
    S.flush()
    lamps(mood)
    span = size + 2 * margin
    px = round(span * px_per_unit)
    if px > spec['light']['maxPx']:
        raise SystemExit(f'{map_id}: light layer {px}px is past {spec["light"]["maxPx"]}px; lower light.pxPerUnit or tile it')
    S.add_camera(size / 2, size / 2, span, px)
    print(f'[light] {map_id}: built {len(bpy.data.objects)} objects in {time.time() - t0:.1f}s, rendering {px}px', flush=True)
    bpy.context.scene.render.filepath = out_path
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'[light] {map_id}: rendered in {time.time() - t1:.1f}s', flush=True)


main()
