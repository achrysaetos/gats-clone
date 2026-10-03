# Progression, death and modes

Score unlocks perk choices at 100, 250 and 450 points: an attachment, then a survival perk, then an ability on Space. Dying shows the killer, a respawn countdown and a loadout re-pick. TDM and DOM add team scores and a winner banner.

## Sub-features

- `prog-perks` docks a row of perk tiles (key, symbol, short name) at the bottom between the vitals panel and the minimap at each threshold. Hovering a tile shows its description. A number key or a click picks.
- `prog-ability` uses the tier 3 ability with Space, then puts it on cooldown. An ability that cannot be used keeps its cooldown ready: an engineer wall that would overlap a player is skipped until the spot clears.
- `prog-dash` bursts 240px over 200ms along the held movement keys, or along the aim when no key is held. The client predicts it, so the local player does not snap back. A dashing body leaves a fading trail.
- `prog-knife` lunges up to 90px along the aim, stopping at walls, crates and the map edge, and strikes the first enemy in reach (75 damage, ignores armor), including one at point blank. Every use draws a short sweeping arc at the strike point and plays a slash sound.
- `round-reset` returns every player to level 0 with no perks when a TDM or DOM round restarts, along with score, kills and deaths.
- `death-screen` names the killer and disables `#respawn` during the countdown.
- `death-respawn` returns the player with the new loadout and shows the objective banner again.
- `mode-tdm` and `mode-dom` show team scores, the objective under the score bar, and the winner banner at the win score.

## How to get to it (user POV)

- Earn points by destroying crates and killing players.
- Get killed by a bot or another player.
- Join the TDM or DOM room from the menu.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Perk dock on the real server.** `node .claude/skills/verify/scripts/combat.ts "$RUN" tdm` shoots crates and bots in the first room until the dock opens, then logs `perk dock opens at 100 points`, `perk dock keeps clear of the screen center` with its size and position, `hovering a tile shows its description`, `pressing 2 picks the second tier 1 perk on the server` (read from `self.perks` in the page's frames) and `the dock closes after the pick`. Screenshot `perk-dock-<room>.png`.
- **Respawn.** When bots kill the driven player during `combat.ts`, it clicks `#respawn` and logs `objective banner shows again after respawning`. This depends on a death happening, so a run without one does not verify it.
- **Dash and knife on the real server.** `node .claude/skills/verify/scripts/abilities.ts "$RUN" [knife] [dash]` joins TDM with a shotgun and heavy armor, earns tier 3 by shooting crates and bots, picks the ability with its number key, and uses it with Space. Dash logs `with no movement keys held, the server moved the player along the aim` with the measured distance (about 240px), `cooldown started on the server`, and `client prediction kept the drawn player on the server path` with the largest smoothed correction from `skirmishDev.drawnSelf()`. Screenshot `dash-trail.png`. Knife holds Space while walking at the nearest enemy and logs each `slash` event from the page's frames, then `a slash hit a bot` when a 75 damage `dmg` event or a Knife kill arrives in the same snapshot as the slash. Screenshots `knife-slash-<n><a-d>.png`, a burst taken 50ms apart, show the arc. Its log is `$RUN/evidence/abilities.log`.
- **Reaching tier 3 quickly.** At the real thresholds (450 points in one life) the driver often dies first. Launch a scratch copy with lower thresholds instead, never by editing the repo: `rsync -a --exclude node_modules --exclude .git <repo>/ "$RUN/repo/"`, `ln -s <repo>/node_modules "$RUN/repo/node_modules"`, change `LEVEL_SCORES` in `$RUN/repo/src/shared/defs.ts` to `[0, 10, 20, 30]`, then run `$RUN/repo/.claude/skills/verify/scripts/launch.sh "$RUN/run"` and point `abilities.ts` at `$RUN/run`.
- **Not yet scripted on the real server.** The death screen's killer name and the winner banner need a specific death or a full match. Report them as not verified.
- **Render-only check.** Run the repo-root harness: `node scripts/mock-server.ts 8787` in one terminal, then `node scripts/drive.ts http://localhost:8787 "$RUN/evidence/mock"`. It forces each state with mock chat commands and screenshots it. This proves rendering only.
- **Next harness step.** Add a `death` step that walks the driven player toward bots and waits for `#death` to show, then asserts `#death-title` names a player from the snapshot and that clicking `#respawn` after the countdown hides `#death`.

## Gotchas

- Score, level and perks reset on respawn and on a round restart.
- The engineer wall, the knife's wall stop and the round reset are covered by `npm test` (`test/abilities.test.ts`, `test/progression.test.ts`) rather than the browser driver.
- Gameplay rules are covered by `npm test` (`test/sim.test.ts`). The map here is about what the player sees.
