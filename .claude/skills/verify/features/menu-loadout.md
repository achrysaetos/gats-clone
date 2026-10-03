# Menu and loadout

The menu lets a player type a name, pick one of six weapons, six colors and four armor tiers, and choose an FFA, TDM or DOM room with live player counts.

## Sub-features

- `menu-rooms` lists the three rooms with player and human counts.
- `menu-loadout` selects weapon, color and armor tiles.
- `menu-phone` fits a 375px-wide screen without horizontal scroll.

## How to get to it (user POV)

- Open the server's root URL.
- After death, the same loadout picker appears on the death screen.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Rooms.** Run `node drive.ts "$RUN" menu`. Log line `menu lists three rooms`. Screenshot `menu-desktop.png` shows FFA, TDM and DOM rows.
- **Phone layout.** Same step. Log line `menu has no horizontal scroll at 375px`. Screenshot `menu-phone.png`.
- **Loadout pick.** Not scripted yet. To add it, click `#loadout-menu .weapon` index N, join, and assert the page's `welcome`-following snapshot shows `players[self].weapon` equal to that weapon.

## Gotchas

- `#servers` re-renders on a timer. Query it fresh before every click.
- A selected tile is shown by styling only. Prove the pick through the joined player's `weapon` in a snapshot, not the CSS class.
