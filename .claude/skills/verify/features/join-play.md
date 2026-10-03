# Joining and playing

Clicking a room and `Play` puts the player into a live match. WASD moves, the mouse aims, clicking fires, and closing the page removes the player from the room.

## Sub-features

- `play-join` enters a room and swaps the menu for the HUD.
- `play-move` moves the player on the server.
- `play-fire` fires and spends ammo on the server.
- `play-leave` removes the player from the room when the page unloads.

## How to get to it (user POV)

- Menu, click a room row, then `Play`.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Join.** Run `node drive.ts "$RUN" join`. Log lines `welcome frame received on the page socket`, `menu hidden and HUD shown`, `own player present in snapshots`, `server human count in ffa rises by one`, `observer leaderboard lists the player`. Screenshot `joined.png`.
- **Move.** Run `node drive.ts "$RUN" join move`. It holds `KeyD` for 700ms. Log line `holding D moves the player right on the server` with the measured x change. Screenshot `moved.png`.
- **Fire.** Run `node drive.ts "$RUN" join fire`. It clicks once. Log line `click fires: server ammo decreases` with the measured ammo. Screenshot `fired.png`.
- **Leave.** Run `node drive.ts "$RUN" join leave`. It reloads the page. Log line `server human count returns to baseline after the page unloads (reload)`.

## Gotchas

- Spawning against a wall can block movement. A move under 50 units fails the check. Retry once before calling it a regression.
- The pistol is semi-automatic. A held mouse fires once. Press and release for each shot.
- TDM and DOM rooms are reached by clicking the 2nd or 3rd `#servers .server`. The driver currently joins FFA only.
