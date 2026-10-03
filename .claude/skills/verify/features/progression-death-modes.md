# Progression, death and modes

Score unlocks perk choices at 100, 300 and 600 points: an attachment, then a survival perk, then an ability on Space. Dying shows the killer, a respawn countdown and a loadout re-pick. TDM and DOM add team scores and a winner banner.

## Sub-features

- `prog-perks` docks a row of perk tiles (key, symbol, short name) at the bottom between the vitals panel and the minimap at each threshold. Hovering a tile shows its description. A number key or a click picks.
- `prog-ability` uses the tier 3 ability with Space, then puts it on cooldown.
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
- **Not yet scripted on the real server.** The death screen's killer name, the ability and the winner banner need a specific death or a full match. Report them as not verified.
- **Render-only check.** Run the repo-root harness: `node scripts/mock-server.ts 8787` in one terminal, then `node scripts/drive.ts http://localhost:8787 "$RUN/evidence/mock"`. It forces each state with mock chat commands and screenshots it. This proves rendering only.
- **Next harness step.** Add a `death` step that walks the driven player toward bots and waits for `#death` to show, then asserts `#death-title` names a player from the snapshot and that clicking `#respawn` after the countdown hides `#death`.

## Gotchas

- Score, level and perks reset on respawn.
- Gameplay rules are covered by `npm test` (`test/sim.test.ts`). The map here is about what the player sees.
