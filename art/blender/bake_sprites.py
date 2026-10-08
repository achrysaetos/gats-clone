"""Bakes every sprite in the catalog.

Usage: blender -b -P art/blender/bake_sprites.py -- art/build/sprites-spec.json <outDir> [name-prefix,...]

Writes <outDir>/<name>/<layer>/<dir>_<frame>.png for each catalog entry, at round(box.w*px) x round(box.h*px)
with px = pxPerUnit * (scale or 1), covering the entry's box around the sprite's origin.
"""

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from sprites import common as C  # noqa: E402
from sprites import fx, guns, kit, props, soldier, zombies  # noqa: E402

BUILDERS = {
    'soldier': soldier.build,
    'gun': guns.build,
    'drop': guns.build_drop,
    'zombie': zombies.build,
    'crate': props.build_crate,
    'engineer-wall': props.build_engineer_wall,
    'siege-wall': props.build_siege_wall,
    'turret-pad': props.build_pad,
    'turret': props.build_turret,
    'core': props.build_core,
    'thrown': props.build_thrown,
    'muzzle-flash': fx.build_muzzle,
    'explosion': fx.build_explosion,
    'smoke-puff': fx.build_smoke,
    'scorch': fx.build_decal,
    'blood': fx.build_decal,
    'ichor': fx.build_decal,
    'kit': kit.build_piece,
    'train': kit.build_train,
}

# How each role's objects take part in a render pass: shown, cut out of the image while still casting light and shadow
# (holdout), only casting shadow (ghost), or absent.
SHOW, HOLDOUT, GHOST, HIDE = 'show', 'holdout', 'ghost', 'hide'

# Every render pass: which roles show, whether the shadow catcher, the sun, the overhead contact light and the sky
# take part, and whether colors stay raw (glow) or get the map's grade.
# Contact shadows fade out over this many pixels at the frame's edge, so no frame shows a cut edge.
CONTACT_FADE_PX = 7

LIT = dict(catcher=False, sun=True, contact=False, sky=True, raw=False, film=True)
PASSES = {
    'base': dict(LIT, roles={'solid': SHOW, 'team': SHOW}),
    'team': dict(LIT, roles={'solid': HOLDOUT, 'team': SHOW}),
    **{t: dict(LIT, roles={'solid': HOLDOUT, 'team': HOLDOUT, t: SHOW}) for t in C.ARMOR},
    'glow': dict(LIT, roles={'solid': SHOW, 'team': SHOW}, sun=False, sky=False, raw=True, film=False),
    'shadow': dict(LIT, roles={'solid': GHOST, 'team': GHOST}, catcher=True),
    'contact': dict(LIT, roles={'solid': GHOST, 'team': GHOST}, catcher=True, sun=False, contact=True),
}


class Build:
    """What a builder gets: the spec, the entry, a kit to add geometry to, and the collections roles live in."""

    def __init__(self, spec, name, entry, frame, root, colls):
        self.spec, self.name, self.entry, self.frame = spec, name, entry, frame
        self.R = spec['playerRadius']
        self.kit = C.Kit()
        self.root = root
        self.colls = colls
        self.rnd = C.rng(name, frame)
        self.arg = entry['model'].split(':')[1:]


def render_pass(spec, name, colls, catcher, lights, model, tmp):
    p = PASSES[name]
    sun, contact, bg, sky = lights
    for role, coll in colls.items():
        state = p['roles'].get(role, HIDE)
        for o in coll.all_objects:
            o.hide_render = state == HIDE
            o.is_holdout = state == HOLDOUT
            o.visible_camera = state != GHOST
    catcher.hide_render = not p['catcher']
    bpy.context.scene.render.film_transparent = p['film']
    sun.hide_render = not p['sun']
    contact.hide_render = not p['contact']
    bg.inputs['Strength'].default_value = sky if p['sky'] else 0.0
    C.look(bpy.context.scene, spec, 'raw' if p['raw'] else 'lit')
    if model.on_layer:
        model.on_layer(name)
    C.render_to(tmp)
    a = C.read_png(tmp)
    os.remove(tmp)
    if name in ('shadow', 'contact'):
        a[..., :3] = 0
    if name == 'glow':
        peak = a[..., :3].max(axis=2)
        a[..., :3] /= C.np.where(peak > 1e-4, peak, 1.0)[..., None]
        a[..., 3] *= peak
    return a


def render_layer(spec, layer, colls, catcher, lights, model, tmp):
    a = render_pass(spec, layer, colls, catcher, lights, model, tmp)
    if model.soften:
        a = C.blur(a, model.soften)
    if layer != 'base':
        return a
    if model.outline:
        a = C.outline(a, *model.outline)
    if model.contact:
        shadow = render_pass(spec, 'contact', colls, catcher, lights, model, tmp)
        shadow[..., 3] *= model.contact * C.edge_fade(shadow.shape[1], shadow.shape[0], CONTACT_FADE_PX)
        a = C.over(a, shadow)
    return a


def bake(spec, name, entry, out):
    kind = entry['model'].split(':')[0]
    px = spec['pxPerUnit'] * entry.get('scale', 1)
    box = entry['box']
    count = 0
    for f in range(entry['frames']):
        C.reset(spec)
        model_coll = C.collection('_model')
        colls = {'_model': model_coll}
        for role in C.ROLES:
            c = bpy.data.collections.new(role)
            model_coll.children.link(c)
            colls[role] = c
        colls['_ground'] = C.collection('_ground')
        root = C.link(bpy.data.objects.new('root', None), model_coll)
        b = Build(spec, name, entry, f, root, colls)
        model = BUILDERS[kind](b)
        b.kit.build(root, colls)
        parts = C.freeze(colls) if model.freeze else None
        if model.samples:
            bpy.context.scene.cycles.samples = model.samples
        C.add_camera(box, px)
        catcher = C.ground(box, colls['_ground'])
        sun, contact, bg = C.add_lights(spec, model.overhead)
        lights = (sun, contact, bg, bg.inputs['Strength'].default_value)
        for d in range(entry['dirs']):
            angle = d / entry['dirs'] * 2 * math.pi
            if not parts:
                root.matrix_world = C.frame_matrix(angle, model.z_ref, spec['camera']['shear'])
            for layer in entry['layers']:
                if f > 0 and layer in entry.get('still', ()):
                    continue
                if parts:
                    C.place(parts, (C.shadow_matrix if layer == 'shadow' else C.frame_matrix)(angle, model.z_ref, spec['camera']['shear']))
                folder = os.path.join(out, name, layer)
                os.makedirs(folder, exist_ok=True)
                path = os.path.join(folder, f'{d}_{f}.png')
                tmp = os.path.join(folder, f'.tmp_{d}_{f}.png')
                C.write_png(path, render_layer(spec, layer, colls, catcher, lights, model, tmp))
                count += 1
    return count


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) < 2:
        print('usage: blender -b -P art/blender/bake_sprites.py -- <spec.json> <outDir> [name-prefix,...]')
        sys.exit(2)
    with open(argv[0]) as fh:
        spec = json.load(fh)
    out = argv[1]
    prefixes = argv[2].split(',') if len(argv) > 2 else ['']
    started = time.time()
    total = 0
    for name, entry in spec['sprites'].items():
        if not any(name.startswith(p) for p in prefixes):
            continue
        t = time.time()
        n = bake(spec, name, entry, out)
        total += n
        print(f'[sprites] {name}: {n} frames in {time.time() - t:.1f}s', flush=True)
    print(f'[sprites] done: {total} frames in {time.time() - started:.1f}s', flush=True)


main()
