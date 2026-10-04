# Progression, death and modes

Score in one life climbs the level ladder (`LEVELS` in `src/shared/defs.ts`): a tier 1 perk at 100, a gun evolution at 200, a tier 2 perk at 350, an ability on Space at 500, and a second evolution at 700. Each evolution offers the two branches of the current gun (6 class guns, 12 stage-1, 24 stage-2). A stage-2 gun makes its holder hunted. Dying resets score, perks and gun to the class gun, shows the killer, a respawn countdown and a loadout re-pick. Every mode ends rounds with a winner banner. TDM and DOM add team scores.

## Sub-features

- `prog-perks` docks a row of perk tiles (key, symbol, short name) at the bottom between the vitals panel and the minimap at each perk level. Hovering a tile shows its description. A number key or a click picks. The client sends `{t:'pick', level, option}`; the server ignores a pick for any level but the pending one.
- `prog-evolve` uses the same dock at each evolve level with two wide tiles (gun art in the branch's accent color, name, one-line description), titled `Level up · evolve your <gun>`. Picking swaps the gun and keeps the loaded share of the magazine (half a pistol magazine becomes half a Hand Cannon magazine), and a reload in progress continues. A max-health perk scales current health by the new maximum over the old, so a pick is never a free heal. The vitals panel shows the gun name with one accent pip per stage.
- `prog-tier-mark` draws chevrons over every evolved player: one silver at stage 1, two gold at stage 2. Evolved guns are longer or thicker, may have two or three barrels, carry an accent stripe, and fire tracers in their own color and size. Each gun has its own shot sound.
- `prog-hunted` marks a stage-2 enemy with a pulsing red reticle in the world and a red diamond on every enemy minimap at any distance. The diamond is a ping: it holds where the last ping caught them, pings come every 2.5s and on every unsilenced shot, and a fading ring marks each ping. A silenced hunted gun (Phantom, Specter, Ghost) shows only on the 2.5s pings. Snapshot minimap marks carry `pingAge` (null for a live mark). Teammates never get the reticle or the hunted minimap marker. The `hunted` event ships on the tick after the pick. The kill feed shows `<name> is hunted` with a target icon, and a kill of a hunted player shows a `+200 BOUNTY` tag and pays 200 extra points.
- `prog-catch-up` multiplies score by 1.5 while your level is below the average level of the other living players. There is no on-screen indicator; read `score` in snapshots.
- `prog-ability` uses the ability (the tier 3 perk) with Space, then puts it on cooldown. An ability that cannot be used keeps its cooldown ready: an engineer wall that would overlap a player is skipped until the spot clears.
- `prog-dash` bursts 240px over 200ms along the held movement keys, or along the aim when no key is held. The client predicts it, so the local player does not snap back. A dashing body leaves a fading trail.
- `prog-knife` lunges up to 90px along the aim, stopping at walls, crates and the map edge, and strikes the first enemy in reach (75 damage, ignores armor), including one at point blank. Every use draws a short sweeping arc at the strike point and plays a slash sound.
- `prog-other-abilities` covers grenade, frag, gas and mine. They exist, but no step drives them. An owner keeps at most two mines (a third replaces the oldest), and they vanish when the owner dies.
- `combat-blast` explosions (blast rounds, grenades, mines) stop at walls: a body or crate whose line from the blast center crosses a wall takes nothing, and crates take the same distance falloff as players. A blast deals its owner half damage; the owner's bullets, shrapnel and gas never hurt them, and teammates are always spared, even after the owner leaves. A self-kill credits nothing.
- `combat-shield` blocks 35% of bullet damage within 40 degrees of the facing; blasts, knives and gas go through it. `node scripts/bench-balance.ts 0` prints a perk duel table of the tier-2 picks.
- `combat-human-damage` scales a human's hits by the victim's health multiplier after armor absorbs its share: 3x against a human, 1x against a bot. Human duels last as long as bot duels; bots deal base damage, so humans outlast them.
- `combat-assist` pays 50 points to every other living attacker who dealt at least 30% of the victim's max health. The kill event lists them in `assisters`, and the assister sees `+50 assist` above the crosshair.
- `prog-ring` shows the empty ability ring reading `Unlocks at 500`, and `Pick an ability` while the ability pick is open.
- `round-reset` returns every player to level 0 with no perks and the class gun when a round restarts in any mode, along with score, kills and deaths. Every living player gets a fresh life (full health, armor and ammo). Team scores and zones reset too, and the map advances to the next in the rotation.
- `round-ceasefire` holds the 8s end-of-round window as a ceasefire. Nobody can fire or use abilities, and bullets, grenades and gas already in flight deal no player damage.
- `round-winner` shows the banner `<winner> wins the round` (a team in TDM and DOM, a player name in FFA), the top three (by score in team modes, by kills in FFA) and `Next round in Ns`. The objective banner is hidden while a winner is shown.
- `death-screen` names the killer and disables `#respawn` during the countdown.
- `death-respawn` returns the player with the new loadout and shows the objective banner again.
- `mode-tdm` and `mode-dom` show team scores, the objective under the score bar, and the winner banner at the win score. TDM wins at 50 kills. DOM wins at 1000 points, earning 5 points per second per held zone. A lone team on a zone first drains another team's partial capture, so an owner standing on its point pushes an attack back. A held zone needs one full capture (3s) to turn neutral and another to be taken.
- `mode-ffa` ends the round when a player reaches 20 kills, or gives it to the player with the most kills when the 8-minute map timer runs out. The leaderboard ranks by round kills and shows them under `First to 20 kills`.

## How to get to it (user POV)

- Earn points by destroying crates and killing players.
- Get killed by a bot or another player.
- Join the TDM or DOM room from the menu.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Perk dock on the real server.** `node .claude/skills/verify/scripts/combat.ts "$RUN" tdm` shoots crates and bots in the first room until the dock opens, then logs `perk dock opens at 100 points`, `perk dock keeps clear of the screen center` with its size and position, `hovering a tile shows its description`, `pressing 2 picks the second tier 1 perk on the server` (read from `self.perks` in the page's frames) and `the dock closes after the pick`. Screenshot `perk-dock-<room>.png`.
- **Respawn.** When bots kill the driven player during `combat.ts`, it clicks `#respawn` and logs `objective banner shows again after respawning`. This depends on a death happening, so a run without one does not verify it.
- **Dash and knife on the real server.** `node .claude/skills/verify/scripts/abilities.ts "$RUN" [knife] [dash]` joins TDM with a shotgun and heavy armor, earns the ability level by shooting crates and bots (taking the first option at every other pick, evolutions included), picks the ability with its number key, and uses it with Space. Dash logs `with no movement keys held, the server moved the player along the aim` with the measured distance (about 240px), `cooldown started on the server`, and `client prediction kept the drawn player on the server path` with the largest smoothed correction from `skirmishDev.drawnSelf()`. Screenshot `dash-trail.png`. Knife holds Space while walking at the nearest enemy and logs each `slash` event from the page's frames, then `a slash hit a bot` when a 75 damage `dmg` event or a Knife kill arrives in the same snapshot as the slash. Screenshots `knife-slash-<n><a-d>.png`, a burst taken 50ms apart, show the arc. Its log is `$RUN/evidence/abilities.log`.
- **Reaching the ability or a stage-2 gun quickly.** At the real thresholds (500 points for the ability, 700 for stage 2, in one life) the driver often dies first. Launch a scratch copy with lower thresholds instead, never by editing the repo: `rsync -a --exclude node_modules --exclude .git <repo>/ "$RUN/repo/"`, `ln -s <repo>/node_modules "$RUN/repo/node_modules"`, change the `score` values in `LEVELS` in `$RUN/repo/src/shared/defs.ts` to `0, 10, 20, 30, 40, 50`, then run `$RUN/repo/.claude/skills/verify/scripts/launch.sh "$RUN/run"` and point `abilities.ts` at `$RUN/run`.
- **Not yet scripted on the real server.** The death screen's killer name and the winner banner need a specific death or a full match. Report them as not verified. The [maps recipe](./maps.md) reaches a round end over `ws` and reads `match.winner`, which proves the winner state but not the banner's rendering.
- **Render-only check.** Run the repo-root harness: `node scripts/mock-server.ts 8787` in one terminal, then `node scripts/drive.ts http://localhost:8787 "$RUN/evidence/mock"`. It forces each state with mock chat commands and screenshots it, including `/evolve` (screenshots `game-evolve.png` and `game-evolved.png`). The mock's bot Frost holds a hunted stage-2 Juggernaut and the feed shows a bounty kill, so the reticle, chevrons, minimap diamond and bounty tag are all on screen. This proves rendering only.
- **Hunted and bounty over `ws`.** Not in a browser driver. `test/hunted.test.ts` proves the minimap ping, its 2.5s refresh and the unsilenced-shot refresh, the teammate exception, the far-away `hunted` event shipped on the next tick, and the bounty score in the sim.
- **Next harness step.** Add a `death` step that walks the driven player toward bots and waits for `#death` to show, then asserts `#death-title` names a player from the snapshot and that clicking `#respawn` after the countdown hides `#death`.

## Gotchas

- Score, level, perks and the gun reset on respawn and on a round restart.
- The engineer wall, the knife's wall stop and the round reset are covered by `npm test` (`test/abilities.test.ts`, `test/progression.test.ts`) rather than the browser driver.
- Gameplay rules are covered by `npm test` (`test/sim.test.ts`). The map here is about what the player sees.
- Do not lower the TDM or DOM win score in the scratch copy used to drive `abilities.ts`. Rounds then end every few seconds, the restart resets level and perks, and `reached tier 3 and picked …` fails. Lower only the `LEVELS` scores for abilities.
- Catch-up makes a kill worth 150 while you trail the room's average level, so the first kill can skip past 100. The dock still opens at the lowest open pick.
