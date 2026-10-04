/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../src/shared/defs.ts';
import { deathText, killOf, lossOf, type KillEvent } from '../src/client/derive.ts';
import type { GameEvent, PlayerView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, armor: 0, maxArmor: 0, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 0, armorTier: 'none', hunted: false, ...over,
});

const snap = (o: { me?: Partial<PlayerView>; self?: Partial<SelfView>; players?: PlayerView[]; events?: GameEvent[] } = {}): Snapshot => ({
  t: 'snap', tick: 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: o.me?.alive ?? true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, ...o.self },
  players: [player(1, o.me), ...(o.players ?? [])], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Boneyard', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0 }, events: o.events ?? [],
});

const kill = (over: Partial<KillEvent> = {}): KillEvent =>
  ({ e: 'kill', killer: 'Atlas', victim: 'p1', killerId: 7, victimId: 1, weapon: 'Hornet', bounty: false, assisters: [], ...over });

test('the death screen names the killer\'s gun and what the life had earned', () => {
  const life = snap({ me: { level: 5, gun: 'hornet' }, self: { perks: { 1: 'bipod', 2: 'shield', 3: 'grenade' } } });
  assert.deepEqual(deathText(kill(), lossOf(life)), {
    title: 'Eliminated by Atlas',
    cause: 'with Hornet',
    lost: 'Lost level 6 · Hornet · Bipod · Shield · Grenade',
  });
});

test('a class gun and an unlevelled life lose nothing worth listing', () => {
  assert.equal(deathText(kill(), lossOf(snap({ me: { level: 0, gun: 'smg' } }))).lost, '');
  assert.equal(deathText(kill(), lossOf(snap({ me: { level: 1, gun: 'smg' } }))).lost, 'Lost level 2', 'the class gun is not a loss');
  assert.equal(lossOf(snap({ me: { alive: false } })), null, 'a snapshot after the death has nothing to report');
});

test('a hunted death says the bounty went to the killer, and an environmental one names only the cause', () => {
  assert.equal(deathText(kill({ bounty: true }), null).cause, `with Hornet · your bounty paid them ${WORLD.bountyScore}`);
  assert.deepEqual(deathText(kill({ killer: '', killerId: null, weapon: 'Gas' }), null), { title: 'You were eliminated', cause: 'Gas', lost: '' });
  assert.equal(killOf([kill({ victimId: 2 }), kill({ killer: 'Bo' })], 1)?.killer, 'Bo', 'the kill whose victim is you');
});
