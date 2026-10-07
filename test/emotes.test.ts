import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { EMOTE_IDS, EMOTE_RANGE } from '../src/shared/emotes.ts';
import { parseClientMsg } from '../src/shared/protocol.ts';
import type { Accounts } from '../src/server/accounts.ts';
import { createRoom } from '../src/server/room.ts';
import { fakeSocket, PISTOL } from './helpers.ts';
import { sectorAt } from '../src/client/emotewheel.ts';
import { bubbleAlpha, EMOTE_SHOW_MS, idleTouch, IDLE_AFTER_MS, popScale } from '../src/client/emotefx.ts';
import { isAnniversary, isCenturion } from '../src/client/friendly.ts';

const sockets: ReturnType<typeof fakeSocket>[] = [];
after(() => { for (const s of sockets) s.close(); });
const accounts = { stats: () => null, credit: () => {} } as unknown as Accounts;

test('emote frames parse only for the known emotes', () => {
  for (const id of EMOTE_IDS) assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'emote', id, junk: 1 })), { t: 'emote', id });
  for (const bad of [{ t: 'emote' }, { t: 'emote', id: 'dance' }, { t: 'emote', id: 7 }, { t: 'emote', id: '<b>' }]) assert.equal(parseClientMsg(JSON.stringify(bad)), null);
});

function joined(room: ReturnType<typeof createRoom>, name: string, team: 'red' | 'blue', at: { x: number; y: number }) {
  const ws = fakeSocket();
  sockets.push(ws);
  room.connect(ws.socket);
  ws.send({ t: 'join', name, loadout: PISTOL, aspect: 1.5 });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome && welcome.t === 'welcome');
  const p = room.world.players.get(welcome.id)!;
  p.team = team;
  p.x = at.x; p.y = at.y;
  return { ws, p };
}
const emotes = (c: { ws: ReturnType<typeof fakeSocket> }) => c.ws.sent.filter((m) => m.t === 'emote');

test('an emote reaches the sender, nearby players and the sender\'s team, but not far-off rivals', () => {
  const room = createRoom('tdm', 'TDM', 1, accounts);
  const a = joined(room, 'Aa', 'red', { x: 500, y: 500 });
  const near = joined(room, 'Bb', 'blue', { x: 500 + EMOTE_RANGE - 10, y: 500 });
  const mate = joined(room, 'Cc', 'red', { x: 500 + EMOTE_RANGE * 3, y: 500 });
  const far = joined(room, 'Dd', 'blue', { x: 500 + EMOTE_RANGE * 3, y: 900 });
  a.ws.send({ t: 'emote', id: 'gg' });
  for (const c of [a, near, mate]) assert.deepEqual(emotes(c), [{ t: 'emote', pid: a.p.id, id: 'gg' }]);
  assert.equal(emotes(far).length, 0);
});

test('emotes are rate limited per player and ignored from the fallen', () => {
  const room = createRoom('tdm', 'TDM', 1, accounts);
  const a = joined(room, 'Aa', 'red', { x: 500, y: 500 });
  const b = joined(room, 'Bb', 'red', { x: 520, y: 500 });
  for (let i = 0; i < 20; i++) a.ws.send({ t: 'emote', id: 'wave' });
  assert.equal(emotes(b).length, 1, 'a spammer gets one through');
  assert.equal(a.ws.sent.filter((m) => m.t === 'error').length, 0, 'and no error to chat about');
  b.p.life = { k: 'dead', respawnAt: Infinity };
  b.ws.send({ t: 'emote', id: 'taunt' });
  assert.equal(emotes(a).length, 1, 'the dead say nothing more: only the earlier wave is there');
});

test('an emote never changes the simulation', () => {
  const room = createRoom('ffa', 'FFA', 1, accounts);
  const a = joined(room, 'Aa', 'red', { x: 500, y: 500 });
  const before = JSON.stringify([a.p.x, a.p.y, a.p.input, room.world.tick]);
  a.ws.send({ t: 'emote', id: 'help' });
  assert.equal(JSON.stringify([a.p.x, a.p.y, a.p.input, room.world.tick]), before);
});

test('the wheel picks the plate under the pointer, clockwise from the top, and nothing in the hub', () => {
  assert.equal(sectorAt(0, -100), 0);
  assert.equal(sectorAt(100, 0), 2);
  assert.equal(sectorAt(0, 100), 4);
  assert.equal(sectorAt(-100, 0), 6);
  assert.equal(sectorAt(-3, -3), null);
});

test('a bubble snaps in past full size and settles, holds, then fades out', () => {
  assert.ok(popScale(60) < 1 && popScale(0) <= popScale(60));
  assert.ok(popScale(150) > 1);
  assert.equal(popScale(400), 1);
  assert.equal(bubbleAlpha(500), 1);
  assert.equal(bubbleAlpha(EMOTE_SHOW_MS), 0);
});

test('idle touches are rare, wait five seconds, and last under two', () => {
  let shown = 0;
  for (let id = 1; id <= 300; id++) {
    assert.equal(idleTouch(id, 0, IDLE_AFTER_MS - 1), null);
    assert.equal(idleTouch(id, 0, IDLE_AFTER_MS + 2500), null);
    if (idleTouch(id, 0, IDLE_AFTER_MS + 500)) shown++;
  }
  assert.ok(shown > 40 && shown < 160, `about a third of rests get one, got ${shown}/300`);
});

test('the party hat needs a year-old account on its day; the 100th kill is the Centurion\'s first tier', () => {
  const first = Date.UTC(2024, 5, 14, 9);
  assert.equal(isAnniversary(first, Date.UTC(2026, 5, 14, 20)), true);
  assert.equal(isAnniversary(first, Date.UTC(2026, 5, 15, 20)), false);
  assert.equal(isAnniversary(first, Date.UTC(2024, 5, 14, 20)), false, 'not on the day you joined');
  assert.equal(isAnniversary(undefined, Date.now()), false);
  assert.equal(isCenturion({ track: 'kills', tier: 0 }), true);
  assert.equal(isCenturion({ track: 'kills', tier: 1 }), false);
  assert.equal(isCenturion({ track: 'games', tier: 0 }), false);
});
