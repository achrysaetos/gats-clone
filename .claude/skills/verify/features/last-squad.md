# Last Squad

Last Squad is the `br` room: a battle royale for six squads of three, one squad per color, on the four versus maps in rotation. A shrinking ring closes in six phases (`RING` in `src/shared/defs.ts`) and burns anyone outside it through armor and the spawn shield. A player whose health runs out while a squadmate stands is knocked: they crawl with half their max health as a pool enemies can shoot through to finish them, and a squadmate holding E within 70px for 3 seconds revives them. A squad is out once nobody in it stands. Until the third phase closes the dead redeploy beside a standing squadmate after 15 seconds, 10 more for each earlier death; then `Last lives`. A supply drop per phase lands inside the next circle and jumps its breaker to their next level pick. The last squad standing wins. Dead players spectate a squadmate, their killer or a survivor, and a squad that is out gets its result card.

## Sub-features

- `br-room` is listed by `/api/servers` as `{ id: 'br', mode: 'BR' }`. `createRoom` fills it to six squads of three with bots. A joiner while redeploys are open takes the place of a bot in the squad with fewest humans (`seatFor` and `takeSeat` in `src/shared/sim/royale.ts`): its spot and its state, up, knocked or waiting to redeploy. A leaver hands the place back to a new bot. After the third phase closes a joiner gets `team: null` and a dead life until the next match's `startRoyale` seats them.
- `br-ring` is `Royale.ring` in `src/shared/sim/world.ts`, a state machine of `waiting`, `shrinking` and `closed`. The snapshot's `royale.ring` is `{ phase, from, to, shrinkAt, closeAt }`, and `ringAt(ring, serverTime)` in `src/shared/protocol.ts` gives the circle at any time on both server and client. `phase` counts the phases closed. Ring damage ships one `dmg` event a second with `attacker: null`.
- `br-knock` turns a death into `life: 'downed'` while a squadmate is up. The `kill` event carries `knock: true` and pays the kill. A finish ships `life` with `k: 'finished'` and `by` the finisher, or `by: null` for the ring. Revives ship `revived`, bleed-outs `bledOut`, redeploys `redeployed`, and a squad going out ships `{ e: 'wiped', team, place }`.
- `br-view` is `snap.royale`: `ring`, `redeploys` (false once the third phase closes), `squads` (`{ team, pips: ('up' | 'down' | 'dead')[], place }`), `redeployAt` (server time, or null), `drops` (`{ x, y, landsAt }`, 0 once landed and still standing), `watch` (the player id the camera follows while dead) and `result` (`{ place, of, kills, knocks, revives }` once your squad is out or the match is over). It is sticky on the wire.
- `br-drops` announce 10 seconds before landing, 20 seconds into each phase's wait. A landed drop is a crate with `drop: true` and 300 hp. Crates pay 25 and never respawn.
- `br-hud` is the pill (`RING 2/6` and the time to the ring's next move, `FINAL` at the end), the squad tracker under it (six columns of three pips: filled up, hollow knocked, faint dead, `#n` once out), the storm tint and the edge outside the circle with the next circle dashed in the world and on the minimap, `Ring closes in 0:24` or `Ring closing · 0:12` above the minimap with `Last lives` under it once redeploys close, gold drop marks, `KNOCKED` tags and finish, redeploy and `Red squad is out · #4` lines in the feed, the downed banner, `Hold E to revive <name>`, `Watching <name>` with the redeploy countdown or the squad's place while dead, `The ring is moving` and `Last lives` callouts, the `knock` and `ring` sounds, and `#report` with `#1 · Last squad standing` or `#4 of 6` and kills, knocks and revives. The death card stays closed in this mode.
- `br-bots` are `src/server/bot/royale.ts`: the versus brain held to the squad's anchor, revives, a crawl toward a squadmate while knocked, and the ring's pull.

## How to get to it (user POV)

- On the menu pick the room marked `BR` and press Play. Stay inside the circle, hold E beside a knocked squadmate, and shoot the gold-framed drop when it lands.

## Driving it with drive.ts

Preconditions:

- Doctor passes and lists four rooms.

- **The client in a browser.** The stock ring takes six minutes, so launch a scratch copy with a fast, hard ring, never by editing the repo: `rsync -a --exclude node_modules --exclude .git <repo>/ "$SCR/repo/"`, `ln -s <repo-or-parent>/node_modules "$SCR/repo/node_modules"`, then in `$SCR/repo/src/shared/defs.ts` set every `RING` row's `waitMs` to `10_000` (the first to `12_000`), every `shrinkMs` to `6_000`, `dps` to `0.06` for the first three rows, `ROYALE.redeployPhases` to `1` and `ROYALE.dropLandMs` to `8_000`. Run `$SCR/repo/.claude/skills/verify/scripts/launch.sh "$SCR/run"` and `node .claude/skills/verify/scripts/royale-ui.ts "$SCR/run"` from `$SCR/repo`. It joins through the menu (`room: 3`), then walks straight away from the next circle's centre and stays out. It logs `the menu joins the Last Squad room`, `the player is seated in a squad of three`, `six squads are tracked`, `the ring catches the player outside it`, `the ring hurts the player outside it` (counting `dmg` events with no attacker), `the ring takes the player down`, `a knocked player stays in play, not on the death screen`, `the player dies`, `a dead player watches someone`, `the camera follows the watched player` (from `skirmishDev.toScreen`, within 120px of the centre), `the death screen stays closed while spectating`, `the result card shows the place`, `it reads as a place with kills, knocks and revives` and `the feed carried knocks and squad wipes`. Screenshots: `br-start`, `br-ring`, `br-knocked`, `br-spectate`, `br-result`. Log: `$SCR/run/evidence/royale-ui.log`. About 2 minutes.
- **The rules without a browser.** `node --test test/royale.test.ts` covers the ring, knocks, finishes, squads going out, placement, friendly fire, redeploys and last lives, spectating, drops, crates and seats.
- **Pacing.** `node scripts/bench-royale.ts --seeds 32` plays 128 bot matches and prints match length, ring deaths, fights a minute by phase, the last fight's phase and the proxy squad's wins.

## Gotchas

- A room stands still until a human joins, so the ring's clock starts with the first joiner.
- A knocked bot crawls toward its nearest standing squadmate, so `downed` players move.
- A dead player who is still waiting to redeploy also spectates; the label then counts down to the redeploy.
