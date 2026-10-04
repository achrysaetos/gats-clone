# Menu and loadout

The menu lets a player type a name, pick one of six weapons, six colors and four armor tiers, and choose an FFA, TDM or DOM room with live player counts.

## Sub-features

- `menu-rooms` lists the three rooms with player and human counts.
- `menu-loadout` selects weapon, color and armor tiles.
- `menu-phone` fits a 375px-wide screen without horizontal scroll.
- `menu-play-visible` keeps the status line and `Play` in a sticky bar at the bottom of the play panel, so `Play` is on screen without scrolling at laptop sizes.
- `menu-connecting` disables `Play` and labels it `Connecting…` while the socket connects.
- `menu-room-refresh` re-renders the room list every 5s.
- `menu-account` shows the account panel signed out (name, password, `Log in`, `Register`) or signed in (name, stats, `Log out`). See [accounts](./accounts.md).
- `menu-muted` lists names muted in chat in the `Muted in chat` panel `#muted`, with an `Unmute` button per name. The panel is hidden when the list is empty. See [chat](./chat.md).
- `menu-privacy` links the footer to the privacy page with `href="privacy.html"`. The server sends `public/privacy.html` as `text/html`.

## How to get to it (user POV)

- Open the server's root URL.
- After death, the same loadout picker appears, compacted, on the death card docked left. It ignores clicks for the first 700ms.
- The privacy link sits in the menu footer.

## Driving it with drive.ts

Preconditions:

- Doctor passes.

- **Rooms.** Run `node drive.ts "$RUN" menu`. Log line `menu lists three rooms`. Screenshot `menu-desktop.png` shows FFA, TDM and DOM rows.
- **Phone layout.** Same step. Log line `menu has no horizontal scroll at 375px`. Screenshot `menu-phone.png`.
- **Play in view.** Same step. Log lines `Play button in view without scrolling at 1366x768` and `... at 1280x800`, with the measured `getBoundingClientRect` top and bottom. Screenshot `menu-desktop.png` shows the bar over the loadout.
- **Loadout pick.** Run `node drive.ts "$RUN" menu loadout join leave`. `loadout` must come before `join`. It presses the shotgun tile with a real mouse press. Log lines `#loadout-menu marks only the shotgun tile pressed`, `#loadout-death marks only the shotgun tile pressed`, `picked weapon saved in localStorage`, then from `join` `joined player carries the picked weapon (server snapshot)`. Screenshot `loadout-picked.png`.
- **Privacy page.** Not scripted. `curl -sI "http://localhost:$(cat "$RUN/port")/privacy.html"` shows `Content-Type: text/html`, and the menu has `a[href="privacy.html"]`.

## Gotchas

- `#servers` re-renders on a timer. Query it fresh before every click.
- At laptop heights the `Server` list sits under the sticky `Play` bar until the menu scrolls. The first room is selected by default, so `Play` works without scrolling.
- The selected tile carries `aria-pressed="true"` (`src/client/menu.ts`), so the pick is checkable in the DOM. The real proof is still the joined player's `gun` in a server snapshot, which equals the picked class until the gun evolves.
