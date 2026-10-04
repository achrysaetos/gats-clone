/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import { clearOfRects, deathText, edgePoint, killOf, lossOf, type KillEvent } from '../src/client/derive.ts';
import { spreadFor } from '../src/shared/sim/stats.ts';
import { addMoments, CALLOUT_MS, CALLOUT_STAGGER_MS, NO_MOMENTS } from '../src/client/moments.ts';
import { approachAlpha, drawHud, PANEL_ALPHA, reticleGap } from '../src/client/hud.ts';
import { makeCamera } from '../src/client/camera.ts';
import { NO_FEEDBACK } from '../src/client/feedback.ts';
import type { Session } from '../src/client/state.ts';
import { createPool } from '../src/client/particles.ts';
import { PALETTE } from '../src/client/palette.ts';
import { drawWorld } from '../src/client/render.ts';
import type { GameEvent, PlayerView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, armor: 0, maxArmor: 0, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 0, armorTier: 'none', hunted: false, kind: 'bot', ...over,
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

test('moments that land together queue, so at most two callouts share the screen', () => {
  const prev = snap({ me: { gun: 'skirmisher', score: 0 }, players: [player(7, { x: 300, y: 200 })] });
  const next = snap({ me: { gun: 'phantom', score: 300 }, events: [kill({ killer: 'p1', killerId: 1, victim: 'Atlas', victimId: 7, bounty: true })] });
  const borns = moments(prev, next).callouts.map((c) => c.born);
  assert.equal(borns.length, 3);
  assert.deepEqual(borns, [1000, 1000 + CALLOUT_STAGGER_MS, 1000 + 2 * CALLOUT_STAGGER_MS]);
  for (let t = 1000; t < 1000 + 3 * CALLOUT_MS; t += 50) {
    assert.ok(borns.filter((b) => t >= b && t - b < CALLOUT_MS).length <= 2, `at most two on screen at ${t}`);
  }
});

test('dying clears pending callouts, so none play over the death card', () => {
  const evolved = moments(snap({ me: { gun: 'skirmisher' } }), snap({ me: { gun: 'phantom' } }));
  assert.equal(evolved.callouts.length, 2);
  const dead = addMoments(evolved, snap({ me: { gun: 'phantom' } }), snap({ me: { gun: 'phantom', alive: false } }), 1100);
  assert.deepEqual(dead.callouts, []);
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

type Drawn = { text: string; color: unknown };

/** Draws the HUD into a recording context and returns every filled string with its fill color. */
function hudTexts(frame: Snapshot, session: Partial<Session> = {}): Drawn[] {
  const drawn: Drawn[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'fillText') return (text: string) => drawn.push({ text, color: target.fillStyle });
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 7 });
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  Object.assign(globalThis, { Path2D: class {} });
  const s = { myId: 1, worldSize: WORLD.size, walls: [], lastSelf: { x: 100, y: 0 }, feedback: NO_FEEDBACK, moments: NO_MOMENTS, feed: [], ...session } as unknown as Session;
  drawHud(ctx, 1, makeCamera(s.lastSelf, 1280, 800, WORLD.viewRadius), frame, s, 1000, { x: 0, y: 0 }, null);
  return drawn;
}

test('the kill feed spells out an evolved gun in its accent color and keeps the icon for a class gun', () => {
  const line = (weapon: string) => ({ ...kill({ weapon }), at: 1000 });
  const evolved = hudTexts(snap(), { feed: [line('Hornet')] });
  assert.deepEqual(evolved.filter((d) => d.text === 'Hornet').map((d) => d.color), [GUNS.hornet.look.accent]);
  const base = hudTexts(snap(), { feed: [line('SMG')] });
  assert.equal(base.some((d) => d.text === 'SMG'), false, 'a class gun is drawn as its icon, not its name');
});

test('holding a stage-2 gun shows a HUNTED badge on your HUD', () => {
  assert.equal(hudTexts(snap({ me: { gun: 'phantom', hunted: true } })).filter((d) => d.text === 'HUNTED').length, 1);
  assert.equal(hudTexts(snap({ me: { gun: 'skirmisher' } })).some((d) => d.text === 'HUNTED'), false);
});

/** Draws the world into a recording context and returns the stroke color of every stroke. */
function worldStrokes(frame: Snapshot, killerId: number | null = null): unknown[] {
  const strokes: unknown[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'stroke') return () => strokes.push(target.strokeStyle);
      if (prop === 'measureText') return () => ({ width: 0 });
      if (typeof prop === 'string' && prop.startsWith('create')) return () => ({ addColorStop() {} });
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ctx }) } });
  const s = { myId: 1, worldSize: WORLD.size, walls: [], trails: new Map(), effects: [], particles: createPool(), feedback: NO_FEEDBACK } as unknown as Session;
  drawWorld(ctx, { snap: frame, s, cam: makeCamera({ x: 100, y: 0 }, 1280, 800, WORLD.viewRadius), dpr: 1, now: 0, selfAngle: null, killerId });
  return strokes;
}

test('the hunted brackets mark hunted enemies but not yourself', () => {
  assert.equal(worldStrokes(snap({ me: { gun: 'phantom', hunted: true } })).includes(PALETTE.hunted), false, 'no brackets on you');
  assert.equal(worldStrokes(snap({ players: [player(2, { gun: 'phantom', hunted: true })] })).includes(PALETTE.hunted), true, 'brackets on a hunted enemy');
});

test('in free for all an enemy wearing your color gets a rival ring; other colors and teammates do not', () => {
  const rings = (frame: Snapshot) => worldStrokes(frame).filter((c) => c === PALETTE.rival).length;
  assert.equal(rings(snap({ me: { color: 'blue' }, players: [player(2, { color: 'blue' }), player(3, { color: 'red' })] })), 1, 'only the same-colored enemy');
  assert.equal(rings(snap({ me: { color: 'blue', team: 'blue' }, players: [player(2, { color: 'blue', team: 'blue' })] })), 0, 'team modes color by team already');
});

test('while you wait to respawn, your killer wears a red ring', () => {
  const frame = snap({ me: { alive: false }, players: [player(2)] });
  assert.equal(worldStrokes(frame).includes(PALETTE.hunted), false);
  assert.equal(worldStrokes(frame, 2).includes(PALETTE.hunted), true);
});

test('the reticle spread follows the gun, Grip always, and Bipod only while standing still', () => {
  assert.equal(spreadFor('smg', {}, false), GUNS.smg.spread);
  assert.ok(Math.abs(spreadFor('smg', { 2: 'grip' }, false) - GUNS.smg.spread * 0.6) < 1e-12, 'grip narrows it');
  assert.equal(spreadFor('smg', { 1: 'bipod' }, false), GUNS.smg.spread, 'bipod does nothing on the move');
  assert.ok(Math.abs(spreadFor('smg', { 1: 'bipod' }, true) - GUNS.smg.spread * 0.5) < 1e-12, 'bipod halves it standing still');
  assert.ok(spreadFor('shotgun', {}, true) > spreadFor('sniper', {}, true), 'a shotgun reticle is wider than a sniper\'s');
});

test('the reticle opens with the spread cone at the cursor distance, within readable bounds', () => {
  assert.ok(Math.abs(reticleGap(0.1, 300) - Math.tan(0.1) * 300) < 1e-9);
  assert.ok(reticleGap(0.1, 400) > reticleGap(0.1, 200), 'farther aim, wider cone');
  assert.equal(reticleGap(0.01, 50), 5, 'never closes onto the center dot');
  assert.equal(reticleGap(0.3, 2000), 90, 'never sprawls across the screen');
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

test('an edge marker that would land on a HUD panel slides back along its bearing to just outside it', () => {
  const from = { x: 640, y: 400 };
  const feed = { x: 12, y: 6, w: 300, h: 140 };
  const onFeed = { x: 40, y: 34 };
  const at = clearOfRects(from, onFeed, [feed], 16);
  assert.ok(at.x > feed.x + feed.w + 15 || at.y > feed.y + feed.h + 15, `outside the grown panel, got ${at.x},${at.y}`);
  const bearing = (p: { x: number; y: number }) => Math.atan2(p.y - from.y, p.x - from.x);
  assert.ok(Math.abs(bearing(at) - bearing(onFeed)) < 1e-9, 'same bearing');
  const clearSpot = { x: 1246, y: 400 };
  assert.deepEqual(clearOfRects(from, clearSpot, [feed], 16), clearSpot, 'a marker clear of every panel stays put');
});
