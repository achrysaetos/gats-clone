# Sprite bake

`art/blender/bake_sprites.py` bakes every entry of `src/client/world/catalog.ts` from the spec that `scripts/art/export-sprites.ts` writes.

```sh
node scripts/art/export-sprites.ts art/build/sprites-spec.json
blender -b -P art/blender/bake_sprites.py -- art/build/sprites-spec.json art/build/sprites [name-prefix]
node scripts/art/check-sprites.ts art/build/sprites-spec.json art/build/sprites
node scripts/art/contact-sheet.ts art/build/sprites-spec.json art/build/sprites <sheetDir>
```

## How a frame is made

- Each builder in `art/blender/sprites/` adds geometry to a `Kit`, which merges primitives into one mesh per role and material (no per-object `bpy.ops`).
- Roles are `solid`, `team` and the three armor tiers. A table of render passes in `bake_sprites.py` says which roles show, which are holdouts (cut out but still casting light and shadow) and which only cast shadow.
- The model's root gets `shear @ rotation`. Rotation turns the model to the facing. The shear moves height z north by `shear * (z - zRef)`, so zRef lands on the footprint or collision circle.
- `team` renders the near-white team parts with everything else held out. `glow` renders with the sun and sky off, then turns brightness into alpha. `shadow` renders a shadow catcher with the model invisible to the camera.
- `base` of a model with `contact` also renders a soft overhead contact shadow and puts it under the base. Rotated sprites (guns, turrets, thrown, downed) are lit from above and not sheared.
- Every PNG goes through `common.write_png`, so output is byte-reproducible for a given render.

## Iteration log

- 2026-10-07. Eevee cannot start headless here (no libEGL), so Cycles CPU it is: about 0.4 to 1.5 s a frame at sprite sizes.
- First soldier: a blob with a huge helmet and flat team color under the 24 degree sun. Shrank the helmet, enlarged the shoulder pads, added edge darkening (`ink`) and crevice AO to the materials and a 1 px dark outline under characters and guns.
- The outline wrapped the contact shadow, so contact shadows became their own pass composited under the outlined base.
- Armor tiers barely showed from above because the torso hides under helmet and pads. Moved the vest onto the back and pack, where the camera sees it, and gave heavy armor pauldrons and a neck guard.
- Zombies: the dark shirt read as a black box on the back. Shrank it and tinted it from the body color.
- Crates: broken boards sank below the dark interior box and vanished, so stage 1 looked hollow. Lowered the interior to a recess 5 units down.
- Contact shadows reached the frame edge and showed a cut rectangle on the sheet. Tightened the contact light and faded its shadow over the last 7 px.
- Overhead-lit sprites came out twice as bright as sun-lit ones, because a flat top gets sin(elevation) of the sun. Overhead light now gives a flat top that same amount.
- Siege walls built from chunks read as sugar cubes. Stage 1 is now one block with chipped outlines and hairline cracks; stage 2 is a jagged stump with rebar and rubble.
- Glow layers rendered on a transparent film lost the color of additive (emission plus transparent) shapes, so glow now renders on black and takes alpha from brightness.
- Muzzle flash and fireball first saturated to white blobs. Cut emission about 4x and blurred the flash 1.4 px so its spikes fade.
