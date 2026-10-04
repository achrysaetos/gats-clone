# Map rotation

Skirmish has four hand-designed maps, Boneyard, Causeway, Old Town and Citadel (`src/shared/maps.ts`). Each mode rotates through its own order. The HUD names the current map, and a pill warns before the next one.

## Sub-features

- `map-rotate-rounds` changes the map in TDM and DOM at each round restart.
- `map-rotate-timer` changes the map in FFA every 8 minutes.
- `map-notice` shows a `Next map: X in Ns` pill for the last 15s before a change.
- `map-name` names the current map in the HUD line.
- `map-respawn` teleports every living player to a fresh spawn on the new map.

## How to get to it (user POV)

- Play TDM or DOM until a team wins the round. The next round starts on the next map.
- Stay in FFA for 8 minutes.

## Driving it with drive.ts

Preconditions:

- Doctor passes on a scratch copy with short rounds. Never edit the repo itself.

- **Scratch copy.** `rsync -a --exclude node_modules --exclude .git --exclude data <repo>/ "$RUN/repo/"`, then `ln -s <repo>/node_modules "$RUN/repo/node_modules"`. In `$RUN/repo/src/shared/defs.ts` set `tdmWinScore` to `2`. In `$RUN/repo/src/shared/maps.ts` set `MAP_MS.FFA` to `30_000`. Launch with `$RUN/repo/.claude/skills/verify/scripts/launch.sh "$RUN/run"`.
- **Watcher.** Open a `ws` client to `ws://localhost:<port>/ws?room=tdm` and another to `?room=ffa`, and send `{t:'join', name, loadout:{weapon:'pistol', armor:'none', color:'green'}}` on each. On every `snap`, keep the last `match` and log `match.map`, `match.winner`, `match.nextMap` and `match.mapChangeIn` when they change.
- **Proof in TDM.** A winner appears with a next-map notice, then `match.map` advances. One run observed Citadel, Old Town, Causeway, then Boneyard.
- **Proof in FFA.** A next-map notice appears, then `match.map` changes every 30s.
- **HUD and pill.** Not scripted. Screenshot the page in the same scratch run during the last 15s to see the pill and the HUD map name.

## Gotchas

- Snapshots omit `match` when it has not changed. A raw reader must refill it from the last snapshot, as `fillSnapshot` in `src/shared/wire.ts` does.
- Never drive `abilities.ts` on this scratch config. Rounds end every few seconds and reset level and perks. See [progression](./progression-death-modes.md).
- A map change moves every living player, so a move check that spans one can fail.
