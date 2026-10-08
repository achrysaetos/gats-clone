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

`SOLDIER` in `catalog.ts` holds the frame layout. The gun stays its own sprite: the aim, recoil and reload poses keep the hands on the grip (x 12.5) and fore-end (x 21.5) of a gun drawn at the origin. Recoil frame 1 matches a gun drawn at full kick (`RECOIL`), frame 2 at half.

## Guns

`sprites/guns.py` builds one model per class (pistol, SMG, assault rifle, pump shotgun, bolt sniper, LMG) on the gun's `GUN_PARTS` rectangles, which now say what each one is (`role`: body, mag, barrel, optic, tube, bipod, accent). Every gun lies on its left side, so the camera sees its profile the way the HUD silhouettes draw it: optics north of the barrel, grip, magazine and bipod south. Evolutions stretch the class model with the gun's `look` and add the attachments below.

Each `gun.<id>` sprite has three frames over one box (`GUN_FRAMES`). A dropped gun reuses them.

| Frame | What | Empty for |
| --- | --- | --- |
| 0 | the gun without its moving parts, barrel and muzzle device included | never |
| 1 | the magazine or ammo box alone, as seated | shotguns fed by a tube or broken open, the revolver |
| 2 | the pump fore-end or the bolt handle alone | every gun without a pump or bolt (`cycleOf` in `reload.ts`, exported as `cycle`) |

Draw frame 1, then 0, then 2: the receiver covers the magazine's top, and the pump and bolt sit on top. The guns sheet and the soldiers on the characters sheet stack them that way.

Three anchors are fixed, and the bake checks two of them:

- The barrel, or the muzzle device on it, ends exactly at the muzzle (`max(x + w)` of `GUN_PARTS`). Suppressors, brakes and compensators sit inside the barrel's length. `check-sprites` holds it to 1.5 px.
- The pistol grip lies under the right hand at (12.5, 6) and a fore-end or support surface under the left at (21.5, -1.5), in game units with y south (`GRIP` in `soldier.py`). The builder records the footprint of the geometry it tags `grip` and `fore`, and the bake fails when a hand point is more than `GRIP_SLACK` (1 unit, 2 px) from its footprint. Akimbo holds a whole pistol in each hand and is exempt.
- Everything stays 1 unit inside the catalog's `gunBox`, which `GUN_PARTS` sizes. Grips, magazines, drums and sights shorten to fit; that is why the pistol's grip is stubby.

### Attachments

`GUN_ATTACHMENTS` in `src/client/sprites.ts`, keyed by gun. Extra barrels (Double Barrel, Sawed-off, Minigun, Twin MG) and Akimbo's second pistol come from `GUN_PARTS`. Every evolved gun also carries its accent stripe on the receiver.

| Class | Gun | Attachments |
| --- | --- | --- |
| pistol | Hand Cannon | compensator |
| | Machine Pistol | folding wire stock |
| | Executioner | compensator, laser under the barrel |
| | Gunslinger | revolver cylinder and top-strap frame, no magazine |
| | Akimbo | a pistol in each hand |
| | Hailstorm | wire stock, compensator |
| smg | Skirmisher | red dot |
| | Heavy SMG | vertical foregrip |
| | Phantom | red dot, suppressor |
| | Hornet | red dot, extended magazine |
| | Ripper | foregrip, heavy fluted barrel, muzzle brake |
| | Bulldog | foregrip, drum magazine |
| shotgun | Slug Gun | red dot, heavy barrel |
| | Double Barrel | over-under barrels, fixed fore-end, break action |
| | Rail Slug | scope, copper coils and rails along the barrel |
| | Boom Slug | red dot, muzzle brake |
| | Sawed-off | no stock, short over-under barrels |
| | Street Sweeper | drum magazine, fixed fore-end |
| assault | Battle Rifle | foregrip, muzzle brake |
| | Carbine | short stock on a buffer tube |
| | Marksman | scope, heavy barrel, muzzle brake |
| | Grenadier | underbarrel launcher, muzzle brake |
| | Specter | short stock, suppressor |
| | Scout | short stock, scope |
| sniper | Longshot | bigger scope |
| | Semi-auto Rifle | extended magazine, black furniture, charging handle instead of a bolt |
| | Piercer | bigger scope, heavy barrel, bipod |
| | Artillery | bigger scope, big muzzle brake, bipod |
| | Repeater | extended magazine, muzzle brake |
| | Ghost | extended magazine, suppressor |
| lmg | Heavy LMG | heavy barrel, carry handle |
| | Light MG | foregrip |
| | Minigun | three barrels with clamps, motor housing |
| | Juggernaut | heavy barrel, carry handle, muzzle brake |
| | Ranger | foregrip, red dot |
| | Twin MG | two barrels with clamps |

To bake and look at the guns alone:

```sh
node scripts/art/export-sprites.ts art/build/sprites-spec.json
blender -b -P art/blender/bake_sprites.py -- art/build/sprites-spec.json art/build/sprites gun.
node scripts/art/contact-sheet.ts art/build/sprites-spec.json art/build/sprites <sheetDir> guns
```

`check-sprites` reports every non-gun sprite as missing after a guns-only bake unless the spec is cut down to the `gun.*` entries.

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
- 2026-10-08. Guns. The first pass had chrome-bright steel (metallic 0.75 caught the overhead light) and glowing accent bars; dulled the steel, darkened it to 0.032 and gave its bevels a light rim instead (`rim` on `common.mat`), made magazines polymer and the accent a flat stripe. The red dot on the Slug Gun and the Rail Slug's scope turret poked out of their narrow gun boxes; sights now shorten to fit. All 42 guns, 126 frames, bake in 47 to 85 s on 4 shared cores (load 12 to 17 from other jobs), about 0.4 to 0.7 s a frame; empty frames cost about as much as full ones. check-sprites passes on every gun frame. Moving a grip 5 units back or starting a fore-end 4.5 units forward fails the bake with the miss in units.

## Known gaps

- Crates, walls, zombies and the core have no `shadow` layer in the catalog, so they carry only a soft contact shadow in `base`. The long sun shadow the map casts for static walls is missing for them. Adding `shadow` layers with boxes long enough for a 24 degree sun (about 2.25 times the height) would fix it.
- The soldier's sun shadow is physically consistent with the map (long and dark at 24 degrees), which reads heavier than the reference's soldiers. The painter may want to draw it at reduced alpha.
