# Accounts and stats

A player can register or log in from the menu's account box. While signed in, games credit kills, deaths and score to that account, and the box shows the saved stats.

## Sub-features

- `acct-register` creates an account and signs in.
- `acct-login` signs in to an existing account and shows an error for a wrong password.
- `acct-token` keeps the session in `localStorage` under `skirmish.token`.
- `acct-stats` shows saved stats, which persist in `$RUN/data/accounts.json`.

## How to get to it (user POV)

- The `Account` panel on the menu, with `Account name`, `Password`, `Log in` and `Register`.

## Driving it with drive.ts

Preconditions:

- Doctor passes. The run's data dir is fresh, so any name is free.

- **Register.** Run `node drive.ts "$RUN" account`. It fills `#account input` and clicks `Register`. Log lines `UI shows signed-in name`, `token stored in localStorage`, `account exists server-side (GET /api/stats)`. Screenshot `account-signed-in.png`.
- **Wrong password and login.** Not scripted yet. After registering, reload, enter a wrong password, click `Log in`, and assert the `#account .status` text shows the server error. Then log in correctly and assert `Signed in as <name>`.
- **Stats credit.** Not scripted yet. Join signed in, die or leave, then assert `GET /api/stats/<name>` shows `games` increased.

## Gotchas

- Tokens live in server memory. Relaunching the server signs everyone out, but accounts and stats persist in the data dir.
- The driver uses a random `Verifier####` name per run, so reruns against the same data dir do not collide.
