import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAREER, KM_PX, type MedalId } from '../src/shared/defs.ts';
import { applyDelta, featuredBadge, freshProfile, openProfiles, trackCount } from '../src/server/profiles.ts';

test('lifetime medals unlock rung by rung as a career stat or a medal count climbs, each once', () => {
  const p = freshProfile('Ann', 0);
  assert.deepEqual(applyDelta(p, { kills: CAREER.kills.at[0] - 1 }, 1), []);
  assert.deepEqual(applyDelta(p, { kills: 1 }, 2), [{ track: 'kills', tier: 0 }]);
  assert.deepEqual(applyDelta(p, { kills: 1 }, 3), [], 'a rung is earned once');
  const longShots: MedalId[] = Array(CAREER.longShot.at[1]).fill('longShot');
  assert.deepEqual(applyDelta(p, { medals: longShots }, 4), [{ track: 'longShot', tier: 0 }, { track: 'longShot', tier: 1 }], 'a big jump earns every rung it passes');
  assert.equal(p.badges['longShot:1'], 4, 'stamped with when');
});

test('distance walked is counted in km, and a best streak only ever rises', () => {
  const p = freshProfile('Bo', 0);
  assert.deepEqual(applyDelta(p, { distance: CAREER.distance.at[0] * KM_PX - 1 }, 1), [], 'a pixel short of the first rung earns nothing');
  assert.deepEqual(applyDelta(p, { distance: 1 }, 2), [{ track: 'distance', tier: 0 }]);
  assert.equal(trackCount(p, 'distance'), CAREER.distance.at[0]);
  assert.equal(p.badges['distance:0'], 2, 'stamped with when the rung was crossed');
  applyDelta(p, { streak: 7 }, 2);
  applyDelta(p, { streak: 3 }, 3);
  assert.equal(p.bestStreak, 7);
});

test('a player wears their rarest lifetime medal', () => {
  const p = freshProfile('Cy', 0);
  assert.equal(featuredBadge(p), null);
  applyDelta(p, { kills: CAREER.kills.at[0] }, 1);
  applyDelta(p, { medals: Array(CAREER.massacre.at[2]).fill('massacre') }, 2);
  assert.deepEqual(featuredBadge(p), { track: 'massacre', tier: 2 });
});

test('profiles persist, and a saved file cannot smuggle in unknown keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'profiles-'));
  const a = await openProfiles(dir);
  assert.deepEqual(a.record('Dee', { kills: CAREER.kills.at[0], games: 1 }, 5), [{ track: 'kills', tier: 0 }]);
  await a.flush();
  const b = await openProfiles(dir);
  assert.equal(b.get('dee')?.kills, CAREER.kills.at[0], 'names are looked up without case');
  assert.deepEqual(b.featured('Dee'), { track: 'kills', tier: 0 });
  await writeFile(join(dir, 'profiles.json'), JSON.stringify({ evil: { name: 'Evil', kills: -5, medals: { bogus: 9, longShot: 2 }, badges: { 'x:9': 1 }, __proto__: 1 } }));
  const c = await openProfiles(dir);
  assert.deepEqual({ kills: c.get('evil')?.kills, medals: c.get('evil')?.medals, badges: c.get('evil')?.badges }, { kills: 0, medals: { longShot: 2 }, badges: {} });
});

test('in a room, a human\'s kill reaches their profile at once, and crossing a rung pays, announces and puts on the medal', async (t) => {
  const { createRoom } = await import('../src/server/room.ts');
  const { LIMITS } = await import('../src/server/limits.ts');
  const { damagePlayer } = await import('../src/shared/sim/combat.ts');
  const { CAREER_PAY } = await import('../src/shared/defs.ts');
  const { fakeSocket, PISTOL } = await import('./helpers.ts');
  const dir = await mkdtemp(join(tmpdir(), 'profiles-room-'));
  const profiles = await openProfiles(dir);
  profiles.record('Eve', { kills: CAREER.kills.at[0] - 1 });
  const accounts = { stats: () => null, credit: () => {}, nameForToken: () => null } as unknown as Parameters<typeof createRoom>[3];
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 2 }, undefined, profiles);
  const ws = fakeSocket();
  room.connect(ws.socket);
  ws.send({ t: 'join', name: 'Eve', loadout: PISTOL, aspect: 1.5 });
  t.after(async () => { ws.close(); await profiles.flush(); });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  const me = room.world.players.get(welcome.id)!;
  const victim = [...room.world.players.values()].find((p) => p.id !== me.id)!;
  const before = me.score;
  // Fresh spawns are shielded.
  if (victim.life.k === 'alive') victim.life.shieldUntil = -Infinity;
  damagePlayer(room.world, victim, 1e6, { attacker: me, team: me.team, label: 'Pistol', piercing: true, via: 'bullet', fromX: me.x, fromY: me.y });
  room.world.queuedEvents.push(...room.world.events);
  room.tick();
  assert.equal(profiles.get('Eve')?.kills, CAREER.kills.at[0], 'credited before the life ends');
  const badge = ws.sent.find((m) => m.t === 'badge');
  assert.deepEqual(badge, { t: 'badge', badge: { track: 'kills', tier: 0 }, score: CAREER_PAY.bronze });
  assert.ok(me.score - before >= CAREER_PAY.bronze, 'the lifetime medal pays its score');
  assert.deepEqual(me.badge, { track: 'kills', tier: 0 }, 'and is worn at once');
});

test('registering a name wipes what guests left under it', async () => {
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'profiles-reset-')));
  profiles.record('Erin', { kills: CAREER.kills.at[0], games: 3 });
  profiles.reset('ERIN');
  assert.equal(profiles.get('Erin'), null);
  assert.equal(profiles.featured('Erin'), null);
});

test('in a room, an account plays under its own name and its play goes to its profile; a guest under a since-registered name keeps none', async (t) => {
  const { createRoom } = await import('../src/server/room.ts');
  const { LIMITS } = await import('../src/server/limits.ts');
  const { fakeSocket, PISTOL } = await import('./helpers.ts');
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'profiles-acct-')));
  const registered = new Set<string>();
  const accounts = {
    stats: (n: string) => (registered.has(n.toLowerCase()) ? { name: n, kills: 0, deaths: 0, games: 0, score: 0 } : null),
    credit: () => {},
    nameForToken: (tok: string) => (tok === 'erin-token' ? 'Erin' : null),
  } as unknown as Parameters<typeof createRoom>[3];
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 4 }, undefined, profiles);
  const guest = fakeSocket();
  room.connect(guest.socket);
  guest.send({ t: 'join', name: 'Erin', loadout: PISTOL, aspect: 1.5 });
  t.after(async () => { guest.close(); owner.close(); await profiles.flush(); });
  assert.equal(profiles.get('Erin')?.games, 1, 'an unregistered name is the guest\'s to play under');
  registered.add('erin');
  profiles.reset('Erin');
  const owner = fakeSocket();
  room.connect(owner.socket);
  owner.send({ t: 'join', name: 'whatever', token: 'erin-token', loadout: PISTOL, aspect: 1.5 });
  const welcome = owner.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  assert.equal(room.world.players.get(welcome.id)?.name, 'Erin', 'the guest holding the name gives it up');
  const guestId = guest.sent.find((m) => m.t === 'welcome');
  assert.ok(guestId?.t === 'welcome');
  assert.notEqual(room.world.players.get(guestId.id)?.name.toLowerCase(), 'erin');
  assert.equal(profiles.get('Erin')?.games, 1, 'only the account\'s own join counts');
});
