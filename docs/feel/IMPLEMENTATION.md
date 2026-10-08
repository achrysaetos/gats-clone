# Implementation guide: feel, models and combat mechanics

This guide is for the agent who builds the next stage of Skirmish. It assumes no prior context. Read it in full, then the files under "Read first", then start.

## Goal

Make every shot, hit and kill in Skirmish satisfying. The owner's frame is that three layers work together:

- **Animations and effects** make an action *feel* satisfying.
- **Mechanics and physics** make it *behave* satisfyingly.
- **Combat and level design** make it *matter*.

A good shotgun blast shows all of it inside a fraction of a second:

1. The click fires at once.
2. The gun kicks back and the soldier reacts.
3. A muzzle flash, a smoke puff, an ejected shell and a fan of pellet trails appear.
4. A heavy blast sounds, then the pump.
5. The target flinches, cover shatters and debris scatters.
6. The target is knocked back, which opens an opportunity.

Today Skirmish does steps 1 to 4 passably on the shooter's side. It barely does steps 5 and 6. Hit targets don't react, nobody stays dead, and hits carry no physical consequence. Close that gap, and raise the soldiers and guns from blobs and boxes to models that read at a glance.

## Scope

In scope:

- **Models.** Better soldier and gun models, built in script in Blender. See how far script can go. An AI-generated soldier may replace the scripted one later, so build for that swap ("Model swap contract" below).
- **Animation.** A full animation set, baked to sprites.
- **Game feel.** Handling, recoil, reload, an honest reticle, weight per gun, footsteps and movement cues.
- **Feedback.** Hit reactions, deaths and bodies, dropped guns, kill confirm, material-aware impacts, brass, near misses, layered sound.
- **New combat mechanics, all approved by the owner as gameplay changes:**
  - knockback
  - stagger
  - flinch
  - suppression
  - cover that wears down

  Balance each one.

Out of scope:

- A feel-lab sandbox. Tune in normal play with bots, and with the verify skill.
- New modes and new maps. Map layout changes too, except cover pieces that gain damage stages.
- Menus, the loadout screen and the match-end screen.
- Phones and touch.

The HUD keeps its layout. Add HUD pieces only where this guide asks: the reticle, reload progress, near-miss and suppression cues.

## Read first

- `README.md`: build, test, golden replay, deploy.
- `docs/art/README.md`: the art direction and every recorded departure from earlier plans.
- `docs/art/IMPLEMENTATION.md`: the previous stage's guide. Its working rules still apply.
- `art/SPRITES.md`: how sprites, the rig and the soldier bake work today, with timings and lessons.
- `docs/art/gold/`: the reference shots. Soldiers there are chunky armoured figures with clear team colour.
- `.claude/skills/verify/SKILL.md` and `features/`: how to drive the real game.
- Code:
  - `art/blender/sprites/rig.py`, `soldier.py`, `guns.py`, `fx.py`, `zombies.py`: the models.
  - `src/client/world/catalog.ts`: sprite catalog and the `SOLDIER` frame layout.
  - `src/client/world/stage.ts`, `scene.ts`, `marks.ts`: drawing.
  - `src/client/sprites.ts`: `GUN_PARTS`, which feeds shot prediction through `muzzleTip`.
  - `src/client/shake.ts`, `hitstop.ts`, `sfx.ts`, `samples.ts`, `audio.ts`: feel and sound.
  - `src/shared/sim/combat.ts`, `stats.ts`, `movement.ts`: damage, spread, movement.
  - `src/shared/defs.ts`: guns, armour, `WORLD`.
  - `src/shared/kit.ts`: map pieces, each with a `material`.
  - `scripts/gun-audit.ts`, `scripts/lib/gunscore.ts`, `test/balance-lint.test.ts`: the balance doctrine.

## Where things stand (reviewed 2026-10-08)

- **Soldier.** One rig (`rig.py`) built from a bone table. Rigid mesh parts ride the bones. Poses are data: hand and foot targets in model space, solved with two-bone IK, plus forward rotations for hips, spine and head.
  - Baked frames: torso at 32 facings (aim, 2 recoil, 6 reload), legs at 16 (stand, 8-frame run), one downed pose, 3 death poses.
  - Review verdict: blobby and low-detail, about two-thirds the size of the reference soldiers.
- **Guns.** Built from the `GUN_PARTS` rectangles by `guns.py` (66 lines): one sprite per gun, no moving parts. They read as boxes.
- **Feel already in place:**
  - per-gun camera kick (`KICK_PX`, 2.5 to 12 px)
  - hitstop: 40 ms on hits, 80 ms on kills
  - muzzle flash frames per class, casing frames per class
  - sampled sounds
  - damage events carrying the hit point and the round's direction (`hit` on `dmg`, `dir` on `impact`)
- **Gaps:**
  - The `soldier.dead` and `drop.<class>` sprites are baked but never drawn. A death leaves only a blood mark.
  - The reload frames are baked but never shown. `drawBody` picks only aim or recoil.
  - Tracers are thin and pale, brass is sparse, sparks are hard to see.
  - Hit targets don't react.
  - Armour is a damage fraction (`ARMORS.blockFrac`) with no visible state.
- **Performance.** At 2560x1440 with 2x DPR on an Apple M1, the high tier drops 52 to 62% of frames and uses about 540 MB of GPU memory. The cause is GPU fill, likely a full-resolution half-float glow target (112 MB). Only the low tier holds 60 fps. This stage adds many frames to the atlas, so it must not make that worse; see "Budgets".

## Models

### Soldier, built in script

Push the scripted soldier as far as it will go, and record how far that is.

- **Design for about 60 px across on screen.** That is the soldier's size at the 600 view radius on a 1600 px-wide screen. Detail reads only as big shapes:
  - a helmet with a visor
  - large shoulder plates and a chest rig
  - a backpack
  - visible boots at the run's far frames
- **Team colour on large panels:** shoulders, backpack, a helmet stripe. Armour tiers add plates on top and must never cover the team panels.
- **Proportions.** Use the reference shots, not a realistic human. Chunky, slightly heroic, readable from straight above under the low sun.
- **Exploring options.** Use bevels, booleans, modifiers and simple procedural surface detail (panel seams, straps, pouches). Bake 3 or 4 design variants of a single facing beside the reference soldiers at game scale (`scripts/art/contact-sheet.ts` makes side-by-sides). Pick the strongest, and record in `art/SPRITES.md` why it won.
- **Zombies.** They share the rig. Lift them in the same pass, so they don't look worse than soldiers.

### Guns, built in script

- **One real model per gun.** Not boxes. Each class must read at a glance:
  - pistol
  - compact SMG
  - assault rifle with magazine and optic
  - pump shotgun
  - long sniper with scope
  - LMG with box magazine and bipod
- **Evolutions show.** Each one adds a visible attachment or change: suppressor, drum magazine, bigger scope, heavier barrel.
- **Moving parts.** Magazine, pump slide and bolt are separate sprites, so animations can move them.
- **The muzzle stays tied to `GUN_PARTS`.** `scripts/art/check-sprites.ts` must keep passing (barrel end within 1.5 px of the muzzle point), so shot prediction stays right. Change `GUN_PARTS` only if gameplay needs it, and say why.
- **Dropped guns.** The same models, lying on the floor.

### Model swap contract

The scripted soldier may later be replaced with one from an AI 3D generator. Keep the swap to a body swap, not an animation redo:

1. **Animations are data.** Every pose is hand and foot targets in model space plus joint rotations, as now. Never hand-placed geometry, and never per-model tweaks.
2. **Fixed footprint and scale.** The collision circle, the gun grip points (x 12.5 and 21.5 today) and the overall height are fixed. A model is scaled to fit them.
3. **Separate layers by name.** Body, team panels and each armour tier are separate layers, so a new mesh only has to say which of its parts is which.
4. **Stable names.** Bone names and the `SOLDIER` frame layout stay stable. The game and the bake key on them.
5. **A check enforces it.** The bake fails if a pose's hands end more than 2 px from the gun grip, the way `check-sprites.ts` checks muzzles.

Record the contract in `art/SPRITES.md`.

## Animation set

Bake as flipbooks. Short transient animations may use 16 facings to save atlas space. Frame counts below are starting guesses.

| Animation | Frames | Notes |
|---|---|---|
| Aim idle with breathing | 2 | Played when the soldier stands still |
| Recoil, light and heavy | 2 to 3 each | SMG flutter, sniper and shotgun shove |
| Reload per family: magazine, pump, box, pistol | 6 to 8 each | The magazine drops and goes in, the pump slides |
| Run, strafe, backpedal | 8 each | Legs follow movement relative to aim |
| Hit flinch, front and back | 2 each | Picked from the round's direction against facing |
| Throw, knife, dash | 3 to 4 each | Abilities read as actions |
| Death: fall forward, fall back, spin | 5 to 6 each | Ends in a lying pose that stays as the body |
| Downed crawl and reviving | 4 each | Last Squad |

Add cheap procedural motion in code on top of the baked frames:

- lean into strafes
- a slight squash on recoil
- the head lagging the torso on fast turns
- a small step bob

Sync sound to frames: magazine-out, magazine-in and chamber sounds on the reload frames; footsteps on the run's contact frames.

## Game feel

- **An honest reticle.** It shows the real current spread from `spreadFor` in `src/shared/sim/stats.ts`, including moving spread and bloom. It tightens when you stop. It marks when your target distance is inside your gun's best band (`scripts/lib/gunscore.ts` defines the bands). It shows a reload progress ring.
- **Reload as a moment.** Animation, sounds on frames, the magazine visibly dropping. Reloading should read as a vulnerable window to everyone, not only to you.
- **Weight per gun.** Kick, recoil frames, flash size, smoke and sound layers scale with the gun. A heavy gun shoves, a light one flutters.
- **Footsteps.** Positioned in stereo, audible to others within a sensible radius, quieter when walking slowly if that state exists. You should hear a flanker before you see one.
- **Movement cues.** Movement stays instant start and stop; don't add acceleration. Add a dust puff on sharp direction changes and a skid and smear at the end of a dash.

## Feedback

- **Flinch.** On every hit, the target's sprite jolts a few pixels along the round's direction, plays its flinch frames, and flashes briefly.
- **Material-aware impacts.** Each kit piece has a `material` (`src/shared/kit.ts`), and impact events carry a point and direction. Use them:
  - metal: sparks and a ricochet whine
  - concrete: chips and dust
  - wood: splinters
  - flesh: blood
  - armour: blue sparks and a "tink"

  Each material leaves its own floor mark.
- **Armour reads.** Hits on an armoured target show plate sparks and small plate chips. Heavier armour sounds heavier.
- **Deaths that stay:**
  - Choose a death animation from the killing round's direction and the gun's weight.
  - Draw the body for the rest of the match, capped and fading oldest first.
  - The gun clatters away with a small bounce and a sound, and stays as a cosmetic prop.

  Make dropped guns pickups only if the owner asks.
- **Kill confirm.** For your own kills: a small camera punch (about 3% zoom for about 120 ms), a layered kill sound (thump, then a confirm tone), and a one-frame white flash on the victim.
- **Brass.** Casings bounce with a tinkle, settle and stay for the match within a budget. Shotgun shells are red.
- **Tracers and flashes.** Tracers become thicker warm orange streaks. Muzzle flashes get bigger and brighter, with a smoke puff on heavy guns. Compare against `docs/art/gold/warehouse.webp`.
- **Near misses.** Rounds passing close to you play a whizz and briefly blur the screen edge nearest the round.
- **Layered gunshots.** A sharp transient, a body and a tail. The tail echoes outdoors and stays short under roofs. Distant guns are filtered.
- **Shotgun showcase.** Treat the shotgun as the proof of this whole stage:
  - a big flash and a smoke puff
  - a fan of pellet tracers
  - a shell flipping out on the pump
  - the target flinching and knocked back
  - cover chips flying

## Combat mechanics

These change gameplay, and the owner has approved them. They live in the authoritative sim (`src/shared/sim/`), are deterministic, and are covered by tests.

- **Knockback.** A hit pushes the target along the round's direction, scaled by gun and range. Strongest for a close-range shotgun, small for rifles, none for the SMG. It respects walls; never push a player into or through a solid. Client prediction must account for it, so your own pushed position doesn't snap.
- **Stagger.** Heavy hits (sniper, hand cannon, close shotgun) slow the target for about 200 ms. Stagger doesn't stack into a stun lock.
- **Flinch.** Being hit widens your own spread briefly. The first player to land a hit gets an edge.
- **Suppression.** Enemy rounds passing within a short distance of you build suppression. It widens your spread and blurs your screen edges, then decays. It lets covering fire pin someone without hitting them.
- **Cover that wears down.** Sandbags, low walls and other low cover pieces lose chunks through damage stages, the way crates already do. Decide per piece which can wear down. Tall walls and buildings stay solid. A worn piece's collision may shrink or open a gap only if that stays readable; record the choice.

Balancing:

- Run `node scripts/gun-audit.ts` before and after each mechanic. Extend `scripts/lib/gunscore.ts` where needed so the doctrine models knockback, flinch and suppression. The class-relative rules in `test/balance-lint.test.ts` must still hold.
- Bots must cope:
  - they use cover against suppression
  - they don't get pinned against walls by knockback
  - their aim reacts to flinch the way a person's would
- Play matches with bots in every mode, and watch for stun locks, people pinned in corners, and fights that turn into who-shoots-first lotteries.
- Write the final tuning values and the reasons into `docs/art/README.md`, or a new `docs/feel/README.md` if that fits better.

## Budgets

- **Frame rate.** No regression on any quality tier.
  - The high tier at 2560x1440 with 2x DPR must not get worse than today.
  - The glow target is the likely cause of today's drops. If you fix it in passing (draw it at quarter resolution in RGBA8, for example), say so with measurements.
- **Atlas growth.** This stage adds many frames. Move atlases to KTX2/Basis GPU-compressed textures if GPU memory or download would otherwise grow by more than about a third. First download stays under 8 MB.
- **Sim cost.** The new mechanics must not measurably raise server tick time with 18 players and bots (`scripts/bench-royale.ts` and similar).
- **Readability.**
  - New effects must not hide players.
  - Bodies, brass and debris stay under live players and fade before they clutter.
  - Teams stay readable at a glance.

## Working rules

- **Git and deploys.** Work on a branch. Commit in small steps that each pass `npx tsc --noEmit` and `npm test`. Merge to master only when the whole stage works end to end. Never force-push. Never deploy without the owner's explicit OK.
- **Golden replay.** `node scripts/golden-replay.ts <hash>` will change, because the mechanics change the sim. Re-pin both the Linux and macOS hashes in `README.md` with a reason each time. Keep the sim deterministic.
- **Art.** Rebuild with `npm run art`. Blender 5.2 is installed (`blender` on PATH). Commit the outputs under `public/assets/`. Delete hashed outputs the manifest no longer names.
- **Verify skill.** Prove every step in the real game with `.claude/skills/verify/`. Extend it with recipes that capture:
  - a hit reaction frame
  - a death and the body that stays
  - a reload
  - a shotgun blast at close range
  - knockback and suppression in action

  Every test browser must be muted (`--mute-audio`, or `localStorage skirmish.muted=1`); the owner plays their own music.
- **Machine and data.** Never touch `data/`, the deployed site, or processes you didn't start. Other agents run heavy jobs on this machine, so record load with every measurement.
- **Mutation testing.** Commit before any mutation testing, and never `git checkout` a file that holds an uncommitted fix.
- **Decision log.** Append decisions to `decisions.tsv` and `todo.md` (both gitignored).

## Suggested order

Each step ends with screenshots beside the references, measurements and a commit.

1. **Soldier variants.** Bake 3 or 4 scripted soldier variants at game scale beside the reference soldiers. Pick one and build it out: armour tiers, team panels, the swap contract and its check.
2. **Guns.** Every class and evolution, with moving parts and dropped versions.
3. **The animation set.** Then the drawing changes: reload, flinch, deaths and bodies, dropped guns, procedural motion.
4. **Feedback.** Material-aware impacts, armour hits, brass, tracers and flashes, kill confirm, near misses, layered sound. Finish with the shotgun showcase.
5. **Game feel.** Honest reticle, reload moment, weight per gun, footsteps, movement cues.
6. **Mechanics, one at a time.** Knockback, then stagger, then flinch, then suppression, then cover wear. Each gets a sim change, tests, bot behaviour, a gun audit and bot matches.
7. **Final pass.** Performance and readability across every mode, measured at 1080p and at 2560x1440 with 2x DPR.

## When you finish

Report:

- before and after screenshots of the soldier, every gun, and each feedback moment, beside the references
- how far scripted modelling got, and where it stopped improving
- the tuning values for each mechanic and how the gun audit moved
- frame-time percentiles per tier, GPU memory, and first-download size against the budgets
- every departure from this guide and why, also recorded in the docs
- anything left open
