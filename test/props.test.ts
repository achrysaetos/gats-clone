import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_IDS, MAPS } from '../src/shared/maps.ts';
import { BARREL, MEDAL_IDS, MEDALS, PROP_FX, PROP_KINDS, PROPS, type MedalId, type PropKind } from '../src/shared/defs.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { damageBarrel } from '../src/shared/sim/barrels.ts';
import { damageProp, empMul } from '../src/shared/sim/props.ts';
import { propViewRect } from '../src/shared/sim/propview.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { coverRects, createWorld, propRect, propSolid, solidRects, type Prop, type World } from '../src/shared/sim/world.ts';
import { step } from '../src/shared/sim.ts';
import { fillSnapshot, makeSnapshotEncoder } from '../src/shared/wire.ts';
import { medalArt } from '../src/client/medals.ts';
import { SOUNDS, soundsFor } from '../src/client/sfx.ts';
import { emptyWorld, run, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

function propAt(w: World, kind: PropKind, x: number, y: number): Prop {
  const q: Prop = { id: w.nextId++, kind, x, y, hp: PROPS[kind].hp, phase: 'stand', at: 0, respawnAt: null, vx: 0, vy: 0, by: null, home: { x, y } };
  w.props.push(q);
  return q;
}
const spark = (p: ReturnType<typeof spawnAt>) => ({ attacker: p, team: p.team });
const EAST = { x: 1, y: 0 };
const medalsOf = (w: World, id: number, events = w.events): MedalId[] => events.flatMap((e) => (e.e === 'medal' && e.id === id ? [e.medal] : []));
const hpOf = (p: ReturnType<typeof spawnAt>) => (p.life.k === 'alive' ? p.life.hp : 0);
/** Steps `ms`, collecting every tick's events. */
function runEvents(w: World, ms: number) {
  const events = [];
  for (let t = 0; t < ms; t += TICK_MS) { step(w, TICK_MS); events.push(...w.events); }
  return events;
}
const wallAt = (x: number, y: number, h = 400) => ({ x, y, w: 50, h, built: false as const, material: 'concrete' as const, expiresAt: Infinity });

// ---- the family

test('every prop kind has a def, a map symbol, a medal where it earns one, and a sound for what it does', () => {
  for (const kind of PROP_KINDS) {
    assert.ok(PROPS[kind].hp > 0 && PROPS[kind].size > 0 && PROPS[kind].respawnMs > 0, kind);
  }
  for (const id of ['liftoff', 'shockTherapy', 'arsonist', 'picasso'] as const) {
    assert.ok(MEDAL_IDS.includes(id) && MEDALS[id].score > 0, id);
    assert.ok(medalArt(id).glyph.length > 10, `${id} has art`);
  }
  for (const id of ['prop:whoosh', 'prop:hiss', 'prop:zap', 'prop:fire', 'prop:glass', 'prop:pickup', 'prop:splat'] as const) assert.ok(SOUNDS[id].length >= 3, id);
});

test('props stand on every versus map in every kind, as half-turn twins, and never in a zombies run', () => {
  for (const id of MAP_IDS) {
    const def = MAPS[id];
    if (def.siege) { assert.equal(def.props.length, 0); continue; }
    if (def.range) continue;
    for (const kind of PROP_KINDS) assert.ok(def.props.some((q) => q.kind === kind), `${def.name} has a ${kind}`);
    for (const q of def.props) assert.ok(def.props.some((o) => o.kind === q.kind && o.x === def.size - q.x && o.y === def.size - q.y), `${def.name} ${q.kind} twin`);
  }
  assert.ok(createWorld('FFA', 1, 'plaza').props.length > 0);
  assert.ok(createWorld('TDM', 1, 'plaza').props.length > 0);
  assert.ok(createWorld('DOM', 1, 'plaza').props.length > 0);
  assert.equal(createWorld('ZOM', 1, 'outpost').props.length, 0);
});

test('a standing prop blocks bodies and rounds and a spent pack or flying tank does not', () => {
  const w = emptyWorld();
  const crate = propAt(w, 'medic', 1000, 1000);
  assert.ok(coverRects(w).some((r) => r.x === propRect(crate).x && r.y === propRect(crate).y), 'cover');
  assert.ok(solidRects(w).some((r) => r.x === propRect(crate).x && r.y === propRect(crate).y), 'solid to bodies');
  crate.phase = 'spent';
  assert.ok(!propSolid(crate), 'a pack lies on the floor');
  const lamp = propAt(w, 'lamp', 1200, 1000);
  lamp.phase = 'spent';
  assert.ok(propSolid(lamp), 'a dark lamp keeps its post');
  const tank = propAt(w, 'propane', 1400, 1000);
  tank.phase = 'active';
  assert.ok(!propSolid(tank));
  const gone = propAt(w, 'oil', 1600, 1000);
  gone.respawnAt = 10;
  assert.ok(!propSolid(gone));
  const shooter = spawnAt(w, 500, 2000);
  const target = propAt(w, 'oil', 900, 2000);
  shootOnce(w, shooter, 0, 300);
  assert.ok(target.hp < PROPS.oil.hp, 'a round hit it, and stopped there');
});

test('a prop is hurt by shots and its view carries tenths of health, 0 while active and 11 once spent', () => {
  const w = emptyWorld();
  const me = spawnAt(w, 500, 1000);
  const q = propAt(w, 'generator', 1000, 1000);
  const view = () => snapshotFor(w, me.id).props!.find((v) => v[0] === q.id)!;
  assert.deepEqual(view().slice(1), [PROP_KINDS.indexOf('generator'), 1000, 1000, 10]);
  damageProp(w, q, PROPS.generator.hp / 2, spark(me), EAST);
  assert.equal(view()[4], 5);
  damageProp(w, q, 1000, spark(me), EAST);
  assert.equal(view()[4], 0, 'arcing');
  const lamp = propAt(w, 'lamp', 1500, 1000);
  damageProp(w, lamp, 1000, spark(me), EAST);
  assert.equal(snapshotFor(w, me.id).props!.find((v) => v[0] === lamp.id)![4], 11);
  assert.equal(propViewRect([lamp.id, 4, 1500, 1000, 11])!.w, PROPS.lamp.size);
  assert.equal(propViewRect([1, 5, 1500, 1000, 11]), null, 'a pack on the floor blocks nobody');
});

// ---- 1. propane

function propaneRun(wallX: number | null, victimAt: number | null) {
  const w = emptyWorld();
  w.firstBlood = true;
  const shooter = spawnAt(w, 400, 1000, { name: 'a', kind: 'bot' });
  const victim = victimAt === null ? null : spawnAt(w, victimAt, 1000, { name: 'v', kind: 'bot', loadout: { color: 'blue' } });
  if (victim && victim.life.k === 'alive') victim.life.hp = 30;
  if (wallX !== null) w.walls = [wallAt(wallX, 800)];
  const tank = propAt(w, 'propane', 900, 1000);
  damageProp(w, tank, 1000, spark(shooter), EAST);
  const events = [...w.events, ...runEvents(w, 3000)];
  return { w, tank, shooter, victim, events };
}

test('a shot propane tank rockets off the way it was hit, spinning up, and bursts against a wall', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 400, 1000);
  const tank = propAt(w, 'propane', 900, 1000);
  damageProp(w, tank, 1000, spark(shooter), EAST);
  assert.equal(tank.phase, 'active');
  assert.ok(tank.vx > 0 && Math.abs(tank.vy) < 1e-9, 'along the round');
  assert.ok(!propSolid(tank));
  assert.equal(snapshotFor(w, shooter.id).props!.find((v) => v[0] === tank.id)![4], 0);
  step(w, TICK_MS);
  assert.ok(tank.x > 900, 'it moves');
  const south = propAt(w, 'propane', 900, 1500);
  damageProp(w, south, 1000, spark(shooter), { x: 0, y: -1 });
  assert.ok(south.vy < 0 && Math.abs(south.vx) < 1e-9, 'a hit from the south sends it north');

  const { tank: t2, events } = propaneRun(1400, null);
  const boom = events.find((e) => e.e === 'boom')!;
  assert.ok(boom.e === 'boom' && Math.abs(boom.x - (1400 - PROP_FX.propane.body)) < 3, `it burst on the wall, at ${boom.e === 'boom' ? boom.x : '?'}`);
  assert.ok(t2.respawnAt !== null);
  assert.ok(events.some((e) => e.e === 'prop' && e.k === 'launch'));
});

test('a propane tank bursts on the first player in its way, and a kill is the shooter\'s Liftoff', () => {
  const { victim, shooter, events, w } = propaneRun(null, 1300);
  assert.equal(victim!.life.k, 'dead');
  const kill = events.find((e) => e.e === 'kill')!;
  assert.ok(kill.e === 'kill' && kill.killerId === shooter.id && kill.weapon === 'Propane');
  assert.ok(medalsOf(w, shooter.id, events).includes('liftoff'));
  const boom = events.find((e) => e.e === 'boom')!;
  assert.ok(boom.e === 'boom' && boom.x < 1300, 'it burst before the body, on contact');
});

test('a tank that finds nothing skids to a stop and bursts when its time runs out', () => {
  const { tank, events } = propaneRun(null, null);
  assert.ok(tank.respawnAt !== null);
  const boom = events.find((e) => e.e === 'boom')!;
  assert.ok(boom.e === 'boom' && boom.x > 1200 && boom.x < 900 + PROP_FX.propane.speed / PROP_FX.propane.drag, 'it skidded a good way and no further than its speed allows');
});

test('propane flight and impact are deterministic', () => {
  const a = propaneRun(1400, 1250), b = propaneRun(1400, 1250);
  assert.deepEqual(a.events, b.events);
  assert.equal(a.tank.x, b.tank.x);
  assert.equal(a.victim!.life.k === 'alive' ? a.victim!.life.hp : -1, b.victim!.life.k === 'alive' ? b.victim!.life.hp : -1);
});

test('a bullet fired along a row sends the tank on down the row', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 400, 1000);
  const tank = propAt(w, 'propane', 800, 1000);
  tank.hp = 1;
  shootOnce(w, shooter, 0, 700);
  assert.equal(tank.phase, 'active');
  assert.ok(tank.vx > 0 && tank.x > 800, 'carried east');
});

// ---- 2. gas canister

test('a shot gas canister bursts into a lingering cloud that poisons what stands in it, spares its shooter and ends', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const shooter = spawnAt(w, 500, 1000, { name: 's' });
  const victim = spawnAt(w, 1050, 1000, { name: 'v', loadout: { color: 'blue' } });
  const far = spawnAt(w, 1050, 1500, { name: 'f', loadout: { color: 'green' } });
  const can = propAt(w, 'gas', 1000, 1000);
  damageProp(w, can, 1000, spark(shooter), EAST);
  assert.ok(can.respawnAt !== null, 'spent at once');
  const cloud = w.thrown.find((t) => t.kind === 'gasCloud');
  assert.ok(cloud && cloud.owner === shooter.id && cloud.expiresAt === w.now + PROP_FX.gas.cloudMs);
  run(w, 2000);
  assert.ok(hpOf(victim) < 80, `the cloud ate ${100 - hpOf(victim)}`);
  assert.equal(hpOf(far), 100, 'out of reach');
  const view = snapshotFor(w, far.id).thrown.find((t) => t.kind === 'gasCloud');
  assert.ok(view && view.r > 100, 'the area rides the wire as a gas cloud');
  shooter.x = 1000; shooter.y = 1000;
  const before = hpOf(shooter);
  run(w, 500);
  assert.equal(hpOf(shooter), before, 'the spiller is spared, like the gas grenade');
  run(w, PROP_FX.gas.cloudMs);
  assert.ok(!w.thrown.some((t) => t.kind === 'gasCloud'), 'it fades');
});

test('a gas kill is credited to whoever shot the canister', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 500, 1000, { kind: 'bot' });
  const victim = spawnAt(w, 1050, 1000, { kind: 'bot', loadout: { color: 'blue' } });
  if (victim.life.k === 'alive') victim.life.hp = 10;
  damageProp(w, propAt(w, 'gas', 1000, 1000), 1000, spark(shooter), EAST);
  const events = runEvents(w, 2000);
  const kill = events.find((e) => e.e === 'kill');
  assert.ok(kill && kill.e === 'kill' && kill.killerId === shooter.id && kill.weapon === 'Gas');
});

// ---- 3. generator

test('a shorted generator arcs, then pulses an EMP that slows everyone near and locks their abilities', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 500, 1000, { name: 's' });
  const near = spawnAt(w, 1100, 1000, { name: 'n', loadout: { color: 'blue' } });
  const far = spawnAt(w, 1100, 1600, { name: 'f', loadout: { color: 'green' } });
  const gen = propAt(w, 'generator', 1000, 1000);
  damageProp(w, gen, 1000, spark(shooter), EAST);
  assert.equal(gen.phase, 'active');
  assert.ok(propSolid(gen), 'it still blocks while it arcs');
  run(w, PROP_FX.generator.arcMs - 100);
  assert.equal(empMul(w, near), 1, 'the pulse has not come yet');
  const base = snapshotFor(w, near.id).self.speed;
  const events = runEvents(w, 200);
  assert.ok(events.some((e) => e.e === 'prop' && e.k === 'emp' && e.r === PROP_FX.generator.radius));
  assert.equal(empMul(w, near), PROP_FX.generator.slowMul);
  assert.equal(empMul(w, far), 1, 'out of reach');
  assert.equal(snapshotFor(w, near.id).self.speed, base * PROP_FX.generator.slowMul, 'the client predicts the slow');
  assert.equal(snapshotFor(w, near.id).players.find((p) => p.id === near.id)!.emp, true, 'shocked players are marked');
  assert.equal(snapshotFor(w, far.id).players.find((p) => p.id === far.id)!.emp, undefined);
  assert.ok(near.abilityReadyAt >= w.now - 200 + PROP_FX.generator.lockMs - TICK_MS, 'the ability is locked for about two seconds');
  assert.ok(gen.respawnAt !== null);
  // The slow really slows a walk, and wears off.
  const x0 = near.x;
  near.input = { ...near.input, right: true };
  run(w, 500);
  const slowed = near.x - x0;
  run(w, PROP_FX.generator.slowMs);
  const x1 = near.x;
  run(w, 500);
  const free = near.x - x1;
  assert.ok(slowed < free * 0.75, `slowed ${slowed.toFixed(0)} px against ${free.toFixed(0)} px free`);
  assert.equal(empMul(w, near), 1, 'worn off');
});

test('killing a player the generator you shorted has shocked pays Shock Therapy, and no one else does', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const shooter = spawnAt(w, 500, 1000, { name: 's', kind: 'bot' });
  const other = spawnAt(w, 500, 1400, { name: 'o', kind: 'bot', loadout: { color: 'green' } });
  const victim = spawnAt(w, 1100, 1000, { name: 'v', kind: 'bot', loadout: { color: 'blue' } });
  damageProp(w, propAt(w, 'generator', 1000, 1000), 1000, spark(shooter), EAST);
  run(w, PROP_FX.generator.arcMs + 100);
  assert.ok(w.emps.has(victim.id));
  const hit = (by: typeof shooter) => damagePlayer(w, victim, 500, { attacker: by, team: by.team, label: 'Pistol', piercing: true, via: 'bullet', fromX: by.x, fromY: by.y, gun: 'pistol' });
  const mine = [...w.events];
  hit(shooter);
  assert.ok(medalsOf(w, shooter.id, [...mine, ...w.events]).includes('shockTherapy'));

  const w2 = emptyWorld();
  w2.firstBlood = true;
  const s2 = spawnAt(w2, 500, 1000, { kind: 'bot' });
  const o2 = spawnAt(w2, 500, 1400, { kind: 'bot', loadout: { color: 'green' } });
  const v2 = spawnAt(w2, 1100, 1000, { kind: 'bot', loadout: { color: 'blue' } });
  damageProp(w2, propAt(w2, 'generator', 1000, 1000), 1000, spark(s2), EAST);
  run(w2, PROP_FX.generator.arcMs + 100);
  damagePlayer(w2, v2, 500, { attacker: o2, team: o2.team, label: 'Pistol', piercing: true, via: 'bullet', fromX: o2.x, fromY: o2.y, gun: 'pistol' });
  assert.ok(!medalsOf(w2, o2.id).includes('shockTherapy'), 'a different shooter');
  void other;
});

// ---- 4. oil drum

test('a shot oil drum spills a burning slick that burns what walks through it for a few seconds, and a fire kill is an Arsonist', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const shooter = spawnAt(w, 500, 1000, { name: 's', kind: 'bot' });
  const walker = spawnAt(w, 1040, 1000, { name: 'w', kind: 'bot', loadout: { color: 'blue' } });
  const edge = spawnAt(w, 1000 + PROP_FX.oil.radius + 80, 1000, { name: 'e', kind: 'bot', loadout: { color: 'green' } });
  if (walker.life.k === 'alive') walker.life.hp = 12;
  damageProp(w, propAt(w, 'oil', 1000, 1000), 1000, spark(shooter), EAST);
  const slick = w.thrown.find((t) => t.kind === 'fireSlick');
  assert.ok(slick && slick.expiresAt === w.now + PROP_FX.oil.burnMs);
  const view = snapshotFor(w, shooter.id).thrown.find((t) => t.kind === 'fireSlick');
  assert.ok(view && view.r === PROP_FX.oil.radius);
  const events = runEvents(w, 2000);
  assert.equal(walker.life.k, 'dead', 'burned to death');
  const kill = events.find((e) => e.e === 'kill');
  assert.ok(kill && kill.e === 'kill' && kill.killerId === shooter.id && kill.weapon === 'Fire');
  assert.ok(medalsOf(w, shooter.id, events).includes('arsonist'));
  assert.equal(hpOf(edge), 100, 'outside the slick');
  run(w, PROP_FX.oil.burnMs);
  assert.ok(!w.thrown.some((t) => t.kind === 'fireSlick'), 'burned out');
});

test('a burning slick burns anyone but its spiller and does not outlast its time', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 1000, 1000, { name: 's' });
  const victim = spawnAt(w, 1050, 1000, { name: 'v', loadout: { color: 'blue' } });
  damageProp(w, propAt(w, 'oil', 1020, 1000), 1000, spark(shooter), EAST);
  run(w, 1000);
  assert.equal(hpOf(shooter), 100);
  const after1s = hpOf(victim);
  assert.ok(after1s < 100);
  run(w, PROP_FX.oil.burnMs);
  const done = hpOf(victim);
  run(w, 1000);
  assert.equal(hpOf(victim), Math.max(done, hpOf(victim)), 'no more burning');
  assert.ok(hpOf(victim) >= done);
});

// ---- 5. streetlamp

test('shooting a streetlamp breaks its bulb: it stays a post, sparks, and relights after a while', () => {
  const w = emptyWorld();
  const me = spawnAt(w, 500, 1000);
  const lamp = propAt(w, 'lamp', 1000, 1000);
  const events = [];
  damageProp(w, lamp, 5, spark(me), EAST);
  assert.equal(lamp.phase, 'stand', 'a scratch');
  damageProp(w, lamp, 100, spark(me), EAST);
  events.push(...w.events);
  assert.equal(lamp.phase, 'spent');
  assert.ok(events.some((e) => e.e === 'prop' && e.kind === 'lamp' && e.k === 'pop'));
  assert.ok(propSolid(lamp), 'the post still blocks');
  assert.equal(snapshotFor(w, me.id).props!.find((v) => v[0] === lamp.id)![4], 11, 'everyone sees the same broken lamp');
  run(w, PROPS.lamp.respawnMs - 500);
  assert.equal(lamp.phase, 'spent');
  const later = runEvents(w, 1000);
  assert.equal(lamp.phase, 'stand');
  assert.ok(later.some((e) => e.e === 'prop' && e.k === 'relight'));
  assert.equal(lamp.hp, PROPS.lamp.hp);
});

// ---- 6. supply cabinets

test('a medical cabinet shatters into a health pack that heals whoever needs it, and not whoever does not', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 500, 1000, { name: 's' });
  const hurt = spawnAt(w, 1300, 1000, { name: 'h', loadout: { color: 'blue' } });
  const cab = propAt(w, 'medic', 1000, 1000);
  damageProp(w, cab, 1000, spark(shooter), EAST);
  assert.equal(cab.phase, 'spent');
  assert.ok(!propSolid(cab), 'the pack is walked over');
  shooter.x = 1000; shooter.y = 1000;
  run(w, 500);
  assert.equal(cab.respawnAt, null, 'a player at full health leaves it');
  assert.equal(cab.phase, 'spent');
  if (hurt.life.k === 'alive') hurt.life.hp = 30;
  hurt.x = 1010; hurt.y = 1000;
  shooter.x = 3000; shooter.y = 3000;
  const events = runEvents(w, 200);
  assert.ok(hpOf(hurt) >= 30 + PROP_FX.medic.heal && hpOf(hurt) < 30 + PROP_FX.medic.heal + 5, 'healed by the pack (and a tick of regen)');
  assert.ok(events.some((e) => e.e === 'prop' && e.kind === 'medic' && e.k === 'pick'));
  assert.ok(cab.respawnAt !== null, 'taken');
});

test('an ammo crate opens into a pack that refills the magazine and the ability cooldown', () => {
  const w = emptyWorld();
  const me = spawnAt(w, 1000, 1000);
  const crate = propAt(w, 'ammo', 1000, 1100);
  damageProp(w, crate, 1000, spark(me), { x: 0, y: 1 });
  assert.equal(crate.phase, 'spent');
  if (me.life.k === 'alive') me.life.ammo = 0;
  me.abilityReadyAt = w.now + 9000;
  me.x = 1000; me.y = 1100;
  run(w, 100);
  assert.ok(me.life.k === 'alive' && me.life.ammo > 0 && me.life.reloadUntil === null, 'a full magazine');
  assert.ok(me.abilityReadyAt <= w.now, 'the ability is ready');
  assert.ok(crate.respawnAt !== null);
});

test('an untaken pack goes after its time, and the cabinet stands again after its respawn, but never on a player', () => {
  const w = emptyWorld();
  const me = spawnAt(w, 500, 1000);
  const cab = propAt(w, 'medic', 1000, 1000);
  damageProp(w, cab, 1000, spark(me), EAST);
  run(w, PROP_FX.medic.packMs + 500);
  assert.ok(cab.respawnAt !== null, 'expired');
  assert.ok(!snapshotFor(w, me.id).props!.some((v) => v[0] === cab.id), 'gone from the view');
  const at = cab.respawnAt!;
  me.x = 1000; me.y = 1000;
  run(w, at - w.now + 500);
  assert.notEqual(cab.respawnAt, null, 'it waits for the player standing there');
  me.x = 2000;
  run(w, 200);
  assert.equal(cab.respawnAt, null);
  assert.equal(cab.phase, 'stand');
  assert.equal(cab.hp, PROPS.medic.hp);
});

// ---- 7. paint can

test('a paint can splatters the shooter\'s colour, and a splatter over an enemy is Picasso', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const shooter = spawnAt(w, 500, 1000, { loadout: { color: 'blue' } });
  const enemy = spawnAt(w, 1040, 1000, { loadout: { color: 'red' } });
  const can = propAt(w, 'paint', 1000, 1000);
  const before = w.events.length;
  damageProp(w, can, 1000, spark(shooter), EAST);
  const ev = w.events.slice(before).find((e) => e.e === 'prop')!;
  assert.ok(ev.e === 'prop' && ev.k === 'pop' && ev.kind === 'paint' && ev.c === 'blue');
  assert.deepEqual(medalsOf(w, shooter.id), ['picasso']);
  assert.equal(hpOf(enemy), 100, 'paint hurts nobody');
  const w2 = emptyWorld();
  const s2 = spawnAt(w2, 500, 1000);
  spawnAt(w2, 2000, 1000, { loadout: { color: 'blue' } });
  damageProp(w2, propAt(w2, 'paint', 1000, 1000), 1000, spark(s2), EAST);
  assert.deepEqual(medalsOf(w2, s2.id), [], 'nobody near');
});

// ---- chains and credit

test('a barrel\'s blast sets props off for whoever lit the barrel', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 400, 1000, { kind: 'bot' });
  const barrel = { id: w.nextId++, x: 1000, y: 1000, hp: BARREL.hp, fuseAt: null, respawnAt: null, by: null };
  w.barrels.push(barrel);
  const can = propAt(w, 'gas', 1100, 1000);
  const drum = propAt(w, 'oil', 900, 1000);
  damageBarrel(w, barrel, 100, spark(shooter));
  run(w, BARREL.fuseMs + 200);
  assert.ok(can.respawnAt !== null && drum.respawnAt !== null, 'both went off');
  assert.ok(w.thrown.some((t) => t.kind === 'gasCloud' && t.owner === shooter.id));
  assert.ok(w.thrown.some((t) => t.kind === 'fireSlick' && t.owner === shooter.id));
});

test('a blast sends a propane tank flying away from it', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 400, 1000);
  const barrel = { id: w.nextId++, x: 1000, y: 1000, hp: BARREL.hp, fuseAt: null, respawnAt: null, by: null };
  w.barrels.push(barrel);
  const tank = propAt(w, 'propane', 1100, 1000);
  damageBarrel(w, barrel, 100, spark(shooter));
  const launch = runEvents(w, BARREL.fuseMs + 100).find((e) => e.e === 'prop' && e.k === 'launch');
  assert.ok(launch?.e === 'prop' && Math.abs(launch.a!) < 0.01, 'launched east, away from the burst');
  assert.ok(tank.phase === 'active' && tank.vx > 0 && tank.x > 1100, 'and flying east');
});

test('props respawn after their time', () => {
  for (const kind of ['propane', 'gas', 'generator', 'oil', 'paint'] as const) {
    const w = emptyWorld();
    const me = spawnAt(w, 400, 3000);
    const q = propAt(w, kind, 3000, 400);
    damageProp(w, q, 1000, spark(me), EAST);
    run(w, 4000);
    assert.ok(q.respawnAt !== null, `${kind} is gone`);
    run(w, PROPS[kind].respawnMs);
    assert.equal(q.respawnAt, null, `${kind} stands again`);
    assert.equal(q.phase, 'stand');
    assert.equal(q.hp, PROPS[kind].hp);
    assert.equal(q.vx, 0);
    assert.deepEqual({ x: q.x, y: q.y }, { x: 3000, y: 400 }, `${kind} stands again on its own spot`);
  }
});

test('a propane tank on a map stands again on its own spot, not where it burst', () => {
  const w = createWorld('FFA', 5, 'plaza');
  w.players.clear();
  const tank = w.props.find((q) => q.kind === 'propane')!;
  const home = MAPS.plaza.props.find((q) => q.kind === 'propane' && q.x === tank.x && q.y === tank.y)!;
  assert.ok(home, 'the tank starts on its map spot');
  const shooter = spawnAt(w, 100, 100);
  damageProp(w, tank, 1000, spark(shooter), { x: 0, y: 1 });
  const boom = runEvents(w, 3000).find((e) => e.e === 'boom');
  assert.ok(tank.respawnAt !== null && boom?.e === 'boom', 'it flew and burst');
  assert.ok(Math.hypot(boom.x - home.x, boom.y - home.y) > 100, 'it burst well away from home');
  run(w, PROPS.propane.respawnMs + 500);
  assert.equal(tank.respawnAt, null, 'it stands again');
  assert.deepEqual({ x: tank.x, y: tank.y }, { x: home.x, y: home.y });
});

test('a prop going away or coming back bumps the walls version so bots re-plan', () => {
  const w = emptyWorld();
  const me = spawnAt(w, 400, 3000);
  const q = propAt(w, 'gas', 3000, 400);
  const v0 = w.wallsVersion;
  damageProp(w, q, 1000, spark(me), EAST);
  assert.ok(w.wallsVersion > v0);
  const v1 = w.wallsVersion;
  run(w, PROPS.gas.respawnMs + 100);
  assert.ok(w.wallsVersion > v1);
});

// ---- the wire

test('props ride the wire as a sticky field, unchanged until one is hurt', () => {
  const w = createWorld('FFA', 5, 'plaza');
  const me = spawnAt(w, 3000, 3000);
  const encode = makeSnapshotEncoder();
  const first = JSON.parse(encode(snapshotFor(w, me.id)));
  assert.ok(Array.isArray(first.props) && first.props.length === MAPS.plaza.props.length);
  assert.ok(first.props.every((v: number[]) => v.length === 5));
  const second = JSON.parse(encode(snapshotFor(w, me.id)));
  assert.equal(second.props, undefined, 'unchanged, so omitted');
  const filled = fillSnapshot(second, fillSnapshot(first, null));
  assert.deepEqual(filled!.props, first.props);
  damageProp(w, w.props[0]!, 3, spark(me), EAST);
  const third = JSON.parse(encode(snapshotFor(w, me.id)));
  assert.ok(third.props, 'a hurt prop changes the field');
  assert.ok(JSON.stringify(first.props).length < 1400, 'a map full of props costs little');
});

test('a prop event is voiced: a launch whooshes, glass shatters, a pack chimes', () => {
  const w = emptyWorld();
  const me = spawnAt(w, 500, 1000);
  const before = snapshotFor(w, me.id);
  damageProp(w, propAt(w, 'propane', 900, 1000), 1000, spark(me), EAST);
  const launch = snapshotFor(w, me.id);
  assert.ok(soundsFor(before, launch).some((c) => c.id === 'prop:whoosh'));
  w.events = [];
  damageProp(w, propAt(w, 'lamp', 1200, 1000), 1000, spark(me), EAST);
  assert.ok(soundsFor(before, snapshotFor(w, me.id)).some((c) => c.id === 'prop:glass'));
  w.events = [];
  damageProp(w, propAt(w, 'gas', 1400, 1000), 1000, spark(me), EAST);
  assert.ok(soundsFor(before, snapshotFor(w, me.id)).some((c) => c.id === 'prop:hiss'));
});

test('a full match with props in it stays deterministic', () => {
  const play = () => {
    const w = createWorld('FFA', 3, 'plaza');
    const a = spawnAt(w, 3000, 3000), b = spawnAt(w, 3300, 3000);
    for (const q of w.props.slice(0, 6)) damageProp(w, q, 1000, spark(a), { x: q.x - a.x, y: q.y - a.y });
    run(w, 10_000);
    return JSON.stringify([w.props, w.thrown, w.rng, a.life.k === 'alive' ? a.life.hp : -1, b.life.k === 'alive' ? b.life.hp : -1]);
  };
  assert.equal(play(), play());
});
