/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREAK } from '../src/shared/defs.ts';
import type { KillEvent } from '../src/client/derive.ts';
import { addMoments, MULTI_KILL_MS, NO_MOMENTS, type Moments } from '../src/client/moments.ts';
import { freshLog, logSnapshot, NO_BESTS, recapOf } from '../src/client/records.ts';
import { soundsFor } from '../src/client/sfx.ts';
import type { GameEvent, PlayerView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const me = (over: Partial<PlayerView> = {}): PlayerView => ({
  id: 1, name: 'me', x: 0, y: 0, angle: 0, hp: 100, maxHp: 100, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 0, armorTier: 'none', hunted: false, kind: 'human', ...over,
});
const snap = (o: { me?: Partial<PlayerView>; self?: Partial<SelfView>; events?: GameEvent[] } = {}): Snapshot => ({
  t: 'snap', tick: 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, suppression: 0, streak: 0, nemesis: null, ...o.self },
  players: [me(o.me)], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Boneyard', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: null }, events: o.events ?? [],
});
const myKill = (victimId: number, over: Partial<KillEvent> = {}): KillEvent =>
  ({ e: 'kill', killer: 'me', victim: `v${victimId}`, killerId: 1, victimId, weapon: 'Pistol', bounty: false, assisters: [], ended: 0, revenge: false, ...over });

/** Your kills, one snapshot each at the given times, with the streak counting up; the callouts each one raised. */
function killsAt(times: number[], best = Infinity) {
  let m: Moments = NO_MOMENTS;
  let prev = snap();
  const titles: string[][] = [];
  times.forEach((t, i) => {
    const next = snap({ self: { streak: i + 1 }, events: [myKill(10 + i)] });
    m = addMoments(m, prev, next, t, best);
    titles.push(m.callouts.filter((c) => c.born >= t).map((c) => c.title));
    prev = next;
  });
  return { m, titles };
}

test('kills in quick succession chain into multi-kills, and a pause breaks the chain', () => {
  const { titles } = killsAt([1000, 2000, 3000, 4000]);
  assert.deepEqual(titles, [[], ['DOUBLE KILL'], ['TRIPLE KILL'], ['QUAD KILL']]);
  const slow = killsAt([1000, 1000 + MULTI_KILL_MS + 1]);
  assert.deepEqual(slow.titles, [[], []]);
});

test('streak milestones are announced as they are reached, folded into one callout with a multi-kill', () => {
  const { m, titles } = killsAt([1000, 10_000, 20_000, 30_000, 40_000]);
  assert.deepEqual(titles, [[], [], ['ON FIRE'], [], ['RAMPAGE']]);
  const together = killsAt([1000, 2000, 3000]);
  assert.deepEqual(together.titles.at(-1), ['TRIPLE KILL'], 'the multi-kill leads');
  assert.match(together.m.callouts.at(-1)!.line, /ON FIRE/, 'the milestone rides on its line');
  assert.ok(m.callouts.length);
});

test('revenge and shutdowns lead the callout, and pass the personal best only once a life', () => {
  const revenge = addMoments(NO_MOMENTS, snap(), snap({ self: { streak: 1 }, events: [myKill(9, { revenge: true })] }), 1000);
  assert.equal(revenge.callouts[0]?.title, 'REVENGE');
  const shutdown = addMoments(NO_MOMENTS, snap(), snap({ self: { streak: 1 }, events: [myKill(9, { ended: STREAK.shutdownAt + 2 })] }), 1000);
  assert.equal(shutdown.callouts[0]?.title, 'SHUTDOWN');
  assert.match(shutdown.callouts[0]!.line, /7-kill streak/);
  const best = killsAt([1000, 10_000, 20_000, 30_000, 40_000], 3);
  assert.deepEqual(best.titles, [[], [], ['ON FIRE'], ['NEW BEST'], ['RAMPAGE']], 'passing the record is announced once');
  assert.equal(best.m.best, true);
});

test('a kill that gives health back floats the health it gave on you', () => {
  const m = addMoments(NO_MOMENTS, snap({ me: { hp: 40 } }), snap({ me: { hp: 75 }, self: { streak: 1 }, events: [myKill(9)] }), 1000);
  const heal = m.popups.find((p) => p.onSelf);
  assert.equal(heal?.text, '+35 HP');
});

test('the kill sound climbs with the streak, and big kills get the fanfare', () => {
  const ids = (streak: number, over: Partial<KillEvent> = {}) => soundsFor(snap(), snap({ self: { streak }, events: [myKill(9, over)] })).map((c) => c.id);
  assert.deepEqual(ids(1), ['kill']);
  assert.deepEqual(ids(3), ['kill:3']);
  assert.deepEqual(ids(9), ['kill:5']);
  assert.deepEqual(ids(2, { revenge: true }), ['bounty']);
});

test('a life recap counts damage, level, streak and time, and stamps only real records', () => {
  let log = freshLog(0);
  log = logSnapshot(log, snap({ me: { level: 3 }, self: { streak: 2 }, events: [{ e: 'dmg', attacker: 1, victim: 5, amount: 60, x: 0, y: 0, kind: 'player' }, { e: 'dmg', attacker: 5, victim: 1, amount: 99, x: 0, y: 0, kind: 'player' }] }));
  log = logSnapshot(log, snap({ me: { level: 2 }, self: { streak: 2 }, events: [{ e: 'dmg', attacker: 1, victim: 6, amount: 40.5, x: 0, y: 0, kind: 'player' }] }));
  const first = recapOf(log, 95_000, NO_BESTS);
  assert.deepEqual(first.stats.map((s) => [s.label, s.value, s.best]), [['Kills', '2', true], ['Damage', '101', true], ['Level', '3', true], ['Survived', '1:35', true]]);
  const again = recapOf(log, 10_000, first.bests);
  assert.equal(again.newBests, 0, 'matching a record is not a new one');
  assert.deepEqual(again.bests, first.bests);
});

test('each class gun\'s kit card bars measure it against the best class, so every bar tops out somewhere', async () => {
  const { gunBars } = await import('../src/client/menu.ts');
  const { WEAPON_IDS } = await import('../src/shared/defs.ts');
  const bars = WEAPON_IDS.map((id) => gunBars(id));
  for (const card of bars) for (const b of card) assert.ok(b.value > 0 && b.value <= 1, `${b.label} ${b.value}`);
  for (let i = 0; i < 4; i++) assert.equal(Math.max(...bars.map((card) => card[i]!.value)), 1);
  const power = (id: (typeof WEAPON_IDS)[number]) => gunBars(id).find((b) => b.label === 'PWR')!.value;
  assert.equal(power('shotgun'), 1, 'a full shotgun blast hits hardest');
  assert.ok(power('sniper') > 0.95 && power('smg') < 0.15, 'the bolt-action all but matches it; an SMG round is a fraction');
});
