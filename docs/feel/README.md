# Feel

This stage gives Skirmish soldiers and guns that move like the ones in the references, hits that land on both ends, deaths that leave a body, and five combat mechanics. [IMPLEMENTATION.md](IMPLEMENTATION.md) is the brief. Sound has its own page, [sound.md](sound.md). The models, their frames and the bake's checks are in [art/SPRITES.md](../../art/SPRITES.md).

## Models

Everything is built in script with Blender and baked to sprites, as before.

- **Soldier.** Four designs were baked at game scale beside the reference soldiers (`shots/soldier-variants.webp`). Design A ("plate") won: rounded team pauldrons and chest shell, a glossy helmet with a stripe, armour in three tiers. It is rigged with a bone table and two-bone arms, and every pose is a table of targets. The bake fails when a held hand misses its grip by more than 2 px.
- **Guns.** All 42 guns have a real model, baked in three frames over one box: body, magazine and action (`shots/guns.webp`). The painter hides the magazine between the reload's magazine-out and magazine-in beats and slides a pump or bolt after each shot. A dropped gun is the same frames.
- **Zombies.** The six kinds were lifted to the soldier's look, with hunched reaching poses, torn clothes and a mark per kind (`shots/zombies.webp`). Their night eyes now sit on the model's eyes, and the bake checks it.
- **Low cover.** Barriers, sandbags and broken walls show three wear stages (`shots/cover-wear.webp`).

**How far scripted modelling got.** At game scale (a soldier is about 50 px across) the soldier, guns and zombies now read as the reference's kind of object: team colour on the shoulders and chest, a dark helmet, a gun held by two visible hands, a body that lies where it fell. It stopped improving at form detail. Bodies are still smooth capsules and spheres, with no cloth folds, straps that wrap, or sculpted muscle, so close crops look like toys beside the painted references. More primitives stopped paying off below about 2 px. The next step up is sculpted or photo-sourced meshes, not more script.

## Animation set

| Animation | Frames | Facings | Notes |
|---|---|---|---|
| Aim, and breathing when still | 1 + 1 | 32 | breath shows for 45% of a 1.7 s cycle, offset per player |
| Recoil, light and heavy | 2 each | 32 | heavy for guns whose damage x pellets passes 36 |
| Reload: pistol, magazine, pump, box | 6 each | 16 | frames turn on the same beats as the sounds (`RELOAD_FRAMES`, `RELOAD_BEATS` in `src/client/reload.ts`) |
| Run, strafe, backpedal, dash | 8, 8, the run reversed, 3 | 16 | legs follow movement against aim: run within 60 degrees, strafe 60 to 120, backpedal beyond |
| Flinch, front and back | 2 each | 16 | picked from the round's direction against facing |
| Throw, knife | 3 each | 16 | |
| Death: forward, back, spin | 6 each | 1, turned | ends on the lying body |
| Downed crawl, reviving | 4 each | 1, turned | Last Squad |

Procedural motion on top: a lean into the run and a bob on each footfall, a 3.2 unit jolt along the round on a hit, a 3% squash on a heavy gun's kick, a sideways sway while staggered, and dust on sharp turns and at the end of a dash. Head lag was left out, because the head is baked into the torso.

## Hits, deaths and feedback

- **Flinch.** Every hit jolts the target along the round for 200 ms, plays its flinch frames and flashes.
- **Impacts by material.** Metal sparks, concrete chips and dust, wood splinters, sandbag grit, blood out the far side of a body. Armour throws plate sparks and grey chips, and heavy armour shows less blood. Each leaves its floor mark, and chips and planks bounce.
- **Deaths that stay.** The fall is picked from the killing blow: from in front the body is thrown back, from behind it folds forward, and a blast spins it. The body stays 25 s and the newest 24 are kept. The gun skids off along the blow and lies beside it.
- **Kill confirm.** Your own kill punches the camera 3% for 120 ms, flashes the victim white and plays the thump and confirm tone.
- **Brass.** Casings and red shotgun shells bounce, settle and stay within the decal budget.
- **Tracers and flashes.** Tracers are thicker and warmer, muzzle flashes bigger, and heavy guns leave smoke at the muzzle.
- **Near misses.** A round passing close plays a whizz and smears the screen edge on its side.
- **Suppression.** The screen edges close in, dark, as your suppression rises.
- **Reticle.** It draws the sim's own spread, with moving spread, bloom, flinch and suppression. It turns gold when your target sits in your gun's best band (`src/shared/bands.ts`) and keeps the reload ring.

The moments, caught in a real match by the verify recipe `moments.ts`, are in `shots/moments.webp`: a hit reaction, a fall, the body 2.5 s later, a reload, a close shotgun blast and a suppressed view. The modes before and after are in `shots/modes-before-after.webp` (before left).

## Budgets

**First download.** 7610 KB reach the first game frame, against 5054 KB before and an 8 MB budget (`loading.ts`, load 0.9). The sprite atlas grew from three 2048 px pages (2.9 MB) to five and a half (5.3 MB). Transient actions use 16 facings to hold that down. The reload, flinch, throw and knife frames are still half the atlas.

**GPU memory.** The sprite atlas now takes about 88 MB as RGBA against 48 MB before, and the kit 48 MB as before. That is more than the third the brief allows before moving to KTX2. KTX2 was not done. Neither a Basis encoder nor KTX tools are on this machine, and adding one is a new build dependency to choose deliberately. The download stays under budget. It is the first open item.

**Frame time.** CPU draw cost per frame (headless Chrome, 1920x1080, two runs each, before then after, load 1.5 to 5):

| tier | before p50 | after p50 | before p95 | after p95 |
|---|---|---|---|---|
| low | 4.8, 3.8 ms | 4.8, 5.8 ms | 7.6, 6.1 ms | 7.6, 8.7 ms |
| high | 6.2, 8.0 ms | 3.7, 6.5 ms | 14.6, 14.0 ms | 6.2, 14.0 ms |

No change stands out from the noise. These numbers are CPU only: this machine renders in software, so its frame interval (50 to 420 ms) says nothing about a GPU. The 2560x1440 at 2x numbers on the owner's Mac (`gpu-matrix.sh`) are still to be taken.

**Sim cost.** See "Sim cost" under the combat mechanics below.

## Departures from the guide

- Bodies stay 25 s and the newest 24, not the rest of the match. Long rounds would otherwise bury the floor.
- Dropped guns are drawn with the body and fade with it. They are not pickups, as the guide allows.
- Transient actions are baked at 16 facings and the aim torso at 32, to hold the atlas down.
- Backpedal plays the run backwards facing the aim rather than a cycle of its own.
- Head lag on fast turns was left out (see "Animation set").
- KTX2 was not adopted (see "Budgets").
- Cover keeps its full collision until it breaks. The art wears down in three stages, but collision never opens a gap (see "Cover that wears down").
- The near-miss and suppression blur are stacked translucent bands, not a blur pass, the same technique as the hurt vignette.
- The macOS golden replay hash was not re-pinned. It needs the owner's Mac.

## Open

- KTX2 atlases, if integrated GPUs struggle with the larger atlas.
- Frame time on the owner's Mac at 2560x1440 and 2x DPR, per tier, with `gpu-matrix.sh`.
- The macOS golden replay hash.
- Zombie night eyes are each drawn 0.7 of the radius wide and now sit close enough to merge into one glow at night. Shrinking them to about 0.45 would show a pair.
- Roofs still cover much of the frame when you spawn under them (see the FFA shot).

## Combat mechanics

Five mechanics make a hit land on both sides of the fight: knockback, stagger, flinch, suppression and low cover that wears down. They live in the authoritative sim (`src/shared/sim/`). They draw on `rand(w)` only, so a seed still replays exactly. Every tuning number sits in the `FEEL` table in `src/shared/defs.ts`, each with its reason beside it. `node scripts/feel-sweep.ts flinch.spreadAdd=0.4 ...` prints the doctrine breaches and the class kill matrix for other values without editing that table.

### Values and why

**Knockback.** A gun's landed round pushes its victim along the round's flight by `perDamage[class] x damage`. The push falls off in a straight line to `farMul` 0.2 of that at the end of the gun's range. It plays out over `ms` 120 as a velocity on top of walking. It slides through the same collision as walking, so it never puts a body into or through a solid. Stacked hits fold into one push capped at `maxPx` 48.

| class | px per damage | close full blast or round |
| --- | --- | --- |
| shotgun | 0.32 | 136 damage, about 43px, so the cap sets it |
| pistol | 0.15 | hand cannon 66 damage, about 10px |
| sniper | 0.12 | bolt-action 135 damage, about 16px |
| assault | 0.08 | 17 damage, about 1.4px a round |
| lmg | 0.06 | 15 damage, about 0.9px a round |
| smg | 0 | none, so spraying stays a tracking duel |

Knockback rides on `SelfView.shove`, and `src/client/predict.ts` replays it, so your own pushed position does not snap. A client corrects once, by less than the snap distance, on the tick it first hears of a hit; after that it matches the server exactly.

**Stagger.** A heavy hit slows its target's walk to `speedMul` 0.5 for `ms` 200. A dash is never slowed. The hit counts as heavy at `damage` 60 raw damage from one attacker in one tick, so a shotgun's pellets count as one blast. Every sniper round, the hand cannon line, slugs and a close shotgun blast with half its pellets on target pass that mark. No new stagger lands within `immuneMs` 800 of one starting, so a target walks at full speed at least three quarters of the time whatever hits it. A test lands a heavy hit every tick for four seconds and finds the target staggered at most a quarter of the time, with a full-pace stretch of at least 600ms after every stagger. Stagger rides on `SelfView.stagger` for prediction and on `PlayerView.staggered` for others to see.

**Flinch.** A hit widens its victim's spread. A hit taking `fullAt` 0.25 of the victim's health flinches fully, and smaller hits add their share. A full flinch adds `spreadAdd` 0.3 of the spread and drains in a straight line over `ms` 450. Values of 0.4 and 0.5 broke the doctrine: Artillery's hip-fire reached into SMG range, and the Ripper upgrade lost its edge at 70px.

**Suppression.** An enemy round passing within `px` 48 of a body without hitting it adds `perPassMs` 300 to a level that drains over `ms` 1500. Five close rounds suppress fully. A full level adds `spreadAdd` 0.3 of the spread. Friendly rounds, lobbed rounds and the round that hits never suppress. The victim alone is sent `{ e: 'whizz', victim, x, y, dir }`, at most once every `whizzGapMs` 333.

**Flinch and suppression together** add at most `shakenMaxAdd` 0.8 of the spread, so a shaken shooter still hits up close. `spreadFor` in `src/shared/sim/stats.ts` is the one spread function, covering moving, bloom, flinch and suppression. The server fires with it, and `SelfView` carries `spray`, `flinch` and `suppression` so the client can draw the same cone.

**Cover that wears down.** Barriers (`lowwall`), sandbags and broken walls lose health through three stages like crates and break at the end. Tall walls, pillars, containers and buildings never break. Low cover is the piece a person crouches behind and expects to chip. A tall wall going would rewrite the map's lanes.

| piece | hp | why |
| --- | --- | --- |
| lowwall | 600 | about a rifle magazine, so it outlasts a duel over it and falls to a squad's sustained fire |
| wall.broken | 600 | the same concrete; no map places it yet |
| sandbags | 400 | two thirds of a rifle magazine; softer than concrete |

Broken cover stands again after `respawnMs` 90 seconds at full health, twice a crate's wait, so a broken lane stays open for most of a fight. It waits while a body stands in its footprint, so it never closes round anyone; that guard holds for every crate now. Last Squad keeps broken cover broken for the match. Cover scores nothing, holds no Last Squad loot, and no bot shoots it for score.

The collision choice: a worn piece keeps its full footprint until it breaks, then it is gone. A piece that shrank stage by stage would leave a body unsure whether a half-chipped barrier still covers its head. Full-or-gone reads at a glance and keeps the cover the art shows identical to the cover the sim uses. Map JSON is unchanged. Map lint passes.

### Bots

Bots take cover against suppression. At `PINNED` 0.6 suppression, a bot fighting in the open looks for a peek-and-hide spot against the threat in sight. With no threat in sight, it hides from where the rounds come from, back along their flight. A bot out on a peek ducks back early. A bot that rushes, or whose shooter is closer than its cornered distance, fights instead.

Bot aim reacts to flinch. The hand's wander grows by up to `flinchSigmaAdd` 1 of itself, and the aim jerks by about `flinchJoltRad` 4 degrees on the tick a hit lands. In a test the mean aim error grew 1.83 times under a full flinch.

Knockback does not pin bots. A bot's walk keeps steering through a shove. In the benches, bots spent 0.0 to 0.1% of their alive time shoved against a solid.

Bots stop using broken cover. Cover points remember the solid they stand beside, and points beside a broken piece drop out of every search until it stands again. A bot hiding behind a piece that breaks turns its peek into a straight fight, and a retreat or a reload finds new cover.

### Gun audit

`node scripts/gun-audit.ts` was saved before and after each mechanic under `docs/feel/audit/`. Every run had 0 doctrine breaches. The doctrine in `scripts/lib/gunscore.ts` now models a mirror duel. The target fires back with the same gun and hit chance, so the shooter flinches from its hits and is suppressed by its near misses. A standing shooter is knocked back and regains its ground over a second.

Median seconds for a person to kill a strafing person, stage 0, before and after:

| class | walking 70px | walking 200px | standing 400px | standing 600px |
| --- | --- | --- | --- | --- |
| pistol | 3.87 to 3.87 | 4.43 to 4.47 | 7.42 to 7.46 | out of range |
| smg | 2.14 to 2.16 | 4.16 to 4.61 | out of range | out of range |
| shotgun | 2.23 to 2.23 | 4.58 to 4.95 | out of range | out of range |
| assault | 2.67 to 2.67 | 3.24 to 3.37 | 5.42 to 5.82 | out of range |
| sniper | 3.15 to 3.15 | 6.79 to 6.79 | 4.85 to 4.86 | 7.22 to 7.22 |
| lmg | 2.54 to 2.62 | 3.98 to 5.03 | 4.51 to 4.76 | out of range |

The class order at each range holds. Fights at mid range got longer, because spray guns flinch and suppress each other in a mirror. The LMG at 200px moved most: its 100-round stream suppresses its mirror. Snipers barely moved, because one round settles their fight. Knockback (`1-knockback.txt`) moved the class medians by at most 0.03s, at 400px, where a standing shooter loses a little ground. Stagger (`2-stagger.txt`) moved nothing, since the audit's target strafes at a fixed pace. Flinch (`3-flinch.txt`) lengthened the spray guns' fights at 200px, by 0.51s for the LMG. Suppression (`4-suppression.txt`) added the rest, 0.37s for the shotgun and 0.54s for the LMG at 200px. Cover wear (`5-cover.txt`) left the audit unchanged.

### Bot matches

`scripts/bench-maps.ts` gained the share of fights the first hitter won, and a feel line: time staggered and the longest stagger, time shoved and shoved against a solid with the longest run, and time pinned with the share of it in cover. Before is the tree at `1f9c260`; after is `57a940a`. Each bench ran 18 bots for 10 minutes on 2 seeds over the rotation.

| mode | kills/min before | after | first hitter won before | after | life mean before | after |
| --- | --- | --- | --- | --- | --- | --- |
| FFA (Warehouse, Railyard) | 59.5, 58.0 | 56.7, 57.6 | 80.3% of 2348 | 81.7% of 2284 | 15.0s | 15.6s |
| TDM (3 maps) | 36.9, 36.2, 44.4 | 36.8, 34.5, 43.3 | 84.3% of 2345 | 84.4% of 2288 | 24.0s | 24.6s |
| DOM (2 maps) | 29.4, 35.2 | 29.4, 33.4 | 78.9% of 1292 | 81.9% of 1256 | 27.4s | 28.0s |

Feel lines after, all maps:

| mode | staggered | longest | shoved | against a solid | longest | pinned of fighting time | in cover while pinned |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FFA | 0.2% | 233ms | 2.5% | 0.1% | 633ms | 2.8% | 12.3% |
| TDM | 0.2% | 233ms | 1.6% | 0.0% | 367ms | 2.6% | 13.1% |
| DOM | 0.2% | 233ms | 1.3% | 0.0% | 367ms | 3.1% | 8.0% |

No stun locks: the longest stagger is 233ms, the 200ms slow rounded up to whole ticks. No corner pins: shoved against a solid is at most 0.1% of alive time. The longest run, 633ms, is a stream of small rifle pushes against a wall, which slide and do not hold (inferred from the per-round sizes, not traced). Who-shoots-first did not turn into a lottery. The first hitter won 80 to 84% before and 82 to 84% after, within about 3 points in every mode. Lives and kill rates moved by a few percent.

Last Squad (`bench-royale`, 8 matches over 4 seeds): every match had a winner before and after, with a median of 5.03 then 5.02 minutes. Ring deaths were 1% then 0%, and the last fight fell in the last two phases in 7 of 8 matches both times. Zombies (`bench-zombies`, seeds 1 to 3): the runs replayed identically, falling on nights 8, 9 and 8 with the same core loss. Zombies never fire, and no zombie map places low cover.

### Sim cost

The two trees were timed interleaved, base then new four times, each a 3 minute FFA on Warehouse with 18 bots and seed 1. The machine was quiet, with a 1 minute load of 1.0 to 1.6.

| round | load | step p50 base | new | step p95 base | new | bot think mean base | new |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.57, 1.29 | 0.34ms | 0.31ms | 1.07ms | 1.10ms | 1.05ms | 1.16ms |
| 2 | 1.19, 1.19 | 0.34ms | 0.30ms | 1.08ms | 1.09ms | 1.01ms | 1.16ms |
| 3 | 1.19, 1.10 | 0.35ms | 0.32ms | 1.07ms | 1.16ms | 1.00ms | 1.17ms |
| 4 | 1.05, 1.02 | 0.39ms | 0.37ms | 1.24ms | 1.32ms | 1.12ms | 1.26ms |

The sim step did not get measurably dearer. Its median fell by about 0.03ms and its p95 rose by 0.01 to 0.09ms. Bot thinking rose by about 0.14ms a tick (13%), about 0.4% of the 33.3ms tick budget. Building the 18 snapshots of one world costs the same in both trees (75 to 82us a tick, measured on an identical world), so the snapshot's new fields are not the cause. The rise most likely comes from how bots now play. They take cover when pinned and leave broken cover, so they search for cover more often (inferred from a CPU profile, where cover search and perception grew while no new function stood out). The full benches above ran at 1 minute loads of 2 to 13 against 1.4 to 10 before, so their timings are not compared.
