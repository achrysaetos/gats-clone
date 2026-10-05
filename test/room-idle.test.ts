import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Accounts } from '../src/server/accounts.ts';
import { createRoom } from '../src/server/room.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const accounts = { stats: () => null, credit: () => {} } as unknown as Accounts;

test('a room with no human in it stands still, and runs again once one joins and stops when they leave', () => {
  const room = createRoom('tdm', 'TDM', 1, accounts);
  const start = room.world.tick;
  for (let i = 0; i < 30; i++) room.tick();
  assert.equal(room.world.tick, start, 'no ticks without a human');

  const ws = fakeSocket();
  room.connect(ws.socket);
  for (let i = 0; i < 5; i++) room.tick();
  assert.equal(room.world.tick, start, 'a socket still in the lobby does not wake the room');

  ws.send({ t: 'join', name: 'Tester', loadout: PISTOL, aspect: 1.5 });
  for (let i = 0; i < 30; i++) room.tick();
  assert.equal(room.world.tick, start + 30, 'every tick runs with a human joined');

  ws.close();
  const left = room.world.tick;
  for (let i = 0; i < 30; i++) room.tick();
  assert.equal(room.world.tick, left, 'still again once the human leaves');
});
