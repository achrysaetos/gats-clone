import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARMORS, GUNS, WORLD } from '../src/shared/defs.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import { damagePlayer, explode } from '../src/shared/sim/combat.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { crateOf, emptyWorld, equip, press, run, spawnAt, TICK_MS } from './helpers.ts';

const PISTOL_DMG = GUNS.pistol.damage;

function fireAndCollect(w: World, shooter: ReturnType<typeof spawnAt>, ms = 500): GameEvent[] {
  const events: GameEvent[] = [];
  press(w, shooter, { angle: 0, fire: true, shots: shooter.input.shots + 1 });
  step(w, TICK_MS);
  events.push(...w.events);
  press(w, shooter, { angle: 0 });
  for (let t = 0; t < ms; t += TICK_MS) { step(w, TICK_MS); events.push(...w.events); }
  return events;
}

const hits = (events: GameEvent[]) => events.filter((e) => e.e === 'dmg' || e.e === 'impact');

test('one bullet hitting a player emits exactly one dmg event naming attacker, victim and amount', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500);
  const stood = { x: b.x, y: b.y };
  const got = hits(fireAndCollect(w, a));
  assert.equal(got.length, 1, JSON.stringify(got));
  const { hit, ...ev } = got[0] as Extract<GameEvent, { e: 'dmg' }>;
  assert.deepEqual(ev, { e: 'dmg', attacker: a.id, victim: b.id, amount: PISTOL_DMG, x: stood.x, y: stood.y, kind: 'player' }, 'placed where the victim stood when hit');
  assert.ok(hit, 'a bullet hit says where it struck');
  assert.ok(Math.abs(Math.hypot(hit.x - stood.x, hit.y - stood.y) - WORLD.playerRadius) < 0.5, `on the victim's edge, got ${hit.x},${hit.y}`);
  assert.ok(hit.x < stood.x, 'on the side facing the shooter');
  assert.ok(Math.abs(hit.dir) < GUNS.pistol.spread + 1e-9, 'flying the way it was fired');
});

test('dmg amount is what armor let through', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500, { loadout: { armor: 'medium' } });
  const [ev] = hits(fireAndCollect(w, a));
  assert.ok(ev?.e === 'dmg' && b.life.k === 'alive');
  const through = PISTOL_DMG * (1 - ARMORS.medium.blockFrac);
  assert.equal(b.life.hp, WORLD.baseHp - through);
  assert.equal(ev.amount, Math.round(through * 10) / 10);
});

test('dmg amount stops at what the target had left', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500);
  if (b.life.k === 'alive') Object.assign(b.life, { hp: 5, lastDamageAt: w.now });
  const [ev] = hits(fireAndCollect(w, a));
  assert.ok(ev?.e === 'dmg');
  assert.equal(ev.amount, 5);
  assert.equal(b.life.k, 'dead');
});

test('a crate hit emits one crate-kind dmg event with the crate id', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  w.crates.push(crateOf(999, 640, 478));
  const got = hits(fireAndCollect(w, a));
  assert.equal(got.length, 1);
  const { hit, ...ev } = got[0] as Extract<GameEvent, { e: 'dmg' }>;
  assert.deepEqual(ev, { e: 'dmg', attacker: a.id, victim: 999, amount: PISTOL_DMG, x: 665, y: 503, kind: 'crate' });
  assert.ok(hit && Math.abs(hit.x - 640) < 1e-6, 'struck on the crate face that faced the shooter');
});

test('a wall hit emits an impact at the wall face and no dmg', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  w.walls.push({ x: 650, y: 400, w: 40, h: 200, built: false, material: 'concrete', expiresAt: Infinity });
  const got = hits(fireAndCollect(w, a));
  assert.equal(got.length, 1, JSON.stringify(got));
  const [ev] = got;
  assert.ok(ev?.e === 'impact');
  assert.ok(Math.abs(ev.dir) < GUNS.pistol.spread + 1e-9, 'with the way the round flew');
  assert.ok(Math.abs(ev.x - 650) < 1 && Math.abs(ev.y - 500) < 10, `impact at ${ev.x},${ev.y}`);
});

test('a shot a teammate shrugs off emits no dmg event', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red' });
  spawnAt(w, 700, 500, { team: 'red' });
  assert.deepEqual(hits(fireAndCollect(w, a)).filter((e) => e.e === 'dmg'), []);
});

test('shot events carry the aim angle', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  press(w, a, { angle: 1.25, fire: true, shots: a.input.shots + 1 });
  step(w, TICK_MS);
  assert.deepEqual(w.events.filter((e) => e.e === 'shot').map((e) => e.e === 'shot' && e.angle), [1.25]);
});

test('kill events carry killer and victim ids', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { name: 'Alex' });
  const b = spawnAt(w, 700, 500, { name: 'Alex' });
  if (b.life.k === 'alive') b.life.hp = 1;
  const kill = fireAndCollect(w, a).find((e) => e.e === 'kill');
  assert.ok(kill?.e === 'kill');
  assert.deepEqual([kill.killerId, kill.victimId], [a.id, b.id]);
});

test('a player finished by their own blast gives the kill, bounty and team point to whoever hurt them most', () => {
  const w = emptyWorld('TDM');
  const most = spawnAt(w, 300, 300, { team: 'red', name: 'Most' });
  const less = spawnAt(w, 300, 900, { team: 'red', name: 'Less' });
  const victim = spawnAt(w, 900, 900, { team: 'blue', name: 'Victim' });
  equip(victim, 'boomSlug');
  const hurt = (by: Player, amount: number) => damagePlayer(w, victim, amount, { attacker: by, team: by.team, label: 'test', piercing: false, via: 'bullet', fromX: by.x, fromY: by.y });
  hurt(less, 10);
  hurt(most, 50);
  w.events = [];
  explode(w, victim.x, victim.y, 70, 200, { attacker: victim, team: victim.team, label: 'Boom Slug' });
  const kill = w.events.find((e) => e.e === 'kill');
  assert.equal(victim.life.k, 'dead');
  assert.ok(kill?.e === 'kill');
  assert.deepEqual({ killerId: kill.killerId, bounty: kill.bounty }, { killerId: most.id, bounty: true });
  assert.deepEqual({ kills: most.kills, score: most.score, red: w.teamScore.red }, { kills: 1, score: WORLD.killScore + WORLD.bountyScore, red: 1 });
  assert.deepEqual({ kills: less.kills, victimKills: victim.kills }, { kills: 0, victimKills: 0 });
});

test('a self-inflicted death credits only damage from the last few seconds, not a fight long healed from', () => {
  const blowUp = (hurtRecently: boolean) => {
    const w = emptyWorld();
    const old = spawnAt(w, 300, 300, { name: 'Old' });
    const recent = spawnAt(w, 300, 900, { name: 'Recent' });
    const victim = spawnAt(w, 900, 900);
    const hurt = (by: Player, amount: number) => damagePlayer(w, victim, amount, { attacker: by, team: null, label: 'test', piercing: true, via: 'bullet', fromX: by.x, fromY: by.y });
    hurt(old, 80);
    run(w, 30_000);
    if (hurtRecently) hurt(recent, 5);
    w.events = [];
    explode(w, victim.x, victim.y, 70, 300, { attacker: victim, team: null, label: 'Boom Slug' });
    const kill = w.events.find((e) => e.e === 'kill');
    assert.ok(kill?.e === 'kill');
    return { killer: kill.killerId, old, recent, victim };
  };
  const mixed = blowUp(true);
  assert.equal(mixed.killer, mixed.recent.id, 'the recent 5 damage outweighs 80 dealt half a minute ago');
  const healed = blowUp(false);
  assert.deepEqual([healed.killer, healed.old.kills], [healed.victim.id, 0], 'a fight half a minute ago credits nobody');
});

test('a player who blows themselves up untouched credits nobody', () => {
  const w = emptyWorld();
  const victim = spawnAt(w, 900, 900);
  const other = spawnAt(w, 300, 300);
  explode(w, victim.x, victim.y, 70, 300, { attacker: victim, team: null, label: 'Boom Slug' });
  const kill = w.events.find((e) => e.e === 'kill');
  assert.ok(kill?.e === 'kill');
  assert.equal(kill.killerId, victim.id);
  assert.deepEqual([victim.kills, other.kills, other.score], [0, 0, 0]);
});
