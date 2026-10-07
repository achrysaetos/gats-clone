/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chatter, CHATTER, holdFor, personalityFor, setChatterOn, tailOffset, wrapLines } from '../src/client/chatter.ts';
import { MAX_LINE, PERSONALITIES, PERSONALITY_IDS, TAGS } from '../src/client/chatterlines.ts';
import type { GameEvent, PlayerView, SelfView, Snapshot } from '../src/shared/protocol.ts';

const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: `p${id}`, x: 0, y: 0, angle: 0, hp: 100, maxHp: 100, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 0, armorTier: 'none', hunted: false, kind: 'human', ...over,
});
const snap = (o: { players?: PlayerView[]; self?: Partial<SelfView>; events?: GameEvent[]; tick?: number; extra?: Partial<Snapshot>; roundEndsAt?: number | null } = {}): Snapshot => ({
  t: 'snap', tick: o.tick ?? 1, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, suppression: 0, streak: 0, nemesis: null, ...o.self },
  players: o.players ?? [player(1)], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Boneyard', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: o.roundEndsAt ?? null },
  events: o.events ?? [], ...o.extra,
});
setChatterOn(true);

test('a personality is the same for the same (id, life) and spreads over all of them', () => {
  assert.equal(personalityFor(7, 3), personalityFor(7, 3));
  const seen = new Set<string>();
  for (let id = 1; id <= 30; id++) for (let life = 0; life < 10; life++) seen.add(personalityFor(id, life));
  assert.equal(seen.size, PERSONALITY_IDS.length);
  // A new life usually brings a new voice.
  let changed = 0;
  for (let id = 1; id <= 40; id++) if (personalityFor(id, 0) !== personalityFor(id, 1)) changed++;
  assert.ok(changed > 25);
});

test('every personality has 30+ idle lines, 2+ per tag, short and unique', () => {
  assert.equal(PERSONALITIES.length, PERSONALITY_IDS.length);
  assert.ok(PERSONALITIES.filter((p) => !p.funny).length >= 3);
  for (const p of PERSONALITIES) {
    assert.ok(p.idle.length >= 30, `${p.id} idle ${p.idle.length}`);
    const all = [...p.idle];
    for (const tag of TAGS) { assert.ok(p.tags[tag].length >= 2, `${p.id}/${tag}`); all.push(...p.tags[tag]); }
    for (const l of all) { assert.ok(l.length <= MAX_LINE, `${p.id}: "${l}" is ${l.length}`); assert.ok(!l.includes('|')); }
    assert.equal(new Set(all).size, all.length, `${p.id} repeats a line`);
  }
});

test('lines wrap to at most two lines', () => {
  const measure = (s: string) => s.length * 6;
  assert.deepEqual(wrapLines(measure, 'short one', 190), ['short one']);
  const two = wrapLines(measure, 'Wonder what I was like in my past life.', 190);
  assert.equal(two.length, 2);
  assert.ok(two.every((l) => measure(l) <= 190));
  assert.ok(holdFor('x') >= 2800 && holdFor('x'.repeat(48)) <= 4000);
  assert.ok(tailOffset(2) < tailOffset(0));
});

/** A chatter with you (id 1) spawned at t=0 and ready to speak. */
function ready(extra: PlayerView[] = [], seed = 5) {
  const c = new Chatter(seed);
  const s = snap({ players: [player(1), ...extra] });
  c.onSnap(s, 1, 0);
  for (const sol of c.soldiers.values()) sol.nextAt = 0;
  return { c, s };
}

test('a quiet soldier speaks, once, then waits out a 10-22 s cooldown', () => {
  const { c, s } = ready();
  c.tick(s, 1, 1000);
  assert.equal(c.bubbles.length, 1);
  assert.equal(c.bubbles[0]!.pid, 1);
  assert.ok(c.bubbles[0]!.own);
  const wait = c.soldiers.get(1)!.nextAt - 1000;
  assert.ok(wait >= CHATTER.ownCooldownMs[0] && wait <= CHATTER.ownCooldownMs[1], String(wait));
  c.tick(s, 1, 6000);
  assert.equal(c.bubbles.length, 0, 'the first bubble has faded by 6 s and nobody else is due');
  c.tick(s, 1, 6000 + CHATTER.ownCooldownMs[1]);
  assert.equal(c.bubbles.length, 1);
});

test('bots wait 14-30 s between lines', () => {
  const bot = ready([player(2, { x: 800 })]);
  bot.c.soldiers.get(1)!.nextAt = Infinity;
  bot.c.tick(bot.s, 1, 1000);
  assert.deepEqual(bot.c.bubbles.map((b) => b.pid), [2]);
  assert.ok(!bot.c.bubbles[0]!.own);
  const w = bot.c.soldiers.get(2)!.nextAt - 1000;
  assert.ok(w >= CHATTER.cooldownMs[0] && w <= CHATTER.cooldownMs[1], String(w));
});

test('no chatter after firing, until 4 s of quiet', () => {
  const { c } = ready();
  const firing = snap({ events: [{ e: 'shot', x: 0, y: 0, angle: 0, silenced: false, owner: 1, gun: 'pistol' }] });
  c.onSnap(firing, 1, 1000);
  c.tick(firing, 1, 2000);
  assert.equal(c.bubbles.length, 0);
  c.tick(snap(), 1, 4999);
  assert.equal(c.bubbles.length, 0);
  c.tick(snap(), 1, 5100);
  assert.equal(c.bubbles.length, 1);
});

test('your ammo dropping counts as firing', () => {
  const { c } = ready();
  c.onSnap(snap({ self: { ammo: 11 } }), 1, 1000);
  c.tick(snap(), 1, 2000);
  assert.equal(c.bubbles.length, 0);
});

test('an enemy within 650 px keeps a soldier quiet; a friend, or one farther off, does not', () => {
  const near = ready([player(2, { x: 600 })]);
  near.c.tick(near.s, 1, 1000);
  assert.equal(near.c.bubbles.filter((b) => b.pid === 1).length, 0, 'FFA: anyone is an enemy');
  const far = ready([player(2, { x: 700 })]);
  far.c.tick(far.s, 1, 1000);
  assert.equal(far.c.bubbles.filter((b) => b.pid === 1).length, 1);
  const mates = new Chatter(3);
  const s = snap({ players: [player(1, { team: 'red' }), player(2, { x: 100, team: 'red' })] });
  mates.onSnap(s, 1, 0);
  assert.ok(mates.quiet(s.players[0]!, s, 1000), 'a teammate is no threat');
  const foe = snap({ players: [player(1, { team: 'red' }), player(2, { x: 100, team: 'blue' })] });
  assert.ok(!mates.quiet(foe.players[0]!, foe, 1000));
  const horde = snap({ extra: { zombies: [[9, 0, 400, 0, 10]] } });
  assert.ok(!mates.quiet(horde.players[0]!, horde, 1000), 'zombies count');
  assert.ok(!mates.quiet(player(1, { alive: false }), horde, 1000));
});

test('never more than 2 bubbles, one new bubble per tick, yours first', () => {
  const others = [2, 3, 4, 5].map((id) => player(id, { x: Math.round(800 * Math.cos(id * 1.57)), y: Math.round(800 * Math.sin(id * 1.57)) }));
  const c = new Chatter(11);
  const s = snap({ players: [player(1), ...others] });
  c.onSnap(s, 1, 0);
  for (const sol of c.soldiers.values()) sol.nextAt = 0;
  c.tick(s, 1, 100);
  assert.deepEqual(c.bubbles.map((b) => b.pid), [1]);
  c.tick(s, 1, 200);
  assert.equal(c.bubbles.length, 2);
  c.tick(s, 1, 300);
  c.tick(s, 1, 400);
  assert.equal(c.bubbles.length, 2);
});

test('no chatter while an overlay or an emote is up, or when switched off', () => {
  const a = ready();
  a.c.tick(a.s, 1, 1000, { overlay: true });
  assert.equal(a.c.bubbles.length, 0);
  a.c.tick(a.s, 1, 1000, { emoting: () => true });
  assert.equal(a.c.bubbles.length, 0);
  setChatterOn(false);
  a.c.tick(a.s, 1, 1000);
  assert.equal(a.c.bubbles.length, 0);
  setChatterOn(true);
  a.c.tick(a.s, 1, 1000);
  assert.equal(a.c.bubbles.length, 1);
});

test('a line is not repeated within a life, and not by anyone within two minutes', () => {
  const c = new Chatter(2);
  const s = snap();
  c.onSnap(s, 1, 0);
  const sol = c.soldiers.get(1)!;
  const pers = PERSONALITIES.find((p) => p.id === sol.personality)!;
  const seen: string[] = [];
  for (let i = 0; i < pers.idle.length; i++) {
    const line = c.pick(sol, [], 1000 + i);
    assert.ok(line);
    sol.said.add(line.text);
    seen.push(line.text);
  }
  assert.equal(new Set(seen).size, seen.length, 'the idle pool is spent without a repeat');
  assert.equal(c.pick(sol, [], 5000), null, 'then it falls quiet');
  // Another soldier with the same voice avoids what was just said anywhere.
  const other = new Chatter(2);
  other.onSnap(snap({ players: [player(1), player(2)] }), 1, 0);
  const twin = [...other.soldiers.values()].find((x) => x.id === 2)!;
  twin.personality = 'poet';
  const text = PERSONALITIES.find((p) => p.id === 'poet')!.idle[0]!;
  (other as unknown as { said: Map<string, number> }).said.set(text, 1000);
  for (let i = 0; i < 200; i++) assert.notEqual(other.pick(twin, [], 2000)?.text, text);
  assert.ok(Array.from({ length: 400 }, () => other.pick(twin, [], 1000 + CHATTER.globalRepeatMs + 5)?.text).includes(text));
});

test('tags: justSpawned, justKilled, closeCall, streak, lowHealth, longIdle, hunted, golden', () => {
  const c = new Chatter(1);
  const start = snap({ players: [player(1, { spawnShield: true })] });
  c.onSnap(start, 1, 0);
  assert.deepEqual(c.tagsOf(start.players[0]!, start, 1000), ['justSpawned']);
  assert.deepEqual(c.tagsOf(start.players[0]!, start, 20_000).includes('justSpawned'), false);

  const kill = snap({ events: [{ e: 'kill', killer: 'p1', victim: 'x', killerId: 1, victimId: 9, weapon: 'Pistol', bounty: false, assisters: [], ended: 0, revenge: false }] });
  c.onSnap(kill, 1, 20_000);
  assert.ok(c.tagsOf(kill.players[0]!, kill, 21_000).includes('justKilled'));
  assert.ok(!c.tagsOf(kill.players[0]!, kill, 31_000).includes('justKilled'));

  c.onSnap(snap({ players: [player(1, { hp: 15 })] }), 1, 40_000);
  const healed = snap({ players: [player(1, { hp: 70 })] });
  c.onSnap(healed, 1, 43_000);
  assert.ok(c.tagsOf(healed.players[0]!, healed, 44_000).includes('closeCall'), 'under 25% and then back up');
  assert.ok(!c.tagsOf(healed.players[0]!, healed, 60_000).includes('closeCall'));

  const low = snap({ players: [player(1, { hp: 20 })], self: { streak: 3 } });
  c.onSnap(low, 1, 70_000);
  const tags = c.tagsOf(low.players[0]!, low, 70_500);
  assert.ok(tags.includes('lowHealth') && tags.includes('onStreak'));

  c.onSnap(snap({ players: [player(1, { x: 50 })] }), 1, 80_000);
  const still = snap({ players: [player(1, { x: 50 })] });
  c.onSnap(still, 1, 89_000);
  assert.ok(c.tagsOf(still.players[0]!, still, 89_000).includes('longIdle'));
  assert.ok(!c.tagsOf(still.players[0]!, still, 83_000).includes('longIdle'));

  const gold = snap({ players: [player(1, { hunted: true, golden: true })] });
  assert.ok(['hunted', 'goldenGun'].every((t) => c.tagsOf(gold.players[0]!, gold, 90_000).includes(t as never)));
});

test('tags: a quick death makes the next spawn "respawned"', () => {
  const c = new Chatter(1);
  c.onSnap(snap({ players: [player(1, { spawnShield: true })] }), 1, 0);
  c.onSnap(snap({ players: [player(1, { alive: false })], self: { alive: false } }), 1, 8000);
  const back = snap({ players: [player(1, { spawnShield: true })], self: { deaths: 1 } });
  c.onSnap(back, 1, 12_000);
  assert.ok(c.tagsOf(back.players[0]!, back, 13_000).includes('respawned'));
  assert.equal(c.soldiers.get(1)!.life, 1);
  assert.equal(c.soldiers.get(1)!.personality, personalityFor(1, 1));
});

test('tags: Zombies night and day, a hit core, an airdrop, a barrel, the round clock, and a round result', () => {
  const c = new Chatter(1);
  const run = (phase: 'day' | 'night', hp: number) => ({ phase, night: 1, phaseEndsAt: null, scrap: 0, core: { x: 0, y: 0, hp, maxHp: 100 }, aliveZombies: 0, waveLeft: 0, survivors: 1, lost: 0, ready: [], report: null });
  const night = snap({ extra: { run: run('night', 100) } });
  c.onSnap(night, 1, 1000);
  assert.ok(c.tagsOf(night.players[0]!, night, 1000).includes('zombiesNight'));
  const hit = snap({ extra: { run: run('night', 80) } });
  c.onSnap(hit, 1, 2000);
  assert.ok(c.tagsOf(hit.players[0]!, hit, 3000).includes('coreDamaged'));
  const day = snap({ extra: { run: run('day', 80) } });
  c.onSnap(day, 1, 30_000);
  const dayTags = c.tagsOf(day.players[0]!, day, 30_000);
  assert.ok(dayTags.includes('zombiesDay') && !dayTags.includes('zombiesNight') && !dayTags.includes('coreDamaged'));

  const plane = snap({ events: [{ e: 'airdrop', k: 'inbound', x: 0, y: 0 }] });
  c.onSnap(plane, 1, 40_000);
  assert.ok(c.tagsOf(plane.players[0]!, plane, 41_000).includes('airdropInbound'));
  assert.ok(!c.tagsOf(plane.players[0]!, plane, 70_000).includes('airdropInbound'));

  const barrel = snap({ extra: { barrels: [[1, 100, 0, 10]] } });
  assert.ok(c.tagsOf(barrel.players[0]!, barrel, 1).includes('nearBarrel'));
  assert.ok(!c.tagsOf(snap({ extra: { barrels: [[1, 900, 0, 10]] } }).players[0]!, snap({ extra: { barrels: [[1, 900, 0, 10]] } }), 1).includes('nearBarrel'));

  const ending = snap({ tick: 100, roundEndsAt: 100 * (1000 / 30) + 20_000 });
  assert.ok(c.tagsOf(ending.players[0]!, ending, 1).includes('roundEndingSoon'));

  const m = new Chatter(1);
  const winning = snap();
  winning.match.winner = { name: 'p1', id: 1, note: null };
  m.onSnap(snap(), 1, 0);
  m.onSnap(winning, 1, 1000);
  const next = snap();
  m.onSnap(next, 1, 5000);
  assert.ok(m.tagsOf(next.players[0]!, next, 6000).includes('wonRound'));
  assert.ok(!m.tagsOf(next.players[0]!, next, 40_000).includes('wonRound'));
});

test('a fresh event tag is preferred about 70% of the time, idle otherwise', () => {
  const c = new Chatter(9);
  c.onSnap(snap(), 1, 0);
  const sol = c.soldiers.get(1)!;
  let ctx = 0;
  for (let i = 0; i < 400; i++) { sol.said.clear(); if (c.pick(sol, ['justKilled'], 1e6 + i * 1e6)?.tag === 'justKilled') ctx++; }
  assert.ok(ctx > 400 * 0.55 && ctx < 400 * 0.85, String(ctx));
  let none = 0;
  for (let i = 0; i < 100; i++) { sol.said.clear(); if (c.pick(sol, [], 1e9 + i * 1e6)?.tag === null) none++; }
  assert.equal(none, 100);
});
