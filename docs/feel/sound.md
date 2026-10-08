# Sound pass

This pass gives every shot, hit, reload and footstep its own sound. It covers the sound asked for in "Animation set", "Game feel" and "Feedback" in [IMPLEMENTATION.md](IMPLEMENTATION.md). The code lives in `src/client/sfx.ts` (what plays and where), `src/client/audio.ts` (the WebAudio graph) and `src/client/samples.ts` (what loads first). The tests are in `test/client-sfx.test.ts` and `test/client-samples.test.ts`.

## What triggers each cue

| Cue | Triggered by | Recording |
|---|---|---|
| `shot:<gun>` | A shot event, or your own shot as the page fires it | `crack`, the class recording, and on heavy guns `sub`. See "Layered gunshots". |
| `gun:pump`, `gun:bolt` | `cycleOf(gun).atMs` after each shot of a pump or bolt gun | `pump`, `bolt` |
| `brass:casing`, `brass:shell` | 400 ms after a casing leaves the gun: on the shot, or on the pump or bolt that throws it | `casing`, `shellDrop` |
| `gun:magOut`, `magIn`, `slide`, `bolt`, `shell`, `pump`, `boxOpen`, `boxClose` | Each `RELOAD_BEATS` beat a reload passes. Your own reload uses `snap.self.reloadFrac`, and other players' use `PlayerView.reload`. | One recording per beat. Its rate follows the gun class: 1.12 for the pistol, 0.88 for the LMG. |
| `impact:metal` | A round stops on metal cover (an `impact` event, or a `dmg` on a metal crate) | `ricochet`, a whine falling from about 2.9 kHz to 2.1 kHz |
| `impact:concrete` | The same, on concrete. Squad walls count as concrete. | `chip` at rate 1.25 |
| `impact:wood` | The same, on wood | `splinter` |
| `impact:planter`, `impact:sandbag` | The same, on planters or sandbags | `dirt`, `sandbag` |
| `flesh` | A bullet `dmg` on an unarmoured player or a zombie | `flesh` |
| `tink:light`, `tink:medium`, `tink:heavy` | A bullet `dmg` on a player with that `armorTier` | `tink` at rates 1.2, 1.0 and 0.8, louder each tier. Heavy adds `plate`. |
| `whizz` | A `whizz` event whose `victim` is you, placed where the round passed | `whizz` |
| `kill` | Your kill. It is a thump, then the confirm tone 70 ms later. | `thump`, then `kill`. `bounty` adds its coins after the tone. |
| `clatter` | Any `kill` event that is not a knock, 250 ms later, where the victim stood | `clatter` |
| `step:L`, `step:R` | A drawn soldier's stride passes a contact frame | `stepL`, `stepR` |

The cues that existed before this pass keep their triggers. The single `reload` cue and its recording are gone. The reload beats replace them.

## How it works

**Reload beats.** `RELOAD_BEATS` in `src/client/reload.ts` is the only timing table, and the reload animation turns its frames on the same beats. `soundsFor` compares two snapshots. Each beat between the old share and the new share plays once, on the snapshot that passes it. A reload that ends while the player is alive is treated as reaching share 1, so the beats after the last snapshot still play. A reload that ends in death plays nothing more. The first snapshot of a session plays no beats. Snapshots arrive at 30 Hz, so a beat lands at most 33 ms after its frame.

**Footsteps.** The baked run cycle (`run_cycle` in `art/blender/sprites/soldier.py`) plants the right heel at phase 0.25 (frame 2 of 8) and the left heel at phase 0.75 (frame 6). These two points are `CONTACTS` in `sfx.ts`. Each frame, after the scene updates `s.strides`, `stepCues` compares each soldier's stride with the one from its previous check (`s.heardSteps`). When the phase passes a contact point, that foot sounds. This uses the same stride the legs were drawn from, so a footstep and its frame stay in step. The gain follows the measured speed (0.4x to 1.3x of base speed), so a slow walk is quieter than a run. Heavier armour plays the step lower. Your own steps play centred at half gain. A hidden enemy makes no sound.

**Material lookup.** A round stopped on cover sounds the material of the piece at its stop point. The lookup builds the same list as the impact effect in `src/client/effects.ts`: map walls, standing crates, squad walls and the core. It then calls `hostOf` from `decals.ts` on that list, so the sound always matches the chips. A point the client cannot place reads as concrete. A shotgun blast sounds each material once per snapshot, not once per pellet.

**Layered gunshots.** Each report has up to four layers, all pitched together by the evolution branch:

- **Transient.** The shared `crack`, the first 50 ms of the AR15 recording high-passed at 2 kHz. Light guns play it brighter (SMG 1.25) and heavy guns lower (shotgun 0.8).
- **Body.** The class recording, as before.
- **Weight.** `sub`, the 20 gauge recording low-passed at 200 Hz. The shotgun plays it at 0.9 gain and the sniper at 0.8. The LMG gets 0.45 and the assault rifle 0.3, both shortened by a faster rate. The pistol and SMG get none, so they flutter rather than shove.
- **Launcher.** Blast guns keep the launcher thump.

The tail is not a recording. Each cue has a reach and a tail amount in `traitsOf`. `placeCue` returns the cue's dry gain, its pan, a low-pass cutoff and a send level into one of two shared convolvers. The convolvers' impulse responses are generated at unlock by `impulse()`, so they add no download:

- **Open.** Slaps at 95, 230 and 410 ms, then noise dying away over 1.6 s.
- **Roof.** Slaps at 11 and 23 ms, then a 0.35 s decay.

A cue goes to the roof space when the listener or the shooter stands under a roof. A roof is an overhead piece at least 100 units wide in both directions (`roofsOf`). Gantry beams and pipe runs are overhead too, but they leave the sky open, so they do not count.

**Distance.** Within 20% of a cue's reach, it arrives unfiltered. From there to the edge of its reach, the low-pass cutoff falls on a log scale from 18 kHz to 900 Hz. The dry signal falls with the square of the distance, but the send falls with its square root. As a result, a far gun sounds mostly like echo. Your own cues are never filtered.

**Tail amounts.** Sniper 0.7, shotgun 0.55, LMG 0.45, assault 0.4, pistol 0.3, SMG 0.25, silenced 0.08, blasts 0.8. Handling sounds get 0.05. Interface sounds stay dry.

**Reach**, in view radii:

| Cues | Reach |
|---|---|
| Shots, blasts, whizz, interface | 1.2 |
| Footsteps | 1.0 |
| Strikes and clatter | 0.8 |
| Silenced shots | 0.8 |
| Gun handling | 0.6 |
| Brass | 0.45 |

## Mixing

`MAX_VOICES` rose from 24 to 48, where one voice is one source node. Footsteps, brass, strikes and clatter are fillers. A filler starts only while 12 voices stay free. A shot, whizz, kill or reload beat that does not fit cuts the oldest fillers short instead of being dropped (`admit` in `sfx.ts`, `steal` in `audio.ts`).

The firefight test plays a 4 s fight with your SMG, four enemy guns (LMG, shotgun, assault and SMG), strikes on metal and concrete, armoured hits, near misses and six runners. In that fight:

- Voices peak at the 48 cap.
- No shot, whizz, kill or reload beat is ever refused.
- 345 filler cues are refused.
- Only 3 voices are cut short.

Without the 12-voice headroom, the same fight cuts 126 voices short mid-sound.

Your own brass plays at 0.45 gain and other players' at 0.7. Your own footsteps play at half gain. Strikes play at 0.7. Gun handling plays at 0.8.

## Sources

Every new source is a CC0 Freesound preview. I confirmed the licence on each sound's page: each page shows "Creative Commons 0" and links only to `creativecommons.org/publicdomain/zero/1.0/`. Each source is listed in `art/sounds.json`, and `public/assets/CREDITS.md` is regenerated from it.

| Sample(s) | Source | Author |
|---|---|---|
| `magOut`, `magIn`, `bolt` | [AK-47 Assault Rifle being unloaded and reloaded](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/674742/) | serøutōnin--deprivəd |
| `slide` | [1911 Reload](https://freesound.org/people/nioczkus/sounds/396331/) | nioczkus |
| `pump` | [SXP_SHOTGUN_RACK_01](https://freesound.org/people/dasBUTCHER84/sounds/449614/) | dasBUTCHER84 |
| `shellIn` | [shell load.ogg](https://freesound.org/people/CeebFrack/sounds/108793/) | CeebFrack |
| `boxOpen`, `boxClose` | [Machine gun reload](https://freesound.org/people/SamsterBirdies/sounds/363168/) | SamsterBirdies |
| `casing` | [Brass bullet shell casing drop onto concrete](https://freesound.org/people/GrayJoy/sounds/210102/) | GrayJoy |
| `shellDrop` | [12 guage shotgun shell drop](https://freesound.org/people/MrGungus/sounds/773860/) | MrGungus |
| `clatter` | [Rifle dropped on floor 3x](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/675009/) | serøutōnin--deprivəd |
| `tink` | [HeavyBulletPing.mp3](https://freesound.org/people/wilhellboy/sounds/351371/) | wilhellboy |
| `ricochet` | [Ricochet 2.wav](https://freesound.org/people/morganpurkis/sounds/392975/) | morganpurkis |
| `whizz` | [Fly-by whiz SFX (subsonic)](https://freesound.org/people/modusmogulus/sounds/789222/) | modusmogulus |

Other samples come from sources the project already uses:

- `stepL`, `stepR`, `chip`, `splinter`, `dirt`, `sandbag`, `plate` and `thump` are members of the Kenney Impact Sounds pack (CC0).
- `flesh` is an unused hit in the Visceral Bullet Impacts recording.
- `crack` and `sub` are carved from the AR15 and 20 gauge recordings. `scripts/art/sounds.ts` now accepts `highpassHz` and `lowpassHz` per sound for this.

I chose the ricochet for its clear falling whine. Its uploader calls it cartoon-like. A real recording (aust_paul's "bullet ricochet", 30932) whines about 15 dB under its impact and would be lost at range.

No cue is synth-only. Every cue keeps a synth recipe in `SOUNDS`, which plays until its recordings decode. A layered cue asks the loader for all of its missing layers at once.

## Size budget

| | Before | After |
|---|---|---|
| `public/assets/sfx` | 216,867 bytes, 32 recordings | about 310,000 bytes, 55 recordings |
| `COMMON_SAMPLES` (loaded before first play) | about 68 KB, 11 recordings | about 91 KB, 18 recordings |

The whole folder stays well under the 1 MB budget. The common set adds `crack`, `sub` and `thump`, because every shot and kill confirm needs them. It also adds the two footsteps, `magOut`, `magIn` and `casing`, all short. The guns now load first. Everything else still loads the first time it is wanted.

## Verified in the real game

I played FFA with the shotgun for 45 s in muted headless Chrome (`--mute-audio`) against a fresh server. The page's `skirmishDev.audio()` reported these cues playing from their recordings:

- the pump after shots
- reload beats
- brass
- both footsteps
- ricochets, chips and splinters
- light, medium and heavy tinks
- flesh and clatter

There were no page exceptions. While the machine was at load 16 on 4 cores, the loader decoded only about 3 recordings every 1.6 s. So the first few seconds of a game played synth recipes. This is the existing loader under load, not a regression.

## Open

- The sim does not emit the `whizz` event on this branch yet. The cue is built and tested against synthetic snapshots.
- The clatter and brass delays (250 ms and 400 ms) are estimates of when the visuals agent's dropped gun and casings land. They should be matched to the final throw times.
- In one of three runs, a busy session never decoded `lmg`. The loader never asks again for a recording that failed once. I could not reproduce it, and the loader policy predates this pass.
