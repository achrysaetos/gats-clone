import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyEvents, CHALLENGE_BY_ID, challengesView, DAILY_POOL, dayResetAt, freshChallenges, pickChallenges, rollChallenges, WEEKLY_POOL, weekKey, weekResetAt, type ChallengeItem,
} from '../src/shared/challenges.ts';
import { CHALLENGE_COSMETICS } from '../src/shared/cosmetics.ts';
import { openProfiles } from '../src/server/profiles.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 86_400_000;
const groups = (items: ChallengeItem[]) => items.map((i) => CHALLENGE_BY_ID.get(i.id)!.group);

test('the pools are the right size and every template is sane', () => {
  assert.ok(DAILY_POOL.length >= 28 && WEEKLY_POOL.length >= 12);
  for (const c of DAILY_POOL) { assert.ok(c.xp >= 150 && c.xp <= 400, c.id); assert.ok(c.text.includes('{n}') || c.target === 1, c.id); }
  for (const c of WEEKLY_POOL) assert.ok(c.xp >= 1000 && c.xp <= 2000, c.id);
  assert.equal(new Set([...DAILY_POOL, ...WEEKLY_POOL].map((c) => c.id)).size, DAILY_POOL.length + WEEKLY_POOL.length);
  const texts = DAILY_POOL.map((c) => c.text.replace('{n}', String(c.target)));
  for (const want of ['Get 3 Long Shots', 'Win a round', 'Get 15 kills with an SMG', 'Earn a Double Tap', 'Survive 2 zombie nights', 'Break an airdrop crate', 'Kill 2 with one barrel chain', 'Play 3 matches', 'Get a 5-kill streak']) assert.ok(texts.includes(want), want);
});

test('selection is deterministic per day and profile, and picks three from different groups', () => {
  const a = pickChallenges('daily', '2026-10-07', 'Ann');
  assert.deepEqual(pickChallenges('daily', '2026-10-07', 'ann'), a, 'case does not matter');
  assert.equal(a.length, 3);
  assert.equal(new Set(groups(a)).size, 3);
  const days = new Set(), people = new Set();
  for (let d = 0; d < 30; d++) days.add(pickChallenges('daily', `2026-10-${10 + d}`, 'Ann').map((i) => i.id).join());
  for (let n = 0; n < 30; n++) people.add(pickChallenges('daily', '2026-10-07', `P${n}`).map((i) => i.id).join());
  assert.ok(days.size > 15 && people.size > 15, `varied: ${days.size} days, ${people.size} people`);
  for (let n = 0; n < 50; n++) {
    const w = pickChallenges('weekly', '2026-W41', `P${n}`);
    assert.equal(new Set(groups(w)).size, 3);
    assert.equal(w.filter((i) => i.grant).length, 1, 'one weekly grants a cosmetic');
    assert.ok(CHALLENGE_COSMETICS.includes(w.find((i) => i.grant)!.grant!));
    assert.notEqual(CHALLENGE_BY_ID.get(w.find((i) => i.grant)!.id)!.group, 'zom', 'never behind a zombies-only one');
  }
  assert.ok(!pickChallenges('weekly', '2026-W41', 'Ann', new Set(CHALLENGE_COSMETICS)).some((i) => i.grant), 'nothing to grant once all are owned');
});

test('ISO weeks, and the reset times', () => {
  assert.equal(weekKey(Date.UTC(2026, 0, 1)), '2026-W01');
  assert.equal(weekKey(Date.UTC(2025, 11, 29)), '2026-W01');
  assert.equal(weekKey(Date.UTC(2027, 0, 1)), '2026-W53');
  assert.equal(weekKey(Date.UTC(2026, 9, 4, 23, 59)), '2026-W40', 'Sunday');
  assert.equal(weekKey(Date.UTC(2026, 9, 5)), '2026-W41', 'Monday');
  assert.equal(dayResetAt(NOW), Date.UTC(2026, 9, 8));
  assert.equal(weekResetAt(NOW), Date.UTC(2026, 9, 12), 'the next Monday');
  assert.equal(weekResetAt(Date.UTC(2026, 9, 11, 23)), Date.UTC(2026, 9, 12), 'from Sunday');
  assert.equal(weekResetAt(Date.UTC(2026, 9, 12)), Date.UTC(2026, 9, 19), 'a Monday looks a week ahead');
});

test('rollover: a new day replaces only the daily set, a new week only the weekly set, and the same period keeps progress', () => {
  const s = freshChallenges(NOW, 'Ann');
  s.daily[0]!.progress = 1;
  assert.equal(rollChallenges(s, NOW + 3_600_000, 'Ann'), s, 'same object when nothing rolled');
  const tomorrow = rollChallenges(s, NOW + DAY, 'Ann');
  assert.notEqual(tomorrow.day, s.day);
  assert.deepEqual(tomorrow.weekly, s.weekly, 'same week keeps its set');
  assert.equal(tomorrow.daily[0]!.progress, 0);
  assert.deepEqual(tomorrow.daily, pickChallenges('daily', tomorrow.day, 'Ann'));
  const nextWeek = rollChallenges(s, NOW + 7 * DAY, 'Ann');
  assert.notEqual(nextWeek.week, s.week);
  assert.deepEqual(nextWeek.weekly, pickChallenges('weekly', nextWeek.week, 'Ann'));
  assert.deepEqual(rollChallenges(undefined, NOW, 'Ann'), s.daily[0]!.progress === 1 ? { ...s, daily: freshChallenges(NOW, 'Ann').daily } : s);
});

const item = (id: string): ChallengeItem => { const c = CHALLENGE_BY_ID.get(id)!; return { id, target: c.target, xp: c.xp, progress: 0, done: false }; };

test('progress counts kills, weapon kills, medals, games, wins, nights and a best streak, and each completes once', () => {
  const items = ['d_kills20', 'd_smg', 'd_longshot', 'd_streak5', 'd_games', 'd_win', 'd_nights', 'd_medals'].map(item);
  assert.deepEqual(applyEvents(items, { kills: 19, weaponKills: Array(14).fill('smg'), medals: ['longShot', 'longShot', 'doubleKill'], streak: 3, games: 1 }), []);
  const by = (id: string) => items.find((i) => i.id === id)!;
  assert.deepEqual([by('d_kills20').progress, by('d_smg').progress, by('d_longshot').progress, by('d_streak5').progress, by('d_games').progress, by('d_medals').progress], [19, 14, 2, 3, 1, 3]);
  const done = applyEvents(items, { kills: 1, weaponKills: ['smg', 'pistol'], medals: ['longShot'], streak: 2, games: 2, wins: 1, nights: 1 });
  assert.deepEqual(done.map((i) => i.id).sort(), ['d_games', 'd_kills20', 'd_longshot', 'd_smg', 'd_win']);
  assert.equal(by('d_streak5').progress, 3, 'a streak is a best-of, not a sum');
  applyEvents(items, { streak: 5 });
  assert.equal(by('d_streak5').done, true);
  assert.deepEqual(applyEvents(items, { kills: 50, wins: 3 }), [], 'done challenges do not complete twice');
  assert.equal(by('d_kills20').progress, 20, 'progress is capped at the target');
  assert.equal(by('d_nights').progress, 1);
});

test('through a profile: events progress challenges, completion pays XP once and a weekly grants its cosmetic', async () => {
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'chal-')));
  profiles.record('Ann', { games: 1 }, NOW);
  const p = profiles.get('Ann')!;
  const cosmetic = CHALLENGE_COSMETICS[0]!;
  p.challenges = { day: '2026-10-07', daily: [item('d_smg'), item('d_win'), item('d_streak5')], week: '2026-W41', weekly: [{ ...item('w_kills150'), grant: cosmetic }, item('w_games20'), item('w_wins5')] };
  profiles.notice('Ann', NOW);
  profiles.record('Ann', { kills: 150, weaponKills: Array(15).fill('smg') }, NOW);
  const msg = profiles.notice('Ann', NOW)!;
  const challenged = msg.gained.filter((g) => g.reason === 'challenge').map((g) => g.id);
  assert.deepEqual(challenged.sort(), ['d_smg', 'w_kills150']);
  assert.equal(msg.xp, CHALLENGE_BY_ID.get('d_smg')!.xp + CHALLENGE_BY_ID.get('w_kills150')!.xp);
  assert.ok(msg.unlocks.includes(cosmetic) && p.unlocked.includes(cosmetic), 'the weekly cosmetic is granted');
  assert.equal(msg.challenges.daily[0]!.done, true);
  assert.equal(msg.challenges.daily[0]!.text, 'Get 15 kills with an SMG');
  assert.equal(msg.challenges.weeklyResetsAt, Date.UTC(2026, 9, 12));
  profiles.record('Ann', { kills: 100, weaponKills: Array(15).fill('smg') }, NOW);
  assert.equal(profiles.notice('Ann', NOW), null, 'nothing paid twice');
  profiles.round('Ann', { won: true, finished: true }, NOW);
  assert.equal(profiles.get('Ann')!.challenges.daily[1]!.done, true, 'winning a round completes Win a round');
  // The next day the daily set is new; the weekly set stays.
  profiles.record('Ann', { kills: 1 }, NOW + DAY);
  const next = profiles.get('Ann')!.challenges;
  assert.equal(next.day, '2026-10-08');
  assert.equal(next.weekly[0]!.done, true);
  assert.equal(challengesView(next, NOW + DAY).dailyResetsAt, Date.UTC(2026, 9, 9));
});

test('in a room, a kill moves a challenge', async (t) => {
  const { createRoom } = await import('../src/server/room.ts');
  const { LIMITS } = await import('../src/server/limits.ts');
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'chal-room-')));
  const accounts = { stats: () => null, credit: () => {}, nameForToken: () => null } as unknown as Parameters<typeof createRoom>[3];
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 2 }, undefined, profiles);
  const ws = fakeSocket();
  room.connect(ws.socket);
  ws.send({ t: 'join', name: 'Hal', loadout: PISTOL, aspect: 1.5 });
  t.after(async () => { ws.close(); await profiles.flush(); });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  const me = room.world.players.get(welcome.id)!;
  const today = new Date().toISOString().slice(0, 10);
  const p = profiles.get('Hal')!;
  p.challenges = { ...p.challenges, day: today, daily: [{ ...item('d_kills20'), target: 1 }, item('d_games'), item('d_win')] };
  const victim = [...room.world.players.values()].find((q) => q.id !== me.id)!;
  if (victim.life.k === 'alive') victim.life.shieldUntil = -Infinity;
  damagePlayer(room.world, victim, 1e6, { attacker: me, team: me.team, label: 'Pistol', piercing: true, via: 'bullet', fromX: me.x, fromY: me.y });
  room.world.queuedEvents.push(...room.world.events);
  room.tick();
  assert.equal(p.challenges.daily[0]!.done, true);
  const msg = ws.sent.filter((m) => m.t === 'progress').at(-1);
  assert.ok(msg?.t === 'progress' && msg.gained.some((g) => g.reason === 'challenge' && g.id === 'd_kills20'), 'the player is told');
});
