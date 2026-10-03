/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundsFor } from '../src/client/sfx.ts';
import type { GameEvent, PlayerView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const ME = 'Me';
const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: id === 1 ? ME : `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, armor: 0, maxArmor: 0, color: 'red', weapon: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 1, ...over,
});

const snap = (o: { me?: Partial<PlayerView>; self?: Partial<SelfView>; players?: PlayerView[]; events?: GameEvent[] } = {}): Snapshot => ({
  t: 'snap', tick: 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, perks: {}, pendingTier: null, ability: null, abilityReadyIn: 0, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, ...o.self },
  players: [player(1, o.me), ...(o.players ?? [])], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0 }, events: o.events ?? [],
});

const ids = (prev: Snapshot | null, next: Snapshot) => soundsFor(prev, next, ME).map((c) => c.id);

test('kill-confirm plays only when you are the killer', () => {
  const kill = (killer: string, victim: string): GameEvent => ({ e: 'kill', killer, victim, weapon: 'Pistol' });
  assert.deepEqual(ids(snap(), snap({ events: [kill(ME, 'p2')] })), ['kill']);
  assert.deepEqual(ids(snap(), snap({ events: [kill('p2', 'p3')] })), [], 'someone else scoring a kill is silent');
  assert.deepEqual(ids(snap(), snap({ events: [kill(ME, ME)] })), [], 'killing yourself is not a kill-confirm');
});

test('hurt plays on damage, including armor-absorbed hits, and never on regen or respawn', () => {
  const hurt = soundsFor(snap({ me: { hp: 100 } }), snap({ me: { hp: 70 } }), ME);
  assert.deepEqual(hurt.map((c) => [c.id, c.self, c.strength]), [['hurt', true, 0.3]], 'strength is damage over max hp');
  assert.deepEqual(ids(snap({ me: { hp: 90, armor: 50 } }), snap({ me: { hp: 85, armor: 30 } })), ['hurt']);
  assert.deepEqual(ids(snap({ me: { hp: 70 } }), snap({ me: { hp: 75 } })), [], 'regen is silent');
  assert.deepEqual(ids(snap({ me: { hp: 0, alive: false } }), snap({ me: { hp: 100 } })), [], 'respawning at full hp is silent');
});

test('a shot sounds like the shooter\'s weapon and is flagged self only for your own shots', () => {
  const players = [player(2, { weapon: 'sniper' })];
  const shots = soundsFor(null, snap({ players, me: { weapon: 'smg' }, events: [
    { e: 'shot', x: 200, y: 0, silenced: false, owner: 2 },
    { e: 'shot', x: 100, y: 0, silenced: false, owner: 1 },
    { e: 'shot', x: 200, y: 0, silenced: true, owner: 2 },
  ] }), ME);
  assert.deepEqual(shots.map((c) => [c.id, c.self, c.x]), [['shot:sniper', false, 200], ['shot:smg', true, 100], ['shot:silenced', false, 200]]);
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
  const gone = { ...snap({ self: { respawnIn: 3000 } }), players: [] };
  assert.deepEqual(ids(snap(), gone), ['death']);
  assert.deepEqual(ids(gone, gone), [], 'staying dead is silent');
});

test('the first snapshot of a session derives no state-transition sounds', () => {
  assert.deepEqual(ids(null, snap({ self: { pendingTier: 1, reloading: true } })), []);
});
