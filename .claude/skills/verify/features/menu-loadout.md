# Menu and loadout

The menu lets a player type a name, pick one of six weapons, six colors and four armor tiers, and choose an FFA, TDM or DOM room with live player counts.

## Sub-features

- `menu-rooms` lists the three rooms with player and human counts.
- `menu-loadout` selects weapon, color and armor tiles.
- `menu-phone` fits a 375px-wide screen without horizontal scroll.
- `menu-play-visible` keeps the status line and `Play` in a sticky bar at the bottom of the play panel, so `Play` is on screen without scrolling at laptop sizes.

## How to get to it (user POV)

- Open the server's root URL.
- After death, the same loadout picker appears on the death screen.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Rooms.** Run `node drive.ts "$RUN" menu`. Log line `menu lists three rooms`. Screenshot `menu-desktop.png` shows FFA, TDM and DOM rows.
- **Phone layout.** Same step. Log line `menu has no horizontal scroll at 375px`. Screenshot `menu-phone.png`.
- **Play in view.** Same step. Log lines `Play button in view without scrolling at 1366x768` and `... at 1280x800`, with the measured `getBoundingClientRect` top and bottom. Screenshot `menu-desktop.png` shows the bar over the loadout.
- **Loadout pick.** Not scripted yet. To add it, click `#loadout-menu .weapon` index N, join, and assert the page's `welcome`-following snapshot shows `players[self].weapon` equal to that weapon.

## Gotchas

- `#servers` re-renders on a timer. Query it fresh before every click.
- At laptop heights the `Server` list sits under the sticky `Play` bar until the menu scrolls. The first room is selected by default, so `Play` works without scrolling.
- A selected tile is shown by styling only. Prove the pick through the joined player's `weapon` in a snapshot, not the CSS class.
