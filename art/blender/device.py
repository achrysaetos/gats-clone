"""Which device Cycles renders on. CPU unless ART_GPU=1, which takes the first GPU backend Blender finds (Metal, OptiX, CUDA, HIP, oneAPI)."""
import os

import bpy


def use_device(scene):
    scene.cycles.device = 'CPU'
    if os.environ.get('ART_GPU') != '1':
        return
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('METAL', 'OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == backend]
        if not gpus:
            continue
        for d in prefs.devices:
            d.use = d.type == backend
        scene.cycles.device = 'GPU'
        print(f'[device] rendering on {backend}: {", ".join(d.name for d in gpus)}')
        return
    print('[device] ART_GPU=1 but no GPU backend found, rendering on CPU')
