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

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Fire |
| R | Reload |
| Space | Use ability |
| 1-9, 0 | Pick a perk (or click its tile) |
| Enter | Chat |
| M | Mute sound |

At 100, 250 and 450 points you pick an attachment, then a survival perk, then an ability.

## Layout

- `src/shared/defs.ts` holds every tuning number: weapons, armor, perks, cooldowns and world constants.
- `src/shared/protocol.ts` defines the wire messages and parses client input.
- `src/shared/wire.ts` encodes snapshots per connection: it rounds numbers and omits crates, leaderboard, zones and match while they are unchanged. The client rebuilds full snapshots from the last one it received.
- `src/shared/sim.ts` is the deterministic game simulation.
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

`node scripts/mock-server.ts 8787` with `node scripts/drive.ts http://localhost:8787 ./shots` is only a render check. Its fake server forces UI states (perk panels, death, the winner banner) so you can screenshot them, and proves nothing about gameplay. `node scripts/measure-bandwidth.ts [humans] [seconds] [room]` starts an isolated server, joins that many scripted clients, and prints bytes per second per client, snapshot arrival gaps and bytes per snapshot field.

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
