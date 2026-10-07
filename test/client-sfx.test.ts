/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUN_IDS, GUNS, MEDALS, type MedalId } from '../src/shared/defs.ts';
import { DUCKS, SOUNDS, duckFor, emoteCue, minGapMs, priorityOf, screenCue, soundsFor, varianceOf, type Layer, type SoundId } from '../src/client/sfx.ts';
import { PLANE_MS } from '../src/client/sfx.ts';
import { TICK_MS } from '../src/client/interp.ts';
import { planeAt } from '../src/shared/protocol.ts';
import type { AirdropView, BarrelView, BuildingView, GameEvent, PlayerView, RunView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const ME = 'Me';
const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: id === 1 ? ME : `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 1, armorTier: 'none', kind: 'bot', hunted: false, ...over,
});

const snap = (o: { me?: Partial<PlayerView>; self?: Partial<SelfView>; players?: PlayerView[]; events?: GameEvent[] } = {}): Snapshot => ({
  t: 'snap', tick: 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: o.me?.alive ?? true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, suppression: 0, streak: 0, nemesis: null, ...o.self },
  players: [player(1, o.me), ...(o.players ?? [])], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Boneyard', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: null }, events: o.events ?? [],
});

const ids = (prev: Snapshot | null, next: Snapshot) => soundsFor(prev, next).map((c) => c.id);

test('kill-confirm plays only when you are the killer, matched by id not name', () => {
  const kill = (killerId: number, victimId: number, killer = `p${killerId}`): GameEvent =>
    ({ e: 'kill', killer, victim: `p${victimId}`, killerId, victimId, weapon: 'Pistol', bounty: false, assisters: [], ended: 0, revenge: false });
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
  assert.deepEqual(ids(snap({ me: { hp: 0, alive: false } }), snap({ me: { hp: 100 } })), ['spawn'], 'respawning at full hp is a drop-in thump, not a hurt');
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

/** Layers a listener far away would still hear (own-gun clacks and brass leave out). */
const heard = (id: (typeof GUN_IDS)[number] | 'silenced') => SOUNDS[`shot:${id}`].filter((l) => !l.selfOnly);
const bodyLow = (id: (typeof GUN_IDS)[number] | 'silenced') => Math.min(...heard(id).flatMap((l) => (l.src === 'tone' && l.wave === 'sine' ? [l.pitchHz[1]] : [])));
const tailMs = (id: (typeof GUN_IDS)[number]) => Math.max(...heard(id).map((l) => (l.delayMs ?? 0) + l.ms));
const isCrack = (l: Layer) => l.src === 'noise' && l.filter === 'highpass' && l.ms <= 6;
const gunPeak = (id: (typeof GUN_IDS)[number] | 'silenced') => Math.max(...SOUNDS[`shot:${id}`].map((l) => l.gain));

test('every real gun has a sub-250 Hz blast body, a short high-passed crack and a reflection tail', () => {
  for (const id of GUN_IDS.filter((g) => !GUNS[g].silenced)) {
    const r = SOUNDS[`shot:${id}`];
    assert.ok(r.some((l) => l.src === 'tone' && Math.max(...l.pitchHz) < 250 && l.gain >= 0.4), `${id} has a low body thump`);
    assert.ok(r.some((l) => l.src === 'noise' && l.filter === 'lowpass' && l.cutoffHz[0] <= 1700 && l.ms >= 40), `${id} has a low-passed blast`);
    assert.ok(r.some(isCrack), `${id} has a crack transient`);
    assert.ok(r.some((l) => l.src === 'noise' && l.filter === 'lowpass' && (l.delayMs ?? 0) >= 18 && l.ms >= 100), `${id} has a reflection tail`);
    assert.ok(r.some((l) => l.selfOnly), `${id} has its own action clack`);
    assert.ok(!r.some((l) => l.src === 'tone' && l.wave !== 'sine' && l.pitchHz[0] > 1000), `${id} has no toy bleeps`);
  }
});

test('heavier classes sound lower and ring longer; evolved guns scale with their damage', () => {
  const order = ['smg', 'pistol', 'assault', 'lmg', 'shotgun', 'sniper'] as const;
  for (let i = 1; i < order.length; i++) {
    assert.ok(bodyLow(order[i]!) <= bodyLow(order[i - 1]!), `${order[i]} body is no higher than ${order[i - 1]}`);
    assert.ok(tailMs(order[i]!) > tailMs(order[i - 1]!), `${order[i]} tail is longer than ${order[i - 1]}`);
  }
  assert.ok(bodyLow('handCannon') < bodyLow('pistol') && bodyLow('executioner') < bodyLow('pistol'), 'hand cannons are heavier than the pistol');
  assert.ok(bodyLow('hornet') > bodyLow('smg') * 0.98 && bodyLow('machinePistol') >= bodyLow('pistol') * 0.95, 'light evolutions stay light');
  assert.ok(tailMs('handCannon') > tailMs('pistol'));
});

test('a silenced shot is a muffled thup and click: no crack, nothing bright, quieter than every real gun', () => {
  const silenced = ['silenced', ...GUN_IDS.filter((g) => GUNS[g].silenced)] as const;
  for (const id of silenced) {
    const r = SOUNDS[`shot:${id}`];
    assert.ok(!r.some(isCrack) && !r.some((l) => l.src === 'noise' && l.filter === 'highpass'), `${id} has no crack`);
    assert.ok(r.every((l) => (l.delayMs ?? 0) + l.ms <= 80), `${id} is short`);
    assert.ok(r.some((l) => l.src === 'tone' && l.pitchHz[1] < 250), `${id} has a low thup`);
    for (const loud of GUN_IDS.filter((g) => !GUNS[g].silenced)) assert.ok(gunPeak(id) < gunPeak(loud) * 0.8, `${id} is quieter than ${loud}`);
  }
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
  assert.deepEqual(ids(snap({ me: { gun: 'handCannon', alive: false } }), snap({ me: { gun: 'pistol' } })), ['spawn'], 'respawning is a drop-in, not an evolution');
  assert.deepEqual(ids(snap(), snap({ self: { perks: { 1: 'grip' } } })), ['perk']);
  assert.deepEqual(ids(snap({ self: { perks: { 1: 'grip' } } }), snap({ self: { perks: { 1: 'grip' } } })), [], 'a kept perk is silent');
  assert.ok(SOUNDS.evolve.length > SOUNDS.perk.length, 'the evolution cue is the bigger one');
});

test('a bounty kill plays the bounty cue in place of the plain kill confirm', () => {
  const kill = (bounty: boolean): GameEvent => ({ e: 'kill', killer: ME, victim: 'p2', killerId: 1, victimId: 2, weapon: 'Pistol', bounty, assisters: [], ended: 0, revenge: false });
  assert.deepEqual(ids(snap(), snap({ events: [kill(true)] })), ['bounty']);
  assert.deepEqual(ids(snap(), snap({ events: [kill(false)] })), ['kill']);
});

test('reload plays when reloading starts, not while it continues', () => {
  const r = (reloading: boolean) => snap({ self: { reloading } });
  assert.deepEqual(ids(r(false), r(true)), ['reload:pistol'], 'the reload clicks are the gun class\'s');
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
  assert.deepEqual(ids(squad(run()), squad(run(), { buildings: [wall(26)] })), ['build:wood']);
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

test('walking sounds a quiet footstep each time you cross a stride, not while standing, dashing or teleporting', () => {
  const at = (x: number, extra: Partial<PlayerView> = {}) => snap({ me: { x, y: 0, ...extra } });
  assert.deepEqual(ids(at(10), at(80)), ['step']);
  assert.deepEqual(ids(at(10), at(20)), [], 'within the same stride');
  assert.deepEqual(ids(at(80), at(80)), [], 'standing still');
  assert.deepEqual(ids(at(10), at(80, { dashing: true })), [], 'a dash is not footsteps');
  assert.deepEqual(ids(at(10), at(2000)), [], 'a respawn teleport is not a step');
  assert.ok(priorityOf({ id: 'step', self: true }) === 0, 'footsteps are the first thing dropped');
});

test('hits land with the voice of what they hit: flesh, crate, zombie and wall each have their own', () => {
  const dmg = (kind: 'player' | 'crate' | 'zombie', attacker: number | null, victim: number): GameEvent => ({ e: 'dmg', attacker, victim, amount: 10, x: 300, y: 0, kind });
  assert.deepEqual(ids(snap(), snap({ events: [dmg('crate', 2, 9), dmg('crate', 2, 9)] })), ['impact:crate'], 'one per kind a snapshot');
  assert.deepEqual(ids(snap(), snap({ events: [dmg('zombie', 1, 9)] })), ['hit', 'impact:zombie'], 'my hit on a zombie ticks and squelches');
  assert.deepEqual(ids(snap(), snap({ events: [dmg('player', 2, 3)] })), ['impact:flesh'], 'others trading hits is a thwack');
  assert.deepEqual(ids(snap(), snap({ events: [dmg('player', 1, 3)] })), ['hit'], 'my own hit is the tick, no second thwack');
  assert.deepEqual(ids(snap(), snap({ events: [{ e: 'impact', x: 300, y: 0 }, { e: 'impact', x: 320, y: 0 }] })), ['impact:wall']);
  const all = ['impact:flesh', 'impact:wall', 'impact:crate', 'impact:zombie'] as const;
  assert.equal(new Set(all.map((i) => JSON.stringify(SOUNDS[i]))).size, all.length);
});

test('each weapon class has its own reload clicks, and a respawn does not read as a reload', () => {
  const classes = ['pistol', 'smg', 'shotgun', 'assault', 'sniper', 'lmg'] as const;
  assert.equal(new Set(classes.map((c) => JSON.stringify(SOUNDS[`reload:${c}`]))).size, classes.length);
  const r = (gun: 'pistol' | 'shotgun', reloading: boolean) => snap({ me: { gun }, self: { reloading } });
  assert.deepEqual(ids(r('shotgun', false), r('shotgun', true)), ['reload:shotgun']);
});

test('shots are layered click + body + tail, the sniper echoes, and casings only tinkle for your own gun', () => {
  for (const id of GUN_IDS.filter((g) => !GUNS[g].silenced)) assert.ok(SOUNDS[`shot:${id}`].length >= 7, `${id} is more than crack and thump`);
  const sniper = SOUNDS['shot:sniper'];
  assert.ok(sniper.some((l) => (l.delayMs ?? 0) >= 140 && l.ms >= 400), 'the sniper has a delayed echo tail');
  assert.ok(Math.max(...SOUNDS['shot:shotgun'].map((l) => l.ms)) >= 280, 'the shotgun boom is long');
  assert.ok(SOUNDS['shot:pistol'].some((l) => l.selfOnly), 'casing layers are marked own-gun only');
  assert.ok(!SOUNDS['shot:silenced'].some((l) => l.selfOnly));
});

test('shots, steps and impacts vary a little each play but melodic cues stay in tune', () => {
  assert.ok(varianceOf('shot:smg').pitch > 0 && varianceOf('shot:smg').gain > 0);
  assert.ok(varianceOf('step').pitch > 0);
  for (const id of ['kill', 'medal:gold', 'levelup', 'fanfare'] as SoundId[]) assert.deepEqual(varianceOf(id), { pitch: 0, gain: 0 }, id);
  assert.ok(minGapMs('shot:pistol') > 0 && minGapMs('kill') === 0);
});

test('feedback outranks ambience when the mix is full', () => {
  for (const id of ['hit', 'hurt', 'boom', 'medal:platinum', 'kill:3', 'bounty', 'fanfare'] as SoundId[]) assert.equal(priorityOf({ id, self: true }), 2, id);
  assert.equal(priorityOf({ id: 'shot:smg', self: false }), 0);
  assert.equal(priorityOf({ id: 'shot:smg', self: true }), 1);
});

test('medals ring bigger up the tiers and platinum is the biggest, with a lifetime fanfare above that', () => {
  const tiers = ['bronze', 'silver', 'gold', 'platinum'] as const;
  const len = (id: SoundId) => Math.max(...SOUNDS[id].map((l) => (l.delayMs ?? 0) + l.ms));
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(SOUNDS[`medal:${tiers[i]!}`].length > SOUNDS[`medal:${tiers[i - 1]!}`].length, `${tiers[i]} has more layers`);
    assert.ok(len(`medal:${tiers[i]!}`) > len(`medal:${tiers[i - 1]!}`), `${tiers[i]} rings longer`);
  }
  assert.ok(SOUNDS.fanfare.length >= SOUNDS['medal:platinum'].length);
  assert.ok(len('fanfare') > len('medal:platinum'));
});

test('a kill\'s ka-ching rides on the climbing sting, and a bounty gets the biggest', () => {
  assert.ok(SOUNDS.kill.length > 3 && SOUNDS['kill:3'].length > SOUNDS.kill.length - 1);
  assert.ok(SOUNDS.bounty.length > SOUNDS.kill.length - 3);
});

// ---- the final pass: mix balance and the cues other features shipped without ----

const peakGain = (id: SoundId) => Math.max(...SOUNDS[id].map((l) => l.gain));
const withWorld = (s: Snapshot, o: { barrels?: BarrelView[]; airdrop?: AirdropView | null; tick?: number }): Snapshot => ({ ...s, tick: o.tick ?? s.tick, barrels: o.barrels, airdrop: o.airdrop });

test('the mix: reload clicks and the spawn thump sit under your gunshots, footsteps are audible, medals and the fanfare lead', () => {
  const total = (id: SoundId) => SOUNDS[id].reduce((a, l) => a + l.gain, 0);
  for (const c of ['pistol', 'smg', 'assault', 'lmg', 'shotgun', 'sniper'] as const) assert.ok(total(`reload:${c}`) < total(`shot:${c}`) * 0.4, `${c} reload is well under its shot`);
  assert.ok(total('spawn') < total('shot:pistol'), 'the spawn is a modest thump');
  assert.ok(total('step') > 0.3 && total('step') < total('hit'), 'a footstep is subtle but not inaudible');
  assert.ok(peakGain('hit') > peakGain('hurt') * 0.5);
  for (const quiet of ['kill', 'kill:5', 'bounty'] as SoundId[]) assert.ok(total(quiet) < total('medal:platinum') && total(quiet) < total('fanfare'), `${quiet} is under the big medals`);
  for (const [lo, hi] of [['medal:bronze', 'medal:silver'], ['medal:silver', 'medal:gold'], ['medal:gold', 'medal:platinum']] as const) assert.ok(total(lo) < total(hi) * 1.2, `${hi} is not quieter than ${lo}`);
  for (const id of Object.keys(SOUNDS) as SoundId[]) for (const l of SOUNDS[id]) assert.ok(Number.isFinite(l.gain) && l.gain > 0, `${id} has sane layer gains`);
});

test('every medal, new and old, sounds its tier\'s cue, and the best medal in a snapshot wins', () => {
  const won = (...medals: MedalId[]) => ids(snap(), snap({ events: medals.map((medal): GameEvent => ({ e: 'medal', id: 1, medal })) }));
  for (const m of Object.keys(MEDALS) as MedalId[]) assert.deepEqual(won(m), [`medal:${MEDALS[m].tier}`], m);
  assert.deepEqual(won('kaboom'), ['medal:bronze']);
  assert.deepEqual(won('specialDelivery'), ['medal:silver']);
  assert.deepEqual(won('chainReaction'), ['medal:gold']);
  assert.deepEqual(won('kaboom', 'chainReaction'), ['medal:gold'], 'one sting, the best');
  assert.deepEqual(ids(snap(), snap({ events: [{ e: 'medal', id: 2, medal: 'chainReaction' }] })), [], 'someone else\'s medal is theirs');
});

const barrel = (id: number, hp: number, x = 500, y = 0): BarrelView => [id, x, y, hp];
const boom = (x: number, y: number): GameEvent => ({ e: 'boom', x, y, r: 170 });
const barrelDmg = (victim: number, x = 500): GameEvent => ({ e: 'dmg', attacker: 1, victim, amount: 5, x, y: 0, kind: 'crate' });

test('a hurt barrel tinks and hisses instead of thudding like a crate, a lit one sizzles', () => {
  const before = withWorld(snap(), { barrels: [barrel(7, 10)] });
  assert.deepEqual(ids(before, withWorld(snap({ events: [barrelDmg(7), barrelDmg(7)] }), { barrels: [barrel(7, 6)] })), ['barrel:hurt'], 'one per snapshot, not impact:crate');
  assert.deepEqual(ids(before, withWorld(snap({ events: [barrelDmg(7)] }), { barrels: [barrel(7, 0)] })), ['barrel:fuse'], 'the hit that lights it sizzles, no separate hurt');
  assert.deepEqual(ids(withWorld(snap(), { barrels: [barrel(7, 0)] }), withWorld(snap(), { barrels: [barrel(7, 0)] })), [], 'a burning barrel is not re-announced every snapshot');
  assert.deepEqual(ids(snap(), snap({ events: [{ e: 'dmg', attacker: 1, victim: 40, amount: 5, x: 300, y: 0, kind: 'crate' }] })), ['impact:crate'], 'a plain crate still thuds');
  const cue = soundsFor(before, withWorld(snap({ events: [barrelDmg(7)] }), { barrels: [barrel(7, 6)] }))[0]!;
  assert.deepEqual([cue.x, cue.self], [500, false]);
});

test('a barrel burst is its own clang-and-whoomp, not the grenade boom, and a chain ripples', () => {
  const lit = withWorld(snap(), { barrels: [barrel(7, 0), barrel(8, 0, 560), barrel(9, 0, 620), barrel(10, 4, 3000)] });
  const one = soundsFor(lit, withWorld(snap({ events: [boom(500, 0)] }), { barrels: [barrel(8, 0, 560), barrel(9, 0, 620), barrel(10, 4, 3000)] }));
  assert.deepEqual(one.map((c) => c.id), ['barrel:burst'], 'the boom on a barrel that just vanished is the burst');
  assert.equal(one[0]!.r, 170, 'it still carries the blast radius for the camera shake');
  const three = soundsFor(lit, withWorld(snap({ events: [boom(500, 0), boom(560, 0), boom(620, 0)] }), { barrels: [barrel(10, 4, 3000)] }));
  assert.deepEqual(three.map((c) => c.id), ['barrel:burst', 'barrel:burst', 'barrel:chain', 'barrel:burst']);
  assert.deepEqual(three.filter((c) => c.id === 'barrel:burst').map((c) => c.delayMs), [0, 90, 180], 'each blast a beat after the last');
  assert.deepEqual(ids(snap(), snap({ events: [boom(500, 0)] })), ['boom'], 'a grenade is still the boom');
  assert.deepEqual(ids(lit, withWorld(snap({ events: [boom(2000, 2000)] }), { barrels: [barrel(7, 0)] })), ['boom'], 'a boom nowhere near a lost barrel is a grenade');
  assert.deepEqual(ids(lit, withWorld(snap(), { barrels: [] })), [], 'barrels vanishing with no blast (a new map) are silent');
  assert.notDeepEqual(SOUNDS['barrel:burst'], SOUNDS.boom);
  assert.ok(SOUNDS['barrel:burst'].some((l) => l.src === 'tone' && l.wave === 'sine' && l.pitchHz[0] > 250 && l.pitchHz[0] < 1500 && l.ms >= 400), 'a ringing clang');
  assert.equal(priorityOf({ id: 'barrel:burst', self: false }), 2);
});

const flight = (over: Partial<AirdropView> = {}): AirdropView => ({ x: 1000, y: 0, a: 0, dropAt: 10_000, landAt: 15_000, ...over });

test('the supply plane drones across the field, panning with its flight and peaking as it passes the drop point', () => {
  const t = 4000 / TICK_MS;
  const inbound: GameEvent = { e: 'airdrop', k: 'inbound', x: 1000, y: 0 };
  const cues = soundsFor(null, withWorld(snap({ events: [inbound] }), { tick: t, airdrop: flight() }));
  assert.equal(cues.length, 1);
  const c = cues[0]!;
  assert.equal(c.id, 'plane');
  assert.equal(c.self, false);
  assert.equal(c.delayMs, 10_000 - 4000 - 3000, 'delayed so the swell peaks over the drop point');
  assert.ok(c.sweep && c.sweep.ms === PLANE_MS && c.sweep.x > c.x, 'travels along the plane\'s heading');
  assert.deepEqual([c.x, c.y], [planeAt(flight(), 7000).x, planeAt(flight(), 7000).y], 'starts where the plane is when the cue begins');
  const bare = soundsFor(null, snap({ events: [inbound] }))[0]!;
  assert.deepEqual([bare.id, bare.sweep, bare.x], ['plane', undefined, 1000], 'without the flight view it still drones from the drop point');
  assert.ok(Math.max(...SOUNDS.plane.map((l) => l.attackMs ?? 0)) >= 2500 && SOUNDS.plane.every((l) => l.ms === PLANE_MS));
});

test('the chute opens as the crate leaves the plane, the crate thuds, and cracking it open shings for gold or jingles for supplies', () => {
  const at = (ms: number) => withWorld(snap(), { tick: ms / TICK_MS, airdrop: flight() });
  assert.deepEqual(ids(at(9_900), at(10_100)), ['chute'], 'on the tick the drop time passes');
  assert.deepEqual(ids(at(10_100), at(10_300)), [], 'not again');
  assert.deepEqual(ids(at(9_000), at(9_500)), [], 'not before');
  assert.deepEqual(ids(snap(), at(10_100)), [], 'a first snapshot derives nothing');
  assert.deepEqual(ids(null, snap({ events: [{ e: 'airdrop', k: 'landed', x: 900, y: 40 }] })), ['crate:land']);
  const taken = (by: string, gold: boolean): Snapshot => snap({ events: [{ e: 'airdrop', k: 'taken', x: 900, y: 40, by, gold }] });
  assert.deepEqual(soundsFor(null, taken(ME, true)).map((c) => [c.id, c.self]), [['crate:break', true], ['crate:gold', true]]);
  assert.deepEqual(soundsFor(null, taken(ME, false)).map((c) => c.id), ['crate:break', 'crate:supply']);
  const theirs = soundsFor(null, taken('p2', true));
  assert.deepEqual(theirs.map((c) => [c.self, c.gain, c.x]), [[false, 0.8, 900], [false, 0.8, 900]], 'someone else\'s crate is placed in the world, quieter');
  assert.notDeepEqual(SOUNDS['crate:gold'], SOUNDS['crate:supply']);
  assert.ok(Math.max(...SOUNDS['crate:gold'].map((l) => (l.src === 'tone' ? l.pitchHz[0] : 0))) > 3000, 'the shing is bright');
});

test('emotes pop softly: your own at full, others\' quieter and placed at the player, strangers out of view silent', () => {
  const s = snap({ players: [player(2, { x: 400, y: 80 })] });
  assert.deepEqual(emoteCue(s, 1), { id: 'emote', x: 0, y: 0, self: true, gain: 1 });
  const other = emoteCue(s, 2)!;
  assert.deepEqual([other.self, other.x, other.y], [false, 400, 80]);
  assert.ok(other.gain < 0.6);
  assert.equal(emoteCue(s, 99), null);
  assert.ok(minGapMs('emote') > 0 && priorityOf({ id: 'emote', self: false }) === 0);
});

test('slow motion, the killcam and the party have cues, and screen cues sit at the listener and pan by side', () => {
  for (const id of ['slowmo:in', 'slowmo:out', 'confetti', 'firework', 'emote'] as const) assert.ok(SOUNDS[id].length >= 2, id);
  const out = SOUNDS['slowmo:out'];
  assert.ok(out.some((l) => l.src === 'noise' && l.attackMs !== undefined && l.attackMs > l.ms * 0.8), 'the swell out is a reverse swell: nearly all attack');
  const inn = SOUNDS['slowmo:in'];
  assert.ok(inn.some((l) => l.src === 'tone' && l.pitchHz[1] < 60), 'a low whoosh into slow motion');
  assert.deepEqual(screenCue('confetti', 0.9, -0.85), { id: 'confetti', x: 0, y: 0, self: true, gain: 0.9, pan: -0.85 });
  assert.equal(screenCue('slowmo:in').pan, undefined);
  assert.ok(priorityOf({ id: 'confetti', self: true }) === 1);
});

test('the music ducks on the sound effects\' own big-event list, less for a far blast and not at all out of earshot', () => {
  for (const id of ['boom', 'barrel:burst', 'kill', 'kill:5', 'bounty', 'medal:gold', 'medal:platinum', 'fanfare', 'crate:gold', 'slowmo:in'] as SoundId[]) assert.ok(DUCKS[id], `${id} ducks the score`);
  assert.equal(DUCKS.step, undefined);
  assert.equal(DUCKS['shot:pistol'], undefined);
  const where = { x: 0, y: 0 };
  const cue = (x: number, self = false) => ({ id: 'boom' as const, x, y: 0, self, gain: 1 });
  assert.deepEqual(duckFor(cue(0, true), where, 900), DUCKS.boom!);
  const near = duckFor(cue(100), where, 900)!, far = duckFor(cue(700), where, 900)!;
  assert.ok(near.depth < far.depth && far.depth < 1 && near.depth >= DUCKS.boom!.depth, 'a nearer blast ducks deeper');
  assert.equal(duckFor(cue(5000), where, 900), null);
  assert.equal(duckFor({ id: 'step', x: 0, y: 0, self: true, gain: 1 }, where, 900), null);
  assert.deepEqual(duckFor(screenCue('fanfare'), where, 900), DUCKS.fanfare!);
  assert.equal(duckFor(screenCue('confetti'), where, 900), null, 'the celebration never ducks the win cadence');
});
