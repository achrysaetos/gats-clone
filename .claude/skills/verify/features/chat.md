# Chat

Pressing Enter in a match opens the chat box. The message appears in the sender's chat log and reaches every other player in the room. The server masks blocked words, and each player can mute a sender for themselves.

## Sub-features

- `chat-send` sends a message from the chat box. The server trims it and caps it at 120 characters. Blank text never leaves the client. Opening the box releases every held movement key and stops firing.
- `chat-receive` delivers it to every client in the room. In TDM it goes to both teams, and each sender's name is tinted their team colour. Your own name is plain bold text, not a button.
- `chat-log` docks bottom-left (raised to 136px from the bottom at 900px wide or less). It shows the last 8 lines, and each line fades out 15s after it arrives unless the box is open.
- `chat-system` lines carry no sender and are tinted the accent colour: server `error` frames, `Reconnected.`, the expired-session notice, `Sound on` / `Sound off (M to turn on)` and `You build by day.`.
- `chat-limit` accepts at most one message per client per 1000 ms, measured from the last accepted message. An over-limit message reaches nobody. The server replies `{t:'error', message:'Slow down'}` and the client shows it as a system chat line.
- `chat-mask` replaces blocked words with asterisks before the broadcast. Lookalikes such as `sh1t` are caught. Operators extend the list with `<dataDir>/blocklist.txt`.
- `chat-name-filter` joins a guest whose name contains a blocked word as `Player`, deduped with a number like any other name.
- `chat-mute` hides a sender for this viewer only. Clicking a sender's name in `#chat-log` mutes it and stores it in localStorage `skirmish.mutedNames`. The muted sender's lines collapse to one marker, the sender's name followed by a `muted` tag. Clicking that name, or `Unmute` in the menu's `#muted` panel, shows the sender again. The panel is headed `Muted in chat` and is hidden while nobody is muted.

## How to get to it (user POV)

- In a match, press `Enter`, type, press `Enter`. `Escape` cancels.
- Click a name in the chat log to mute it. Click the name on the muted marker to unmute.

## Driving it with drive.ts

Preconditions:

- Doctor passes. The steps need `join` first.

- **Send and receive.** Run `node drive.ts "$RUN" join chat`. Log lines `own chat log shows the message` and `observer in the same room receives it`. Screenshot `chat.png`.
- **Mute.** Run `node drive.ts "$RUN" join chat mute`. The observer chats and the page clicks its name. Log lines `muted name stored in localStorage`, `earlier line from the muted player is hidden`, `chat log shows a muted marker for the player`, `page socket still receives the muted player chat`, `later line from the muted player is not shown`, `menu lists the muted player after a reload`, `muted player stays hidden after the reload`, `after unmuting, the player is shown again` and `unmuting clears the stored name`. Screenshots `chat-muted.png`, `menu-muted-list.png` and `chat-muted-after-reload.png`.
- **Masking, renaming and rate limit.** Not in drive.ts. Open two `ws` clients to `ws://localhost:<port>/ws?room=ffa` and send `{t:'join', name, loadout:{weapon:'pistol', armor:'none', color:'green'}}` on each. Join one as `sh1tlord`. The other client's snapshot `leaderboard` lists it as `Player`. Send `{t:'chat', text:'nice shot sh1t'}` from it. The other client receives `nice shot ****`. Send a second chat within 1 s. The sender receives an `error` frame with `Slow down`, and the other client receives nothing.

## Gotchas

- Movement keys are ignored while the chat box is open. Close chat before driving movement in the same run.
- Space chat steps more than 1 s apart. A faster message is rejected with `Slow down` and reaches nobody.
- Every socket also has a message budget of 60 per second with a burst of 120 across all message kinds. Past it the server closes the socket with code 1008 `too many messages`.
- Mute is per viewer. The muted sender's frames still arrive on the page socket, so prove a mute from the chat log text, not from the frames.
