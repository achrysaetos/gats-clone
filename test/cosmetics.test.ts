import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAREER, CAREER_IDS } from '../src/shared/defs.ts';
import {
  botCosmetics, CHALLENGE_COSMETICS, COSMETIC_BY_ID, COSMETICS, cosmeticsIn, DEFAULTS, MAX_LEVEL, parsePicks, resolveEquipped, SLOT_KEY, SLOTS, toCos, type Cos,
} from '../src/shared/cosmetics.ts';
import { parseClientMsg, type Snapshot, type SnapshotWire } from '../src/shared/protocol.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { fillSnapshot, makeSnapshotEncoder } from '../src/shared/wire.ts';
import { openProfiles } from '../src/server/profiles.ts';
import { emptyWorld, fakeSocket, PISTOL, spawnAt } from './helpers.ts';

const picks = (...ids: string[]) => Object.fromEntries(ids.map((id) => [COSMETIC_BY_ID.get(id)!.slot, id]));

test('the catalog is rich, its ids unique and slot-prefixed, and every slot has exactly one default', () => {
  assert.equal(new Set(COSMETICS.map((c) => c.id)).size, COSMETICS.length);
  const count = (slot: (typeof SLOTS)[number]) => cosmeticsIn(slot).length;
  assert.ok(count('helmet') >= 12 && count('camo') >= 12 && count('gunSkin') >= 10 && count('nameColor') >= 10 && count('title') >= 25 && count('killFx') >= 6, 'sizes');
  for (const c of COSMETICS) {
    assert.ok(c.id.startsWith(`${SLOT_KEY[c.slot]}_`), c.id);
    assert.ok(c.name && c.desc, c.id);
    if (c.slot !== 'title') assert.ok(c.swatch.length > 0, `${c.id} has preview colours`);
  }
  for (const slot of SLOTS) assert.equal(cosmeticsIn(slot).filter((c) => 'default' in c.unlock).length, 1, slot);
  assert.equal(DEFAULTS.title, 't_rookie');
  assert.ok(COSMETICS.some((c) => c.rarity === 'legendary' && c.slot === 'helmet'), 'a legendary crown');
  assert.equal(COSMETIC_BY_ID.get('n_aurora')?.animated, true);
});

test('unlock rules are well formed, every level up to 50 gives something, and rarer things wait at 60 to 100', () => {
  const levels = new Set<number>();
  for (const c of COSMETICS) {
    const u = c.unlock;
    if ('level' in u) { assert.ok(u.level >= 2 && u.level <= MAX_LEVEL, c.id); levels.add(u.level); }
    if ('career' in u) { assert.ok(CAREER_IDS.includes(u.career) && u.tier >= 0 && u.tier <= 3, c.id); assert.ok(CAREER[u.career].at[u.tier] > 0); }
  }
  for (let l = 2; l <= 50; l++) assert.ok(levels.has(l), `level ${l} unlocks something`);
  assert.ok([...levels].filter((l) => l >= 60).length >= 8, 'late levels have rewards');
  assert.ok(COSMETICS.filter((c) => 'career' in c.unlock).length >= 10, 'several come only from lifetime medals');
  assert.ok(CHALLENGE_COSMETICS.length >= 6, 'and several only from challenges');
  for (const c of COSMETICS) if (c.rarity === 'legendary' && 'level' in c.unlock) assert.ok(c.unlock.level >= 78, `${c.id} is a late reward`);
});

test('parsePicks keeps catalog ids of the right slot and drops the rest', () => {
  assert.deepEqual(parsePicks({ helmet: 'h_viking', camo: 'h_viking', gunSkin: 'nope', title: 't_rookie', bogus: 'k_poof' }), { helmet: 'h_viking', title: 't_rookie' });
  assert.deepEqual(parsePicks(null), {});
  assert.deepEqual(parsePicks('x'), {});
});

test('parseClientMsg validates cosmetics on join and equip', () => {
  const join = { t: 'join', name: 'Ann', loadout: PISTOL, aspect: 1.5 };
  const ok = parseClientMsg(JSON.stringify({ ...join, cosmetics: { helmet: 'h_beret', killFx: 'k_confetti' } }));
  assert.deepEqual(ok?.t === 'join' && ok.cosmetics, { helmet: 'h_beret', killFx: 'k_confetti' });
  const foreign = parseClientMsg(JSON.stringify({ ...join, cosmetics: { helmet: 'h_hax', camo: 7 } }));
  assert.ok(foreign?.t === 'join' && foreign.cosmetics === undefined, 'unknown ids are dropped, the join still works');
  assert.equal(parseClientMsg(JSON.stringify(join))?.t === 'join' && 'cosmetics' in parseClientMsg(JSON.stringify(join))!, false);
  assert.deepEqual(parseClientMsg('{"t":"equip","slot":"helmet","id":"h_crown"}'), { t: 'equip', slot: 'helmet', id: 'h_crown' });
  assert.equal(parseClientMsg('{"t":"equip","slot":"helmet","id":"h_hax"}'), null, 'a foreign id is rejected');
  assert.equal(parseClientMsg('{"t":"equip","slot":"helmet","id":"c_woodland"}'), null, 'an id of another slot is rejected');
  assert.equal(parseClientMsg('{"t":"equip","slot":"hat","id":"h_crown"}'), null);
});

test('toCos omits defaults; resolveEquipped fills them', () => {
  assert.equal(toCos({}), null);
  assert.equal(toCos({ helmet: DEFAULTS.helmet }), null);
  assert.deepEqual(toCos({ helmet: 'h_beret', title: 't_toysoldier' }, 12, 2), { h: 'h_beret', t: 't_toysoldier', l: 12, p: 2 });
  assert.deepEqual(resolveEquipped({ camo: 'c_urban' }), { ...DEFAULTS, camo: 'c_urban' });
});

test('equip: a locked item is refused, a default is accepted, an unlocked item is worn and persists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cos-'));
  const profiles = await openProfiles(dir);
  profiles.record('Ann', { games: 1 });
  const locked = profiles.equip('Ann', picks('h_crown'), true);
  assert.deepEqual({ ok: locked.ok, rejected: locked.rejected }, { ok: false, rejected: ['h_crown'] });
  assert.equal(locked.equipped.helmet, DEFAULTS.helmet);
  assert.equal(profiles.equip('Ann', picks('h_standard'), true).ok, true, 'defaults are always allowed');
  const p = profiles.get('Ann')!;
  p.unlocked.push('h_beret', 'c_woodland');
  const mixed = profiles.equip('Ann', picks('h_beret', 'c_galaxy'), true);
  assert.equal(mixed.ok, false);
  assert.equal(profiles.get('Ann')!.equipped.helmet, undefined, 'strict applies nothing when any pick is refused');
  const lenient = profiles.equip('Ann', picks('h_beret', 'c_galaxy'), false);
  assert.deepEqual({ ok: lenient.ok, h: lenient.equipped.helmet, c: lenient.equipped.camo }, { ok: false, h: 'h_beret', c: DEFAULTS.camo });
  assert.deepEqual(profiles.cos('Ann'), { h: 'h_beret', l: 1 });
  profiles.equip('Ann', picks('h_standard'), true);
  assert.equal(profiles.get('Ann')!.equipped.helmet, undefined, 'wearing the default clears the slot');
  profiles.equip('Ann', picks('h_beret'), true);
  await profiles.flush();
  assert.equal((await openProfiles(dir)).get('Ann')!.equipped.helmet, 'h_beret');
});

test('bots wear a deterministic mix of level-gated common and rare items', () => {
  assert.deepEqual(botCosmetics('Rex'), botCosmetics('Rex'));
  const worn = new Map<string, number>();
  for (let i = 0; i < 200; i++) {
    const cos = botCosmetics(`Bot ${i}`) as Cos | null;
    for (const [k, v] of Object.entries(cos ?? {})) {
      if (typeof v !== 'string') continue;
      const c = COSMETIC_BY_ID.get(v)!;
      assert.ok(c.rarity === 'common' || c.rarity === 'rare', v);
      assert.ok('level' in c.unlock, `${v} is not a career or challenge reward`);
      assert.equal(SLOT_KEY[c.slot], k);
      worn.set(v, (worn.get(v) ?? 0) + 1);
    }
  }
  assert.ok(worn.size > 20, `variety: ${worn.size}`);
  assert.ok([...worn.keys()].some((id) => id.startsWith('t_')), 'now and then a title');
  assert.ok([...worn.keys()].filter((id) => id.startsWith('t_')).length < [...worn.keys()].filter((id) => id.startsWith('h_')).length * 3);
});

test('cosmetics ride the snapshot wire sticky and come out on each PlayerView', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 1500, 1500, { name: 'A' });
  const b = spawnAt(w, 1600, 1500, { name: 'B' });
  const encode = makeSnapshotEncoder();
  let last: Snapshot | null = null;
  const sentCos: (number | undefined)[] = [];
  const tick = () => {
    const snap = snapshotFor(w, a.id);
    const wire = JSON.parse(encode(snap)) as SnapshotWire;
    sentCos.push(wire.cos === undefined ? undefined : Object.keys(wire.cos).length);
    assert.ok(wire.players.every((p) => p.cos === undefined), 'not repeated on each player');
    last = fillSnapshot(wire, last);
    return last!;
  };
  assert.equal(tick().players.find((p) => p.id === b.id)!.cos, undefined);
  b.cos = { h: 'h_viking', l: 40 };
  assert.deepEqual(tick().players.find((p) => p.id === b.id)!.cos, { h: 'h_viking', l: 40 });
  for (let i = 0; i < 5; i++) assert.deepEqual(tick().players.find((p) => p.id === b.id)!.cos, { h: 'h_viking', l: 40 });
  assert.deepEqual(sentCos, [undefined, 1, undefined, undefined, undefined, undefined, undefined], 'sent once, then only on change');
  a.cos = { c: 'c_tiger' };
  const t = tick();
  assert.deepEqual(t.players.find((p) => p.id === a.id)!.cos, { c: 'c_tiger' });
  b.cos = null;
  assert.equal(tick().players.find((p) => p.id === b.id)!.cos, undefined, 'taking it off clears it');
  a.cos = null;
  const bare = tick();
  assert.deepEqual(bare.players.map((p) => p.cos), [undefined, undefined], 'the last one taken off clears too, though nobody in view wears anything');
  assert.deepEqual(sentCos.slice(-1), [0], 'by an empty set, sent once');
  tick();
  assert.equal(sentCos.at(-1), undefined, 'and not again');
});

test('in a room, join cosmetics and equip messages are validated against what the profile has unlocked, and bots wear things', async (t) => {
  const { createRoom } = await import('../src/server/room.ts');
  const { LIMITS } = await import('../src/server/limits.ts');
  const profiles = await openProfiles(await mkdtemp(join(tmpdir(), 'cos-room-')));
  profiles.record('Gus', { games: 1 });
  profiles.get('Gus')!.unlocked.push('h_beret');
  const accounts = { stats: () => null, credit: () => {}, nameForToken: () => null } as unknown as Parameters<typeof createRoom>[3];
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 6 }, undefined, profiles);
  const ws = fakeSocket();
  room.connect(ws.socket);
  t.after(async () => { ws.close(); await profiles.flush(); });
  ws.send({ t: 'join', name: 'Gus', loadout: PISTOL, aspect: 1.5, cosmetics: { helmet: 'h_beret', camo: 'c_galaxy' } });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  const me = room.world.players.get(welcome.id)!;
  assert.deepEqual(me.cos, { h: 'h_beret', l: 1 }, 'the unlocked pick is worn; the locked one is not');
  const progress = ws.sent.find((m) => m.t === 'progress');
  assert.ok(progress?.t === 'progress' && progress.level === 1 && progress.equipped.helmet === 'h_beret' && progress.challenges.daily.length === 3, 'a progress message follows welcome');
  ws.send({ t: 'equip', slot: 'helmet', id: 'h_crown' });
  assert.ok(ws.sent.some((m) => m.t === 'error' && m.message.includes('locked')));
  assert.equal(me.cos?.h, 'h_beret');
  ws.send({ t: 'equip', slot: 'helmet', id: 'h_standard' });
  assert.deepEqual(me.cos, { l: 1 });
  const last = [...ws.sent].reverse().find((m) => m.t === 'equipped');
  assert.ok(last?.t === 'equipped' && last.equipped.helmet === 'h_standard');
  const bots = [...room.world.players.values()].filter((p) => p.kind === 'bot');
  assert.ok(bots.length > 0 && bots.some((b) => b.cos !== null), 'bots show variety');
  for (const b of bots) assert.deepEqual(b.cos, botCosmetics(b.name));
});
