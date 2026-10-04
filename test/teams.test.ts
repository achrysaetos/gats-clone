import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODE_IDS, WORLD } from '../src/shared/defs.ts';
import type { Accounts } from '../src/server/accounts.ts';
import { createRoom, type Room } from '../src/server/room.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const accounts = { stats: () => null, nameForToken: () => null, credit: () => {} } as unknown as Accounts;

function sidesWith(room: Room, humans: number) {
  const sockets = Array.from({ length: humans }, (_, i) => {
    const ws = fakeSocket();
    room.connect(ws.socket);
    ws.send({ t: 'join', name: `Human${i}`, loadout: PISTOL, aspect: 1.5 });
    return ws;
  });
  const ps = [...room.world.players.values()];
  for (const ws of sockets) ws.close();
  const tally = (team: 'red' | 'blue', kind?: 'human') => ps.filter((p) => p.team === team && (!kind || p.kind === kind)).length;
  return { redHumans: tally('red', 'human'), blueHumans: tally('blue', 'human'), red: tally('red'), blue: tally('blue') };
}

for (const mode of MODE_IDS.filter((m) => m !== 'FFA')) {
  test(`${mode}: two humans land on opposite teams`, () => {
    const s = sidesWith(createRoom('r', mode, 1, accounts), 2);
    assert.deepEqual({ red: s.redHumans, blue: s.blueHumans }, { red: 1, blue: 1 });
  });

  test(`${mode}: four humans split two and two, with the bots keeping the teams level`, () => {
    assert.deepEqual(sidesWith(createRoom('r', mode, 1, accounts), 4), { redHumans: 2, blueHumans: 2, red: WORLD.minPlayers / 2, blue: WORLD.minPlayers / 2 });
  });
}
