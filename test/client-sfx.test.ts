/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUN_IDS, GUNS } from '../src/shared/defs.ts';
import { SOUNDS, soundsFor } from '../src/client/sfx.ts';
import type { BuildingView, GameEvent, PlayerView, RunView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const ME = 'Me';
const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: id === 1 ? ME : `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 1, armorTier: 'none', kind: 'bot', hunted: false, ...over,
});

const snap = (o: { me?: Partial<PlayerView>; self?: Partial<SelfView>; players?: PlayerView[]; events?: GameEvent[] } = {}): Snapshot => ({
  t: 'snap', tick: 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: o.me?.alive ?? true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, ...o.self },
  players: [player(1, o.me), ...(o.players ?? [])], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Boneyard', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: null }, events: o.events ?? [],
});

const ids = (prev: Snapshot | null, next: Snapshot) => soundsFor(prev, next).map((c) => c.id);

test('kill-confirm plays only when you are the killer, matched by id not name', () => {
  const kill = (killerId: number, victimId: number, killer = `p${killerId}`): GameEvent =>
    ({ e: 'kill', killer, victim: `p${victimId}`, killerId, victimId, weapon: 'Pistol', bounty: false, assisters: [] });
  assert.deepEqual(ids(snap(), snap({ events: [kill(1, 2)] })), ['kill']);
  assert.deepEqual(ids(snap(), snap({ events: [kill(2, 3)] })), [], 'someone else scoring a kill is silent');
  assert.deepEqual(ids(snap(), snap({ events: [kill(2, 3, ME)] })), [], 'another player sharing my name scoring a kill is silent');
  assert.deepEqual(ids(snap(), snap({ events: [kill(1, 1)] })), [], 'killing yourself is not a kill-confirm');
});

test('hurt plays on damage, and never on regen or respawn', () => {
  const hurt = soundsFor(snap({ me: { hp: 100 } }), snap({ me: { hp: 70 } }));
  assert.deepEqual(hurt.map((c) => [c.id, c.self, c.id === 'hurt' && c.damageFrac]), [['hurt', true, 0.3]], 'damageFrac is damage over max hp');
  assert.equal(hurt[0]!.gain, 0.65, 'a bigger hit is louder');
  assert.deepEqual(ids(snap({ me: { hp: 70 } }), snap({ me: { hp: 75 } })), [], 'regen is silent');
  assert.deepEqual(ids(snap({ me: { hp: 0, alive: false } }), snap({ me: { hp: 100 } })), [], 'respawning at full hp is silent');
});

test('another player\'s shot sounds like their weapon, and your own shot events stay silent because the page voiced them when it fired', () => {
  const shots = soundsFor(null, snap({ events: [
    { e: 'shot', x: 200, y: 0, angle: 0, silenced: false, owner: 2, gun: 'sniper' },
    { e: 'shot', x: 100, y: 0, angle: 0, silenced: false, owner: 1, gun: 'smg' },
    { e: 'shot', x: 200, y: 0, angle: 0, silenced: true, owner: 2, gun: 'sniper' },
  ] }));
  assert.deepEqual(shots.map((c) => [c.id, c.self, c.x]), [['shot:sniper', false, 200], ['shot:silenced', false, 200]]);
});

test('every gun on the evolution tree has its own shot sound, and blast guns add a low thump', () => {
  const recipes = GUN_IDS.map((id) => JSON.stringify(SOUNDS[`shot:${id}`]));
  assert.equal(new Set(recipes).size, GUN_IDS.length);
  const lowest = (id: (typeof GUN_IDS)[number]) => Math.min(...SOUNDS[`shot:${id}`].flatMap((l) => (l.src === 'tone' ? [l.pitchHz[1]] : [])));
  for (const id of GUN_IDS.filter((g) => GUNS[g].blast)) assert.ok(lowest(id) < lowest(GUNS[id].base), `${id} thumps below its class gun`);
});

test('a knife slash makes a slash sound at the strike point, flagged self only for your own', () => {
  const cues = soundsFor(null, snap({ events: [
    { e: 'slash', x: 300, y: 0, angle: 0, owner: 2 },
    { e: 'slash', x: 120, y: 0, angle: 0, owner: 1 },
  ] }));
  assert.deepEqual(cues.map((c) => [c.id, c.self, c.x]), [['slash', false, 300], ['slash', true, 120]]);
});

test('level-up plays once per newly pending pick', () => {
  const t = (level: 1 | 2 | null) => snap({ self: { pending: level === null ? null : level === 1 ? { level, k: 'perk', tier: 1 } : { level, k: 'evolve' } } });
  assert.deepEqual(ids(t(null), t(1)), ['levelup']);
  assert.deepEqual(ids(t(1), t(1)), [], 'a tier still waiting for a pick does not replay');
  assert.deepEqual(ids(t(1), t(null)), [], 'picking is silent');
  assert.deepEqual(ids(t(1), t(2)), ['levelup'], 'the next pick opening right after one is made still announces itself');
});

test('an evolution plays its own cue, a perk pick a smaller confirm, and neither replays on respawn', () => {
  assert.deepEqual(ids(snap({ me: { gun: 'pistol' } }), snap({ me: { gun: 'handCannon' } })), ['evolve']);
  assert.deepEqual(ids(snap({ me: { gun: 'handCannon', alive: false } }), snap({ me: { gun: 'pistol' } })), [], 'respawning is not an evolution');
  assert.deepEqual(ids(snap(), snap({ self: { perks: { 1: 'grip' } } })), ['perk']);
  assert.deepEqual(ids(snap({ self: { perks: { 1: 'grip' } } }), snap({ self: { perks: { 1: 'grip' } } })), [], 'a kept perk is silent');
  assert.ok(SOUNDS.evolve.length > SOUNDS.perk.length, 'the evolution cue is the bigger one');
});

test('a bounty kill plays the bounty cue in place of the plain kill confirm', () => {
  const kill = (bounty: boolean): GameEvent => ({ e: 'kill', killer: ME, victim: 'p2', killerId: 1, victimId: 2, weapon: 'Pistol', bounty, assisters: [] });
  assert.deepEqual(ids(snap(), snap({ events: [kill(true)] })), ['bounty']);
  assert.deepEqual(ids(snap(), snap({ events: [kill(false)] })), ['kill']);
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
  assert.deepEqual(ids(null, snap({ self: { pending: { level: 1, k: 'perk', tier: 1 }, reloading: true } })), []);
});

const run = (over: Partial<RunView> = {}): RunView => ({
  phase: 'day', night: 1, phaseEndsAt: 40_000, scrap: 100, core: { x: 1500, y: 1500, hp: 4000, maxHp: 4000 }, aliveZombies: 0, waveLeft: 0, survivors: 50, lost: 0, ready: [], report: null, ...over,
});
const squad = (r: RunView, o: Parameters<typeof snap>[0] & { buildings?: BuildingView[] } = {}): Snapshot => ({ ...snap(o), run: r, buildings: o.buildings ?? [], zombies: [] });

test('the night opens on a horn and closes on a dawn chime', () => {
  const night = run({ phase: 'night', phaseEndsAt: null, waveLeft: 20 });
  assert.deepEqual(ids(squad(run()), squad(night)), ['horn']);
  assert.deepEqual(ids(squad(night), squad(run({ night: 2 }))), ['chime']);
  assert.deepEqual(ids(squad(run()), squad(run())), [], 'a quiet day stays quiet');
});

test('the core sounds once per hundred health it loses, not on every bite', () => {
  const core = (hp: number) => squad(run({ phase: 'night', phaseEndsAt: null, core: { x: 1500, y: 1500, hp, maxHp: 4000 } }));
  assert.deepEqual(ids(core(4000), core(3992)), ['coreHit'], 'the first bite crosses below 4000');
  assert.deepEqual(ids(core(3992), core(3950)), [], 'more bites in the same hundred are silent');
  assert.deepEqual(ids(core(3905), core(3890)), ['coreHit']);
});

test('walls clack up, thud when bitten and crumble when they fall', () => {
  const wall = (cx: number, hp = 10): BuildingView => ({ kind: 'wall', cx, cy: 30, hp });
  const night = run({ phase: 'night', phaseEndsAt: null });
  assert.deepEqual(ids(squad(run()), squad(run(), { buildings: [wall(26)] })), ['wallUp']);
  const bitten: GameEvent[] = [1, 2].map(() => ({ e: 'dmg', attacker: null, victim: 9, amount: 8, x: 1325, y: 1525, kind: 'building' }));
  assert.deepEqual(ids(squad(night, { buildings: [wall(26)] }), squad(night, { buildings: [wall(26, 9)], events: bitten })), ['wallHit'], 'one thud however many bites land together');
  assert.deepEqual(ids(squad(night, { buildings: [wall(26), wall(27)] }), squad(night, { buildings: [wall(27)] })), ['wallDown']);
});

test('turrets fire with their own sound, once per kind a snapshot however many rounds fly', () => {
  const shot = (kind: 'sentry' | 'cannon'): GameEvent => ({ e: 'turret', kind, x: 1325, y: 1525, angle: 0 });
  const night = run({ phase: 'night', phaseEndsAt: null });
  assert.deepEqual(ids(squad(night), squad(night, { events: [shot('sentry'), shot('sentry'), shot('cannon'), shot('sentry')] })), ['turret:sentry', 'turret:cannon']);
  assert.notDeepEqual(SOUNDS['turret:sentry'], SOUNDS['turret:cannon']);
});

test('a zombie bite crunches, your own zombie kills splat, and going down or getting up has its own sound', () => {
  const bite: GameEvent = { e: 'dmg', attacker: null, victim: 1, amount: 8, x: 100, y: 0, kind: 'player' };
  assert.deepEqual(ids(squad(run(), { me: { hp: 100 } }), squad(run(), { me: { hp: 92 }, events: [bite] })), ['bite', 'hurt']);
  const zkill = (by: number | null): GameEvent => ({ e: 'zkill', id: 50, kind: 'walker', x: 300, y: 0, by });
  assert.deepEqual(ids(null, squad(run(), { events: [zkill(1)] })), ['splat']);
  assert.deepEqual(ids(null, squad(run(), { events: [zkill(2)] })), [], 'a squadmate\'s kill is theirs to hear');
  const life = (k: 'downed' | 'revived' | 'bledOut', id: number, by: number | null = null): GameEvent => ({ e: 'life', id, name: 'n', k, by });
  const down = { alive: false, hp: 0, downed: { revive: 0, bleedOutAt: 9e9 } };
  assert.deepEqual(ids(squad(run()), squad(run(), { me: down, events: [life('downed', 1)] })), ['downed'], 'going down is not the death sound');
  assert.deepEqual(ids(null, squad(run(), { events: [life('revived', 2, 1)] })), ['revived'], 'you got a squadmate up');
  assert.deepEqual(ids(null, squad(run(), { events: [life('revived', 3, 2)] })), [], 'someone else\'s revive');
  assert.deepEqual(ids(squad(run(), { me: down }), squad(run(), { me: { alive: false, hp: 0 }, events: [life('bledOut', 1)] })), ['death']);
});
