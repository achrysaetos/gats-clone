"""Reduces the downloaded ambientCG sets (see docs/art/CREDITS.md) to the small maps the bake reads.

python3 -I art/textures/reduce.py <dir holding the unzipped 1K-JPG sets>
Colour maps become greyscale detail maps, so scene.py sets every hue and the texture only adds wear.
"""

import os
import sys

from PIL import Image, ImageOps

src = sys.argv[1]
out = os.path.dirname(os.path.abspath(__file__))


def load(asset, kind):
    return Image.open(os.path.join(src, asset, f'{asset}_1K-JPG_{kind}.jpg'))


def detail(asset, name, size=1024):
    """Luminance stretched to the full range, so the shader decides how strong it is."""
    im = ImageOps.autocontrast(load(asset, 'Color').convert('L'), cutoff=0.5).resize((size, size), Image.LANCZOS)
    im.save(os.path.join(out, name), quality=88)


def normal(asset, name, size=512):
    load(asset, 'NormalGL').convert('RGB').resize((size, size), Image.LANCZOS).save(os.path.join(out, name), quality=90)


detail('Concrete044D', 'floor.jpg')
normal('Concrete044D', 'floor_normal.jpg')
detail('Concrete034', 'wall.jpg')
normal('Concrete034', 'wall_normal.jpg')
ImageOps.invert(load('Asphalt011', 'Opacity').convert('L')).save(os.path.join(out, 'cracks.png'), optimize=True)
