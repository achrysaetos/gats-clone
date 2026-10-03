import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABILITY_COOLDOWN_MS, ARMOR_ABSORB, ARMORS, WEAPONS, WORLD } from '../src/shared/defs.ts';
import {
  addPlayer, canRespawn, choosePerk, createWorld, rand, respawn, setInput, snapshotFor, step,
} from '../src/shared/sim.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { emptyWorld, grantPerks, hpOf, press, run, shootOnce, shootUntilDead, spawnAt, TICK_MS } from './helpers.ts';

const PISTOL_DMG = WEAPONS.pistol.damage;

// Defect: armor ignored, or absorbing the wrong share.
test('armor absorbs ARMOR_ABSORB of a hit and depletes', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500, { loadout: { armor: 'medium' } });
  shootOnce(w, a, 0);
  assert.ok(b.life.k === 'alive');
  assert.equal(b.life.hp, WORLD.baseHp - PISTOL_DMG * (1 - ARMOR_ABSORB));
  assert.equal(b.life.armor, ARMORS.medium.points - PISTOL_DMG * ARMOR_ABSORB);
});

// Defect: piercing perk not consulted when applying armor.
test('piercing bullets bypass armor entirely', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500, { loadout: { armor: 'heavy' } });
  grantPerks(w, a, ['piercing']);
  shootOnce(w, a, 0);
  assert.ok(b.life.k === 'alive');
  assert.equal(b.life.hp, WORLD.baseHp - PISTOL_DMG);
  assert.equal(b.life.armor, ARMORS.heavy.points);
});

// Defect: bullets ignore walls (tunnel through) or skip the rect test.
test('walls stop bullets', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 800, 500);
  w.walls.push({ x: 640, y: 400, w: 20, h: 200, built: false, expiresAt: Infinity });
  shootOnce(w, a, 0, 1000);
  assert.equal(hpOf(b), WORLD.baseHp, 'target behind wall untouched');
  assert.equal(w.bullets.length, 0, 'bullet removed at the wall');

  w.walls = [];
  shootOnce(w, a, 0, 1000);
  assert.ok(hpOf(b) < WORLD.baseHp, 'same shot without the wall hits');
});

// Defect: kill grants no score, or level/pending tier do not follow LEVEL_SCORES.
test('kills award killScore and unlock perk tiers at thresholds', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const killOne = () => {
    const v = spawnAt(w, 650, 500);
    if (v.life.k === 'alive') v.life.hp = 1;
    shootOnce(w, a, 0);
    assert.equal(v.life.k, 'dead');
  };
  killOne();
  let self = snapshotFor(w, a.id).self;
  assert.equal(a.score, WORLD.killScore);
  assert.equal(a.level, 1);
  assert.equal(self.pendingTier, 1);
  assert.equal(self.kills, 1);

  killOne();
  killOne();
  assert.equal(a.score, 3 * WORLD.killScore);
  assert.equal(a.level, 2);
  assert.equal(snapshotFor(w, a.id).self.pendingTier, 1, 'tier 1 stays pending until chosen');
  assert.ok(choosePerk(w, a.id, 1, 'grip'));
  self = snapshotFor(w, a.id).self;
  assert.equal(self.pendingTier, 2);
  assert.equal(self.perks[1], 'grip');
  assert.equal(choosePerk(w, a.id, 3, 'dash'), false, 'cannot skip to a locked tier');
});

// Defect: perk chosen but derived stats unchanged.
test('extended mag enlarges the magazine', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  assert.equal(snapshotFor(w, a.id).self.mag, WEAPONS.pistol.mag);
  grantPerks(w, a, ['extended']);
  assert.equal(snapshotFor(w, a.id).self.mag, Math.round(WEAPONS.pistol.mag * 1.5));
});

test('lightweight moves 10% faster', () => {
  const distanceIn1s = (lightweight: boolean) => {
    const w = emptyWorld();
    const a = spawnAt(w, 500, 500);
    if (lightweight) grantPerks(w, a, ['lightweight']);
    press(w, a, { right: true });
    run(w, 1000);
    return a.x - 500;
  };
  const base = distanceIn1s(false);
  assert.ok(Math.abs(base - WORLD.baseSpeed) < WORLD.baseSpeed * 0.05, `base speed ${base}`);
  assert.ok(Math.abs(distanceIn1s(true) / base - 1.1) < 0.01);
});

// Defect: dead players still move/shoot, or respawn ignores respawnAt.
test('dead player cannot act and respawns after respawnMs', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 650, 500);
  if (b.life.k === 'alive') b.life.hp = 1;
  shootOnce(w, a, 0);
  assert.equal(b.life.k, 'dead');

  const { x, y } = b;
  press(w, b, { right: true, fire: true, angle: Math.PI });
  run(w, 1000);
  assert.deepEqual([b.x, b.y], [x, y], 'dead player did not move');
  assert.equal(w.bullets.filter((bu) => bu.owner === b.id).length, 0, 'dead player did not shoot');
  assert.equal(hpOf(a), WORLD.baseHp);
  assert.equal(respawn(w, b.id, b.loadout), false, 'too early to respawn');
  assert.ok(snapshotFor(w, b.id).self.respawnIn > 0);

  run(w, WORLD.respawnMs);
  assert.ok(canRespawn(w, b.id));
  assert.ok(respawn(w, b.id, { weapon: 'smg', armor: 'light', color: 'blue' }));
  assert.equal(hpOf(b), WORLD.baseHp);
  assert.equal(b.loadout.weapon, 'smg');
  assert.equal(snapshotFor(w, b.id).self.respawnIn, 0);
});

// Defect: friendly fire applies in team modes.
test('TDM friendly fire does no damage but enemies still take hits', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red' });
  const mate = spawnAt(w, 650, 500, { team: 'red' });
  const foe = spawnAt(w, 800, 500, { team: 'blue' });
  shootOnce(w, a, 0, 800);
  assert.equal(hpOf(mate), WORLD.baseHp);
  assert.ok(hpOf(foe) < WORLD.baseHp, 'bullet passed the teammate and hit the enemy');
});

test('TDM grenades spare teammates', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red' });
  const mate = spawnAt(w, 700, 480, { team: 'red' });
  const foe = spawnAt(w, 700, 520, { team: 'blue' });
  grantPerks(w, a, ['grip', 'thickSkin', 'grenade']);
  press(w, a, { ability: true, angle: 0, aimDist: 200 });
  run(w, 2000);
  assert.equal(hpOf(mate), WORLD.baseHp);
  assert.ok(hpOf(foe) < WORLD.baseHp);
});

test('TDM auto-balances teams', () => {
  const w = emptyWorld('TDM');
  const teams = Array.from({ length: 6 }, () => addPlayer(w, 'x', randomLoadout(Math.random)).team);
  assert.equal(teams.filter((t) => t === 'red').length, 3);
  assert.equal(teams.filter((t) => t === 'blue').length, 3);
});

// Defect: zones never capture, never score, or the round never ends/resets.
test('DOM zone capture scores for the team, declares a winner, then resets', () => {
  const w = emptyWorld('DOM');
  const zone = w.zones[0];
  const p = spawnAt(w, zone.x, zone.y, { team: 'red' });
  run(w, 3500);
  assert.equal(snapshotFor(w, p.id).zones[0].owner, 'red');
  assert.ok(w.teamScore.red > 0);
  assert.equal(w.teamScore.blue, 0);

  for (let t = 0; t < 300_000 && w.match.k === 'playing'; t += TICK_MS) step(w, TICK_MS);
  const match = snapshotFor(w, p.id).match;
  assert.equal(match.winner, 'Red team');
  assert.ok(match.teamScore.red >= WORLD.domWinScore);

  run(w, WORLD.roundRestartMs + 100);
  const after = snapshotFor(w, p.id).match;
  assert.equal(after.winner, null);
  assert.ok(after.teamScore.red < 10, `scores reset (${after.teamScore.red})`);
});

test('TDM team reaching tdmWinScore kills wins', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'blue' });
  for (let i = 0; i < WORLD.tdmWinScore; i++) {
    const v = spawnAt(w, 650, 500, { team: 'red' });
    shootUntilDead(w, a, v);
    w.players.delete(v.id);
  }
  assert.equal(snapshotFor(w, a.id).match.winner, 'Blue team');
});

// Defect: crate destruction awards nothing or the crate never respawns.
test('destroying a crate awards crateScore and it respawns later', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  w.crates.push({ id: 999, x: 600, y: 478, size: 44, hp: WORLD.crateHp, respawnAt: null });
  const shots = Math.ceil(WORLD.crateHp / PISTOL_DMG);
  for (let i = 0; i < shots; i++) shootOnce(w, a, 0, 300);
  assert.equal(a.score, WORLD.crateScore);
  assert.ok(!snapshotFor(w, a.id).crates.some((c) => c.id === 999), 'destroyed crate hidden');
  run(w, 20_000);
  assert.ok(snapshotFor(w, a.id).crates.some((c) => c.id === 999 && c.hp === WORLD.crateHp), 'crate respawned');
});

// Defect: abilities fire every tick the key is held (cooldown ignored).
test('ability respects its cooldown', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  grantPerks(w, a, ['grip', 'thickSkin', 'engineer']);
  const built = () => w.walls.filter((x) => x.built).length;
  press(w, a, { ability: true, angle: 0 });
  step(w, TICK_MS);
  assert.equal(built(), 1);
  const version = w.wallsVersion;
  run(w, 2000);
  assert.equal(built(), 1, 'held key during cooldown builds nothing');
  assert.equal(w.wallsVersion, version);
  assert.ok(snapshotFor(w, a.id).self.abilityReadyIn > 0);
  run(w, ABILITY_COOLDOWN_MS.engineer);
  assert.ok(built() >= 1 && w.wallsVersion > version, 'ready again after cooldown');
});

test('engineer wall stops bullets in the aim direction', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 800, 500);
  grantPerks(w, a, ['grip', 'thickSkin', 'engineer']);
  press(w, a, { ability: true, angle: 0 });
  step(w, TICK_MS);
  shootOnce(w, a, 0, 800);
  assert.equal(hpOf(b), WORLD.baseHp);
});

test('frag grenade damages a nearby enemy', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500);
  grantPerks(w, a, ['grip', 'thickSkin', 'fragGrenade']);
  press(w, a, { ability: true, angle: 0, aimDist: 200 });
  run(w, 2000);
  assert.ok(hpOf(b) < WORLD.baseHp);
});

test('enemy land mine is hidden but its owner sees it', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 800, 500);
  grantPerks(w, a, ['grip', 'thickSkin', 'landMine']);
  press(w, a, { ability: true });
  step(w, TICK_MS);
  assert.equal(snapshotFor(w, a.id).thrown.filter((t) => t.kind === 'landMine').length, 1);
  assert.equal(snapshotFor(w, b.id).thrown.filter((t) => t.kind === 'landMine').length, 0);
});

// Defect: snapshot leaks positions outside the view radius, or the minimap ignores firing/silencer.
test('snapshot culls out-of-view enemies; minimap shows them only after unsilenced fire', () => {
  const w = emptyWorld();
  const me = spawnAt(w, 300, 300);
  const near = spawnAt(w, 600, 300);
  const far = spawnAt(w, 2600, 2600);
  const ids = () => snapshotFor(w, me.id).players.map((p) => p.id);
  assert.ok(ids().includes(near.id));
  assert.ok(!ids().includes(far.id));
  assert.equal(snapshotFor(w, me.id).minimap.length, 0);

  shootOnce(w, far, Math.PI / 2, 100);
  assert.deepEqual(snapshotFor(w, me.id).minimap.map((m) => [m.x, m.y]), [[far.x, far.y]]);
  run(w, 3000);
  assert.equal(snapshotFor(w, me.id).minimap.length, 0, 'reveal expires');

  grantPerks(w, far, ['silencer']);
  shootOnce(w, far, Math.PI / 2, 100);
  assert.equal(snapshotFor(w, me.id).minimap.length, 0, 'silenced shot stays off the minimap');
});

test('minimap always shows teammates', () => {
  const w = emptyWorld('TDM');
  const me = spawnAt(w, 300, 300, { team: 'red' });
  spawnAt(w, 2600, 2600, { team: 'red' });
  spawnAt(w, 2600, 300, { team: 'blue' });
  assert.deepEqual(snapshotFor(w, me.id).minimap.map((m) => m.team), ['red']);
});

// Defect: map generation uses unseeded randomness.
test('same seed builds the same map', () => {
  const a = createWorld('FFA', 7), b = createWorld('FFA', 7), c = createWorld('FFA', 8);
  assert.deepEqual(a.walls, b.walls);
  assert.deepEqual(a.crates, b.crates);
  assert.notDeepEqual(a.walls, c.walls);
  assert.equal(a.crates.length, WORLD.crateCount);
});

// Defect: players walk through walls or off the map.
test('players collide with walls and map edges', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  w.walls.push({ x: 600, y: 300, w: 50, h: 400, built: false, expiresAt: Infinity });
  press(w, a, { right: true });
  run(w, 2000);
  assert.ok(a.x <= 600 - WORLD.playerRadius + 0.01, `stopped at wall (${a.x})`);
  press(w, a, { up: true });
  run(w, 5000);
  assert.equal(a.y, WORLD.playerRadius);
});

test('bots fighting each other produce a kill within 60 simulated seconds', () => {
  const w = createWorld('FFA', 3);
  const r = () => rand(w);
  const mems = new Map<number, BotMemory>();
  for (let i = 0; i < WORLD.minPlayers; i++) mems.set(addPlayer(w, `bot${i}`, randomLoadout(r), { isBot: true }).id, newBotMemory(r));
  let kills = 0;
  for (let t = 0; t < 60_000 && kills === 0; t += TICK_MS) {
    for (const [id, mem] of mems) {
      const d = botThink(snapshotFor(w, id), mem, r);
      mems.set(id, d.mem);
      setInput(w, id, t, d.input);
    }
    step(w, TICK_MS);
    kills += w.events.filter((e) => e.e === 'kill').length;
  }
  assert.ok(kills > 0);
});
