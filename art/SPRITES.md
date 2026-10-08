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

`SOLDIER` in `catalog.ts` holds the frame layout and mirrors `STRIPS`. The painter draws the legs, then the gun (`gun.<id>` frames: magazine, body, action), then the torso and its armour over it, so the baked hands sit on the gun. Strafing right plays the strafe strip backwards; backpedalling plays the run backwards with the legs facing the aim.

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

`ZOMBIE_LOOK.eyes` in `palette.ts` is where the painter draws the night eye glows: `ahead` along the facing, `apart` to each side, and `lift` north for the shear, all in radius units. `check_eyes` solves the pose and fails the bake if either model eye sits more than 0.04 radius from that spot, so a head or pose change cannot leave the glows off the face.

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
- 2026-10-08. Zombies lifted beside the plate soldier. The bake had been failing since `ZOMBIE_LOOK` lost `armor` and `shoulders`; those now live in the body plans.
  - First pass: rips covered the whole shirt, so no cloth read; shrank them to a quarter of the back. Brute and colossus back details sat inside the shoulder slab and hump, so `Back` now also wraps those. Bulky orange cuffs became thin iron shackles. Hair patches read as black masks at game scale and went.
  - Long fingers (about 0.48 radius) pushed reaching hands past the frame at the 22.5 degree facings next to east and west; shortened them to about 0.3 radius and pulled the walker's and colossus's hands in slightly instead of growing the boxes.
  - Timing, 16 samples on 4 shared cores at load 9 to 14. All 96 zombie frames (16 facings) took 393 s and 424 s in two runs: walker 1.7 to 2.3 s a frame, runner 1.4, plated 2.7 to 4.5, bloater 3.6 to 5.1, brute 4.5 to 6.5, colossus 6.7 to 10.6. Old and new models baked back to back at 4 facings took 73.6 s (old), 79.5 s (new) and 112.0 s (old), so the extra geometry costs nothing that stands out from the load.
  - Eyes now sit 0.42 to 0.96 radius ahead and 0.07 to 0.12 apart depending on kind; the painter's fixed 0.55 at plus or minus 0.42 rad (0.50 ahead, 0.22 apart) missed every kind by 0.16 to 0.49 radius, so the spot moved into `ZOMBIE_LOOK.eyes`.

## Known gaps

- Crates, walls, zombies and the core have no `shadow` layer in the catalog, so they carry only a soft contact shadow in `base`. The long sun shadow the map casts for static walls is missing for them. Adding `shadow` layers with boxes long enough for a 24 degree sun (about 2.25 times the height) would fix it.
- The soldier's sun shadow is physically consistent with the map (long and dark at 24 degrees), which reads heavier than the reference's soldiers. The painter may want to draw it at reduced alpha.
