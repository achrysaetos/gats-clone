import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Accounts } from '../src/server/accounts.ts';
import { LIMITS } from '../src/server/limits.ts';
import { createRoom } from '../src/server/room.ts';
import type { InputState, Snapshot } from '../src/shared/protocol.ts';
import { IDLE_INPUT } from '../src/shared/sim/world.ts';
import { fakeSocket } from './helpers.ts';

const accounts = { stats: () => null, nameForToken: () => null, credit: () => {} } as unknown as Accounts;

function joinAlone(t: TestContext, weapon: 'pistol' | 'smg' = 'pistol') {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 0 });
  const ws = fakeSocket();
  room.connect(ws.socket);
  ws.send({ t: 'join', name: 'Solo', loadout: { weapon, armor: 'none', color: 'red' }, aspect: 1.5 });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  const me = room.world.players.get(welcome.id)!;
  const input = (seq: number, over: Partial<InputState> = {}) => ws.send({ t: 'input', seq, input: { ...IDLE_INPUT, ...over }, viewAt: null });
  const tick = () => {
    room.tick();
    const snap = ws.sent.at(-1) as Snapshot;
    return { ackSeq: snap.ackSeq, x: me.x, shots: room.world.events.filter((e) => e.e === 'shot' && e.owner === me.id).length };
  };
  return { room, me, input, tick };
}

test('two inputs that land in one tick are applied in order, one per tick, each acknowledged', (t) => {
  const { me, input, tick } = joinAlone(t);
  const x0 = me.x;
  input(1, { right: true });
  input(2, { right: false });
  const first = tick();
  assert.equal(first.ackSeq, 1);
  assert.ok(first.x > x0, `the first input's step moved the player right (${x0} -> ${first.x})`);
  const second = tick();
  assert.equal(second.ackSeq, 2);
  assert.equal(second.x, first.x, 'the second input stopped the player');
});

test('a held trigger released in the same tick still fires the shot it was held for', (t) => {
  const { input, tick } = joinAlone(t, 'smg');
  input(1, { fire: true });
  input(2, { fire: false });
  assert.equal(tick().shots + tick().shots, 1);
});
