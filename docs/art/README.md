# Art direction and the visual overhaul

The art reference for Skirmish is the set of shots in `gold/` (set 2026-10-07). `gold-standard.webp` is the same image as `gold/yard.webp`, kept for the bake tools that compare against it. When the game's look and the references disagree, the references win, as long as gameplay stays readable.

The next stage widens the scope to maps, map scale and gameplay. Its plan is [IMPLEMENTATION.md](IMPLEMENTATION.md). The rest of this file records the first stage: its scope, measurements, decisions and what changed from its plan.

## Scope of the first stage

The overhaul changes only visuals, effects and graphics. The UI and gameplay stay mostly the same.

- In scope: the world renderer, floor, cover, props, characters, guns, effects, lighting, decals, particles and colour grading.
- Out of scope: game rules, the sim, the server, the netcode, maps' collision layout, the HUD layout and the menus. The HUD keeps its current layout and content. At most it gets restyled to sit well over the new look.
- Collision stays axis-aligned rectangles. A wall's top face in the art is exactly its collision rect, so what players see is what blocks bullets.

## What the reference sets

- A daylit concrete industrial yard seen from almost straight above. Painted floor markings, drains and vents, and water at the map edge.
- Long, hard sun shadows falling one way, with soft contact darkening where walls meet the floor.
- Detailed modular cover with short visible side faces: concrete walls with hazard trim, railings, stairs, AC units, planters, crates and barrels.
- Destruction: walls broken into rubble piles, chunks and dust, and burning barrels and crates with fire, smoke and embers.
- Soldiers as small detailed figures with a team colour and a ring under them. A health bar sits over each one, and a dashed trail follows them.
- Bright muzzle flashes, glowing tracer rounds, brass casings and debris that stay on the floor.
- A glowing objective (the blue core) with a beam of light.
- A minimal HUD: health and ammo top left, top 5 top right, minimap bottom right.

## What we measured (2026-10-07, Apple M1)

- The current Canvas2D renderer is not slow. On the GPU canvas a busy 1080p frame costs 0.5 to 0.7ms at p50 and under 2ms at p99. With 125 zombies on screen it costs 1.2ms at p50.
- Canvas2D's limit is that it has no shaders: no bloom, no distortion, no colour grading, and no cheap mass of particles. It manages about 10k rotated sprites at 60fps.
- PixiJS 8.22 (WebGL) manages about 59k sprites, or about 367k additive particles, at 60fps.
- Bundle cost after gzip. Today's client is 74.5 KB. PixiJS with bloom, glow and displacement filters adds about 191 KB. Three.js with bloom adds about 139 KB.

## Decisions

### Renderer: PixiJS v8 for the world

- The reference is a 2D sprite look with baked lighting plus glow effects. PixiJS covers every part of it:
  - Fire and explosions: additive flipbooks, embers, a soft light pool under them, and bloom.
  - Smoke: particles.
  - Rubble, casings and debris: particles, then baked into a persistent floor RenderTexture.
  - Breakable walls: damage-stage sprites plus chunk particles.
  - The core: additive sprites, bloom and a pulse.
  - Water: a displacement filter.
  - Sun shadows: baked.
- Three.js wins only if side faces must shift with camera position (true 3D parallax). We accept painted side faces that stay fixed, as most 2D games do.
- Rejected:
  - Staying on Canvas2D: it can't reach the target's effects.
  - Phaser, Babylon, PlayCanvas and Godot: each owns its game loop and is heavy, which fights our shared authoritative sim.
  - Raw WebGL or WebGPU: we'd rebuild what PixiJS already gives us.
- The seam is `drawWorld(ctx, Frame)` in `src/client/render.ts`. About 1,580 lines of world drawing get rewritten. Everything else stays: interpolation, prediction, particle data, feedback, audio, the menu, the sim and the server. The HUD stays on a Canvas2D layer over the WebGL canvas.
- Care points:
  - Some draw code writes state (`faceZombies`, `barrelOf`), and that has to move out of the drawing code.
  - Gun geometry in `sprites.ts` feeds shot prediction (`muzzleTip`), and it must survive.
  - Four tests record Canvas2D calls (client-gamefeel, client-teaching, client-tilt, client-decals). They, and `scripts/map-overview.ts`, need replacing.
- WebGL2 is required. The old software-canvas frame budget no longer applies. Weak GPUs get quality tiers instead: render scale, bloom at half resolution, and capped particle counts.

### Art pipeline: scripted Blender bakes, assembled by PixiJS

The project has no artist, and all current art is code. So art is built by scripts in the repo and rebuilt with one command (`npm run art`).

1. A Node script exports each map in `src/shared/maps.ts` to JSON: cover rects, material and whether each can be destroyed.
2. A Blender Python script builds each map's static scenery from that JSON: the floor, cover that never breaks, markings, and the sun shadows and ambient occlusion. It renders the scene once with a fixed orthographic camera and sun, then cuts it into roughly 1024px tiles. At runtime that layer is a few dozen images and costs no per-frame shadow work.
3. Everything that moves or changes is a sprite rendered with the same camera and sun:
   - breakable walls and crates, one sprite per damage stage, with rubble rendered under them
   - barrels, pickups, zombie-mode buildings and the core
4. Soldiers and guns:
   - Render them lit from straight above, so they still look right when rotated at runtime. Their cast shadow is a separate sprite offset along the sun.
   - Render a mask with each one, so one sprite set is tinted for every team and squad colour in code.
   - Export each gun's muzzle position from the render as data. Shot prediction and the drawn gun then agree by construction.
5. Effects: fire, smoke and explosion flipbooks, rendered in Blender or taken from free packs. Sparks, debris, casings, embers and glow are procedural PixiJS particles. Glow comes from per-sprite emissive masks plus a half-resolution bloom pass.
6. A script packs sprites into atlases with a JSON index and compresses them twice: WebP for download, and KTX2/Basis for low GPU memory. Outputs are committed under `public/assets/`.

- **Sources.** Materials come from free PBR texture libraries (check licences first). Props and soldiers start from free low-poly packs, shapes the script generates, or AI 3D-model generators for one-off props. AI image generators are for concept art only, not for game assets: they can't keep the camera, sun and tiling consistent across hundreds of pieces.
- **Camera.** Start straight down, with short visible south faces, for readability. Tall side faces hide the floor behind them. An earlier 2.5D tilt was tried and backed off (see the history of `tilt.ts`).
- **Resolution.** About 1.5 px per world unit for baked maps. That is an estimated 3 to 8 MB per map after compression. Only tiles near the camera stay in GPU memory.

### It stays a web game

- Expected first download is about 5 to 15 MB of art (an estimate), so a few seconds of loading the first time. After that it comes from the browser cache.
- Load the menu and the first map first, and stream the rest while the player picks a mode.
- Warm shaders on the loading screen (draw one hidden explosion and bloom), so the first real one doesn't stutter.
- Phones stay out of scope. Desktop integrated GPUs are the performance floor, and they are not yet measured.

### Feel work that doesn't depend on the renderer

This part also changes no rules:

- A real camera kick per gun. Today's own-shot shake peaks around 0.07px, which nobody can see.
- 40 to 80ms of hitstop on hits and kills. It is purely visual, and the sim is untouched.
- The server sends the hit point and shot direction, so sparks and blood land where the round hit. Today a player hit reports the victim's centre.
- Remote sounds play on the render clock. Today they lead their visuals by about 100ms.
- Sampled sound in place of synthesized cues.

## Plan

1. The renderer-independent feel work above.
2. A PixiJS test slice on Plaza:
   - the map export and the Blender static bake
   - one breakable crate in three stages
   - one soldier and gun with an exported muzzle point
   - fire, smoke and debris effects, and bloom
3. Measure download size and Retina frame time with bloom on and off, and compare screenshots with `gold-standard.webp`.
4. Port the world renderer in one wave and delete the Canvas2D world code in the same change.
5. Remaining maps and pieces in batches: floor and cover, then soldiers and guns, then props and effects.

Blender has to be installed on the dev machine before step 2.

## What changed from the plan, and why

The overhaul followed the plan above: PixiJS behind `drawWorld`, the HUD on Canvas2D, scripted Blender bakes, atlases committed under `public/assets/`, one `npm run art`. These parts went differently, each for a reason found while building it.

- **Camera.** Straight down, with an oblique shear of 0.3: a wall's top sits on its collision rect and its south face hangs below it, 0.3 of its height. Tops on the rect keep every hit honest; the short face gives the reference's sense of height without hiding the floor behind it.
- **Soldiers and zombies are baked per facing, lit by the sun.** The plan was one sprite lit from straight above, rotated at runtime. That leaves soldiers flatter than the walls around them, whose light comes from the low sun. Baking 32 soldier facings and 16 zombie facings at 2 px per unit keeps one sun on everything and costs about 10.5 Mpx in all; the rotation left over is at most half a step (5.6° for soldiers) and is applied at runtime. Guns, turrets, thrown items and effects still rotate one sprite, lit from above.
- **The gun's muzzle comes from the game, not from the render.** `GUN_PARTS` in `src/client/sprites.ts` already feeds shot prediction, so the bake reads it and builds each gun to match. `scripts/art/check-sprites.ts` fails the build when a baked barrel ends more than 1.5 px from its muzzle point. They agree by construction, the other way round.
- **Rubble and scorch marks are a decal pool, not a floor RenderTexture.** A pool of at most 90 decals, each fading out over its last 6 of 40 seconds, needs no texture management across map changes or camera moves and costs a handful of sprites.
- **Water is a scrolling tile, not a displacement filter.** The map's edge is a baked quay, so water shows only past the margin; a 512 px tileable texture panned at two speeds reads as moving water there and costs no filter pass.
- **Bloom comes from an emissive layer at a quarter of the resolution.** Glowing things (fire, muzzle flashes, tracers, turret lights, the core) draw a second time into a small render target, which is blurred and added. A full-screen filter would blur the whole frame at 2x DPR every frame.
- **Names, bars and timers stay on the HUD canvas.** Canvas2D text is crisp and cheap; Pixi text is neither. The scene model gives the labels their positions, so they still follow the world.
- **WebP only, no KTX2 yet.** The atlas is two 2048 px pages and at most 30 ground tiles (the view plus a ring of prefetch) stay on the GPU: about 150 MB of texture memory at worst, which desktop GPUs hold. KTX2 would cut that four- to eightfold but needs a Basis encoder in the build and a transcoder in the page; it is the first lever if integrated GPUs struggle.
- **No shader warm-up screen.** Every effect draws with Pixi's sprite batcher or the bloom pass, and both run from the first frame of play, so the first explosion compiles nothing new.
- **`scripts/map-overview.ts` stitches the baked tiles with sharp** instead of rendering in a browser.
- **Sounds are sampled MP3s** (CC0, from Freesound) fetched and encoded by `scripts/art/sounds.ts`, with the old synthesizer kept as the fallback while they load.
- **The sun shadows fall south-west** (`ART.sun.shadow` `[-0.62, 0.78]`, elevation 26°), matching the planters and walls in the reference. The live soldier shadow reads the same values, and is drawn at 60% strength because at full strength it outweighs the soldier.

## Second stage: what departs from IMPLEMENTATION.md, and why

Each entry names the guide's suggestion, what was built instead, and the reason.

- **Map files are JSON placements, with half the map written.** The guide asks for a kit-of-parts format with a typed registry. The registry is `src/shared/kit.ts`; a map (`src/shared/maps/*.json`) lists placements `{p, x, y, r}` and, with `symmetry: "halfTurn"`, only half of them: the loader adds each piece's twin turned about the centre, red spawns become blue ones, and DOM's third zone is A's twin. A versus map is fair by construction, and the editor only ever edits one half.
- **First drafts come from a block plan.** `scripts/maps/plan.ts` turns a character grid (container stacks, crate piles, roofed rooms with doors, walls, props) into packed placements, varied by a hash of position so a plan fills the same way every run. Hand placement came out far sparser than the references; the plan reaches their density in a few lines. The draft is a starting point; the editor owns the JSON after it.
- **Fuel barrels chain through a short fuse.** A round that breaks a fuel barrel sets it off at once; a blast that breaks one lights a 160 ms fuse first, so a row of barrels goes up one after another instead of in a single frame. Fuses and burning fuel are `Thrown` kinds, so they reach clients through the existing snapshot path.
- **The train runs on absolute server time.** Its arrivals are `run × everyMs` plus a hashed delay per run, so the sim and every client compute the same position from the server clock alone, with nothing on the wire and no map-start time to sync. A map whose runs cannot fit their timetable fails to load.
- **The view is 600, picked from the references rather than from play.** The guide asks to play a greybox at two or three scales. Its own two measures of "25 to 30 soldier widths across" disagree (48-unit bodies put the band at 600 to 720; its "about 45 today" at 900 puts it at 500 to 600), and 600 is the one value inside both. Bots and the balance model were then tuned at 600; screenshots beside the references check the framing.
- **Gun balance moved with the camera, and the doctrine moved with it.** Ranges and the gunscore bands shrank by 2/3, bullet speeds stayed (so a strafing target needs the same lead angle). Soldiers are bigger against the distances they fight over, so aimed kills got quicker: about 1.0x at close range, 0.8x at mid, 0.7x at long, measured with `scripts/gun-audit.ts` against the old roster. The doctrine's kill-time floors follow that measured ratio rather than holding the old seconds; the class-relative rules (band owners, upgrade ladders, hipfire) are unchanged and nineteen guns were retuned on spread, fire rate or reload to meet them, with no damage or breakpoint changes. Assault comes out a little stronger at mid and long range; classes keep their order.
- **Bot fight bands are fractions of gun range.** They were pixel numbers tuned to the old ranges, so they now follow any future gun retune.
- **Soldier: gun stays its own sprite; legs at 16 facings; armour baked once per facing.** Baking 42 guns into every torso frame would not fit and shot prediction reads `GUN_PARTS`. Legs are small and mostly under the torso, so 16 facings halve their bytes. Armour rides only the spine, which no torso frame moves, so it is baked once per facing (saving about 1 MB). Recoil and reload move only arms and head. The rig is a Blender armature posed from data in Python (two-bone IK solved in Python, deterministic). Characters write their shear into vertices because Blender drops shear set on an object matrix; older sheared bakes carry a partial shear until they are rebaked.
- **Bodies and dropped guns.** Downed and dead sprites are lit from above, not sheared, and rotated by the painter; three death poses. Dropped guns are one per class (the class's base gun lying flat), cosmetic. Proposal, not built: make a dropped gun a pickup that swaps your gun for its class's base gun for the rest of the life, keeping your level, so a pickup is a tactical choice rather than a progression shortcut.
- **Zombies keep one frame each** with their own silhouettes (the brute a hunched, knuckle-dragging slab; the Colossus humped and spiked with one club arm). A shamble cycle would add about 384 frames; left for later.
- **Extraction rules.** Best of five rounds of 150 s; red attacks odd rounds. A 10 s uncontested hold of the terminal (progress holds, never decays, more attackers don't speed it) spawns the case; the carrier moves at 0.88 speed, can't use abilities and is always on the minimap; a dropped case returns on a defender's touch or after 20 s; the carrier on the pad wins, the clock wins for defenders; respawns come in 8 s waves. A 5 s break between rounds was added so the swap reads on screen. Vault's defender spawn sits away from the vault room after bot-only rounds showed defenders camping the circle.
- **Quality tiers.** Four tiers (low, medium, high, ultra) in one table; auto steps down on the 90th-percentile frame interval over 1.5 s passing 25 ms, climbs back after 20 s under 18 ms, never above high, and bars the tier it just left for a doubling interval so it can't bounce. Night lights, glows and bloom roll off through a knee instead of clipping. The thresholds assume a 60 Hz display.
- **The ground is a light layer times a tiling detail, not baked tiles.** The guide's per-tile ground bakes took hours and most of the download. Each map now gets one image at 0.5 px per unit (`art/blender/bake_light.py`, at most 4096 px a side): floor colour, paint and hazard marks, the sun shadows of every standing and overhead piece, contact darkening, grime under flat pieces and the non-pulsing lamp pools. The client multiplies a 512 px seamless grey detail over it, one repeat per 256 units with slab joints every 128, so the floor stays sharp at any zoom. The detail's mean is 0.86 and the build lifts the light layer by its inverse, so the product keeps the baked brightness. Concrete is the default; outpost lays asphalt (`MAP_FLOOR` in `art.ts`). Until the layer arrives, the plain floor and greybox tops show.
- **Flat pieces stay kit sprites.** Vents, grates, drains, the helipad, track, rubble, lamps and alarms are baked as kit sprites rather than painted into the light layer, which at 0.5 px per unit would blur them. The light layer only seats them with a smudge of grime or dust.
- **Breakable pieces cast no baked shadow.** A shadow baked into the floor would stay after the piece broke, so the client needs a live shadow for them. Unbreakable pieces cast, sheared about their tops like their sprites; roofs cast as open-bottom shells so hall lamps still light the floor inside.
- **Kit sprites leave room for their south face.** The contract's box is `footprint(w', h')`, but a 6-unit pad cannot hold the south face of a tall piece, so the south room grows with height (`ceil(0.3 × height) + 4`, at least the standard face). The client reads each box from `SPRITES` rather than recomputing it.
- **The kit loads with the atlases.** Its three pages load at start beside the core atlases, not per map, since every map draws from the same kit and the pages are small.
- **The train is lit and has a glow layer.** `train.loco.<turn>` and `train.car.<turn>` carry headlights and marker lamps in their glow layer; the car is a flatcar with a rust or grey container.
- **The light layer bakes each map's mood.** A map file's `light` picks day (warehouse, outpost) or dusk (vault: a low warm sun, a blue sky and lamps 1.4 times as bright). Lamp colours are pulled 60% toward white so hall pools read as light on grey concrete, not as tan floor.
- **Floor marks are a ring of sprites, not a floor render texture.** The guide suggests stamping scorch, blood and debris into a floor texture. Marks (`src/client/world/marks.ts`) are instead launch values in a fixed ring of 400: a new one takes the oldest slot, and the quality tier's `decals` budget (60 on low, 400 on ultra) draws only the newest, fading the oldest few out before they recycle. A ring costs one sprite per visible mark and nothing per frame when nothing happens, keeps marks sharp at any zoom, needs no texture memory sized to the map, and clears itself when the map changes. Marks sit in the decal layer, under every solid, so scorch lies on the floor and under cover.
- **Casings are marks too.** Each shot ejects one brass sprite (pistol and SMG small, rifles long, shotgun a red shell) to the shooter's right. They live in their own ring of 300 for 14 seconds, under the tier's `casings` budget (30 on low), so heavy fire on a low tier recycles them sooner rather than piling up draw calls. The old casing particle is gone.
- **A thrown mark is still a mark.** Planks from a crate, chunks off a concrete wall and casings fly along an eased arc, hop and spin, then rest where they land. Flight and rest both follow from the launch values, so drawing never changes a mark and the effect is the same at any frame rate.
- **The old staged crate sprites are gone.** `crate.<tier>.<stage>` and `build_crate` were unused since breakable crates became kit pieces, and their sizes failed the sprite check. Removing them changed `bake_sprites.py` and `props.py`, which feed the kit group's hash, so the kit group rebakes on its next run (the output is byte-identical; only the cache key moved).
- **Breaking reads by material.** A crate leaves a plank pile and throws 8 to 10 planks; a supply drop leaves dark scrap; a blast that reaches a concrete wall knocks off chunks and a small rubble heap. Rounds strike sparks on metal and concrete and only grit and splinters on wood, sandbags and planters, picked from the struck piece's kit material.
- **Fire is a flipbook, not drawn shapes.** Burning fuel (`scene.fires`, for as long as the server's fire `Thrown` lasts) and the static burning barrel draw several copies of an 8-frame baked flame, each at its own phase, with smoke puffs and embers rising off them; every glow goes through the existing knee, so bloom stays clamped. The flame is drawn twice, once tinted in the normal layer so it keeps its shape over a sunlit floor and once in the glow layer.
- **Night is a moonlit tenth of day, and lamps are live.** At full ZOM night the ambient light is (0.1, 0.12, 0.2) of day. What no lamp, fire, flash or tracer reaches is dark but readable as blue shapes. The map's own lamps (`lights` on kit pieces) now light the night pass too, pulsing where the kit says so; by day the baked pools carry them.
- **Breakable pieces get a flat live shadow.** The shadow pass draws each crate's foot and its copy cast along `ART.sun.shadow`, joined into one hull, and a capsule for barrels, as dark as the baked shadows. A worn crate's shadow shortens with its height, and a broken one casts nothing.
- **Tracers are orange for every gun.** The per-gun tracer tint read as noise in a firefight; the reference's rounds are all warm orange, and the gun now sets only the tracer's width.
- **Effects comparisons.** `progress/fx-day.webp` and `progress/fx-night.webp` are one fixed scene (a blast beside a barrier, a crate breaking, burning fuel, one flash per class) drawn by the old and new painters at the same ages; `progress/fx-zom-night.webp` and `progress/fx-ffa.webp` are live play, and `progress/fx-break.webp` is a crate breaking in FFA. The references hold no night shot, so night was judged against the guide's own words: real darkness lit by its sources, not a flat blue wash.
