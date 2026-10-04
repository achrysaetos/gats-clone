# Joining and playing

Clicking a room and `Play` puts the player into a live match. A 4s banner states the objective and team, and a one-line objective stays under the score bar. WASD moves, the mouse aims, clicking fires, and closing the page removes the player from the room. Hits give the shooter a hitmarker and damage numbers, and the victim a red edge vignette.

## Sub-features

- `play-join` enters a room and swaps the menu for the HUD.
- `play-move` moves the player on the server.
- `play-fire` fires and spends ammo on the server.
- `play-leave` removes the player from the room when the page unloads.
- `play-reconnect` rejoins on its own when the socket drops mid-match (a deploy restarts the server, or the network blips). The last frame stays on screen under a centered `#reconnect` card reading `Reconnecting… (attempt n)`. Retries back off from 0.5s to a 5s cap with jitter, and the browser's `online` event dials at once. The player rejoins the same room with the same name, loadout and token, and chat gains a `Reconnected.` line. After about 45s the client gives up, and the menu says `Lost connection. Press Play to try again.` Leaving the page never reconnects, and neither does a server policy close (1008, a message flood).
- `play-objective` shows the `#objective` banner on join and on every respawn, naming the mode, the player's team and the win score, then hides it after 4s.
- `play-hit-feedback` turns each hit into one `dmg` event (attacker, victim, amount, kind `player` or `crate`) or an `impact` for walls. The shooter sees a crosshair hitmarker for player hits (larger and red on a kill) and floating damage numbers. The victim sees a red edge vignette. The muzzle flash sits at the barrel tip.
- `play-team-colors` draws every TDM and DOM body in its team color, whatever color was picked, and marks teammates with a small triangle. FFA keeps the picked color.
- `play-names` gives each player a unique name in the room. A guest who types a registered name or a name already in use gets a number appended.

- `play-duel` two real browsers in one room see and damage each other.

## How to get to it (user POV)

- Menu, click a room row, then `Play`.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Join.** Run `node drive.ts "$RUN" join`. Log lines `welcome frame received on the page socket`, `menu hidden and HUD shown`, `own player present in snapshots`, `server human count in ffa rises by one`, `observer leaderboard lists the player`. Screenshot `joined.png`.
- **Move.** Run `node drive.ts "$RUN" join move`. It holds `KeyD` for 700ms. Log line `holding D moves the player right on the server` with the measured x change. Screenshot `moved.png`.
- **Fire.** Run `node drive.ts "$RUN" join fire`. It clicks once. Log line `click fires: server ammo decreases` with the measured ammo. Screenshot `fired.png`.
- **Reconnect.** Run `node drive.ts "$RUN" join reconnect leave`. Local runs only. It restarts the server process on the same port and data dir. Log lines `page shows the reconnecting overlay over the game while the server is down` with the overlay text, `a new welcome arrives on the page socket without any click` with the old and new player ids and the delay, `HUD is back and the overlay is gone`, `observer on the restarted server lists the player`. Screenshots `reconnecting.png` and `reconnected.png`. The backoff, the 45s budget and which closes reconnect are covered by `test/client-reconnect.test.ts`.
- **Leave.** Run `node drive.ts "$RUN" join leave`. It reloads the page. Log line `server human count returns to baseline after the page unloads (reload)`.
- **Objective, hits and team colors.** Run `node .claude/skills/verify/scripts/combat.ts "$RUN" tdm dom`. It writes `$RUN/evidence/combat.log` and ends in `RESULT PASS` or `RESULT FAIL`. Per room it logs `objective banner shows on join` with the banner text, `banner names the player's team from the snapshot`, `objective banner hides after about 4s`, and `a dmg event from the driven player arrives on the page socket` with the count and kinds. Screenshots are `objective-<room>.png`, `muzzle-<room>.png`, `hit-crate-<room>.png`, and, when the chance comes up, `hit-player-<room>.png` (hitmarker), `hurt-<room>.png` (vignette) and `teammate-<room>.png` (team colors and marker).
- **Names.** Covered by `npm test` (`test/e2e.test.ts` and `test/names.test.ts`), which join real sockets as an impostor, the account owner and two guests named Alex.

- **Duel.** Run `node duel.ts "$RUN"`. Log lines `each browser had the other in its own snapshots`, `hunter's socket shows a dmg event naming the target` and `target's socket shows the same hit from the hunter`. Screenshots `duel-hunter-view.png` and `duel-target-view.png`.

## Gotchas

- Spawning against a wall can block movement. A move under 50 units fails the check. Retry once before calling it a regression.
- The pistol is semi-automatic. A held mouse fires once. Press and release for each shot.
- TDM and DOM rooms are reached by clicking the 2nd or 3rd `#servers .server`. `drive.ts` joins FFA only. `combat.ts` joins any room.
- The hitmarker lasts 220ms, so `hit-player-<room>.png` exists only when a bot came within range and the screenshot landed in time. A crate hit alone still passes the dmg check, and the log says the hitmarker was not exercised.
- After navigating to another room, the old page can stay in the back/forward cache with its socket open. `combat.ts` reads frames only from the newest socket.
