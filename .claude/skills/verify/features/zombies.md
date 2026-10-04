# Zombies

Zombies is co-op base defense for a private squad of up to four, with bots in the empty seats. The squad holds a core at the center of the Outpost map through a 40-second day of building and repairing walls, then a night whose wave walks in from the four edges. A night ends once its whole wave has spawned and died. Waves grow every night until the core falls, which ends the run with a report; 20 seconds later a fresh run starts. A player whose health runs out goes down, can be revived by a squadmate holding use for 3 seconds, and otherwise bleeds out after 25 seconds and returns at dawn. This phase is the server and the shared simulation. The browser client does not draw zombies, walls, the core or the run yet, so every recipe here runs over `ws`.

## Sub-features

- `zom-squad-room` opens with `POST /api/squads`, which answers `{ room: 'z-' + 6 base-32 characters }`. `GET /api/servers` never lists it. One address may open `squadsPerMin` (6) a minute (429 after), at most `squadRooms` (20) run at once (503 after), and a room with no humans for `squadIdleMs` (30s) closes and its code stops answering the upgrade. `LIMITS` in `src/server/limits.ts` holds all three.
- `zom-seats` keeps four players: bots fill the seats humans leave, a joining human takes a bot's seat, and a fifth human gets `{t:'error', message:'Room full'}`. Everyone is on team `red`, so friendly fire never applies; in a run only zombie bites hurt the squad, never its own blasts.
- `zom-run` is the state machine in `src/shared/sim/run.ts`: `day` (until `phaseEndsAt`), `night` (`phaseEndsAt` null; `waveLeft` counts zombies alive or to come), `over` (`phaseEndsAt` is the restart time and `report` holds night reached, `durationMs` and each player's kills, revives and walls built). The snapshot's `run` field carries it with `scrap`, `core` (`x`, `y`, `hp`, `maxHp`) and `aliveZombies`.
- `zom-horde` sends each player the zombies in view as tuples `[id, kindIndex, x, y, hpTenths]` in `snap.zombies` (`kindIndex` into `ZOMBIE_KINDS`: 0 walker, 1 brute). A zombie death ships a `zkill` event; each player sees `dmg` events (kind `zombie`) only for their own hits, one per zombie per tick. A blast sends no per-zombie `dmg`, only its `boom`.
- `zom-walls` takes `{t:'build', cx, cy}` and `{t:'demolish', cx, cy}` on the 50px grid (`ZOM.cell`). Rules and costs are in `build()` in `run.ts` and the README. `snap.buildings` lists `{kind, cx, cy, hp}` (hp in tenths) and is sticky: the wire omits it while unchanged. Walls block bodies but not the squad's bullets or grenades.
- `zom-downed` shows a downed player in `players` with `downed: { revive (0..1), bleedOutAt (server time) }`; `alive` is false. `life` events report `downed`, `revived` (with `by`) and `bledOut`. A bled-out player's `self.respawnIn` stays 0 and the `respawn` message does nothing until dawn brings them back.
- `zom-use` is the `use` flag on `InputState`: held within 70px of a downed squadmate it revives, otherwise it repairs the nearest damaged wall within 250px for scrap.

## How to get to it (user POV)

- Not reachable from the menu in this phase. A client would `POST /api/squads`, then join `/ws?room=<code>` with the usual `join` message and share the code with friends.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **First night on the real server.** `node .claude/skills/verify/scripts/zombies.ts "$RUN" [seconds]` (default 150) opens a squad, checks it stays off `/api/servers`, joins as one human with an LMG, and logs `welcome says mode ZOM`, `the run opens on day 1`, `3 bots fill the squad beside one human`, `a build message put a wall on cell <cx>,<cy>` and `the wall cost 20 scrap`. It then holds the trigger on the nearest zombie until dawn and logs `night 1 over after <s>s: <n> zombie kills, peak <n> alive, <n> downs, <n> revives, <n> bled out, core <hp>/<max>`, then `dawn of night 2 arrived`. The log is `$RUN/evidence/zombies.log`, ending in `RESULT PASS`. It takes about 70 seconds.
- **Balance and cost.** `node scripts/bench-zombies.ts 1,2,3 4` and `node scripts/bench-zombies.ts 1,2,3 1` play whole runs in-process. Each seed prints the night reached and per-night length and core health; the last lines print step and tick time and snapshot bytes with 200 zombies alive.
- **Rules.** `npm test` covers them in `test/zombies-*.test.ts`: the run cycle, building refusals, flow-field routing, downs and revives, combat credit, snapshots and the wire, squad rooms, bots and seeded replay.

## Gotchas

- There is no client rendering yet. `drive.ts`, `combat.ts` and screenshots show nothing of a squad; a squad room in the browser shows players fighting nothing.
- `doctor.sh` checks only the three public rooms. A squad exists only after a `POST /api/squads`.
- A squad with no human closes after 30s, bots and all, so open it and join within that window.
- `zombies.ts` needs no browser and launches none.
- The golden replay excludes zombies runs; `test/zombies-determinism.test.ts` guards their determinism instead.
