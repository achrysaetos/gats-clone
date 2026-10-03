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

At 100, 300 and 600 points you pick an attachment, then a survival perk, then an ability.

## Layout

- `src/shared/defs.ts` holds every tuning number: weapons, armor, perks, cooldowns and world constants.
- `src/shared/protocol.ts` defines the wire messages and parses client input.
- `src/shared/wire.ts` encodes snapshots per connection: it rounds numbers and omits crates, leaderboard, zones and match while they are unchanged. The client rebuilds full snapshots from the last one it received.
- `src/shared/sim.ts` is the deterministic game simulation.
- `src/server/` contains rooms, bots, accounts and the HTTP and WebSocket server.
- `src/client/` contains the browser client.

## Verify

```bash
npm test
npx tsc --noEmit
node scripts/mock-server.ts 8787
node scripts/drive.ts http://localhost:8787 ./shots
```

Run the mock server in its own terminal. `node scripts/measure-bandwidth.ts [humans] [seconds] [room]` starts an isolated server, joins that many scripted clients, and prints bytes per second per client, snapshot arrival gaps and bytes per snapshot field. `npm test` runs the simulation, protocol, client and end-to-end server tests. `drive.ts` drives headless Chrome through the menu, login, perks, chat, death and respawn. Set `CHROME` if Chrome is not at the default macOS path.

## Deploy

The `Dockerfile` builds the client, drops dev dependencies, and runs the server as a non-root user on port 8080. Mount a volume at `/data` to keep accounts. The server saves and exits cleanly on SIGTERM.

```bash
docker build -t skirmish .
docker run -p 8080:8080 -v skirmish-data:/data skirmish
```
