/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import { MAP_IDS, MAPS } from '../src/shared/maps.ts';
import type { PlayerView, Snapshot, ThrownKind, WallView } from '../src/shared/protocol.ts';
import { BLAST_RADIUS } from '../src/shared/sim/abilities.ts';
import { makeCamera } from '../src/client/camera.ts';
import { addCrack, createCracks } from '../src/client/decals.ts';
import { NO_FEEDBACK } from '../src/client/feedback.ts';
import { createPool } from '../src/client/particles.ts';
import type { Session } from '../src/client/state.ts';
import { ART, SHADOW_PER_HEIGHT } from '../src/client/world/art.ts';
import { facing } from '../src/client/world/catalog.ts';
import { tilesFor } from '../src/client/world/ground.ts';
import { layoutKey, mapLayoutKey } from '../src/client/world/layout.ts';
import { describeWorld, inShadow, type Scene } from '../src/client/world/scene.ts';

const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 0, armorTier: 'none', hunted: false, kind: 'bot', ...over,
});

const snap = (o: { me?: Partial<PlayerView>; players?: PlayerView[]; thrown?: Snapshot['thrown']; crates?: Snapshot['crates'] } = {}): Snapshot => ({
  t: 'snap', tick: 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: o.me?.alive ?? true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900 },
  players: [player(1, o.me), ...(o.players ?? [])], bullets: [], crates: o.crates ?? [], thrown: o.thrown ?? [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Plaza', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: null }, events: [],
});

const session = (over: Partial<Session> = {}): Session => ({
  myId: 1, worldSize: 3000, walls: [], trails: new Map(), hurtAt: new Map(), cracks: createCracks(), effects: [], particles: createPool(), feedback: NO_FEEDBACK,
  zombieFaces: new Map(), turretAims: new Map(), coreHitAt: -Infinity, lastSelf: { x: 100, y: 0 }, ...over,
} as unknown as Session);

const describe = (frame: Snapshot, o: { killerId?: number | null; s?: Session; at?: { x: number; y: number } } = {}): Scene =>
  describeWorld({ snap: frame, s: o.s ?? session(), cam: makeCamera(o.at ?? { x: 100, y: 0 }, 1280, 800, WORLD.viewRadius), dpr: 1, now: 0, selfAngle: null, killerId: o.killerId ?? null }, 0);

const body = (scene: Scene, id: number) => scene.bodies.find((b) => b.id === id)!;

test('the hunted brackets mark hunted enemies but not yourself', () => {
  assert.equal(body(describe(snap({ me: { gun: 'phantom', hunted: true } })), 1).hunted, false, 'no brackets on you');
  assert.equal(body(describe(snap({ players: [player(2, { gun: 'phantom', hunted: true })] })), 2).hunted, true, 'brackets on a hunted enemy');
});

test('in free for all an enemy wearing your color gets a rival ring; other colors and teammates do not', () => {
  const ffa = describe(snap({ me: { color: 'blue' }, players: [player(2, { color: 'blue' }), player(3, { color: 'red' })] }));
  assert.deepEqual(ffa.bodies.map((b) => b.ring), ['self', 'rival', null], 'only the same-colored enemy');
  const team = describe(snap({ me: { color: 'blue', team: 'blue' }, players: [player(2, { color: 'blue', team: 'blue' })] }));
  assert.deepEqual(team.bodies.map((b) => b.ring), ['self', null], 'team modes color by team already');
});

test('every other body wears its name; your own bar shows only while you are hurt, and your name never', () => {
  const tags = (frame: Snapshot) => describe(frame).tags.map((t) => ({ id: t.id, bar: t.bar > 0, name: t.name !== null }));
  assert.deepEqual(tags(snap({ players: [player(2), player(3, { hidden: true })] })), [{ id: 1, bar: false, name: false }, { id: 2, bar: false, name: true }]);
  assert.deepEqual(tags(snap({ me: { hp: 99 }, players: [player(2, { hp: 10 })] })), [{ id: 1, bar: true, name: false }, { id: 2, bar: false, name: true }]);
});

test('while you wait to respawn, your killer wears a red ring and a label', () => {
  const frame = snap({ me: { alive: false }, players: [player(2)] });
  assert.equal(body(describe(frame), 2).killer, false);
  const scene = describe(frame, { killerId: 2 });
  assert.equal(body(scene, 2).killer, true);
  assert.equal(scene.killer?.name, 'p2');
});

const lightness = (color: string): number => {
  const [r, g, b] = color.startsWith('#') ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) : color.match(/\d+/g)!.slice(0, 3).map(Number);
  return (r! + g! + b!) / (3 * 255);
};

test("every gun's rounds glow: no tracer color is darker than mid-grey, evolved hues included", () => {
  for (const gun of Object.keys(GUNS) as (keyof typeof GUNS)[]) {
    const frame = snap({ players: [player(2, { gun })] });
    frame.bullets = [{ id: 9, x: 140, y: 0, vx: 1500, vy: 0, owner: 2, gun }];
    const [tracer] = describe(frame).tracers;
    assert.ok(tracer, `${gun} draws a tracer`);
    for (const c of [tracer.glow, tracer.color, tracer.hot]) assert.ok(lightness(c) >= 0.5, `${gun} tracer ${c} glows`);
    assert.ok(tracer.x1 === 140 && tracer.x0 < 140, 'the tracer trails behind the round');
  }
});

const thrown = (kind: ThrownKind): Snapshot['thrown'] => [{ id: 1, kind, x: 1234, y: 987, r: 10, owner: 2 }];

test('a live grenade or frag grenade shows a danger ring at its blast radius; a gas grenade none', () => {
  for (const kind of ['grenade', 'fragGrenade'] as const) {
    assert.deepEqual(describe(snap({ thrown: thrown(kind) }), { at: { x: 1234, y: 987 } }).dangers, [{ x: 1234, y: 987, r: BLAST_RADIUS[kind] }], `${kind} ring at ${BLAST_RADIUS[kind]}`);
  }
  assert.deepEqual(describe(snap({ thrown: thrown('gasGrenade') }), { at: { x: 1234, y: 987 } }).dangers, []);
});

test('cracks show only while their host stands and they have life left', () => {
  const wall: WallView = { x: 100, y: 200, w: 200, h: 40, built: false, material: 'concrete' };
  const cracks = createCracks();
  addCrack(cracks, wall, 150, 220, 0, Math.random);
  const shown = (walls: WallView[], now: number) => describeWorld({ snap: snap(), s: session({ walls, cracks }), cam: makeCamera({ x: 100, y: 0 }, 1280, 800, WORLD.viewRadius), dpr: 1, now, selfAngle: null, killerId: null }, 0).cracks.length;
  assert.equal(shown([wall], 10), 1, 'on a standing wall');
  assert.equal(shown([], 10), 0, 'gone with the wall');
  assert.equal(shown([wall], 10_000), 0, 'gone once faded');
});

test('a body standing in a wall\'s shadow is drawn darker; one on the sunny side is not', () => {
  const wall: WallView = { x: 0, y: 0, w: 200, h: 200, built: false, material: 'concrete' };
  const [sx, sy] = ART.sun.shadow;
  const reach = ART.heights.concrete * SHADOW_PER_HEIGHT;
  const edge = { x: 100 + sx * 100, y: 100 + sy * 100 };
  assert.equal(inShadow(edge.x + sx * reach * 0.5, edge.y + sy * reach * 0.5, [wall]), true, 'halfway along the shadow');
  assert.equal(inShadow(edge.x + sx * reach * 1.6, edge.y + sy * reach * 1.6, [wall]), false, 'past the shadow\'s reach');
  assert.equal(inShadow(100 - sx * 160, 100 - sy * 160, [wall]), false, 'on the lit side');
  const s = session({ walls: [wall] });
  const frame = snap({ me: { x: edge.x + sx * 20, y: edge.y + sy * 20 } });
  assert.ok(body(describe(frame, { s, at: frame.players[0]! }), 1).light < 1);
});

test('the baked facing is the nearest one, and what is left over stays within half a step', () => {
  for (let a = -7; a < 7; a += 0.05) {
    const { dir, rest } = facing(a, 32);
    assert.ok(dir >= 0 && dir < 32);
    assert.ok(Math.abs(rest) <= Math.PI / 32 + 1e-9);
    const back = (dir / 32) * Math.PI * 2 + rest;
    assert.ok(Math.abs(Math.atan2(Math.sin(back - a), Math.cos(back - a))) < 1e-9, `facing ${a} rebuilds`);
  }
});

test('the ground streams the tiles under the view first, a ring past it, and nothing off the map', () => {
  const map = { span: 640, origin: -64, count: 10 };
  const ids = tilesFor({ x0: 1000, y0: 1000, x1: 1600, y1: 1500 }, map);
  assert.equal(ids[0], '2_2', 'the tile under the view centre first');
  assert.ok(ids.includes('0_0') && ids.includes('3_3'), 'a ring past the view');
  assert.ok(!ids.includes('4_4'));
  const corner = tilesFor({ x0: -500, y0: -500, x1: 100, y1: 100 }, map);
  assert.ok(corner.every((id) => id.split('_').every((v) => Number(v) >= 0)), 'never a tile left or above the map');
});

test("the ground is keyed by the map's own walls, so an engineer's wall coming or going never swaps it", () => {
  const long: WallView = { x: 0, y: 0, w: 100, h: 50, built: false, material: 'concrete' };
  const block: WallView = { x: 300, y: 0, w: 50, h: 50, built: false, material: 'metal' };
  const map = [long, block];
  const built: WallView = { x: 500, y: 500, w: 120, h: 40, built: true };
  assert.equal(mapLayoutKey([...map, built]), mapLayoutKey(map));
  assert.notEqual(mapLayoutKey([long, { ...block, material: 'planter' }]), mapLayoutKey(map), 'a map wall changing swaps it');
  assert.notEqual(mapLayoutKey([long]), mapLayoutKey(map), 'a map wall going swaps it');
});

test('the key the client computes from the walls the server sends is the key each map was baked under', () => {
  for (const id of MAP_IDS) {
    const views: WallView[] = MAPS[id].walls.map(({ x, y, w, h, material }) => ({ x, y, w, h, material, built: false }));
    assert.equal(mapLayoutKey(views), layoutKey(MAPS[id].walls), id);
  }
});

