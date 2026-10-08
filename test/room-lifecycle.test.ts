import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Accounts } from '../src/server/accounts.ts';
import { createRoom } from '../src/server/room.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

type Credit = { name: string; kills: number; deaths: number; score: number; games: number };

function signedInAccounts() {
  const credits: Credit[] = [];
  const accounts = {
    stats: (name: string) => (name.toLowerCase() === 'ace' ? { name: 'Ace' } : null),
    nameForToken: (token: string) => (token === 'ace-token' ? 'Ace' : null),
    credit: (name: string, d: Omit<Credit, 'name'>) => { credits.push({ name, ...d }); },
  } as unknown as Accounts;
  return { accounts, credits };
}

test('closing a room (a squad gone idle, a server shutting down) credits each seated life at once, not when the close handshake ends', () => {
  const { accounts, credits } = signedInAccounts();
  const room = createRoom('ffa', 'FFA', 1, accounts);
  const ws = fakeSocket();
  const lurker = fakeSocket();
  room.connect(ws.socket);
  room.connect(lurker.socket);
  ws.send({ t: 'join', name: 'Ace', loadout: PISTOL, aspect: 1.5, token: 'ace-token' });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome && welcome.t === 'welcome' && welcome.account === 'Ace');
  room.tick();
  const p = room.world.players.get(welcome.id)!;
  p.lifeKills = 3;
  p.score = 450;

  // The fake socket's close() never emits 'close', as a real peer that is slow (or never) to answer the close frame.
  // The server flushes accounts right after closing its rooms and exits, so whatever waits for that event is lost.
  room.close();
  const life = credits.find((c) => c.kills > 0 || c.score > 0);
  assert.deepEqual(life, { name: 'Ace', kills: 3, deaths: 0, score: 450, games: 0 }, 'the life in progress is credited by close() itself');
  assert.equal(room.info().humans, 0, 'the closed room seats nobody');
  lurker.send({ t: 'join', name: 'Late', loadout: PISTOL, aspect: 1.5 });
  assert.equal(room.info().humans, 0, 'a lobby socket still finishing its close handshake cannot join the closed room');
  assert.ok(!lurker.sent.some((m) => m.t === 'welcome'));
  lurker.close();

  // The close event arriving later must not credit the same life twice.
  ws.close();
  assert.equal(credits.filter((c) => c.kills > 0 || c.score > 0).length, 1);
});
