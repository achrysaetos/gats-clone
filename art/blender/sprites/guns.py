"""Guns from the game's own part rectangles (units of the player radius, x along the barrel, y across).

The longest-reaching part is the barrel and ends exactly at the muzzle the game spawns bullets from. Guns are flat
(no shear) and lit from above, since the painter turns them with the holder.
"""

from . import common as C

STEEL = (0.028, 0.03, 0.034)
DARK = (0.01, 0.0105, 0.012)
POLY = (0.018, 0.018, 0.02)
INK = (0.05, 0.05, 0.055)


def build(b):
    gun = b.spec['guns'][b.arg[0]]
    R = b.R
    kit = b.kit
    steel = C.mat('steel', STEEL, rough=0.38, metal=0.6, grime=0.15, grime_scale=1.2, ink=0.4)
    dark = C.mat('dark', DARK, rough=0.45, metal=0.4, grime=0.0)
    poly = C.mat('poly', POLY, rough=0.75, grime=0.1, ink=0.3)
    accent = C.mat('accent', C.srgb(gun['accent']), rough=0.4, metal=0.3, grime=0.1)
    parts = gun['parts']
    reach = max(p['x'] + p['w'] for p in parts)
    plain = [p for p in parts if not p.get('accent')]
    body = plain[0]
    for p in parts:
        x0, x1 = p['x'] * R, (p['x'] + p['w']) * R
        y0, y1 = p['y'] * R, (p['y'] + p['h']) * R
        cx, cy, w, h = (x0 + x1) / 2, -(y0 + y1) / 2, x1 - x0, y1 - y0
        if p.get('accent'):
            kit.box('solid', accent, (cx, cy, 6.2), (w, h, 1.2), bevel=0.4)
        elif abs(p['x'] + p['w'] - reach) < 1e-6:
            # the barrel: a round tube ending flush with the muzzle, with a brake no longer than the tube
            kit.cyl('solid', steel, (cx, cy, 4.5), min(h * 0.4, 2.4), w, rot=(0, 1.5708, 0), segs=14)
            brake = min(w * 0.28, 4.0)
            kit.cyl('solid', dark, (x1 - brake / 2, cy, 4.5), min(h / 2, 3.2), brake, rot=(0, 1.5708, 0), segs=14)
        elif p is body:
            kit.box('solid', steel, (cx, cy, 3.6), (w, h, 4.6), bevel=min(1.4, h * 0.25))
            kit.box('solid', dark, (cx + w * 0.08, cy, 6.0), (w * 0.62, h * 0.3, 0.8), bevel=0.3)
        elif p['y'] < 0 and p['y'] + p['h'] < body['y'] + 0.02:
            # above the receiver: a scope or rail, round along the barrel
            kit.cyl('solid', dark, (cx, cy, 7.5), min(h / 2, 3.2), w, rot=(0, 1.5708, 0), segs=14)
            kit.cyl('solid', steel, (x1 - 0.6, cy, 7.5), min(h / 2, 3.2) * 1.15, 1.2, rot=(0, 1.5708, 0), segs=14)
        elif p['h'] > p['w'] * 1.2:
            # across the gun: a magazine or grip hanging below
            kit.box('solid', poly, (cx, cy, 1.6), (w, h, 3.2), bevel=min(0.9, w * 0.3))
        else:
            kit.box('solid', steel, (cx, cy, 3.0), (w, h, 3.8), bevel=min(1.0, h * 0.25))
    return C.Model(z_ref=None, overhead=True, outline=(INK, 0.8))
