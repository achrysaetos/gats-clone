# Accounts and stats

A player can register or log in from the menu's account box. While signed in, games credit kills, deaths and score to that account, and the box shows the saved stats.

## Sub-features

- `acct-register` creates an account and signs in.
- `acct-login` signs in to an existing account and shows an error for a wrong password.
- `acct-token` keeps the session in `localStorage` under `skirmish.token`. The token is HMAC-signed with a secret in `$RUN/data/session-secret` and lasts 30 days, so it survives a server restart.
- `acct-expired` drops a token the server rejects. `welcome.account` is null, the client clears the token, chat says `Session expired, log in again.`, and the menu shows signed out.
- `acct-stats` shows saved stats, which persist in `$RUN/data/accounts.json`.
- `acct-name` makes a signed-in player play under the account name. Guests and bots cannot take that name.
- `acct-logout` clears both `skirmish.token` and `skirmish.account` from localStorage.
- `acct-leaderboard` serves the top 20 accounts by score at `GET /api/leaderboard`.
- `acct-errors` answers a wrong password or an unknown name with 401, a malformed stats name such as `/api/stats/%E0%A4%A` with 400, and more than 10 login or register attempts per IP per minute with 429.

## How to get to it (user POV)

- The `Account` panel on the menu, with `Account name`, `Password`, `Log in` and `Register`.

## Driving it with drive.ts

Preconditions:

- Doctor passes. The run's data dir is fresh, so any name is free.

- **Register.** Run `node drive.ts "$RUN" account`. It fills `#account input` and clicks `Register`. Log lines `UI shows signed-in name`, `token stored in localStorage`, `account exists server-side (GET /api/stats)`. Screenshot `account-signed-in.png`.
- **Wrong password and login.** Not scripted yet. After registering, reload, enter a wrong password, click `Log in`, and assert the `#account .status` text shows the server error. Then log in correctly and assert `Signed in as <name>`.
- **Session survives a restart.** Run `node drive.ts "$RUN" account restart join`. `restart` stops the server with SIGTERM and starts it again on the same port and data dir. Log lines `server restarts on the same port and data dir`, `menu still shows signed in after the restart`, `server accepts the stored session (welcome.account)`. Screenshot `account-after-restart.png`.
- **Expired or forged session.** Run `node drive.ts "$RUN" expire`. It stores a forged token, reloads and joins. Log lines `server joins a forged session as a guest (welcome.account null)`, `client drops the stored token`, `chat tells the player the session expired`, `menu shows signed out after an expired session`. Screenshot `session-expired-chat.png`.
- **Stats credit.** Not scripted yet. `games` increments at join, so a rise in `games` after joining signed in proves only that the join was credited to the account. It does not prove kills, deaths or score are credited. To prove those, record `kills`, `deaths` and `score` from `GET /api/stats/<name>`, join signed in, earn a kill or die, leave, and assert the matching field rose.
- **Error codes.** Not in drive.ts. `POST` a wrong password or an unknown name as JSON `{name, password}` to `/api/login` and expect 401. `GET /api/stats/%E0%A4%A` expects 400. Send more than 10 `/api/login` or `/api/register` attempts from one IP within a minute and expect 429.

## Gotchas

- `cleanup.sh` deletes `$RUN/data`, including the session secret, so a relaunch after cleanup rejects old tokens. Use the `restart` step to keep the data dir.
- `restart` changes `$RUN/pid`. Run `cleanup.sh` afterwards as usual; it reads the new pid.
- localStorage is per origin, so a server on a different port starts the page signed out. That is why `restart` reuses the port.
- Every login or register attempt in the same run counts toward the 10 per minute limit, including the `account` step and the 401 checks. The 429 can arrive before the 11th attempt of the burst.
- The driver uses a random `Verifier####` name per run, so reruns against the same data dir do not collide.
