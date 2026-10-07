# Art direction and the visual overhaul

`gold-standard.webp` is the art reference for Skirmish (set 2026-10-07; it replaces the earlier minimalist reference). When the game's look and the image disagree, the image wins, as long as gameplay stays readable.

## Scope

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
