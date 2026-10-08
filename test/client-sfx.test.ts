/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EVOLUTIONS, GUN_IDS, GUNS } from '../src/shared/defs.ts';
import { RELOAD_BEATS, reloadFamily } from '../src/client/reload.ts';
import { impulse, placeCue, RATE_JITTER, roofsOf, SAMPLE_IDS, SAMPLES, shotCues, SOUNDS, soundsFor, voiceFor, type Hearing, type SampleId, type SoundCue, type SoundId } from '../src/client/sfx.ts';
import type { BuildingView, CrateView, GameEvent, PlayerView, RunView, SelfView, Snapshot, WallView } from '../src/shared/protocol.ts';

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
  const confirms = (events: GameEvent[]) => ids(snap(), snap({ events })).filter((id) => id !== 'clatter');
  assert.deepEqual(confirms([kill(1, 2)]), ['kill']);
  assert.deepEqual(confirms([kill(2, 3)]), [], 'someone else scoring a kill is silent');
  assert.deepEqual(confirms([kill(2, 3, ME)]), [], 'another player sharing my name scoring a kill is silent');
  assert.deepEqual(confirms([kill(1, 1)]), [], 'killing yourself is not a kill-confirm');
});

test('the kill confirm is a thump and then the confirm tone, in recording and synth alike', () => {
  const [thump, tone] = sampleOf('kill');
  assert.equal(thump!.sample, 'thump');
  assert.equal(thump!.delayMs ?? 0, 0);
  assert.equal(tone!.sample, 'kill');
  assert.ok((tone!.delayMs ?? 0) > 0, 'the tone follows the thump');
  assert.deepEqual(sampleOf('bounty').slice(0, 2), sampleOf('kill'), 'a bounty kill confirms the same way before its coins');
  const [low, ...notes] = SOUNDS.kill;
  assert.ok(low!.src === 'tone' && low!.pitchHz[0] < 200 && !low!.delayMs, 'the synth opens on a low thump');
  assert.ok(notes.every((n) => (n.delayMs ?? 0) > 0));
});

test('a fallen player\'s gun clatters where they fell once it lands, and a knock drops no gun', () => {
  const kill = (knock: boolean): GameEvent => ({ e: 'kill', killer: 'p3', victim: 'p2', killerId: 3, victimId: 2, weapon: 'Pistol', bounty: false, assisters: [], ...(knock && { knock: true as const }) });
  const before = snap({ players: [player(2, { x: 340, y: 60 })] });
  const clatter = soundsFor(before, snap({ events: [kill(false)] })).filter((c) => c.id === 'clatter');
  assert.deepEqual(clatter.map((c) => [c.x, c.y, c.self]), [[340, 60, false]], 'placed where the victim stood, though they are gone from the snapshot');
  assert.ok((clatter[0]!.delayMs ?? 0) > 0);
  assert.deepEqual(soundsFor(before, snap({ events: [kill(true)] })).filter((c) => c.id === 'clatter'), []);
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
  const reports = shots.filter((c) => c.id.startsWith('shot:'));
  assert.deepEqual(reports.map((c) => [c.id, c.self, c.x]), [['shot:sniper', false, 200], ['shot:silenced', false, 200]]);
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

/** Walks a reload through `shares` (undefined once it is over) and collects the handling cues each snapshot pair makes. */
const reloadRun = (shares: (number | undefined)[], frame: (share: number | undefined) => Snapshot) =>
  shares.slice(1).map((share, i) => soundsFor(frame(shares[i]), frame(share)).filter((c) => c.id.startsWith('gun:')));

test('your reload plays each beat of its family once, as the reload passes it, finishing the last on the snapshot it ends', () => {
  const mine = (gun: 'pistol' | 'shotgun' | 'lmg') => (share: number | undefined) =>
    snap({ me: { gun }, self: { reloading: share !== undefined, reloadFrac: share ?? 0 } });
  for (const gun of ['pistol', 'shotgun', 'lmg'] as const) {
    const steps = reloadRun([undefined, 0.05, 0.3, 0.5, 0.7, 0.8, undefined, undefined], mine(gun));
    const heard = steps.flat();
    assert.deepEqual(heard.map((c) => c.id), RELOAD_BEATS[reloadFamily(gun)].map((b) => `gun:${b.cue}`), `${gun} beats, each once, in order`);
    assert.ok(heard.every((c) => c.self), 'your own reload is centred on you');
    assert.ok(steps.at(-2)!.length > 0, 'the beats past 0.8 land as the reload completes');
    assert.deepEqual(steps.at(-1), [], 'nothing after it is over');
  }
  const pistol = reloadRun([undefined, 0.05, 0.3, 0.5, 0.7, 0.8, undefined], mine('pistol'));
  assert.deepEqual(pistol.map((cues) => cues.map((c) => c.id)), [[], ['gun:magOut'], [], ['gun:magIn'], [], ['gun:slide']], 'each beat on the snapshot that passes it');
});

test('dying mid-reload cuts the reload off, and the first snapshot of a session plays no beats', () => {
  const dead = snap({ me: { alive: false, hp: 0 }, self: { alive: false, reloading: false } });
  assert.deepEqual(soundsFor(snap({ self: { reloading: true, reloadFrac: 0.5 } }), dead).filter((c) => c.id.startsWith('gun:')), []);
  assert.deepEqual(ids(null, snap({ self: { reloading: true, reloadFrac: 0.9 } })), []);
});

test('another player reloading is heard where they stand, beat by beat, and their finished reload plays its last beats', () => {
  const them = (share: number | undefined) => snap({ players: [player(2, { gun: 'shotgun', x: 400, ...(share !== undefined && { reload: share }) })] });
  const heard = reloadRun([undefined, 0.1, 0.45, 0.7, undefined], them).flat();
  assert.deepEqual(heard.map((c) => c.id), ['gun:shell', 'gun:shell', 'gun:shell', 'gun:pump']);
  assert.ok(heard.every((c) => !c.self && c.x === 400), 'placed at the reloading player');
  const killed = (share: number | undefined) => snap({ players: [player(2, { gun: 'shotgun', ...(share === undefined ? { alive: false } : { reload: share }) })] });
  assert.deepEqual(reloadRun([0.7, undefined], killed).flat(), [], 'a reload ended by death never pumps');
});

test('a shotgun blast is followed by its pump and then the shell landing, a sniper by its bolt, and an SMG only by its casing', () => {
  const at = { x: 0, y: 0 };
  const shape = (gun: 'shotgun' | 'sniper' | 'smg') => shotCues(gun, false, at, true).map((c) => [c.id, c.delayMs ?? 0]);
  const shotgun = shape('shotgun');
  assert.deepEqual(shotgun.map(([id]) => id), ['shot:shotgun', 'gun:pump', 'brass:shell']);
  assert.ok(0 < (shotgun[1]![1] as number) && (shotgun[1]![1] as number) < (shotgun[2]![1] as number), 'blast, then pump, then the shell it threw');
  assert.deepEqual(shape('sniper').map(([id]) => id), ['shot:sniper', 'gun:bolt', 'brass:casing']);
  assert.deepEqual(shape('smg').map(([id]) => id), ['shot:smg', 'brass:casing']);
  assert.deepEqual(shotCues('smg', true, at, false)[0]!.id, 'shot:silenced');
  const lmg = shotCues('lmg', false, at, false).find((c) => c.id === 'brass:casing')!;
  assert.ok(placeCue(lmg, open(600)) === null, 'brass is only heard close by');
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

const wall = (x: number, material: 'metal' | 'concrete' | 'wood' | 'sandbag'): WallView => ({ x, y: 0, w: 100, h: 25, built: false, material });
const WALLS = [wall(0, 'metal'), wall(200, 'concrete'), wall(400, 'sandbag')];
const impact = (x: number, y = 10): GameEvent => ({ e: 'impact', x, y, dir: 0 });
const strikes = (o: Parameters<typeof snap>[0] & { crates?: CrateView[] } = {}, walls = WALLS) =>
  soundsFor(snap(), { ...snap(o), crates: o.crates ?? [] }, walls).filter((c) => /^(impact|tink|flesh)/.test(c.id));

test('a round stopping on cover sounds like what it hit: a ricochet off metal, chips off concrete, a thud in sandbags', () => {
  assert.deepEqual(strikes({ events: [impact(50)] }).map((c) => [c.id, c.x]), [['impact:metal', 50]]);
  assert.deepEqual(strikes({ events: [impact(250)] }).map((c) => c.id), ['impact:concrete']);
  assert.deepEqual(strikes({ events: [impact(450)] }).map((c) => c.id), ['impact:sandbag']);
  assert.deepEqual(strikes({ events: [impact(150, 200)] }).map((c) => c.id), ['impact:concrete'], 'a wall the client does not know reads as concrete');
  const crate: CrateView = { id: 40, piece: 'crate', r: 0, x: 600, y: 0, w: 50, h: 50, hp: 60 };
  assert.deepEqual(strikes({ events: [impact(610)], crates: [crate] }).map((c) => c.id), ['impact:wood'], 'a wooden crate splinters');
  assert.equal(SAMPLES['impact:metal'][0]!.sample, 'ricochet');
  assert.equal(SAMPLES['impact:wood'][0]!.sample, 'splinter');
  assert.equal(SAMPLES['impact:concrete'][0]!.sample, 'chip');
  const pellets = [impact(20), impact(30), impact(40), impact(250), impact(260)];
  assert.deepEqual(strikes({ events: pellets }).map((c) => c.id), ['impact:metal', 'impact:concrete'], 'a shotgun blast sounds each material once');
});

test('shooting a breakable piece sounds its own material, wood or metal', () => {
  const hitCrate = (id: number): GameEvent => ({ e: 'dmg', attacker: 2, victim: id, amount: 10, x: 0, y: 0, kind: 'crate', hit: { x: 610, y: 5, dir: 0 } });
  const crates: CrateView[] = [{ id: 40, piece: 'crate', r: 0, x: 600, y: 0, w: 50, h: 50, hp: 60 }, { id: 41, piece: 'crate.drop', r: 0, x: 600, y: 0, w: 75, h: 75, hp: 300 }];
  assert.deepEqual(strikes({ events: [hitCrate(40)], crates }).map((c) => [c.id, c.x]), [['impact:wood', 610]], 'at the hit point');
  assert.deepEqual(strikes({ events: [hitCrate(41)], crates }).map((c) => c.id), ['impact:metal']);
});

test('a bullet into a body sounds flesh, into armour a tink that rings lower and heavier with each tier', () => {
  const shot = (victim: number): GameEvent => ({ e: 'dmg', attacker: 3, victim, amount: 12, x: 0, y: 0, kind: 'player', hit: { x: 205, y: 0, dir: 0 } });
  const on = (armorTier: PlayerView['armorTier']) => strikes({ players: [player(2, { armorTier })], events: [shot(2)] }).map((c) => c.id);
  assert.deepEqual(on('none'), ['flesh']);
  assert.deepEqual(on('light'), ['tink:light']);
  assert.deepEqual(on('medium'), ['tink:medium']);
  assert.deepEqual(on('heavy'), ['tink:heavy']);
  const tink = (tier: 'light' | 'medium' | 'heavy') => sampleOf(`tink:${tier}`);
  assert.ok(tink('light')[0]!.rate > tink('medium')[0]!.rate && tink('medium')[0]!.rate > tink('heavy')[0]!.rate, 'heavier plates ring lower');
  assert.ok(tink('heavy').length > tink('light').length, 'and heavy armour adds the weight of a plate');
  const blast: GameEvent = { e: 'dmg', attacker: 3, victim: 2, amount: 30, x: 200, y: 0, kind: 'player' };
  assert.deepEqual(strikes({ players: [player(2)], events: [blast] }), [], 'a blast or a blade carries no bullet strike');
});

test('a near miss whizzes past only when the round passed you, from the side it passed on', () => {
  const whizz = (victim: number, x: number): GameEvent => ({ e: 'whizz', victim, x, y: 0, dir: Math.PI / 2 });
  const heard = soundsFor(null, snap({ events: [whizz(1, 160), whizz(1, 150)] })).filter((c) => c.id === 'whizz');
  assert.equal(heard.length, 1, 'once a snapshot');
  assert.ok(placeCue(heard[0]!, open(100))!.pan > 0, 'passing on your right');
  assert.deepEqual(soundsFor(null, snap({ events: [whizz(2, 160)] })).filter((c) => c.id === 'whizz'), [], 'a round passing someone else is theirs to hear');
});

const ALL = () => true;
const MID = () => 0.5;
const sampleOf = (id: SoundId, decoded: (s: SampleId) => boolean = ALL, random = MID) => {
  const v = voiceFor(id, decoded, random);
  assert.equal(v.kind, 'sample', `${id} plays a recording once it has decoded`);
  return v.kind === 'sample' ? v.layers : [];
};

test('a cue plays its synth recipe until every recording it needs has decoded', () => {
  assert.deepEqual(voiceFor('shot:pistol', () => false, MID), { kind: 'synth', recipe: SOUNDS['shot:pistol'] });
  assert.equal(voiceFor('shot:pistol', (s) => s === 'pistol', MID).kind, 'synth', 'the body alone is not the layered report');
  assert.deepEqual(sampleOf('shot:pistol', (s) => s === 'pistol' || s === 'crack').map((l) => l.sample), ['crack', 'pistol']);
  const blast = GUN_IDS.find((g) => GUNS[g].blast)!;
  assert.equal(voiceFor(`shot:${blast}`, (s) => s !== 'launcher', MID).kind, 'synth', 'half a layered sound is not played');
});

test('every cue has a recording, and every shipped recording is used by some cue', () => {
  const used = new Set(Object.values(SAMPLES).flatMap((layers) => layers.map((l) => l.sample)));
  assert.deepEqual([...used].sort(), [...SAMPLE_IDS].sort());
  for (const id of Object.keys(SOUNDS) as SoundId[]) assert.ok(SAMPLES[id].length > 0, `${id} has sample layers`);
});

test('each gun plays its class recording, evolved guns pitch it up or down by branch, and no two guns sound alike', () => {
  const body = (g: (typeof GUN_IDS)[number]) => sampleOf(`shot:${g}`).find((l) => l.sample === GUNS[g].base)!;
  for (const g of GUN_IDS) assert.ok(body(g), `${g} plays its class recording`);
  for (const g of GUN_IDS.filter((id) => !GUNS[id].from)) assert.equal(body(g).rate, 1, `${g} plays its recording as recorded`);
  for (const g of GUN_IDS) {
    const [low, high] = EVOLUTIONS[g];
    if (low && high) assert.ok(body(low).rate < body(g).rate && body(g).rate < body(high).rate, `${g}'s branches sit either side of it`);
  }
  const keys = GUN_IDS.map((g) => JSON.stringify(sampleOf(`shot:${g}`)));
  assert.equal(new Set(keys).size, GUN_IDS.length);
  for (const g of GUN_IDS.filter((id) => GUNS[id].blast)) assert.ok(sampleOf(`shot:${g}`).some((l) => l.sample === 'launcher'), `${g} adds the launcher thump`);
  assert.deepEqual(sampleOf('shot:silenced').map((l) => l.sample), ['silenced']);
});

test('a report opens on a crack over its body, and only heavy guns add the low layer, heaviest on the shotgun and sniper', () => {
  const layers = (g: (typeof GUN_IDS)[number]) => sampleOf(`shot:${g}`);
  for (const g of GUN_IDS) assert.equal(layers(g)[0]!.sample, 'crack', `${g} opens on the crack`);
  const sub = (g: (typeof GUN_IDS)[number]) => layers(g).find((l) => l.sample === 'sub')?.gain ?? 0;
  assert.equal(sub('pistol'), 0);
  assert.equal(sub('smg'), 0, 'the SMG flutters with no low body');
  for (const light of ['assault', 'lmg'] as const) for (const heavy of ['shotgun', 'sniper'] as const) assert.ok(sub(heavy) > sub(light), `${heavy} shoves harder than ${light}`);
});

test('each play nudges the pitch by at most the jitter, the same for every layer of a cue', () => {
  const blast = GUN_IDS.find((g) => GUNS[g].blast)!;
  const at = (r: number) => sampleOf(`shot:${blast}`, ALL, () => r);
  const mid = at(0.5);
  for (const r of [0, 0.999]) {
    const nudged = at(r);
    const k = nudged[0]!.rate / mid[0]!.rate;
    assert.ok(Math.abs(k - 1) > RATE_JITTER * 0.9 && Math.abs(k - 1) <= RATE_JITTER + 1e-9, `random ${r} moves the rate by ~${RATE_JITTER}`);
    nudged.forEach((l, i) => assert.ok(Math.abs(l.rate / mid[i]!.rate - k) < 1e-9, 'layers move together'));
  }
});

const open = (x = 0, y = 0, roofs: Hearing['roofs'] = []): Hearing => ({ listener: { x, y }, viewRadius: 900, roofs });

test('a cue is louder near you, panned to its side, silent past earshot, and centred at full volume when it is yours', () => {
  const cue = (x: number, self = false): SoundCue => ({ id: 'boom', x, y: 0, self, gain: 1 });
  const near = placeCue(cue(100), open())!, far = placeCue(cue(600), open())!;
  assert.ok(near.gain > far.gain);
  assert.ok(near.pan > 0 && far.pan > near.pan, 'to the right');
  assert.ok(placeCue(cue(-300), open())!.pan < 0, 'to the left');
  assert.equal(placeCue(cue(2000), open()), null);
  const mine = placeCue({ ...cue(2000, true), gain: 0.7 }, open())!;
  assert.deepEqual([mine.gain, mine.pan], [0.7, 0]);
  assert.ok(placeCue(cue(1000), { ...open(), viewRadius: 1200 }) !== null, 'a wider view hears further');
});

test('distance filters a gun: close shots arrive bright, farther ones lose their highs, and your own is never filtered', () => {
  const at = (x: number, self = false) => placeCue({ id: 'shot:assault', x, y: 0, self, gain: 1 }, open())!;
  assert.equal(at(80).cutoffHz, null);
  const mid = at(500).cutoffHz!, far = at(950).cutoffHz!;
  assert.ok(mid < 18000 && far < mid && far < 2000, `500 away cuts at ${mid.toFixed(0)} Hz, 950 away at ${far.toFixed(0)} Hz`);
  assert.equal(at(950, true).cutoffHz, null);
});

test('a gun rings into the space around it: a far one is mostly tail, a heavy gun rings longer than a light one, a silencer barely rings', () => {
  const at = (id: Exclude<SoundId, 'hurt'>, x: number) => placeCue({ id, x, y: 0, self: false, gain: 1 }, open())!;
  const wetShare = (p: { gain: number; wet: number }) => p.wet / p.gain;
  assert.ok(wetShare(at('shot:assault', 900)) > 2 * wetShare(at('shot:assault', 100)), 'distance leaves the tail and takes the dry sound');
  assert.ok(at('shot:sniper', 300).wet > at('shot:smg', 300).wet);
  assert.ok(at('shot:silenced', 300).wet < at('shot:pistol', 300).wet / 2);
  assert.equal(at('click', 300).wet, 0, 'interface sounds stay dry');
});

test('the tail echoes in the open and stays short under a roof, whether the roof is over the shooter or over you', () => {
  const roof = { x: 1000, y: 1000, w: 200, h: 200 };
  const shot = (x: number, self = false): SoundCue => ({ id: 'shot:shotgun', x, y: 1100, self, gain: 1 });
  assert.equal(placeCue(shot(700), open(600, 1100, [roof]))!.space, 'open');
  assert.equal(placeCue(shot(1100), open(600, 1100, [roof]))!.space, 'roof', 'shooter indoors');
  assert.equal(placeCue(shot(700), open(1100, 1100, [roof]))!.space, 'roof', 'listener indoors');
  assert.equal(placeCue(shot(1100, true), open(1100, 1100, [roof]))!.space, 'roof', 'your own shot indoors');
  const ir = (space: 'open' | 'roof') => impulse(space, 48000, Math.random)[0].length;
  assert.ok(ir('roof') < ir('open') / 3, 'the roofed tail dies away in a fraction of the open one');
});

test('only overhead pieces broad both ways count as a roof: beams and pipes leave the sky open', () => {
  const roof = { x: 0, y: 0, w: 200, h: 200 }, beam = { x: 0, y: 0, w: 600, h: 50 }, pipes = { x: 0, y: 0, w: 400, h: 25 };
  assert.deepEqual(roofsOf([roof, beam, pipes]), [roof]);
});

test('the shipped sample manifest names one existing file for exactly the recordings the game asks for', () => {
  const dir = new URL('../public/assets/sfx/', import.meta.url);
  const files = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as Record<string, string>;
  assert.deepEqual(Object.keys(files).sort(), [...SAMPLE_IDS].sort());
  for (const [id, file] of Object.entries(files)) {
    assert.match(file, new RegExp(`^${id}\\.[0-9a-f]{8,}\\.mp3$`), 'content-hashed so it can be cached forever');
    assert.ok(existsSync(new URL(file, dir)), `${file} exists`);
  }
});
