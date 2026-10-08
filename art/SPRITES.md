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
- Characters (`soldier:*`, `zombie:*`) are rigged: `sprites/rig.py` builds a Blender armature from a bone table, parents rigid mesh parts to its bones and poses it from plain data (FK for hips, spine and head, two-bone IK for arms and legs to model-space targets). The posed meshes are then frozen into model-space vertices (`Model(freeze=True)`), and each facing rewrites them through the true shear, because Blender decomposes object matrices into location, rotation and scale and drops a shear set on the root. The sun-shadow pass turns them without shear and moves them south by `shear * z_ref`, so the shadow starts at the drawn feet.
- A catalog entry's `still` layers are baked at frame 0 only and every frame shares them (`layerFrames`, `frameKey`). The soldier's armour tiers ride the spine, which no torso frame moves.

## The soldier

One rig, actions in `sprites/soldier.py` (`ACTIONS`), baked in segments the painter stacks at the body's origin:

| Key | Dirs | Frames | Layers | What |
| --- | --- | --- | --- | --- |
| `soldier` | 32 by aim | 0 aim, 1-2 recoil, 3-8 reload | base, team, armor tiers (still) | waist up, arms and gun hands |
| `soldier.legs` | 16 by movement | 0 stand, 1-8 run | base, team | pelvis down, contact shadow |
| `soldier.shadow` | 16 | 1 | shadow | whole body in the aim stance |
| `soldier.downed` | 1, turned by the painter | 1 | base, team | prone, crawling, overhead lit |
| `soldier.dead` | 1, turned by the painter | 3 variants | base, team | on the back, face down, on the side |
| `drop.<class>` | 1, turned by the painter | 1 | base | the class's base gun lying on the floor |

`SOLDIER` in `catalog.ts` holds the frame layout. The gun stays its own sprite: the aim, recoil and reload poses keep the hands on the grip (x 12.5) and fore-end (x 21.5) of a gun drawn at the origin. Recoil frame 1 matches a gun drawn at full kick (`RECOIL`), frame 2 at half.

## The zombies

`sprites/zombies.py` builds every kind on one rig and one anatomy in units of the kind's radius. `PLANS` holds each kind's proportions, pose targets and features (shirt cover and colour, scrap plates, wrist cuffs), merged over `BASE`; `EXTRAS` adds the parts only one kind has. Each kind is one standing pose, `zombie.<kind>` at 16 facings, base layer only, with the catalog boxes, dirs and scale unchanged.

- From straight above a hunched body shows its back, so the back carries the detail. `Back` gives points and normals on a body ellipsoid (the chest, the brute's slab, the colossus's hump), and rips, ribs, plates and spikes are laid on it.
- Materials follow the soldier: low roughness with clear coat on skin, ink on silhouette edges, crevice AO, and the same 1 px dark outline.
- walker: hunched, both arms reaching ahead (one higher), a dark torn shirt with skin, raw flesh and ribs showing, a ragged sleeve, a hanging jaw and a torn scalp.
- runner: thin, bare back with shoulder blades, flank ribs and a wound, thrown 48 degrees forward with the arms swept back past the hips.
- plated: a heavier walker in bolted scrap armour: skull cap, pauldrons, two riveted back plates and bracers.
- bloater: a gut swollen past the hips with weeping sores, eight glossy veined sacs over the back, short reaching arms.
- brute: a slab of shoulder the head sinks into, gashes and a harness strap across it, long knuckle arms with iron cuffs.
- colossus: the brute's slab grown huge, a hump with three steel plates driven into raw flesh, bone spikes up the ridge, a club arm.

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
- Full bake: 405 frames in 594 s (about 10 minutes) on 4 CPU cores. check-sprites passes: every size matches and every gun barrel ends within 1.5 px of its muzzle. Rebaking a sprite gives byte-identical PNGs.
- check-sprites now also fails on art cut off by the frame edge. It caught crate and wall debris (the shear moves the floor south by shear times the top height), the downed soldier's limbs and the muzzle core. Floor debris is now clamped into the frame with the shear accounted for.
- The gutted metal crate showed one big black disc. Replaced it with scattered contents and small scorch marks.

- 2026-10-08. The rigged soldier. The first pass had huge shoulder pads and stubby arms hidden under the helmet; shrank the pads (8.4 to 7.2), the helmet (7.7 to 7.0) and the arm radius, lengthened the arms and moved the hands forward. Legs hide under the torso from straight above, so the stride is 17 units each way and the belt is narrower; feet show ahead and behind at the far frames. Heavy armour's forearm guards went, because armour is now one frame per facing and arms move between frames.
- Zombies on the same rig. Brute and Colossus first came out about 1.4 times their collision circle; trimmed shoulder width and arm spread so they stay near 1.25 times.
- Timing, 16 samples on 4 shared CPU cores (load 3 to 4 from other jobs). A one-facing test of all soldier segments took 60 to 90 s (about 1 s per layer render). The full bake rendered 1217 frames in 1586 s (26 min): torso 672 renders in 377 s, legs 288 in 182 s (each legs frame renders a second contact pass), shadow 16 in 13 s, zombies 96 frames in 283 s (the Colossus alone 129 s), and the unchanged props and effects the rest. Kept 16 samples: denoised frames showed no noise at game scale, and the whole bake stays under half an hour.
- Atlas: 1217 frames on three 2048x2048 pages, 2.87 MB of WebP (830 KB, 1187 KB, 924 KB) plus 215 KB of JSON, against 1.63 MB and 72 KB before. Baking armour once per facing instead of per torso frame saved about 1 MB (estimated from per-frame WebP sizes of one facing).
- 2026-10-08. Zombies lifted beside the plate soldier. The bake had been failing since `ZOMBIE_LOOK` lost `armor` and `shoulders`; those now live in the body plans.
  - First pass: rips covered the whole shirt, so no cloth read; shrank them to a quarter of the back. Brute and colossus back details sat inside the shoulder slab and hump, so `Back` now also wraps those. Bulky orange cuffs became thin iron shackles. Hair patches read as black masks at game scale and went.
  - Long fingers (about 0.48 radius) pushed reaching hands past the frame at the 22.5 degree facings next to east and west; shortened them to about 0.3 radius and pulled the walker's and colossus's hands in slightly instead of growing the boxes.
  - Timing, 16 samples on 4 shared cores at load 9 to 14. All 96 zombie frames (16 facings) took 393 s and 424 s in two runs: walker 1.7 to 2.3 s a frame, runner 1.4, plated 2.7 to 4.5, bloater 3.6 to 5.1, brute 4.5 to 6.5, colossus 6.7 to 10.6. Old and new models baked back to back at 4 facings took 73.6 s (old), 79.5 s (new) and 112.0 s (old), so the extra geometry costs nothing that stands out from the load.

## Known gaps

- Crates, walls, zombies and the core have no `shadow` layer in the catalog, so they carry only a soft contact shadow in `base`. The long sun shadow the map casts for static walls is missing for them. Adding `shadow` layers with boxes long enough for a 24 degree sun (about 2.25 times the height) would fix it.
- The soldier's sun shadow is physically consistent with the map (long and dark at 24 degrees), which reads heavier than the reference's soldiers. The painter may want to draw it at reduced alpha.
