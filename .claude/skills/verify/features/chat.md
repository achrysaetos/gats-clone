# Chat

Pressing Enter in a match opens the chat box. The message appears in the sender's chat log and reaches every other player in the room.

## Sub-features

- `chat-send` sends a message from the chat box.
- `chat-receive` delivers it to another client in the same room.
- `chat-limit` drops messages sent faster than about one per second.

## How to get to it (user POV)

- In a match, press `Enter`, type, press `Enter`. `Escape` cancels.

## Driving it with drive.ts

Preconditions:

- Doctor passes. The step needs `join` first.

- **Send and receive.** Run `node drive.ts "$RUN" join chat`. Log lines `own chat log shows the message` and `observer in the same room receives it`. Screenshot `chat.png`.
- **Rate limit.** Not scripted in drive.ts. `test/e2e.test.ts` covers it at the WebSocket level.

## Gotchas

- Movement keys are ignored while the chat box is open. Close chat before driving movement in the same run.
- A message sent within a second of another is dropped silently, so space out chat steps.
