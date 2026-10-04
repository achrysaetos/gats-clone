# Skirmish

Skirmish is a top-down multiplayer arena shooter for the browser. Its gameplay is modeled on gats.io. The name, art and code are original.

## Run

```bash
npm install
npm start
```

Open http://localhost:8080. Set `PORT` to change the port. Accounts and stats are saved in `data/`.

## Play

Pick a weapon, a color and an armor tier, then choose an FFA, TDM or DOM room. Bots keep every room at ten players or more. In TDM and DOM every body wears its team color.

Each room rotates through four maps: Boneyard (open ground with scattered cover), Causeway (three lanes split by long walls with crossings), Old Town (a grid of city blocks with narrow streets) and Citadel (a walled fort in the middle with four doors). Every mode loads the next map when a round restarts. TDM is won at 50 team kills and DOM at 1000 points. An FFA round runs 6 minutes and goes to the player with the most kills, bot or human; a human who reaches 20 kills ends it early. The next map is announced 15 seconds ahead.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Fire |
| R | Reload |
| Space | Use ability |
| 1-9, 0 | Pick a perk or an evolution (or click its tile) |
| Enter | Chat |
| M | Mute sound |

Points in one life raise your level. At 100, 300 and 400 points you pick an attachment, a survival perk and an ability. At 200 and 550 points your gun evolves into one of two branches: 6 class guns, 12 stage-1 guns and 24 stage-2 guns. Dying resets your score, perks and gun to the class gun. While your level is below the average level of the other living players, every point you earn counts 1.5 times. A player holding a stage-2 gun is hunted: every enemy minimap pings their position every 2.5 seconds and whenever they fire an unsilenced shot, the kill feed announces it, and killing them pays a 200-point bounty on top of the kill. An attacker who dealt at least 30% of a victim's max health earns a 50-point assist when someone else gets the kill.

## Layout

- `src/shared/defs.ts` holds every tuning number: weapons, armor, perks, cooldowns and world constants.
- `src/shared/maps.ts` holds the map layouts and each mode's rotation. `test/maps.test.ts` checks that every map keeps walls in bounds, keeps spawns and zones clear, can be walked end to end, and gives both teams the same walk to the DOM zones.
- `src/shared/protocol.ts` defines the wire messages and parses client input.
- `src/shared/wire.ts` encodes snapshots per connection: it rounds numbers and omits crates, leaderboard, zones and match while they are unchanged. The client rebuilds full snapshots from the last one it received.
- `src/shared/sim.ts` is the deterministic game simulation's entry point. `step` advances the world one tick, and the player commands add, remove, respawn and steer players. The rest lives in `src/shared/sim/`, one module per domain:
  - `world.ts` holds the world and player types, the seeded random source, map loading and spawn points.
  - `movement.ts` holds the collision geometry and player motion that the client also runs for prediction.
  - `stats.ts` holds perks, levels and score, and the effective stats they produce.
  - `combat.ts` holds bullets, damage, kills and lag compensation. Each input carries the server time of the world the client was drawing, and a shot first flies through that past, up to the client's measured round trip plus its render delay and never more than `MAX_REWIND_MS` back, so players hit what they aim at on screen.
  - `abilities.ts` holds the tier 3 abilities and the grenades, mines and gas they leave behind.
  - `modes.ts` holds the FFA, TDM and DOM rules and the round cycle.
  - `snapshot.ts` builds each player's culled view of the world.
- `src/server/` contains rooms, bots, accounts and the HTTP and WebSocket server.
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

`node scripts/golden-replay.ts [hash]` guards refactors of `src/shared/sim.ts` and `src/shared/sim/`. It replays fixed-seed FFA, TDM and DOM matches with bots, scripted human players, abilities, perks, lag-compensated shots and round ends, and prints one SHA-256 hash of every snapshot. Record the hash before you change the simulation's structure. Then pass it as the argument after the change. The script exits with status 1 when the hashes differ. The current hash is `ae252ef2218d8ef5c88fef5a1105866776708749a9250650d7c59c9b005a710e`.

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
