---
name: verify
description: Drive the Skirmish browser game (top-down multiplayer shooter, Node server + Canvas client) against a real, isolated server to prove gameplay and UI behavior. Use after any change to src/client, src/server, src/shared, or public/, before declaring a gameplay or UI change done, or when asked to run, check, or screenshot the game.
---

# Verify Skirmish

Skirmish is a browser game. The user touches the web page served by `src/server/main.ts`: the menu (loadout, rooms, account) and the canvas game (HUD, chat, death screen). The server also exposes `/api/*` JSON routes and a WebSocket at `/ws?room=<ffa|tdm|dom>`. Bots fill every room, so a single driver always has opponents.

All helpers live in `.claude/skills/verify/scripts/` and take one argument, a run directory you choose. Put it in your session scratchpad, for example `RUN=<scratchpad>/verify-$(date +%s)`. Every instance gets its own port and data dir, so parallel runs never share state. Never drive a server this run did not start, and never touch the user's `data/` directory.

## Launch

```bash
.claude/skills/verify/scripts/launch.sh "$RUN"
```

It runs `npm install` if `node_modules` is missing, rebuilds `public/game.js` with `npm run build`, picks a free port, and starts `node src/server/main.ts` with `PORT` and `DATA_DIR=$RUN/data`. Ready means it printed `ready: http://localhost:<port>`, which follows the server's `Skirmish listening on` log line. The server log is `$RUN/server.log`. Rerunning launch on a live run is a no-op.

## Doctor

```bash
.claude/skills/verify/scripts/doctor.sh "$RUN"
```

Read-only. It checks the pid is alive, the port is owned by that pid, all three rooms answer `/api/servers`, `game.js` is served, and the bundle is newer than every `src/**/*.ts`. A stale bundle means the browser runs old code. Relaunch instead of driving it. Run doctor first whenever a result looks wrong.

## Drive

```bash
node .claude/skills/verify/scripts/drive.ts "$RUN" [step ...]
```

Steps run in order: `menu account join move fire latency chat leave`. No steps means those eight. `touch`, `restart` and `expire` run only when named. `restart` stops the server and starts it again on the same port and data dir, so a later `join` proves the stored session survived. `move`, `fire`, `latency` and `chat` need `join` earlier in the same invocation. `fire` also taps the mouse six times just past the weapon's fire cooldown and checks the server's ammo drops by exactly six. `latency` checks the median time from a real keydown to the first frame that draws the player moving stays at or under 50ms at any lag, and logs the largest misprediction the client smoothed meanwhile. Both are read from the page's `?dev` hook `skirmishDev.drawnSelf()`.

To measure feel under latency on localhost, set `LAG=<one-way ms>` and `JITTER=<ms>`. The driver passes them to the client's dev-only `?lag=&jitter=` params, which delay the page's own socket in both directions while keeping message order. Chrome's network emulation does not reliably shape WebSockets, so this is the supported lever. The driver launches headless Chrome (override the binary with `CHROME=`) on a free debug port and talks CDP directly. It proves behavior three independent ways:

- **DOM state** through stable ids: `#servers .server`, `#name`, `#play`, `#account`, `#menu`, `#hud`, `#chat-log`, `#perk-panel`, `#objective`, `#death`, `#death-title`, `#respawn`, `#banner`.
- **The page's own WebSocket frames**, read with `Network.webSocketFrameReceived`. Position and ammo come from the server's snapshots, not from client state.
- **An observer client** joined to the same room over `ws`. It must see the driven player on its leaderboard and receive the driven player's chat.

`node .claude/skills/verify/scripts/combat.ts "$RUN" [room ...]` is the combat driver. It joins TDM and DOM (or the rooms given), checks the objective banner, shoots until a `dmg` event from the driven player arrives in the page's frames, and opens the perk dock in the first room. Its log is `$RUN/evidence/combat.log`.

Real input goes through `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent`. Hold `KeyD` to move right. Press the mouse to fire. Press `Enter`, insert text, then press `Enter` to chat. Feature-specific recipes are in [features/README.md](features/README.md).

`scripts/drive.ts` and `scripts/mock-server.ts` at the repo root are a second harness that forces UI states (perk panels, death, winner banner) through mock chat commands. Use it only to check how those states render. Its server is fake, so it proves nothing about gameplay.

## Evidence

The driver writes `$RUN/evidence/drive.log`, one `ok` or `FAIL` line per check with measured values (for example `x 736 -> 914`, `ammo 12 -> 11`), and a final `RESULT PASS` or `RESULT FAIL`. It saves a PNG per step to `$RUN/evidence/`. It exits non-zero on any failed check, page exception or `console.error`.

Proof standards:
- Drive the real user path. Never call `/api/*` or the sim to cause the behavior you are proving. Reading `/api/*` to confirm a side effect is fine.
- Capture both the action and the resulting state. A screenshot alone is not proof. Pair it with the measured log line.
- Confirm side effects. An account must exist via `GET /api/stats/<name>`. A join must raise `humans` in `/api/servers`. Chat must reach another client.
- The only mock allowed for gameplay proof is none. Bots are real server participants, not mocks.
- When you add a check, break the behavior once (for example, stop `room.ts` from calling `setInput`) and confirm the check fails, then restore the file.

## Cleanup

```bash
.claude/skills/verify/scripts/cleanup.sh "$RUN"
```

Kills only the pid in `$RUN/pid`, then deletes `$RUN/data`, `$RUN/pid` and `$RUN/port`. It keeps `$RUN/evidence/` and `$RUN/server.log`. Run cleanup after every attempt, including failed ones. The driver kills its own Chrome on exit.

## Gotchas

- `/api/servers` counts the observer as a human. Compare against a baseline, never against an absolute number.
- Navigating the page to `about:blank` keeps the old page in Chrome's back/forward cache, so its socket stays open. Use `Page.reload` to unload the page the way closing a tab would.
- The menu's server list re-renders every few seconds, so element handles go stale. Query fresh each time, or click through `Runtime.evaluate`.
- Bots can kill the driven player mid-run, and a dead player has no position in snapshots. `move`, `fire` and `touch` call `ensureAlive`, which respawns through the real death screen and logs a `note` line, so a death no longer fails the run.
