# Progression, death and modes

Score unlocks perk choices at 100, 300 and 600 points: an attachment, then a survival perk, then an ability on Space. Dying shows the killer, a respawn countdown and a loadout re-pick. TDM and DOM add team scores and a winner banner.

## Sub-features

- `prog-perks` offers a perk panel at each threshold, picked by click or number key.
- `prog-ability` uses the tier 3 ability with Space, then puts it on cooldown.
- `death-screen` names the killer and disables `#respawn` during the countdown.
- `death-respawn` returns the player with the new loadout.
- `mode-tdm` and `mode-dom` show team scores, and the winner banner at the win score.

## How to get to it (user POV)

- Earn points by destroying crates and killing players.
- Get killed by a bot or another player.
- Join the TDM or DOM room from the menu.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Not yet scripted on the real server.** These states need score, a death or a full match, which the driver cannot cause quickly through the real user path. Report them as not verified.
- **Render-only check.** Run the repo-root harness: `node scripts/mock-server.ts 8787` in one terminal, then `node scripts/drive.ts http://localhost:8787 "$RUN/evidence/mock"`. It forces each state with mock chat commands and screenshots it. This proves rendering only.
- **Next harness step.** Add a `death` step that walks the driven player toward bots and waits for `#death` to show, then asserts `#death-title` names a player from the snapshot and that clicking `#respawn` after the countdown hides `#death`.

## Gotchas

- Score, level and perks reset on respawn.
- Gameplay rules are covered by `npm test` (`test/sim.test.ts`). The map here is about what the player sees.
