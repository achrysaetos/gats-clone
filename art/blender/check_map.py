"""Checks a map bake's geometry against the collision rects, without rendering.

blender -b -P art/blender/check_map.py -- <spec.json> <map id>
Every vertex standing more than 1 unit off the floor must draw over its wall: inside the rect at the wall's top,
and no further south than the shear moves a point that low. Points past the map edge (curb, quay) are exempt.
Prints each offending point, and exits 1 if there is any.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:]
sys.argv = [sys.argv[0], '--', argv[0], argv[1], '/dev/null', '-1,-1']
src = open(os.path.join(HERE, 'bake_map.py')).read().replace('\nrender()\n', '\n')
env = {'__file__': os.path.join(HERE, 'bake_map.py'), '__name__': 'check'}
exec(compile(src, 'bake_map.py', 'exec'), env)

M, H, K, size = env['M'], env['H'], env['K'], env['size']
TOL = 1.0
walls = [(w['x'], w['y'], w['w'], w['h'], H[w['material']]) for w in M['walls']]
c = env['CURB']
walls += [(-c, -c, size + 2 * c, c, H['curb']), (-c, size, size + 2 * c, c, H['curb']), (-c, 0, c, size, H['curb']), (size, 0, c, size, H['curb'])]


def covered(px, py, z):
    for x, y, w, h, top in walls:
        south = max(0.0, K * (top - z))
        if x - TOL <= px <= x + w + TOL and y - TOL <= py <= y + h + south + TOL:
            return True
    return False


bad = []
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    for v in obj.data.vertices:
        co = obj.matrix_world @ v.co
        if co.z <= 1.0:
            continue
        px, py = co.x, -co.y
        if px < 0 or py < 0 or px > size or py > size:
            continue
        if not covered(px, py, co.z):
            bad.append((obj.name, round(px, 1), round(py, 1), round(co.z, 1)))

from collections import Counter
print(Counter(b[0] for b in bad))
for b in bad[:12]:
    print('uncovered', *b)
print(f'{M["id"]}: {len(bad)} uncovered points', flush=True)
sys.exit(1 if bad else 0)
