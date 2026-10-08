# Implementation guide: the dockyard overhaul

This guide is for the agent who builds the next stage of Skirmish's overhaul. It assumes you know nothing about the project. Read it in full, then read the files under "Read first", then start.

## Goal

Make Skirmish play and look like the reference shots in `docs/art/gold/`. Players should be in close-quarters tactical fights through dense industrial maps, with cover that splinters, light that tells you where you are, and debris and bodies that record where fights happened.

The first overhaul, already merged, gave the game a PixiJS world renderer and Blender-baked art. It matched the reference's sun and shadows but fell short of its density, materials, effects and scale (see "Where we are" below). This stage closes that gap. Unlike the first stage, it may change maps, map scale and gameplay.

## The references

`docs/art/gold/` is the gold standard. `docs/art/gold-standard.webp` is the same image as `gold/yard.webp`; it stays because the bake tools compare against it.

| File | What to take from it |
|---|---|
| `warehouse.webp` | The core target. Dense crate stacks and containers, an overhead gantry casting long bar shadows, a forklift, lit interior bays, splintering crates and planks, brass everywhere. |
| `railyard.webp` | A train splitting the map, hazard-striped track edges, pulsing red warning lights, broken low walls with rubble, bold chevrons and lane paint. |
| `yard.webp` | Fire and smoke from barrels, a wall blown into rubble, the glowing objective core with a beam, water at the quay. |
| `match-end.webp` | World only: bodies in death poses, dropped guns, a floor covered in brass and scorch after a match. Ignore its UI panels. |
| `extraction.webp` | The extraction mode: a terminal to hack, a case to carry, a helicopter pad to reach. Interior rooms lit by lamps, red alarm lights throwing coloured light. Ignore its HUD styling, but keep the idea of objective markers in the world. |
| `loadout.webp` | World only: the armory room with props on walls and tables. Its loadout panel is a later project; see "Out of scope". |

These are AI concept images. Their shadows sometimes disagree, scale drifts, and they hold more props than a playable map can. Match their mood, palette, density and effects. Don't chase pixel parity.

## Scope

In scope:

- Maps: new layouts, a new map format built from a kit of parts, closer camera scale, and smaller or denser maps as the new scale needs.
- Gameplay that the references show:
  - overhead structures that fade when you walk under them
  - crates and barrels that break through stages, and explosive barrels
  - bodies that stay where players die, and guns dropped on death
  - lit interiors
  - a moving train on maps that have track
  - an extraction mode
- Gun, view radius and bot retuning for the new scale.
- Everything visual: characters, animation, lighting, effects, decals, materials.
- The fixes listed under "Known defects".

Out of scope, later projects:

- The loadout screen (classes, primary and secondary, gadget, perks) in `loadout.webp`.
- The match-end screen in `match-end.webp`.
- Menu redesign.
- Phones and touch.

The in-game HUD (health, ammo, leaderboard, kill feed, minimap, perk dock) keeps its layout and content. Restyle it only as far as it needs to sit well over the new look. Add HUD pieces only where a new mode needs them: extraction objectives, hack progress, an extraction marker.

## Read first

- `README.md`: how the project builds, tests, replays and deploys.
- `docs/art/README.md`: the first overhaul's decisions, measurements and what changed from its plan.
- `art/LOOK.md` and `art/SPRITES.md`: the bake look log and the sprite bake notes.
- `.claude/skills/verify/SKILL.md` and `features/`: how to drive the real game in headless Chrome for screenshots, frame time and feature checks.
- Code to know:
  - `src/shared/maps.ts` and `src/shared/maps/`: map definitions.
  - `src/shared/defs.ts`: `WORLD`, guns, modes.
  - `src/shared/sim/`: the authoritative sim. Read `modes.ts`, `combat.ts`, `royale.ts` and `run.ts` (zombies).
  - `src/server/bot/`: bots.
  - `src/client/world/`: the PixiJS renderer.
  - `src/client/render.ts`: the `drawWorld` seam.
  - `scripts/art/` and `art/blender/`: the art pipeline.
  - `scripts/gun-audit.ts`, `scripts/lib/gunscore.ts` and `test/balance-lint.test.ts`: gun balance doctrine.

## Where we are

The first overhaul was reviewed on 2026-10-07. What works:

- A PixiJS world behind `drawWorld`, with the HUD on a Canvas2D layer.
- Baked map tiles with long south-west shadows, and 32-facing baked soldiers.
- Per-gun camera kick, hitstop, hit points and directions on damage events, render-clock audio and sampled sounds.
- 60 fps at 1080p, at 1080p with 2x DPR, and with 125 zombies, on an Apple M1.
- About 4 MB downloaded for a first FFA game.

What falls short of the reference:

- Floors are clean and flat, with few markings, and the light is neutral where the reference is warm.
- Cover is thin slabs with little contact darkening and few props.
- Explosions are soft balls that blow out to white at night. There is no fire, embers, lingering smoke or rubble.
- Scorch marks are oversized black blots drawn over wall tops.
- Muzzle flashes and tracers are small and pale, and bullet impacts look like black scribbles.
- Nothing persists after a fight except decals that fade.
- Heavy armour darkens soldiers until their team colour is hard to read.
- Floor detail goes soft at 1440p.

### Known defects

Fix these early. They are cheap and visible.

1. Scorch decals draw over cover and are too big and too opaque.
2. Bloom has no clamp, so night explosions blow out to a banded white disc.
3. No quality tiers. The only control is `?bloom=0`. At 2560x1440 with 2x DPR and bloom on, two of three runs dropped up to 19% of frames.
4. WebGL2 is not enforced. Pixi falls back to WebGL1 or software GL. Without WebGL at all, Play still works and shows a HUD over nothing.
5. The menu waits for 1.6 MB of atlases before it appears, with no progress shown.
6. A ground tile that fails to load is re-requested every frame (`src/client/world/ground.ts`).
7. All 33 sounds download before play.
8. `npm run art` defaults to a Linux Blender path, doesn't document that it needs ffmpeg and network access, and never runs `art/blender/check_map.py`.
9. Dead leftovers from the old renderer, for example `PALETTE.outside`, `grid`, `contact` and `ARMOR_RIM` in `palette.ts`, and `zombieSprite`, `turretSprite` and `Marks`. `scripts/unused-exports.ts` lists them.
10. `README.md` pins only the Linux golden replay hash. On macOS the replay prints `319252850ebc67ffe01364750e40352bc851cda0186e6b74a11dcaa27c3553ba`.
11. Hitstop shifts the time the server judges your shots against (`viewAt` in `src/client/main.ts`). The owner has not decided whether to keep this. Leave it as is and flag it in your report.

## Architecture

The rendering choice stands: PixiJS v8 for the world, Canvas2D for the HUD, scripted Blender bakes for art. Everything below is direction, not a spec. Change any of it if evidence says so, and record why in `docs/art/README.md`.

### Maps built from a kit of parts

This is the central change. Whole-map bakes don't scale to the new detail. At the 2 to 2.5 px per world unit the references need, a whole map bakes to an estimated 10 to 25 MB.

- **The kit.** A catalog of modular pieces, each a Blender asset rendered from the shared camera and sun into atlas sprites:
  - wall runs, corners and ends
  - low walls and sandbag lines
  - shipping containers, crate stacks, single crates, pallets
  - barrels: plain and explosive
  - planters, vents, drains, grates
  - stairs, railings
  - gantries and overhead pipes
  - interior bays with lamps
  - a forklift
  - track, and a train
  - the objective props: terminal, case, helipad, core
- **Each piece's data:**
  - its sprite or sprites, including damage stages
  - its collision rects, in piece space
  - its height, which sets its shadow
  - whether it blocks bullets, blocks movement, or neither
  - whether it is overhead (it fades when a player stands under it)
  - its destructibility and hit points
  - its light sources (colour, radius, pulse)
- **The catalog is a typed registry in `src/shared/`.** The sim reads only collision and destructibility from it. The client reads everything.
- **A map is data.** It is a size plus a list of placed pieces (piece id, position, rotation by quarter turns) and the spawns, zones, crates and objective points the modes need. Collision rects come from the placements, so art and collision can't drift apart. Keep the existing rule: a piece's top face is its collision rect.
- **Rendering a map.**
  - PixiJS draws visible pieces from the shared atlas.
  - Under them goes one baked layer per map at low resolution: about 0.5 px per unit (an estimate; tune it). It holds the floor base colour, paint, stains, sun shadows, contact darkening and baked interior light pools, and it multiplies over a tiling floor texture.
  - A tiling floor detail texture keeps the floor sharp at any zoom.
  - Download cost then grows with the kit, not with the number of maps.
- **Authoring.** The owner will lay out maps, so give them an editor. Two options:
  - The free Tiled editor, with an importer script.
  - A small in-browser editor under `?dev`.

  Pick by trying both briefly. The map file format is whatever the editor saves, converted at build time into the typed `MapDef`.
- **Existing modes keep working.** FFA, TDM, DOM, Last Squad (`BR`, with its ring, 100 scattered crates and edge spawns) and Zombies (`ZOM`, with buildings placed at runtime) must all run on the new maps. Port or replace the current maps (Causeway, Plaza, Oldtown, Quarry, Outpost); you choose which.

### Scale

- The references frame about 25 to 30 soldier-widths across the screen. Today it is about 45 (`WORLD.viewRadius` 900, `WORLD.playerRadius` 24).
- Pick the new view radius by playing a greybox map with bots at two or three candidate scales before any art.
- Then retune together:
  - view radius
  - gun ranges and the band doctrine in `scripts/lib/gunscore.ts`
  - map sizes for 18-player rooms
  - bot sight and aim
  - Last Squad's ring table

  `node scripts/gun-audit.ts` and `test/balance-lint.test.ts` encode the balance rules. Update the doctrine bands to the new scale rather than deleting rules.
- Server culling, the camera and bot sight share one view box ("nobody is hit from off screen", `src/shared/protocol.ts`). Keep that invariant at the new size.

### Characters

- **One rigged soldier model.** Animations: idle, run, aim, fire recoil, reload, downed and death.
- **Baking.** Bake to 32 facings, as now, with enough run frames to read as running (8 is a starting guess). Keep team colour as a mask tinted in code. Armour must not swallow the team hue.
- **Gear.** Gun models still match `GUN_PARTS` in `src/client/sprites.ts`, which feeds shot prediction. `scripts/art/check-sprites.ts` keeps them aligned.
- **Bodies.** A death-pose sprite that stays on the floor. Cap the count and fade the oldest.
- **Dropped guns.** A world prop. Start cosmetic. Making them pickups is a gameplay design question; propose it, don't build it.
- **Zombies.** Rebake them in the same style. Brutes and the Colossus need their own silhouettes.

### Light

- **Baked.** Sun shadows, contact darkening, and interior lamp pools all go in the per-map light layer.
- **Live.** Additive light sprites for:
  - muzzle flashes
  - explosions and fire
  - pulsing warning lights
  - the objective core and its beam
  - alarm lights during extraction

  No shadow-casting dynamic lights are needed.
- **Grading.** One colour grade for the whole world: warm key, cool shadow, saturated hazard yellow. Night in Zombies becomes real darkness lit by these sources, not a flat blue wash.

### Effects

Build these to read as well as the references, inside the frame budget:

- Muzzle flashes per gun class. Tracers as warm orange streaks.
- Casings that land and stay for a while. Spark bursts on metal, chips and dust on concrete.
- Crates that break through stages into flying planks and a plank pile that stays.
- Walls hit by explosives that shed chunks into rubble decals.
- Explosions as a fireball flipbook with embers and a smoke column that lingers 2 to 3 seconds. Clamp bloom so they never blow out to white.
- Burning barrels with looping fire and smoke.
- Scorch marks as brown, cracked-edge decals smaller than the blast, under cover, never on top of it.
- Floor decals (scorch, blood, rubble, planks, brass) that accumulate per match within a fixed budget.

### Gameplay additions

These all change the sim. Add them one at a time, each with tests.

- **Overhead fade.** Overhead pieces and roofs fade to show players under them. This is client-only. The sim already ignores overhead pieces.
- **Destructible crates and barrels.**
  - Crates already exist in the sim. Extend them to placed kit pieces with damage stages.
  - Explosive barrels chain-react through the existing blast code.
  - Fire leaves a burning area that damages over time, as gas does now.
- **Moving train.** A scripted moving obstacle on a fixed path and timetable, with a warning (lights and sound) before it arrives. It blocks movement and bullets while present. Being hit by it kills. It must be deterministic from the match seed.
- **Extraction mode.** A new mode in `MODES`, added the way Last Squad was. A sketch:
  - two teams
  - one team hacks a terminal (hold an area for N seconds), carries a data case, and reaches the extraction pad
  - the other team defends
  - rounds swap sides

  Design the rules, write them into `src/shared/defs.ts` and the mode table, and give bots objective behaviour. Keep it small and fun first, and say what you chose and why.

## Budgets and quality bar

- **Frame rate.** 60 fps on an Apple M1 at 2560x1440 with 2x DPR in the busiest scene of each mode, with effects on. Quality tiers set render scale, bloom, particle and decal caps, and light-sprite count. They step down automatically when frame time climbs, and can be set by hand in settings. Report frame interval percentiles, not only JS cost.
- **First download.** Under 8 MB before the first game frame; aim lower. The menu shows before the art finishes loading, with progress. Load sounds lazily.
- **GPU memory.** Under 300 MB at 1440p with 2x DPR. Use KTX2/Basis if atlases push past it.
- **Readability.**
  - You can tell teams apart at a glance in TDM, DOM and extraction.
  - Props that don't block read as decoration, and props that block read as cover.
  - The HUD stays legible over every floor.
- **Look.** Screenshots of each mode beside the matching reference. Judge mood, palette, density, materials and effects.

## Working rules

- **Git and deploys.** Work on a branch. Commit in small steps that each pass `npx tsc --noEmit` and `npm test`. Merge to master only when the whole thing works end to end. Never force-push. Never deploy without the owner's explicit OK.
- **Golden replay.** `node scripts/golden-replay.ts <hash>` will change, because maps and gameplay change. Re-pin both the Linux and macOS hashes in `README.md`, each time with a sentence on why. Keep the sim deterministic, and keep `test/zombies-determinism.test.ts` passing.
- **Verify skill.** Prove every milestone in the real game with `.claude/skills/verify/`. Extend its scripts and feature files for new maps, the editor and extraction mode. Every test browser must be muted (`--mute-audio`, or `localStorage skirmish.muted=1`); the owner plays their own music.
- **Machine and data.** Never touch `data/`, the deployed site, or processes you didn't start. Other agents run heavy jobs on this machine, so expect timing noise and report load with measurements.
- **Commits.** Commit before any mutation testing, and never `git checkout` a file that holds an uncommitted fix.
- **Decision log.** Append to `decisions.tsv` and `todo.md`; both are gitignored.
- **Art.** Rebuild with `npm run art`. Blender is installed at `/Applications/Blender.app`, and as `blender` on PATH (version 5.2.2). Commit the outputs under `public/assets/`.

## Suggested order

Each step ends with screenshots, measurements and a commit.

1. Fix the known defects. Add quality tiers and the loading flow.
2. Build a greybox kit and one greybox map in the new format. Choose the scale by playing it with bots, then retune guns, view and bots. Choose the map editor.
3. Build the art kit for one map in the warehouse style: containers, crate stacks, walls, gantry, forklift, interior bay. Add the per-map light layer and the floor detail texture. Get that map to look like `warehouse.webp`.
4. Rig and bake the soldier, then add bodies and dropped guns.
5. Effects pass: fire, smoke, crate breaks, rubble, brass, sparks, scorch, bloom clamp.
6. Destructible kit pieces and explosive barrels. Overhead fade.
7. Port all modes onto new maps. Build the railyard map with the train.
8. Extraction mode on an extraction map.
9. Remaining maps. Run a final performance and readability pass across every mode.

## When you finish

Report:

- screenshots of every mode beside the matching reference
- frame interval percentiles and first-download size
- the scale you chose and how gun balance moved
- what you changed from this guide, and why
- anything left open, including your view on hitstop and `viewAt`
