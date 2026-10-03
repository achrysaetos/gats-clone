# Accounts and stats

A player can register or log in from the menu's account box. While signed in, games credit kills, deaths and score to that account, and the box shows the saved stats.

## Sub-features

- `acct-register` creates an account and signs in.
- `acct-login` signs in to an existing account and shows an error for a wrong password.
- `acct-token` keeps the session in `localStorage` under `skirmish.token`. The token is HMAC-signed with a secret in `$RUN/data/session-secret` and lasts 30 days, so it survives a server restart.
- `acct-expired` drops a token the server rejects. `welcome.account` is null, the client clears the token, chat says `Session expired, log in again.`, and the menu shows signed out.
- `acct-stats` shows saved stats, which persist in `$RUN/data/accounts.json`.

## How to get to it (user POV)

- The `Account` panel on the menu, with `Account name`, `Password`, `Log in` and `Register`.

## Driving it with drive.ts

Preconditions:

- Doctor passes. The run's data dir is fresh, so any name is free.

- **Register.** Run `node drive.ts "$RUN" account`. It fills `#account input` and clicks `Register`. Log lines `UI shows signed-in name`, `token stored in localStorage`, `account exists server-side (GET /api/stats)`. Screenshot `account-signed-in.png`.
- **Wrong password and login.** Not scripted yet. After registering, reload, enter a wrong password, click `Log in`, and assert the `#account .status` text shows the server error. Then log in correctly and assert `Signed in as <name>`.
- **Session survives a restart.** Run `node drive.ts "$RUN" account restart join`. `restart` stops the server with SIGTERM and starts it again on the same port and data dir. Log lines `server restarts on the same port and data dir`, `menu still shows signed in after the restart`, `server accepts the stored session (welcome.account)`. Screenshot `account-after-restart.png`.
- **Expired or forged session.** Run `node drive.ts "$RUN" expire`. It stores a forged token, reloads and joins. Log lines `server joins a forged session as a guest (welcome.account null)`, `client drops the stored token`, `chat tells the player the session expired`, `menu shows signed out after an expired session`. Screenshot `session-expired-chat.png`.
- **Stats credit.** Not scripted yet. Join signed in, die or leave, then assert `GET /api/stats/<name>` shows `games` increased.

## Gotchas

- `cleanup.sh` deletes `$RUN/data`, including the session secret, so a relaunch after cleanup rejects old tokens. Use the `restart` step to keep the data dir.
- `restart` changes `$RUN/pid`. Run `cleanup.sh` afterwards as usual; it reads the new pid.
- localStorage is per origin, so a server on a different port starts the page signed out. That is why `restart` reuses the port.
- The driver uses a random `Verifier####` name per run, so reruns against the same data dir do not collide.
