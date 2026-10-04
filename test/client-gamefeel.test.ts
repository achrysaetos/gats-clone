/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import { deathText, edgePoint, killOf, lossOf, type KillEvent } from '../src/client/derive.ts';
import { addMoments, CALLOUT_MS, NO_MOMENTS } from '../src/client/moments.ts';
import { approachAlpha, PANEL_ALPHA } from '../src/client/hud.ts';
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

const moments = (prev: Snapshot | null, next: Snapshot, now = 1000) => addMoments(NO_MOMENTS, prev, next, now);

test('evolving announces the new gun with a ring, and stage 2 adds the hunted callout', () => {
  const stage1 = moments(snap({ me: { gun: 'smg' } }), snap({ me: { gun: 'skirmisher' } })).callouts;
  assert.deepEqual(stage1.map((c) => [c.title, c.ring]), [['Skirmisher', true]]);
  assert.equal(stage1[0]!.color, GUNS.skirmisher.look.accent, 'in the gun\'s accent');
  const stage2 = moments(snap({ me: { gun: 'skirmisher' } }), snap({ me: { gun: 'phantom' } })).callouts;
  assert.deepEqual(stage2.map((c) => c.title), ['Phantom', 'You are HUNTED']);
  assert.match(stage2[1]!.line, /minimap/);
  assert.deepEqual(moments(snap({ me: { gun: 'phantom', alive: false } }), snap({ me: { gun: 'smg' } })).callouts, [], 'respawning on the class gun is no moment');
  assert.deepEqual(moments(snap({ me: { gun: 'smg' } }), snap({ me: { gun: 'smg' } })).callouts, []);
});

test('your kill floats the score you actually earned at the victim, catch-up included', () => {
  const blow: GameEvent = { e: 'dmg', attacker: 1, victim: 7, amount: 30, x: 420, y: 380, kind: 'player' };
  const m = moments(snap({ me: { score: 100 } }), snap({ me: { score: 250 }, events: [blow, kill({ killer: 'p1', killerId: 1, victim: 'Atlas', victimId: 7 })] }));
  assert.deepEqual(m.popups.map((p) => [p.x, p.y, p.amount]), [[420, 380, 150]]);
  assert.deepEqual(m.callouts, [], 'a plain kill has no callout');
  const someoneElse = moments(snap({ me: { score: 100 } }), snap({ me: { score: 100 }, events: [kill({ killerId: 3, victimId: 7 })] }));
  assert.deepEqual(someoneElse.popups, [], 'another player\'s kill');
});

test('a bounty kill gets a gold callout, and moments expire', () => {
  const prev = snap({ me: { score: 0 }, players: [player(7, { x: 300, y: 200 })] });
  const m = moments(prev, snap({ me: { score: 300 }, events: [kill({ killer: 'p1', killerId: 1, victim: 'Atlas', victimId: 7, bounty: true })] }));
  assert.deepEqual(m.callouts.map((c) => c.title), [`BOUNTY +${WORLD.bountyScore}`]);
  assert.deepEqual(m.popups.map((p) => [p.x, p.y]), [[300, 200]], 'without a blow this snapshot, the victim\'s last position');
  assert.deepEqual(addMoments(m, prev, prev, 1000 + CALLOUT_MS), NO_MOMENTS);
});

test('an off-screen hunted mark gets an edge marker on its bearing; an on-screen one gets none', () => {
  const center = { x: 640, y: 400 };
  assert.equal(edgePoint(center, { x: 900, y: 100 }, 1280, 800, 30), null, 'inside the screen');
  assert.deepEqual(edgePoint(center, { x: 3000, y: 400 }, 1280, 800, 30), { x: 1250, y: 400, angle: 0 }, 'due east lands on the right edge');
  assert.deepEqual(edgePoint(center, { x: 640, y: -5000 }, 1280, 800, 30), { x: 640, y: 30, angle: -Math.PI / 2 }, 'due north lands on the top edge');
  const corner = edgePoint(center, { x: -500, y: 3000 }, 1280, 800, 30)!;
  assert.equal(corner.y, 770, 'a steep bearing toward the bottom left clamps to the bottom edge first');
  assert.ok(corner.x > 30 && corner.x < 640, 'left of center, still on screen');
});

test('a HUD panel fades toward see-through while a player is under it, and back after', () => {
  let alpha: number = PANEL_ALPHA.rest;
  alpha = approachAlpha(alpha, true, 90);
  assert.ok(alpha < PANEL_ALPHA.rest && alpha > PANEL_ALPHA.covering, 'eases rather than snapping');
  for (let i = 0; i < 10; i++) alpha = approachAlpha(alpha, true, 50);
  assert.equal(alpha, PANEL_ALPHA.covering, 'settles see-through without overshooting');
  for (let i = 0; i < 10; i++) alpha = approachAlpha(alpha, false, 50);
  assert.equal(alpha, PANEL_ALPHA.rest, 'returns to its resting opacity');
  assert.ok(PANEL_ALPHA.rest < 1, 'even at rest the panel is translucent');
});

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
