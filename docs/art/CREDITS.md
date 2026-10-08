# Art credits

Every third-party file the bakes read is listed here with its source and licence.
Sounds are credited in `public/assets/CREDITS.md`, which ships with the game.

## Textures

`art/textures/reduce.py` builds the committed maps from the 1K-JPG downloads below. It turns colour maps into greyscale detail maps. `scripts/art/floor.ts` builds the tiling floor detail textures from them, and the light layer chooses every hue.

| File | Source | Licence |
| --- | --- | --- |
| `art/textures/floor.jpg` | Concrete 044 D by ambientCG, https://ambientcg.com/view?id=Concrete044D | CC0 1.0 |
| `art/textures/cracks.png` | Asphalt 011 (opacity map, inverted) by ambientCG, https://ambientcg.com/view?id=Asphalt011 | CC0 1.0 |

ambientCG publishes all of its assets under CC0 1.0 Universal (https://docs.ambientcg.com/license/). We checked the licence on each asset page on 2026-10-07.

## Sprites

Every sprite under the catalog is built and rendered by `art/blender/bake_sprites.py`. The geometry, materials, volumes and decals are procedural. No third-party models, textures or particle packs are used.

- Stencil lettering on crates ("SUPPLY", "CACHE") is set in Blender's built-in text font, "Bfont Regular". Blender 4.x bundles Inter (SIL Open Font License 1.1) as its default font, and Bfont is believed to be that face; confirm before a release. Only rendered pixels of it end up in the game, which the OFL allows.
- Renders come from Blender 4.5 (GPL). Blender's licence does not cover what it renders, so the baked images carry no Blender licence terms.
