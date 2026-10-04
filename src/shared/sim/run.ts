import { BUILDINGS, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type ZombieKind } from '../defs.ts';
import { MAPS } from '../maps.ts';
import { tickHorde } from './horde.ts';
import { circleHitsRect, dist2, rectsOverlap } from './movement.ts';
import { addScore, freshLife, resetProgress } from './stats.ts';
import { cellRect, coreRect, coverRects, loadMap, newId, newRun, rand, sameTeam, solidRects, spawnPoint, type Building, type Player, type Run, type RunStats, type World, type Zombie } from './world.ts';

function squadOf(w: World) {
  const squad = { humans: 0, bots: 0 };
  for (const p of w.players.values()) squad[p.kind === 'human' ? 'humans' : 'bots']++;
  return squad;
}

export const zombieMaxHp = (kind: ZombieKind, night: number) => ZOMBIES[kind].hp * ZOM.nightMul(night).hp;

function statsFor(run: Run, p: Player): RunStats {
  let s = run.stats.get(p.id);
  if (!s) run.stats.set(p.id, (s = { name: p.name, kills: 0, revives: 0, built: 0 }));
  return s;
}

export function goDown(w: World, p: Player) {
  p.life = { k: 'downed', bleedOutAt: w.now + ZOM.bleedOutMs, reviveProgress: 0 };
  w.events.push({ e: 'life', id: p.id, name: p.name, k: 'downed', by: null });
}

function tickDowned(w: World, run: Run, p: Player, dtMs: number, revivers: Set<Player>) {
  const life = p.life;
  if (life.k !== 'downed') return;
  if (w.now >= life.bleedOutAt) {
    p.life = { k: 'dead', respawnAt: Infinity };
    p.deaths++;
    w.events.push({ e: 'life', id: p.id, name: p.name, k: 'bledOut', by: null });
    return;
  }
  const reviver = [...w.players.values()].find((o) => o.life.k === 'alive' && o.input.use && sameTeam(o, p) && dist2(o.x, o.y, p.x, p.y) <= ZOM.reviveRange ** 2);
  if (!reviver) { life.reviveProgress = 0; return; }
  revivers.add(reviver);
  life.reviveProgress += dtMs;
  if (life.reviveProgress < ZOM.reviveMs) return;
  const revived = freshLife(p, w.now);
  revived.hp *= ZOM.reviveHpFrac;
  revived.lastDamageAt = w.now;
  p.life = revived;
  statsFor(run, reviver).revives++;
  w.events.push({ e: 'life', id: p.id, name: p.name, k: 'revived', by: reviver.id });
}

function repair(w: World, run: Run, p: Player, dtMs: number) {
  let best: Building | null = null, bestD = ZOM.reachPx ** 2;
  for (const b of w.buildings) {
    const d = dist2(p.x, p.y, (b.cx + 0.5) * ZOM.cell, (b.cy + 0.5) * ZOM.cell);
    if (b.hp < BUILDINGS[b.kind].hp && d <= bestD) { best = b; bestD = d; }
  }
  if (!best) return;
  const hp = Math.min((ZOM.repairHpPerSec * dtMs) / 1000, BUILDINGS[best.kind].hp - best.hp, run.scrap / ZOM.repairScrapPerHp);
  best.hp += hp;
  run.scrap -= hp * ZOM.repairScrapPerHp;
}

function tickSquad(w: World, run: Run, dtMs: number) {
  const revivers = new Set<Player>();
  for (const p of w.players.values()) tickDowned(w, run, p, dtMs, revivers);
  for (const p of w.players.values()) if (p.life.k === 'alive' && p.input.use && !revivers.has(p)) repair(w, run, p, dtMs);
}

/** Why a wall cannot go up, or null once it has. */
export type BuildRefusal = 'notDay' | 'farFromCore' | 'outOfReach' | 'cover' | 'core' | 'body' | 'taken' | 'scrap';

const cellCenter = (cx: number, cy: number) => ({ x: (cx + 0.5) * ZOM.cell, y: (cy + 0.5) * ZOM.cell });

function buildRefusal(w: World, run: Run, p: Player, cx: number, cy: number): BuildRefusal | null {
  const core = coreRect(w);
  if (run.phase.k !== 'day' || p.life.k !== 'alive' || !core) return 'notDay';
  const at = cellCenter(cx, cy);
  if (dist2(at.x, at.y, core.x + core.w / 2, core.y + core.h / 2) > ZOM.buildRadius ** 2) return 'farFromCore';
  if (dist2(at.x, at.y, p.x, p.y) > ZOM.reachPx ** 2) return 'outOfReach';
  const cell = cellRect(cx, cy);
  if (coverRects(w).some((r) => rectsOverlap(r, cell))) return 'cover';
  if (rectsOverlap(core, cell)) return 'core';
  const bodies = [
    ...[...w.players.values()].filter((o) => o.life.k !== 'dead').map((o) => ({ x: o.x, y: o.y, r: WORLD.playerRadius })),
    ...w.zombies.map((z) => ({ x: z.x, y: z.y, r: ZOMBIES[z.kind].radius })),
  ];
  if (bodies.some((b) => circleHitsRect(b.x, b.y, b.r, cell))) return 'body';
  if (w.buildings.some((b) => b.cx === cx && b.cy === cy)) return 'taken';
  if (run.scrap < BUILDINGS.wall.cost) return 'scrap';
  return null;
}

export function build(w: World, id: number, cx: number, cy: number): BuildRefusal | null {
  const p = w.players.get(id);
  const run = w.run;
  if (!p || !run) return 'notDay';
  const refusal = buildRefusal(w, run, p, cx, cy);
  if (refusal) return refusal;
  run.scrap -= BUILDINGS.wall.cost;
  w.buildings.push({ id: newId(w), kind: 'wall', cx, cy, hp: BUILDINGS.wall.hp });
  w.buildingsVersion++;
  statsFor(run, p).built++;
  return null;
}

export function demolish(w: World, id: number, cx: number, cy: number): boolean {
  const p = w.players.get(id);
  const run = w.run;
  const wall = w.buildings.find((b) => b.cx === cx && b.cy === cy);
  if (!p || !run || !wall || run.phase.k !== 'day' || p.life.k !== 'alive') return false;
  const at = cellCenter(cx, cy);
  if (dist2(at.x, at.y, p.x, p.y) > ZOM.reachPx ** 2) return false;
  w.buildings = w.buildings.filter((b) => b !== wall);
  w.buildingsVersion++;
  run.scrap += Math.floor(BUILDINGS[wall.kind].cost * ZOM.demolishRefund);
  return true;
}

/** One hit marker per zombie and attacker a tick, so a shotgun's pellets in one zombie read as one hit. */
function markHit(w: World, z: Zombie, dealt: number, attacker: number | null) {
  const same = w.events.find((e) => e.e === 'dmg' && e.kind === 'zombie' && e.victim === z.id && e.attacker === attacker);
  const amount = Math.round(((same?.e === 'dmg' ? same.amount : 0) + dealt) * 10) / 10;
  if (same?.e === 'dmg') same.amount = amount;
  else w.events.push({ e: 'dmg', attacker, victim: z.id, amount, x: z.x, y: z.y, kind: 'zombie' });
}

/**
 * A zombie's death pays its killer score toward the gun ladder and the squad scrap for walls.
 * `marked` sends the hit to the client; a blast leaves it off, since its boom already shows and a crowd would fill the snapshot with hits.
 */
export function damageZombie(w: World, z: Zombie, amount: number, attacker: Player | null, marked = true) {
  const run = w.run;
  if (!run || z.hp <= 0) return;
  const dealt = Math.min(z.hp, amount);
  z.hp -= amount;
  if (marked) markHit(w, z, dealt, attacker?.id ?? null);
  if (z.hp > 0) return;
  const def = ZOMBIES[z.kind];
  w.zombies = w.zombies.filter((o) => o !== z);
  run.scrap += def.scrap;
  w.events.push({ e: 'zkill', id: z.id, kind: z.kind, x: z.x, y: z.y, by: attacker?.id ?? null });
  if (!attacker) return;
  attacker.kills++;
  statsFor(run, attacker).kills++;
  addScore(w, attacker, def.score);
}

function buildWave(w: World, night: number): ZombieKind[] {
  const shares = ZOMBIE_KINDS.map((kind) => ZOM.share(kind, night));
  const total = shares.reduce((a, b) => a + b, 0);
  return Array.from({ length: ZOM.waveSize(night, squadOf(w)) }, () => {
    let roll = rand(w) * total;
    return ZOMBIE_KINDS.find((_, i) => (roll -= shares[i]!) < 0) ?? 'walker';
  });
}

function spawnZombie(w: World, run: Run, kind: ZombieKind) {
  const horde = MAPS[w.map].siege?.horde ?? [];
  const solids = solidRects(w);
  const r = ZOMBIES[kind].radius;
  for (let i = 0; i < 20; i++) {
    const region = horde[Math.floor(rand(w) * horde.length)]!;
    const x = region.x + rand(w) * region.w, y = region.y + rand(w) * region.h;
    if (solids.some((b) => circleHitsRect(x, y, r, b))) continue;
    w.zombies.push({ id: newId(w), kind, x, y, hp: zombieMaxHp(kind, run.night), attackAt: 0 });
    return;
  }
}

function placeAtCore(w: World, p: Player) {
  const at = spawnPoint(w, p.team);
  p.x = at.x;
  p.y = at.y;
}

/** Everyone down or dead gets up at the core; what they earned this run stays with them. */
function dawn(w: World, run: Run) {
  run.night++;
  run.phase = { k: 'day', endsAt: w.now + ZOM.dayMs };
  for (const p of w.players.values()) {
    if (p.life.k === 'alive') continue;
    placeAtCore(w, p);
    p.life = freshLife(p, w.now);
  }
}

function restartRun(w: World) {
  loadMap(w, w.map);
  w.run = newRun(w.now);
  const players = [...w.players.values()];
  for (const p of players) { p.x = -Infinity; p.y = -Infinity; }
  for (const p of players) {
    resetProgress(p);
    p.kills = 0;
    p.deaths = 0;
    placeAtCore(w, p);
    p.life = freshLife(p, w.now);
  }
}

/** The run's state machine: the day counts down to night, the night spawns its wave and turns to day once the wave is dead, and the core's fall ends the run until a fresh one starts. */
export function tickRun(w: World, dtMs: number) {
  const run = w.run;
  if (!run) return;
  const phase = run.phase;
  switch (phase.k) {
    case 'day':
      if (w.now >= phase.endsAt) run.phase = { k: 'night', toSpawn: buildWave(w, run.night), nextSpawnAt: w.now };
      break;
    case 'night':
      if (phase.toSpawn.length > 0 && w.now >= phase.nextSpawnAt && w.zombies.length < ZOM.maxAlive) {
        spawnZombie(w, run, phase.toSpawn.shift()!);
        phase.nextSpawnAt = w.now + ZOM.spawnGapMs(run.night);
      }
      if (phase.toSpawn.length === 0 && w.zombies.length === 0) dawn(w, run);
      break;
    case 'over':
      if (w.now >= phase.restartAt) restartRun(w);
      return;
  }
  tickHorde(w, run, dtMs);
  tickSquad(w, run, dtMs);
  if (run.core.hp <= 0) {
    run.phase = { k: 'over', night: run.night, restartAt: w.now + ZOM.restartMs };
    w.zombies = [];
  }
}
