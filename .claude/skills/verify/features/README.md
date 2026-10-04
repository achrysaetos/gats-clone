# Skirmish verification map

This directory is the maintained source for verifying what a Skirmish player can do. Read this index before driving the game, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.claude/skills/verify/scripts/launch.sh "$RUN"` and require `doctor.sh "$RUN"` to print only `ok` lines.
- Each run has its own port and `$RUN/data`, so accounts start empty.
- Every room starts with bots, so the driven player always has opponents.
- Never drive a server this run did not start.

## Driving conventions

- Drive with `node .claude/skills/verify/scripts/drive.ts "$RUN" <steps>`. Steps run in the order given, in one browser session.
- Prefer element ids (`#play`, `#account`, `#chat-log`) over coordinates.
- Read gameplay results from the page's WebSocket frames or an observer client, never from the client's internal state.
- Clean up with `cleanup.sh "$RUN"` after every attempt.

## Proof and skip reporting

- Report the `drive.log` line with its measured values, plus the matching screenshot.
- Confirm side effects through `/api/*` reads or the observer client.
- A feature whose state the driver cannot reach on the real server (for example a full-length match at the stock win score) is reported as not verified, with the reason. Mock-server screenshots do not count as verification.

## Feature entry contract

Each feature file starts with an H1 and one paragraph on the user-visible behavior, then four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.ts`, `Gotchas`.

## Features

- [Menu and loadout](./menu-loadout.md) covers the room list, weapon, color and armor pickers, phone layout, the privacy link and the muted panel.
- [Accounts and stats](./accounts.md) covers register, login, the token, server-side stats, the leaderboard and error codes.
- [Joining and playing](./join-play.md) covers joining a room, moving, firing, hit feedback, the reticle, HUD fading, leaving, the duel, reconnect, the view rectangle and lag compensation.
- [Chat](./chat.md) covers sending and receiving, the rate limit, word masking, renaming blocked names, and mute.
- [Progression, death and modes](./progression-death-modes.md) covers perks, gun evolution and its callouts, the hunted marker, edge chevrons and bounty, kill popups, abilities, the death screen, respawn, TDM and DOM scoring, and round end.
- [Map rotation](./maps.md) covers the four maps, per-mode rotation and the next-map notice.
