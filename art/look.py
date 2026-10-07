"""Renders the look-check tiles and lays them beside the reference at game zoom.

python3 art/look.py <out dir> [map:cx,cy ...]
Exports the spec, bakes each listed tile, prints render seconds and WebP q80 bytes per tile,
and writes <out dir>/sheet.png: the reference crops, then every tile over water blue at 1.07 px per game unit.
"""

import json
import os
import re
import subprocess
import sys
from collections import defaultdict

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLENDER = os.environ.get('BLENDER', '/opt/blender-dl/blender-4.5.3-linux-x64/blender')
DEFAULT = ['plaza:2,1', 'plaza:6,2', 'plaza:3,5', 'oldtown:1,2', 'causeway:4,4']
REFERENCE = os.path.join(ROOT, 'docs/art/gold-standard.webp')
REF_CROPS = [(420, 330), (0, 568)]
GAME_PX_PER_UNIT = 1.07

out = sys.argv[1]
tiles = sys.argv[2:] or DEFAULT
spec = os.path.join(ROOT, 'art/build/spec.json')
subprocess.run(['node', os.path.join(ROOT, 'scripts/art/export-maps.ts'), spec], check=True, cwd=ROOT)
bake = json.load(open(spec))['bake']
side = round(bake['tilePx'] / bake['pxPerUnit'] * GAME_PX_PER_UNIT)

by_map = defaultdict(list)
for t in tiles:
    m, c = t.split(':')
    by_map[m].append(c)

rows = []
for m, cs in by_map.items():
    run = subprocess.run([BLENDER, '-b', '-P', os.path.join(ROOT, 'art/blender/bake_map.py'), '--', spec, m, os.path.join(out, m), *cs],
                         capture_output=True, text=True, cwd=ROOT)
    if run.returncode != 0 or 'Error' in run.stderr:
        print(run.stdout[-3000:], run.stderr[-3000:])
    built = re.search(r'built \d+ objects in ([\d.]+)s', run.stdout)
    print(f'{m}: build {built.group(1) if built else "?"}s')
    for c, secs in re.findall(r'tile (\d+,\d+) in ([\d.]+)s', run.stdout):
        png = os.path.join(out, m, c.replace(',', '_') + '.png')
        size = subprocess.run(['node', '-e', f"require('sharp')({json.dumps(png)}).webp({{quality:80}}).toBuffer().then(b=>console.log(b.length))"],
                              capture_output=True, text=True, cwd=ROOT).stdout.strip()
        print(f'  {m} {c}: {secs}s, webp {int(size) // 1024}KB')
        rows.append((f'{m} {c}', png))

ref = Image.open(REFERENCE).convert('RGB')
cells = [ref.crop((x, y, x + side, y + side)) for x, y in REF_CROPS]
for _, png in rows:
    tile = Image.open(png).convert('RGBA').resize((side, side), Image.LANCZOS)
    water = Image.new('RGBA', tile.size, (28, 70, 86, 255))
    cells.append(Image.alpha_composite(water, tile).convert('RGB'))
cols = 3
sheet = Image.new('RGB', (cols * side, -(-len(cells) // cols) * side), 'white')
for i, c in enumerate(cells):
    sheet.paste(c, ((i % cols) * side, (i // cols) * side))
sheet.save(os.path.join(out, 'sheet.png'))
print(os.path.join(out, 'sheet.png'))
