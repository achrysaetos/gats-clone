import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CAREER, WORLD } from '../src/shared/defs.ts';
import { COSMETICS, DEFAULTS, levelState, lifeGains, MAX_LEVEL, PRESTIGE_XP, roundGains, XP, xpForLevel, xpToLevel } from '../src/shared/cosmetics.ts';
import { startServer } from '../src/server/main.ts';
import { openProfiles, profileView } from '../src/server/profiles.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const NOW = Date.UTC(2026, 9, 7, 12);

test('the level curve: 400 + 60 a level, level 1 at zero, 100 at the cap, then a star per 10,000 XP', () => {
  assert.equal(xpToLevel(1), 460);
  assert.equal(xpToLevel(10), 1000);
  assert.deepEqual(levelState(0), { level: 1, prestige: 0, xpInLevel: 0, xpToNext: 460 });
  assert.deepEqual(levelState(459), { level: 1, prestige: 0, xpInLevel: 459, xpToNext: 1 });
  assert.deepEqual(levelState(460), { level: 2, prestige: 0, xpInLevel: 0, xpToNext: 520 });
  for (let l = 1; l < MAX_LEVEL; l++) assert.equal(xpForLevel(l + 1) - xpForLevel(l), xpToLevel(l), `level ${l}`);
  assert.equal(levelState(xpForLevel(25)).level, 25);
  assert.equal(levelState(xpForLevel(25) - 1).level, 24);
  assert.equal(levelState(xpForLevel(MAX_LEVEL)).level, MAX_LEVEL);
  assert.equal(levelState(xpForLevel(MAX_LEVEL) - 1).level, MAX_LEVEL - 1);
  const top = xpForLevel(MAX_LEVEL);
  assert.deepEqual(levelState(top + PRESTIGE_XP - 1), { level: 100, prestige: 0, xpInLevel: PRESTIGE_XP - 1, xpToNext: 1 });
  assert.deepEqual(levelState(top + 2.5 * PRESTIGE_XP), { level: 100, prestige: 2, xpInLevel: 0.5 * PRESTIGE_XP, xpToNext: 0.5 * PRESTIGE_XP });
  // Pacing: a casual 3,000 XP an hour is about level 25 to 30 in 10 hours; 130,000 XP (about 50 hours) is level 60.
  assert.ok(levelState(30_000).level >= 25 && levelState(40_000).level <= 31);
  assert.equal(levelState(130_000).level, 60);
});

test('life XP: a fifth of the score and 25 a kill, capped per life', () => {
  assert.deepEqual(lifeGains(0, 0), []);
  assert.deepEqual(lifeGains(1000, 4), [{ reason: 'kills', xp: 100 }, { reason: 'score', xp: 200 }]);
  assert.deepEqual(lifeGains(104, 0), [{ reason: 'score', xp: 20 }], 'rounds down');
  const sum = (g: { xp: number }[]) => g.reduce((s, x) => s + x.xp, 0);
  assert.equal(sum(lifeGains(100_000, 100)), XP.lifeCap, 'a farmed life stops at the cap');
  assert.equal(sum(lifeGains(100_000, 0)), XP.lifeCap);
  assert.equal(sum(lifeGains(5000, 20)), XP.lifeCap, 'kills first, score fills the rest');
  assert.deepEqual(lifeGains(5000, 20), [{ reason: 'kills', xp: 500 }, { reason: 'score', xp: 250 }]);
  assert.equal(sum(lifeGains(500, 20)), 600, 'under the cap everything counts');
  assert.equal(sum(lifeGains(500, 4)), 200);
});

test('round XP: finish, win, zombie nights and the Bastion', () => {
  assert.deepEqual(roundGains({ won: false, finished: true }), [{ reason: 'finish', xp: 40 }]);
  assert.deepEqual(roundGains({ won: true, finished: true }), [{ reason: 'finish', xp: 40 }, { reason: 'win', xp: 100 }]);
  assert.deepEqual(roundGains({ won: false, finished: false, nights: 1 }), [{ reason: 'night', xp: 60 }]);
  assert.deepEqual(roundGains({ won: true, finished: true, nights: 1, bastion: true }), [{ reason: 'finish', xp: 40 }, { reason: 'night', xp: 60 }, { reason: 'bastion', xp: 300 }]);
});

test('the first win of the UTC day doubles that round\'s award, once', async () => {
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'prog-')));
  profiles.round('Ann', { won: true, finished: true }, NOW);
  const first = profiles.notice('Ann', NOW)!;
  assert.deepEqual(first.gained.filter((g) => g.reason !== 'challenge'), [{ reason: 'finish', xp: 40 }, { reason: 'win', xp: 100 }, { reason: 'firstWin', xp: 140 }]);
  profiles.round('Ann', { won: true, finished: true }, NOW + 3_600_000);
  assert.ok(!profiles.notice('Ann', NOW)!.gained.some((g) => g.reason === 'firstWin'), 'not again the same day');
  profiles.round('Ann', { won: false, finished: true }, NOW + 86_400_000);
  assert.ok(!profiles.notice('Ann', NOW)!.gained.some((g) => g.reason === 'firstWin'), 'a loss does not use it up');
  profiles.round('Ann', { won: true, finished: true }, NOW + 86_400_000 + 1000);
  assert.ok(profiles.notice('Ann', NOW)!.gained.some((g) => g.reason === 'firstWin'), 'the next UTC day has its own');
  profiles.round('Bo', { won: true, finished: true, bastion: true, nights: 1 }, NOW);
  const z = profiles.notice('Bo', NOW)!;
  assert.equal(z.gained.find((g) => g.reason === 'firstWin')?.xp, 40 + 60 + 300);
});

test('levelling up reports each level and grants the cosmetics those levels hold', async () => {
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'prog-lv-')));
  profiles.life('Cy', { score: 0, kills: 0 }, NOW);
  assert.equal(profiles.notice('Cy', NOW), null, 'nothing earned, nothing said');
  profiles.life('Cy', { score: 5 * (xpForLevel(5) - 25 * 4), kills: 0 }, NOW);
  // 3,000+ score might be capped; top up with rounds until level 5.
  while ((profiles.get('Cy')?.level ?? 1) < 5) profiles.round('Cy', { won: false, finished: true }, NOW);
  const m = profiles.notice('Cy', NOW)!;
  assert.deepEqual(m.levelUps, [2, 3, 4, 5]);
  assert.equal(m.level, 5);
  assert.ok(m.unlocks.includes('c_woodland') && m.unlocks.includes('h_beret') && m.unlocks.includes('g_walnut'), m.unlocks.join());
  assert.ok(!m.unlocks.includes('c_desert'), 'level 7 is not here yet');
  assert.equal(m.xpInLevel + m.xpToNext, xpToLevel(5));
  const p = profiles.get('Cy')!;
  for (const c of COSMETICS) if ('level' in c.unlock) assert.equal(p.unlocked.includes(c.id), c.unlock.level <= 5, c.id);
  for (const id of Object.values(DEFAULTS)) assert.ok(p.unlocked.includes(id), `${id} default`);
  assert.deepEqual(profiles.cos('Cy'), { l: 5 });
});

test('past level 100 XP keeps counting into prestige stars', async () => {
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'prog-pr-')));
  profiles.round('Dee', { won: false, finished: true }, NOW);
  const p = profiles.get('Dee')!;
  p.xp = xpForLevel(MAX_LEVEL) - 10;
  profiles.life('Dee', { score: 0, kills: 1 }, NOW);
  assert.equal(p.level, MAX_LEVEL);
  assert.equal(p.prestige, 0);
  assert.ok(p.unlocked.includes('c_galaxy') && p.unlocked.includes('t_legend'), 'the top rewards');
  p.xp = xpForLevel(MAX_LEVEL) + PRESTIGE_XP - 5;
  profiles.life('Dee', { score: 50, kills: 0 }, NOW);
  assert.equal(p.prestige, 1);
  const m = profiles.notice('Dee', NOW)!;
  assert.deepEqual([m.level, m.prestige], [100, 1]);
  assert.deepEqual(profiles.cos('Dee'), { l: 100, p: 1 });
  assert.deepEqual(m.levelUps.filter((l) => l > 100), []);
});

test('lifetime medals unlock their cosmetics as they are earned, and existing badges are retro-granted on load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prog-car-'));
  const profiles = await openProfiles(dir);
  profiles.record('Eve', { kills: CAREER.kills.at[1] - 1 }, NOW);
  assert.ok(!profiles.get('Eve')!.unlocked.includes('h_centurion'));
  profiles.record('Eve', { kills: 1 }, NOW);
  const m = profiles.notice('Eve', NOW)!;
  assert.ok(['t_centurion', 'h_centurion'].every((id) => m.unlocks.includes(id)), m.unlocks.join());
  assert.ok(!m.unlocks.includes('t_centurionprime'));
  await profiles.flush();
  // An old file: a badge on record but nothing of progression.
  await writeFile(join(dir, 'profiles.json'), JSON.stringify({ old: { name: 'Old', kills: 600, deaths: 3, games: 60, bestStreak: 11, distance: 0, medals: { ghost: 6 }, weaponKills: {}, badges: { 'kills:0': 1, 'kills:1': 2, 'ghost:0': 3, 'ghost:1': 4, 'games:1': 5, 'streak:1': 6 }, firstSeen: 1, lastSeen: 2 } }));
  const old = (await openProfiles(dir)).get('old')!;
  assert.deepEqual([old.xp, old.level, old.prestige, old.lastWinDay], [0, 1, 0, '']);
  for (const id of ['h_centurion', 't_centurion', 'h_phantom', 't_phantom', 't_seasoned', 't_ironwill']) assert.ok(old.unlocked.includes(id), id);
  assert.ok(!old.unlocked.includes('c_oldguard'), 'games tier 2 not reached');
  assert.deepEqual(old.equipped, {});
  assert.deepEqual({ kills: old.kills, bestStreak: old.bestStreak }, { kills: 600, bestStreak: 11 }, 'what was there survives');
});

test('a saved file is cleaned: unknown unlocks, equipped items not owned and bad challenge entries are dropped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prog-clean-'));
  await writeFile(join(dir, 'profiles.json'), JSON.stringify({
    x: {
      name: 'Zed', xp: 5000, level: 99, prestige: 9, unlocked: ['h_viking', 'h_hax', 7, 'c_tape'], equipped: { helmet: 'h_viking', camo: 'c_galaxy', title: 'k_poof', bogus: 'h_beret' },
      lastWinDay: '2026-10-07', challenges: { day: '2026-10-07', daily: [{ id: 'd_smg', progress: 99, done: true }, { id: 'nope' }, { id: 'd_win', progress: 1, done: true, grant: 'h_crown' }], week: '2026-W41', weekly: 'x' },
    },
  }));
  const p = (await openProfiles(dir)).get('zed')!;
  assert.deepEqual([p.xp, p.level, p.prestige], [5000, levelState(5000).level, 0], 'level and stars are recomputed from XP');
  assert.ok(p.unlocked.includes('h_viking') && !p.unlocked.includes('h_hax'));
  assert.deepEqual(p.equipped, { helmet: 'h_viking' }, 'only owned, correctly slotted items stay on');
  assert.deepEqual(p.challenges.daily.map((d) => [d.id, d.progress, d.done, d.grant]), [['d_smg', 15, true, undefined], ['d_win', 1, true, undefined]]);
  assert.deepEqual(p.challenges.weekly, []);
});

test('a profile persists its progress across a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prog-save-'));
  const a = await openProfiles(dir);
  a.round('Fay', { won: true, finished: true }, NOW);
  a.equip('Fay', { title: 't_rookie' }, true);
  await a.flush();
  const before = a.get('Fay')!;
  const b = (await openProfiles(dir)).get('Fay')!;
  assert.deepEqual({ xp: b.xp, level: b.level, unlocked: b.unlocked, lastWinDay: b.lastWinDay, challenges: b.challenges }, { xp: before.xp, level: before.level, unlocked: before.unlocked, lastWinDay: before.lastWinDay, challenges: before.challenges });
  assert.ok(b.xp >= 280);
});

test('in a room, a finished life and a won round pay XP and the player is told; guests under a registered name get nothing', async (t) => {
  const { createRoom } = await import('../src/server/room.ts');
  const { LIMITS } = await import('../src/server/limits.ts');
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'prog-room-')));
  const registered = new Set<string>();
  const accounts = {
    stats: (n: string) => (registered.has(n.toLowerCase()) ? { name: n, kills: 0, deaths: 0, games: 0, score: 0 } : null),
    credit: () => {}, nameForToken: (tok: string) => (tok === 'gil-token' ? 'Gil' : null),
  } as unknown as Parameters<typeof createRoom>[3];
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 3 }, undefined, profiles);
  const ws = fakeSocket();
  room.connect(ws.socket);
  ws.send({ t: 'join', name: 'Hal', loadout: PISTOL, aspect: 1.5 });
  t.after(async () => { ws.close(); await profiles.flush(); });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  const me = room.world.players.get(welcome.id)!;
  const bots = [...room.world.players.values()].filter((p) => p.id !== me.id);
  const shot = (victim: (typeof bots)[number], by = me) => {
    if (victim.life.k === 'alive') victim.life.shieldUntil = -Infinity;
    damagePlayer(room.world, victim, 1e6, { attacker: by, team: by.team, label: 'Pistol', piercing: true, via: 'bullet', fromX: by.x, fromY: by.y });
    room.world.queuedEvents.push(...room.world.events);
  };
  // Hal kills a bot, then dies: the life ends and pays kills and score.
  shot(bots[0]!);
  const scoreAtDeath = me.score;
  room.tick();
  shot(me, bots[1]!);
  room.tick();
  const lifeMsg = ws.sent.filter((m) => m.t === 'progress').at(-1);
  assert.ok(lifeMsg?.t === 'progress');
  const kills = lifeMsg.gained.find((g) => g.reason === 'kills')?.xp, score = lifeMsg.gained.find((g) => g.reason === 'score')?.xp;
  assert.equal(kills, XP.perKill);
  assert.ok(scoreAtDeath >= WORLD.killScore && score === Math.floor(scoreAtDeath / XP.scoreDiv), `score xp ${score} for ${scoreAtDeath}`);
  assert.equal(profiles.get('Hal')!.xp >= XP.perKill + 20, true);
  // Win the round: 30 kills, after being seated long enough.
  ws.sent.length = 0;
  room.world.now += XP.minRoundPlayMs + 1;
  me.kills = WORLD.ffaWinKills;
  room.tick();
  assert.equal(room.world.match.k, 'over');
  const winMsg = ws.sent.filter((m) => m.t === 'progress').at(-1);
  assert.ok(winMsg?.t === 'progress');
  assert.deepEqual(winMsg.gained.filter((g) => g.reason !== 'challenge' && g.reason !== 'kills' && g.reason !== 'score').map((g) => [g.reason, g.xp]), [['finish', 40], ['win', 100], ['firstWin', 140]]);
  room.tick();
  assert.equal(ws.sent.filter((m) => m.t === 'progress').length, 1, 'a round pays once');
  // A guest who has not been in the room for a minute earns no round XP.
  const late = fakeSocket();
  room.connect(late.socket);
  late.send({ t: 'join', name: 'Ivy', loadout: PISTOL, aspect: 1.5 });
  t.after(() => late.close());
  room.world.match = { k: 'playing' };
  room.tick();
  room.world.match = { k: 'over', winner: { name: 'Ivy', id: null, note: null }, restartAt: room.world.now + 5000 };
  room.tick();
  assert.ok(!late.sent.some((m) => m.t === 'progress' && m.gained.some((g) => g.reason === 'finish')), 'too late to count');
  // A guest holding a name an account has since registered keeps no profile.
  const own = fakeSocket();
  room.connect(own.socket);
  own.send({ t: 'join', name: 'Gil', loadout: PISTOL, aspect: 1.5 });
  t.after(() => own.close());
  assert.equal(profiles.get('Gil')?.games, 1);
  registered.add('gil');
  profiles.reset('Gil');
  const gp = [...room.world.players.values()].find((p) => p.name === 'Gil')!;
  shot(gp, bots[1]!);
  room.tick();
  assert.equal(profiles.get('Gil'), null, 'nothing recorded for it');
  assert.ok(!own.sent.some((m) => m.t === 'progress' && m.gained.length > 0));
});

test('the HTTP API: profile shows level state, equipped and challenges; POST /api/equip needs the account token and an unlocked item', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prog-http-'));
  let server = await startServer({ port: 0, dataDir, limits: { authPerMin: 1000 } });
  t.after(async () => { await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`http://localhost:${server.port}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
  const get = (path: string) => fetch(`http://localhost:${server.port}${path}`);
  const session = await (await post('/api/register', { name: 'Jax', password: 'hunter2' })).json() as { token: string };
  assert.equal((await get('/api/profile/Jax')).status, 404, 'no profile before any play');
  // Registering wipes the name's profile, so seed one for the restarted server: 20,000 XP is level 20.
  await server.close();
  await writeFile(join(dataDir, 'profiles.json'), JSON.stringify({ jax: { name: 'Jax', xp: 20_000, kills: 5 } }));
  server = await startServer({ port: 0, dataDir, limits: { authPerMin: 1000 } });
  const view = await (await get('/api/profile/Jax')).json() as ReturnType<typeof profileView>;
  const state = levelState(20_000);
  assert.deepEqual([view.level, view.xp, view.prestige, view.xpToNext, view.xpInLevel], [state.level, 20_000, 0, state.xpToNext, state.xpInLevel]);
  assert.equal(view.challenges.daily.length, 3);
  assert.equal(view.challenges.weekly.length, 3);
  assert.ok(view.challenges.dailyResetsAt > Date.now() && view.challenges.weeklyResetsAt >= view.challenges.dailyResetsAt);
  assert.deepEqual(view.equipped, DEFAULTS);
  assert.ok(view.unlocked.includes('h_ushanka') && !view.unlocked.includes('h_crown'));

  assert.equal((await post('/api/equip', { slot: 'helmet', id: 'h_ushanka' })).status, 401, 'no token');
  assert.equal((await post('/api/equip', { token: 'bad', slot: 'helmet', id: 'h_ushanka' })).status, 401);
  assert.equal((await post('/api/equip', { token: session.token, slot: 'helmet', id: 'h_nope' })).status, 400, 'foreign id');
  assert.equal((await post('/api/equip', { token: session.token, slot: 'helmet', id: 'c_urban' })).status, 400, 'wrong slot');
  assert.equal((await post('/api/equip', { token: session.token })).status, 400);
  const locked = await post('/api/equip', { token: session.token, equipped: { helmet: 'h_ushanka', camo: 'c_galaxy' } });
  assert.equal(locked.status, 403);
  const refused = await locked.json() as { rejected: string[]; equipped: Record<string, string> };
  assert.deepEqual([refused.rejected, refused.equipped.helmet], [['c_galaxy'], DEFAULTS.helmet], 'all or nothing');
  const ok = await post('/api/equip', { slot: 'helmet', id: 'h_ushanka' }, { authorization: `Bearer ${session.token}` });
  assert.equal(ok.status, 200);
  const body = await ok.json() as { equipped: Record<string, string>; unlocked: string[] };
  assert.deepEqual(body.equipped, { ...DEFAULTS, helmet: 'h_ushanka' });
  assert.ok(body.unlocked.includes('h_ushanka'));
  const again = await (await get('/api/profile/jax')).json() as ReturnType<typeof profileView>;
  assert.equal(again.equipped.helmet, 'h_ushanka');
  const viaBody = await post('/api/equip', { token: session.token, equipped: { helmet: 'h_standard', title: 't_rookie' } });
  assert.equal(viaBody.status, 200);
  assert.deepEqual((await viaBody.json() as { equipped: Record<string, string> }).equipped, DEFAULTS);
});

test('golden replay: the simulation is untouched by progression', () => {
  const readme = execFileSync('grep', ['-o', 'current hash is `[0-9a-f]\\{64\\}`', 'README.md'], { encoding: 'utf8' });
  const hash = /([0-9a-f]{64})/.exec(readme)![1]!;
  const out = execFileSync('node', ['scripts/golden-replay.ts', hash], { encoding: 'utf8', timeout: 600_000 });
  assert.ok(out.includes(`golden ${hash}`), out.slice(-200));
});
