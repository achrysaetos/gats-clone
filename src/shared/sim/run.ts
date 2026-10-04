import { ZOM, ZOMBIE_KINDS, ZOMBIES, type ZombieKind } from '../defs.ts';
import { MAPS } from '../maps.ts';
import { tickHorde } from './horde.ts';
import { circleHitsRect } from './movement.ts';
import { addScore, freshLife, resetProgress } from './stats.ts';
import { loadMap, newId, newRun, rand, solidRects, spawnPoint, type Player, type Run, type RunStats, type World, type Zombie } from './world.ts';

const humans = (w: World) => [...w.players.values()].filter((p) => p.kind === 'human').length;

export const zombieMaxHp = (kind: ZombieKind, night: number) => ZOMBIES[kind].hp * ZOM.nightMul(night).hp;

export function statsFor(run: Run, p: Player): RunStats {
  let s = run.stats.get(p.id);
  if (!s) run.stats.set(p.id, (s = { name: p.name, kills: 0, revives: 0, built: 0 }));
  return s;
}

/** A zombie's death pays its killer score toward the gun ladder and the squad scrap for walls. */
export function damageZombie(w: World, z: Zombie, amount: number, attacker: Player | null) {
  const run = w.run;
  if (!run || z.hp <= 0) return;
  const dealt = Math.min(z.hp, amount);
  z.hp -= amount;
  w.events.push({ e: 'dmg', attacker: attacker?.id ?? null, victim: z.id, amount: Math.round(dealt * 10) / 10, x: z.x, y: z.y, kind: 'zombie' });
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

/** The night's zombies in spawn order, each kind drawn by its share of the night. */
function buildWave(w: World, night: number): ZombieKind[] {
  const shares = ZOMBIE_KINDS.map((kind) => ZOM.share(kind, night));
  const total = shares.reduce((a, b) => a + b, 0);
  return Array.from({ length: ZOM.waveSize(night, humans(w)) }, () => {
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
  if (run.core.hp <= 0) {
    run.phase = { k: 'over', night: run.night, restartAt: w.now + ZOM.restartMs };
    w.zombies = [];
  }
}
