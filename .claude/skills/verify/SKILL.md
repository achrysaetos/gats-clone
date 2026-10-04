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

Steps run in order: `menu account join move fire latency chat leave`. No steps means those eight. `touch`, `mute`, `loadout`, `restart`, `reconnect` and `expire` run only when named. `loadout` must come before `join`. It presses the shotgun tile (index 2 of `#loadout-menu .weapon`, in `WEAPON_IDS` order) with a real mouse press, checks that only that tile has `aria-pressed="true"` in both `#loadout-menu` and `#loadout-death`, and checks `skirmish.loadout` in localStorage names `shotgun`. A later `join` then logs `joined player carries the picked weapon (server snapshot)`. `mute` has the observer chat, clicks its name in the chat log, and checks that its earlier and later lines are hidden while its frames still reach the page socket, that the mute and the menu's muted list survive a reload, and that clicking the muted marker shows the observer again. `restart` stops the server and starts it again on the same port and data dir, so a later `join` proves the stored session survived. `reconnect` does the same restart mid-match: it checks the page shows the `#reconnect` overlay while the server is down, then that a new `welcome` arrives on the page socket and the HUD returns within 15s without any click. It skips when the run directory has a `url` file, since it would need the server process. `move`, `fire`, `latency`, `chat` and `mute` need `join` earlier in the same invocation. `fire` also taps the mouse six times just past the weapon's fire cooldown and checks the server's ammo drops by exactly six. `latency` checks the median time from a real keydown to the first frame that draws the player moving stays at or under 50ms at any lag, and logs the largest misprediction the client smoothed meanwhile. Both are read from the page's `?dev` hook `skirmishDev.drawnSelf()`. The same hook's `skirmishDev.drawnOthers()` lists where the page draws every other player, in world and screen coordinates; `scripts/measure-lag-aim.ts` aims with it.

To measure feel under latency on localhost, set `LAG=<one-way ms>` and `JITTER=<ms>`. The driver passes them to the client's dev-only `?lag=&jitter=` params, which delay the page's own socket in both directions while keeping message order. Chrome's network emulation does not reliably shape WebSockets, so this is the supported lever. The driver launches headless Chrome (override the binary with `CHROME=`) on a free debug port and talks CDP directly. It proves behavior three independent ways:

- **DOM state** through stable ids: `#servers .server`, `#name`, `#play`, `#account`, `#menu`, `#hud`, `#chat-log`, `#perk-panel`, `#objective`, `#death`, `#death-title`, `#respawn`, `#banner`, `#reconnect`.
- **The page's own WebSocket frames**, read with `Network.webSocketFrameReceived`. Position and ammo come from the server's snapshots, not from client state.
- **An observer client** joined to the same room over `ws`. It must see the driven player on its leaderboard and receive the driven player's chat.

`node .claude/skills/verify/scripts/combat.ts "$RUN" [room ...]` is the combat driver. It joins TDM and DOM (or the rooms given), checks the objective banner, shoots until a `dmg` event from the driven player arrives in the page's frames, and opens the perk dock in the first room. Its log is `$RUN/evidence/combat.log`.

`node .claude/skills/verify/scripts/abilities.ts "$RUN" [knife] [dash]` earns the ability pick in TDM and proves the dash distance, its client prediction, and the knife slash and hit. Its log is `$RUN/evidence/abilities.log`. See [the progression recipe](features/progression-death-modes.md) for launching a scratch copy with lower level thresholds.

Real input goes through `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent`. Hold `KeyD` to move right. Press the mouse to fire. Press `Enter`, insert text, then press `Enter` to chat. Feature-specific recipes are in [features/README.md](features/README.md).

`scripts/drive.ts` and `scripts/mock-server.ts` at the repo root are a second harness that forces UI states (perk panels, death, winner banner) through mock chat commands. Use it only to check how those states render. Its server is fake, so it proves nothing about gameplay.

### Two players

```bash
node .claude/skills/verify/scripts/duel.ts "$RUN"
```

Two separate headless Chromes join FFA. The hunter walks toward the target and taps fire until both sockets agree on the hit. It checks that both browsers joined, that each had the other in its own snapshots, that the hunter's socket shows a `dmg` event naming the target, and that the target's socket shows the same hit. It writes `duel.log`, `duel-hunter-view.png` and `duel-target-view.png`. Like `drive.ts`, it targets a deployed site when the run directory has a `url` file.

### Frame time

```bash
node .claude/skills/verify/scripts/frametime.ts "$RUN" [seconds] [width] [height]
```

One headless Chrome joins FFA at 1920x1080 through `?dev`, picks the SMG, and holds fire while it strafes toward the nearest player. After a 5s warmup it logs to `frametime.log` how busy the view was (players and bullets per snapshot), `frame cost` (each real frame's draw calls, from `skirmishDev.takeFrameCosts()`) and the `requestAnimationFrame` interval. The GPU canvas defers rasterizing, so `frame cost` alone misses pixel work. `SOFTWARE=1` turns the GPU canvas off and adds `rastered frame cost`: the current frame redrawn back to back by `skirmishDev.benchFrames(n)`, each waiting for its pixels. Compare both modes before and after any art change, three runs per side, since bot positions vary.

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
