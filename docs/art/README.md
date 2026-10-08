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
