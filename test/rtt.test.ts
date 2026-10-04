import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Accounts } from '../src/server/accounts.ts';
import { LIMITS } from '../src/server/limits.ts';
import { createRoom } from '../src/server/room.ts';
import { MAX_REWIND_MS, rewindCapFor } from '../src/shared/sim/combat.ts';
import { IDLE_INPUT } from '../src/shared/sim/world.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const accounts = { stats: () => null, nameForToken: () => null, credit: () => {} } as unknown as Accounts;

test('a client\'s rewind is capped by the round trip its pongs measure, and only pongs answering the room\'s own ping count', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const room = createRoom('ffa', 'FFA', 1, accounts);
  const ws = fakeSocket();
  room.connect(ws.socket);
  ws.send({ t: 'join', name: 'Lagger', loadout: PISTOL, aspect: 1.5 });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  const me = room.world.players.get(welcome.id)!;
  let seq = 1;
  const capAfterInput = () => {
    ws.send({ t: 'input', seq: seq++, input: IDLE_INPUT, viewAt: 0 });
    return me.rewindCapMs;
  };

  assert.equal(capAfterInput(), MAX_REWIND_MS, 'before any round trip is measured');
  ws.pong('1');
  assert.equal(capAfterInput(), MAX_REWIND_MS, 'an unsolicited pong measures nothing');

  t.mock.timers.tick(LIMITS.rttPingMs);
  assert.equal(ws.pings.length, 1, 'pings well inside the heartbeat');
  t.mock.timers.tick(40);
  ws.pong('stale');
  assert.equal(capAfterInput(), MAX_REWIND_MS, 'a pong with the wrong payload measures nothing');
  ws.pong(ws.pings[0]!);
  assert.equal(capAfterInput(), rewindCapFor(40));
  assert.ok(rewindCapFor(40) < MAX_REWIND_MS);
  ws.close();
});
