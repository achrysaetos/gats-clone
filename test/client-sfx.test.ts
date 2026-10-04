/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundsFor } from '../src/client/sfx.ts';
import type { GameEvent, PlayerView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const ME = 'Me';
const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: id === 1 ? ME : `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, armor: 0, maxArmor: 0, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 1, armorTier: 'none', ...over,
});

const snap = (o: { me?: Partial<PlayerView>; self?: Partial<SelfView>; players?: PlayerView[]; events?: GameEvent[] } = {}): Snapshot => ({
  t: 'snap', tick: 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pendingTier: null, ability: null, abilityReadyIn: 0, alive: o.me?.alive ?? true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, ...o.self },
  players: [player(1, o.me), ...(o.players ?? [])], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Boneyard', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0 }, events: o.events ?? [],
});

const ids = (prev: Snapshot | null, next: Snapshot) => soundsFor(prev, next).map((c) => c.id);

test('kill-confirm plays only when you are the killer, matched by id not name', () => {
  const kill = (killerId: number, victimId: number, killer = `p${killerId}`): GameEvent =>
    ({ e: 'kill', killer, victim: `p${victimId}`, killerId, victimId, weapon: 'Pistol' });
  assert.deepEqual(ids(snap(), snap({ events: [kill(1, 2)] })), ['kill']);
  assert.deepEqual(ids(snap(), snap({ events: [kill(2, 3)] })), [], 'someone else scoring a kill is silent');
  assert.deepEqual(ids(snap(), snap({ events: [kill(2, 3, ME)] })), [], 'another player sharing my name scoring a kill is silent');
  assert.deepEqual(ids(snap(), snap({ events: [kill(1, 1)] })), [], 'killing yourself is not a kill-confirm');
});

test('hurt plays on damage, including armor-absorbed hits, and never on regen or respawn', () => {
  const hurt = soundsFor(snap({ me: { hp: 100 } }), snap({ me: { hp: 70 } }));
  assert.deepEqual(hurt.map((c) => [c.id, c.self, c.id === 'hurt' && c.damageFrac]), [['hurt', true, 0.3]], 'damageFrac is damage over max hp');
  assert.equal(hurt[0]!.gain, 0.65, 'a bigger hit is louder');
  assert.deepEqual(ids(snap({ me: { hp: 90, armor: 50 } }), snap({ me: { hp: 85, armor: 30 } })), ['hurt']);
  assert.deepEqual(ids(snap({ me: { hp: 70 } }), snap({ me: { hp: 75 } })), [], 'regen is silent');
  assert.deepEqual(ids(snap({ me: { hp: 0, alive: false } }), snap({ me: { hp: 100 } })), [], 'respawning at full hp is silent');
});

test('a shot sounds like the shooter\'s weapon and is flagged self only for your own shots', () => {
  const players = [player(2, { gun: 'sniper' })];
  const shots = soundsFor(null, snap({ players, me: { gun: 'smg' }, events: [
    { e: 'shot', x: 200, y: 0, angle: 0, silenced: false, owner: 2 },
    { e: 'shot', x: 100, y: 0, angle: 0, silenced: false, owner: 1 },
    { e: 'shot', x: 200, y: 0, angle: 0, silenced: true, owner: 2 },
  ] }));
  assert.deepEqual(shots.map((c) => [c.id, c.self, c.x]), [['shot:sniper', false, 200], ['shot:smg', true, 100], ['shot:silenced', false, 200]]);
});

test('a knife slash makes a slash sound at the strike point, flagged self only for your own', () => {
  const cues = soundsFor(null, snap({ events: [
    { e: 'slash', x: 300, y: 0, angle: 0, owner: 2 },
    { e: 'slash', x: 120, y: 0, angle: 0, owner: 1 },
  ] }));
  assert.deepEqual(cues.map((c) => [c.id, c.self, c.x]), [['slash', false, 300], ['slash', true, 120]]);
});

test('level-up plays once per newly pending tier', () => {
  const t = (pendingTier: 1 | 2 | null) => snap({ self: { pendingTier } });
  assert.deepEqual(ids(t(null), t(1)), ['levelup']);
  assert.deepEqual(ids(t(1), t(1)), [], 'a tier still waiting for a pick does not replay');
  assert.deepEqual(ids(t(1), t(null)), [], 'picking the perk is silent');
  assert.deepEqual(ids(t(1), t(2)), ['levelup'], 'the next tier arriving before a pick still announces itself');
});

test('reload plays when reloading starts, not while it continues', () => {
  const r = (reloading: boolean) => snap({ self: { reloading } });
  assert.deepEqual(ids(r(false), r(true)), ['reload']);
  assert.deepEqual(ids(r(true), r(true)), []);
});

test('death plays once on the alive-to-dead edge, even when the server drops you from players', () => {
  assert.deepEqual(ids(snap(), snap({ me: { alive: false, hp: 0 } })), ['death']);
  const gone = { ...snap({ self: { alive: false } }), players: [] };
  assert.deepEqual(ids(snap(), gone), ['death']);
  assert.deepEqual(ids(gone, gone), [], 'staying dead is silent');
});

test('the hit sound plays once per snapshot only when you damage another player', () => {
  const dmg = (attacker: number, victim: number, kind: 'player' | 'crate' = 'player'): GameEvent =>
    ({ e: 'dmg', attacker, victim, amount: 15, x: 0, y: 0, kind });
  const hits = (events: GameEvent[]) => soundsFor(snap(), snap({ events })).filter((c) => c.id === 'hit');
  assert.deepEqual(hits([dmg(1, 2), dmg(1, 2), dmg(1, 3)]).map((c) => c.self), [true], 'shotgun pellets make one hit sound');
  assert.deepEqual(hits([dmg(2, 3)]), [], 'other players trading hits');
  assert.deepEqual(hits([dmg(1, 40, 'crate')]), [], 'hitting a crate');
  assert.deepEqual(hits([dmg(2, 1)]), [], 'being hit plays hurt, not hit');
});

test('the first snapshot of a session derives no state-transition sounds', () => {
  assert.deepEqual(ids(null, snap({ self: { pendingTier: 1, reloading: true } })), []);
});
