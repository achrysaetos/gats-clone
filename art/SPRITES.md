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
| `soldier` | 32 by aim | 0 aim, 1 breathe, 2-3 light recoil, 4-5 heavy recoil | base, team, armor tiers (still) | waist up, arms and gun hands |
| `soldier.act` | 16 by aim | 0-23 reloads (pistol, mag, pump, box, 6 each), 24-27 flinch front and back, 28-30 throw, 31-33 knife | base, team | the waist up in moves that take a hand off the grip or snap the head |
| `soldier.legs` | 16 by the way the legs face | 0 stand, 1-8 run, 9-16 strafe left, 17-19 dash | base, team | pelvis down, contact shadow |
| `soldier.shadow` | 16 | 1 | shadow | whole body in the aim stance |
| `soldier.downed` | 1, turned by the painter | 0-3 crawl, 4-7 revive | base, team | prone, overhead lit |
| `soldier.die` | 1, turned by the painter | 0-5 fall forward, 6-11 fall back, 12-17 spin; the last of each is the body | base, team | from standing to the body that stays |

`SOLDIER` in `catalog.ts` holds the frame layout and mirrors `STRIPS`. The painter draws the legs, then the gun (`gun.<id>` frames: body, magazine, action), then the torso and its armour over it, so the baked hands sit on the gun. Strafing right plays the strafe strip backwards; backpedalling plays the run backwards with the legs facing the aim.

### The design, picked from four

Four scripted designs were baked on the same rig at game scale beside the reference soldiers ([sheet](../docs/feel/shots/soldier-variants.webp), made with `contact-sheet.ts variants`):

- A, plate: rounded team pauldrons and lame, team chest shell and backpack, glossy black helmet with a team stripe and visor, team arms and bracers. **Picked.** It reads closest to the gold shots: team colour dominates the silhouette, the helmet is the dark focal point, and the forms are round and glossy.
- B, shell: the same as boxes. The pauldrons read as bricks with black gaps between them.
- C, trooper: olive cloth torso with team colour on the panels only. The team read weakens at game scale.
- D, bulk: A scaled up 15%. It crowds the collision circle and hides the arms.

The built version of A has smaller, lower pauldrons than the variant so the arms and hands show, and a larger helmet. Armour tiers lie over the chest, collar and flanks: light is straps and pouches, medium adds a steel chest plate and collar, heavy adds flank plates and a neck guard. None covers the pauldrons, arms, backpack or helmet stripe, so the team still reads at heavy.

### The swap contract

A different soldier model can replace this one without touching the painter if it keeps:

- **Footprint and scale.** Built at the 24-unit player radius, origin at the collision circle's centre on the floor, facing +X, shoulder height `SHOULDER` (22) as the shear's reference.
- **Grips.** `GRIP` in `soldier.py`: right hand at (12.5, -6, 19.5), left at (21.5, 1.5, 20). Every gun model puts its pistol grip and fore-end there. A pose lists the hands that hold the gun in `holds`, and a pose that moves the gun (recoil, breathing) says by how much in `gun`. `check_grips` fails the bake when a held hand ends more than 1 unit (2 px) from its grip.
- **Poses as data.** `ACTIONS` names each strip; `STRIPS` orders them per segment; `SOLDIER` in `catalog.ts` mirrors the order.
- **Bones.** The names in `BONES` (`hips`, `spine`, `head`, `upper_arm`/`forearm`/`hand`/`thigh`/`shin`/`foot` with `.R` and `.L`) and the two-bone limbs in `LIMBS`. Poses address limbs by these names.
- **Layers by name.** Geometry carries a role: `solid` (base), `team` (the white mask the painter tints), and one role per armour tier. Armour rides only the spine, and no torso or act frame moves the spine.

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

## Known gaps

- Crates, walls, zombies and the core have no `shadow` layer in the catalog, so they carry only a soft contact shadow in `base`. The long sun shadow the map casts for static walls is missing for them. Adding `shadow` layers with boxes long enough for a 24 degree sun (about 2.25 times the height) would fix it.
- The soldier's sun shadow is physically consistent with the map (long and dark at 24 degrees), which reads heavier than the reference's soldiers. The painter may want to draw it at reduced alpha.
