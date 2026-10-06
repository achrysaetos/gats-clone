# Skirmish

Skirmish is a top-down multiplayer arena shooter for the browser. Its gameplay is modeled on gats.io. The name, art and code are original.

## Run

```bash
npm install
npm start
```

Open http://localhost:8080. Set `PORT` to change the port. Accounts and stats are saved in `data/`.

## Play

Pick a weapon, a color and an armor tier, then choose an FFA, TDM or DOM room, or open a zombies squad (see Zombies below). Bots keep every room at 18 players or more. In TDM and DOM a team short of humans gets three bots for each human it lacks, since humans carry four times the health. In TDM and DOM every body wears its team color.

Each room rotates through four maps, each 6000 px square: Causeway (three lanes split by long walls with crossings, round a planter courtyard), Plaza (city blocks round a wide open square with a fountain at its heart), Old Town (a quarter of small rooms with a doorway in every wall between two long streets, round a planted courtyard) and Quarry (long open avenues beside walled pockets, round a monolith of four sandstone blocks). Every mode loads the next map when a round restarts. TDM is won at 150 team kills or, after 12 minutes, by the team ahead on score and then on kills. DOM is won at 3000 points or, after 15 minutes, by the team ahead. An FFA round runs 10 minutes and goes to the player with the most kills, bot or human, fewest deaths breaking a tie; a human who reaches 30 kills ends it early and leads the podium. A timed round that nobody wins, such as an FFA round with no kills or a dead-even TDM round, restarts at once on the next map. The objective line and the FFA leaderboard count the round's time down. The next map is announced 15 seconds ahead.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Fire |
| R | Reload |
| Space | Use ability |
| 1-9, 0 | Pick a perk or an evolution (or click its tile) |
| B | Zombies: build mode by day (left click builds, right click takes your wall down) |
| E | Zombies: hold to revive a downed squadmate or repair a wall or the core |
| Tab | Hold for the whole leaderboard |
| Enter | Chat |
| M | Mute sound |

Points in one life raise your level. At 100, 300 and 400 points you pick an attachment, a survival perk and an ability. At 200 and 550 points your gun evolves into one of two branches: 6 class guns, 12 stage-1 guns and 24 stage-2 guns. Dying resets your score, perks and gun to the class gun. While your level is below the average level of the other living players, every point you earn counts 1.5 times. A player holding a stage-2 gun is hunted: every enemy minimap pings their position every 2.5 seconds and whenever they fire an unsilenced shot, the kill feed announces it, and killing them pays a 200-point bounty on top of the kill. An attacker who dealt at least 30% of a victim's max health earns a 50-point assist when someone else gets the kill. A player killed by their own blast gives the kill to whoever hurt them most in the last 10 seconds.

### Zombies

Zombies is a co-op mode for a private squad of up to four. Start a squad from the menu's Zombies block and send friends its invite link (`?squad=<code>`), which opens the menu with that squad selected. Under the hood `POST /api/squads` opens a squad room and answers `{ "room": "z-xxxxxx" }`; everyone who joins the WebSocket with `?room=<code>` plays in it. Squads stay off the public room list, one address may open six a minute, at most 20 run at once, and a squad closes 30 seconds after its last human leaves. Bots fill the empty seats and give a seat up when a human joins. Humans keep their fourfold health. The whole squad is one team, and nothing the squad does hurts the squad.

The squad defends a core at the center of the Outpost map. A run opens on a 40-second day. Night follows, and a wave walks in from the four map edges toward the core. The night ends once the whole wave has spawned and died, and the next day starts. Each night's wave is bigger and its zombies tougher, so every run ends when the core falls. The run's score is the night it fell on. A report of the night reached, the run's length, each player's kills, revives and buildings put up, and the turrets' kills shows for 20 seconds, and then a fresh run starts on a reset map.

Walkers come from the first night and brutes from the third. A walker bites a squad player it can see within 120 px. A brute has far more health, ignores the squad and marches on the core. Otherwise a zombie bites the core once it reaches it, and the core shrugs off 60% of each bite. On the way it follows a flow field to the core that goes round the squad's walls while there is an open way and breaks through the cheapest wall when there is not. Zombie kills pay score up the same level ladder as the versus modes, and each kill adds scrap to the squad's shared bank. A player's level, perks and gun last for the whole run.

By day a player presses B for build mode and puts up a building on a 50 px grid cell within 600 px of the core and 250 px of themselves, on a cell clear of cover, the core, bodies and other buildings. The keys 1, 2 and 3, or a click on the build bar, pick a wall for 20 scrap, a sentry for 70 or a cannon for 180. A building can come down by day for half its cost back. Buildings block bodies, zombies included, but the squad's bullets and grenades pass over them. A wall has 2000 hp, a sentry 1000 and a cannon 1500. A walker bites a building for half its damage and a brute for its full damage.

A turret fires real rounds at the nearest zombie in range that no map wall or crate hides, and the squad's own buildings never block its view. Each turret prefers one kind of zombie and fires at the nearest of that kind first. A sentry reaches 420 px and fires seven rounds a second, each dealing 14 damage to a walker and 4 to a brute, so it thins walkers. A cannon reaches 560 px and fires one 260-damage round every 2.2 seconds at brutes first, so it answers brutes. A sentry holds 120 rounds and a cannon 10, and an empty turret stops firing. Its rounds never hurt the squad. A turret's kill pays the bank its scrap and pays the turret's builder the score, but counts as the turret's kill, not the builder's.

Holding use repairs the nearest damaged building or the core within 250 px at 80 hp a second, or reloads the nearest turret short of ammo, day or night. A worn turret is repaired before it is reloaded. A building costs 1 scrap per 20 hp and the core 1 scrap per 5 hp. A sentry round costs 0.25 scrap and a cannon round 4, and a full reload takes 2.5 seconds.

A player whose health runs out goes down instead of dying. A downed player crawls, cannot shoot and is ignored by the horde. A squadmate holding use within 70 px for 3 seconds revives them with 40% health. A downed player nobody revives within 25 seconds bleeds out and returns at the core at dawn. A human who joins or rejoins during the night sits out the same way until dawn. Bots fight, revive, repair buildings and the core and reload turrets while no zombie is close, and post behind the squad's walls. They never build.

## Layout

- `src/shared/defs.ts` holds every tuning number: weapons, armor, perks, cooldowns and world constants.
- `src/shared/maps.ts` registers the maps and each mode's rotation; a map's `size` is its side in pixels. The versus maps live in `src/shared/maps/`, each drawn as a text grid of 50 px cells: the west half only, since `src/shared/mapgrid.ts` turns it half way round for the east and merges cells into wall, spawn and crate rects. Its legend is `.` floor, `#` concrete, `S` sandstone, `P` planter, `c` crate, `R` red spawn (blue once turned), `F` FFA spawn, `X` both, and `A` zone A (B is the centre, C is A turned). Outpost, the zombies map, is still drawn in rects. `node scripts/map-lint.ts` checks every map for walls or crates past the edge, crates on walls, ground nobody can walk to, spawns a player cannot stand in, team spawns in sight of each other, a broken half turn and misplaced DOM zones, and lists each map's longest clear sightline against the longest gun's reach; `test/map-lint.test.ts` fails on any problem.
- `src/shared/protocol.ts` defines the wire messages and parses client input.
- `src/shared/wire.ts` encodes snapshots per connection: it rounds numbers and omits crates, leaderboard, zones and match while they are unchanged. The client rebuilds full snapshots from the last one it received.
- `src/shared/sim.ts` is the deterministic game simulation's entry point. `step` advances the world one tick, and the player commands add, remove, respawn and steer players. The rest lives in `src/shared/sim/`, one module per domain:
  - `world.ts` holds the world and player types, the seeded random source, map loading and spawn points.
  - `movement.ts` holds the collision geometry and player motion that the client also runs for prediction.
  - `stats.ts` holds perks, levels and score, and the effective stats they produce.
  - `combat.ts` holds bullets, damage, kills and lag compensation. Each input carries the server time of the world the client was drawing, and a shot first flies through that past, up to the client's measured round trip plus its render delay and never more than `MAX_REWIND_MS` back, so players hit what they aim at on screen.
  - `abilities.ts` holds the tier 3 abilities and the grenades, mines and gas they leave behind.
  - `modes.ts` holds the FFA, TDM, DOM and zombies rules and the round cycle.
  - `run.ts` holds the zombies run: its day, night and restart cycle, waves, downed players, revives, walls and scrap.
  - `build.ts` holds the wall rules, which the server applies and the client's build preview mirrors.
  - `horde.ts` holds the zombies themselves: the flow field to the core, their steps, bites and spacing.
  - `snapshot.ts` builds each player's culled view of the world.
- `src/server/` contains rooms, bots, accounts and the HTTP and WebSocket server. `bots.ts` runs each bot's think. `bot/` holds its parts:
  - `arena.ts` builds each world's nav grid (`nav.ts`, A* over a grid of where a body fits) and cover points (`cover.ts`, spots beside walls and crates with the bearings they shield) once per wall layout.
  - `awareness.ts` turns a bot's snapshot into what it knows: enemies in sight, where it last saw others, and gunfire it heard.
  - `intent.ts` holds the personalities, each weapon class's fight range, and the one transition table between intents (patrol, take position, engage, peek and hide, reload in cover, retreat and heal, flank, search). An intent holds for a minimum time unless an interrupt fires.
  - `motor.ts` turns the intent into keys, aim and fire. No bot turns back within 400 ms of its last turn back. `aim.ts` holds the reaction and aim model: the gun turns toward where the bot wants it on a capped spring, the aim error drifts with a 400 ms time constant, and a bot fires only once its gun is on target.
- `src/client/` contains the browser client.

## Verify

```bash
npx tsc --noEmit
npm test
RUN=/tmp/skirmish-verify
.claude/skills/verify/scripts/launch.sh "$RUN"
.claude/skills/verify/scripts/doctor.sh "$RUN"
node .claude/skills/verify/scripts/drive.ts "$RUN"
node .claude/skills/verify/scripts/combat.ts "$RUN" tdm dom
.claude/skills/verify/scripts/cleanup.sh "$RUN"
```

`npm test` runs the simulation, protocol, client and end-to-end server tests. The scripts in `.claude/skills/verify/` prove behavior against a real, isolated server. `launch.sh` builds the client and starts a server with its own port and data dir. `doctor.sh` checks the server and bundle are current. `drive.ts` drives headless Chrome through the menu, login, movement, firing, latency and chat, and `combat.ts` checks objectives and damage in TDM and DOM. Both write `RESULT PASS` or `RESULT FAIL` to `$RUN/evidence/`. `cleanup.sh` stops the server and deletes its data. Set `CHROME` if Chrome is not at the default macOS path. See `.claude/skills/verify/SKILL.md` for details.

`node scripts/golden-replay.ts [hash]` guards refactors of `src/shared/sim.ts` and `src/shared/sim/`. It replays fixed-seed FFA, TDM and DOM matches with bots, scripted human players, abilities, perks, lag-compensated shots and round ends, and prints one SHA-256 hash of every snapshot. Record the hash before you change the simulation's structure. Then pass it as the argument after the change. The script exits with status 1 when the hashes differ. Bots drive these matches, so a change to the bot brain also changes the hash. The current hash is `43105c38e75f1138788a2635976da74e64bbe38c2c1e541883a2fdd577eb952e`, taken with the gun overhaul roster (breakpoints through heavy armor, bots fighting at their gun's reach), with the intent-driven bots turning their guns by hand and pacing their turns back, with class gun rules (moving spread, assault bloom, minigun spin-up, sniper view) and per-class attachment menus (the scripted local human plays a sniper so its ghillie pick is on its menu), on the 6000 px grid maps with their own size, 18-player rooms and the longer round targets. Zombies runs stay out of the replay so the hash holds; `test/zombies-determinism.test.ts` checks that a bot squad's run replays exactly from its seed.

`node scripts/bench-bots.ts` pits a scripted human against bots and prints the human's life, K/D and damage taken per minute. `node scripts/spasm-meter.ts [modes] [minutes] [seeds]` reads every bot's gun angle and position from snapshots sent through the wire encoder. It prints how far guns turn per tick, how often they reverse, how often bodies turn back and how soon after the last turn, and the brain decision behind each turn back. `node scripts/bot-trace.ts` writes an HTML replay of a bot match, tick by tick, with each bot's intent, goal and gun.

`node scripts/bench-zombies.ts [seeds] [squad]` plays zombies runs on fixed seeds to the core's fall with a squad of four bots, or with `1` a lone bot-brained player with a human's health. It prints the night each run reached and each night's length and core health, then holds a full horde of 200 zombies on the squad and prints server step time, whole-tick time and snapshot bytes, first with no buildings, then against a ring of 14 always-loaded turrets and then against 70. `node .claude/skills/verify/scripts/zombies.ts "$RUN"` opens a squad on a launched server and plays its first night over `ws`. `node .claude/skills/verify/scripts/zombies-ui.ts "$RUN"` plays the same in headless Chrome through the menu, build mode, a sentry and night 1, and screenshots each state.

`node scripts/bench-maps.ts <FFA|TDM|DOM> [maps] [minutes] [players] [heatDir|-] [seeds] [capMinutes]` fills each map with bots (18 by default) on seeds 1 to `seeds` (2 by default). For each seed it plays one round under the mode's rules, capped at `capMinutes` (60 by default), then plays `minutes` more with the round held open. Per map it prints round length and, for TDM and DOM, the time each round took to reach the win score. From the open round it prints how soon the leader reaches each score, kills per minute, time from spawn to first contact, time between fights, bot life length, fight length, the share of fighting time spent in cover, the share of shots fired standing still, the share of deaths that came while low or outnumbered, and how far apart shooter and victim stood on each hit. It also prints tick time, split into bot think time and step time; raise `players` to time the bot brain in a fuller room. Last it prints the life figures over all maps and, for TDM and DOM, the mean and median time to the win score. With a heat directory it writes where players took damage and died. Pass `-` for no heat directory when you set `seeds` or `capMinutes`. `node scripts/map-overview.ts <outDir> [maps|all|none] [heat.json ...]` draws each map whole in a muted headless Chrome with the game's own ground and materials, and draws a bench's heat over it.

`node scripts/unused-exports.ts` lists every export that no file in `src/`, `test/`, `scripts/` or the verify scripts imports, and says whether its own module still uses it.

`node scripts/mock-server.ts 8787` with `node scripts/drive.ts http://localhost:8787 ./shots` is only a render check. Its fake server forces UI states (perk panels, death, the winner banner) so you can screenshot them, and proves nothing about gameplay. `node scripts/measure-bandwidth.ts [humans] [seconds] [room]` starts an isolated server, joins that many scripted clients, and prints bytes per second per client, snapshot arrival gaps and bytes per snapshot field. `node scripts/measure-lag-aim.ts [seconds] [lag:jitter ...]` starts a bot-free server, has headless Chrome tap the pistol at where it draws a scripted strafing target, and prints hit rate and damage per minute at each simulated latency.

## Deploy

The `Dockerfile` builds the client, drops dev dependencies, and runs the server as a non-root user on port 8080. Mount a volume at `/data` to keep accounts. The server saves and exits cleanly on SIGTERM.

```bash
docker build -t skirmish .
docker run -p 8080:8080 -v skirmish-data:/data skirmish
```

The server limits WebSocket connections and login attempts per IP address. Behind a reverse proxy every player arrives from the proxy's address, so they all share one limit. Set `TRUST_PROXY=1` to key the limits on the last `X-Forwarded-For` address instead, which is the one your proxy appends. Enable it only when exactly one proxy you control sits in front of the server, because clients can put any value they like at the front of that header.

```bash
docker run -p 8080:8080 -e TRUST_PROXY=1 -v skirmish-data:/data skirmish
```

### Fly.io

`fly.toml` runs the Docker image on one always-on machine with a volume at `/data`, `TRUST_PROXY=1` (Fly's edge is the one proxy in front), and a `/healthz` check. Keep it to one machine: rooms live in memory and the accounts file is not shared between machines.

```bash
fly launch --no-deploy --copy-config --name <your-app-name>
```

```bash
fly volumes create skirmish_data --size 1 --region iad
```

```bash
fly deploy
```

Change `primary_region` and the volume region to the one nearest your players. A deploy restarts the machine and disconnects everyone, so deploy at quiet times.
