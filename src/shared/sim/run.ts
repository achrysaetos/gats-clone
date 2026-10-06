import { BUILDINGS, hordeCount, isBoss, NIGHTS, nightOf, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type BuildingKind, type Burst, type TurretKind, type ZombieKind } from '../defs.ts';
import { MAPS } from '../maps.ts';
import { biteBuilding, distToRect, hurtCore, tickHorde } from './horde.ts';
import { explode } from './combat.ts';
import { tickTurrets } from './turrets.ts';
import { buildingView, buildRefusal, cellRect, refundFor, repairScrapPerHp, serviceTarget, type BuildRefusal, type BuildSite } from './build.ts';
import { circleHitsRect, clamp, dist2, type Rect } from './movement.ts';
import { addScore, freshLife, resetProgress } from './stats.ts';
import { tickDowned } from './downed.ts';
import { coreRect, coverRects, loadMap, newId, newRun, rand, solidRects, spawnPoint, type Building, type HordeUnit, type Player, type Run, type RunStats, type Shooter, type World, type Zombie } from './world.ts';

function squadOf(w: World) {
  const squad = { humans: 0, bots: 0 };
  for (const p of w.players.values()) squad[p.kind === 'human' ? 'humans' : 'bots']++;
  return squad;
}

export const zombieMaxHp = (kind: ZombieKind, night: number, share: number) => ZOMBIES[kind].hp * ZOM.nightMul(night).hp * (isBoss(kind) ? share : 1);

function statsFor(run: Run, p: Player): RunStats {
  let s = run.stats.get(p.id);
  if (!s) run.stats.set(p.id, (s = { name: p.name, kills: 0, revives: 0, built: 0 }));
  return s;
}

function tickSquadmate(w: World, run: Run, p: Player, dtMs: number, revivers: Set<Player>) {
  const outcome = tickDowned(w, p, dtMs, revivers);
  if (outcome === 'bledOut') {
    p.life = { k: 'dead', respawnAt: w.now + ZOM.reinforce.ms };
    p.deaths++;
  } else if (outcome) statsFor(run, outcome).revives++;
}

function service(w: World, run: Run, p: Player, dtMs: number) {
  const core = MAPS[w.map].siege!.core;
  const target = serviceTarget(p, { ...core, hp: Math.ceil(run.core.hp), maxHp: ZOM.coreHp }, w.buildings.map((b) => ({ ...buildingView(b), b })));
  if (!target) return;
  const mend = (it: { hp: number }, max: number, perHp: number) => {
    const hp = Math.min((ZOM.repairHpPerSec * dtMs) / 1000, max - it.hp, run.scrap / perHp);
    it.hp += hp;
    run.scrap -= hp * perHp;
  };
  if (target.on === 'core') { mend(run.core, ZOM.coreHp, ZOM.coreRepairScrapPerHp); return; }
  const b = target.on.b;
  if (target.job === 'repair' || b.kind === 'wall') { mend(b, BUILDINGS[b.kind].hp, repairScrapPerHp(b.kind)); return; }
  const def = BUILDINGS[b.kind].turret;
  const rounds = Math.min((def.ammo * dtMs) / ZOM.refillMs, def.ammo - b.ammo, run.scrap / def.scrapPerRound);
  b.ammo += rounds;
  run.scrap -= rounds * def.scrapPerRound;
}

function reinforce(w: World, run: Run) {
  for (const p of w.players.values()) {
    const cost = ZOM.reinforce.survivors(run.night);
    if (p.life.k !== 'dead' || w.now < p.life.respawnAt || run.survivors <= cost) continue;
    run.survivors -= cost;
    run.lost += cost;
    placeAtCore(w, p);
    p.life = freshLife(p, w.now);
    w.events.push({ e: 'life', id: p.id, name: p.name, k: 'revived', by: null });
  }
}

function tickSquad(w: World, run: Run, dtMs: number) {
  if (run.phase.k === 'night') reinforce(w, run);
  const revivers = new Set<Player>();
  for (const p of w.players.values()) tickSquadmate(w, run, p, dtMs, revivers);
  for (const p of w.players.values()) if (p.life.k === 'alive' && p.input.use && !revivers.has(p)) service(w, run, p, dtMs);
}

const cellCenter = (cx: number, cy: number) => ({ x: (cx + 0.5) * ZOM.cell, y: (cy + 0.5) * ZOM.cell });

function siteFor(w: World, run: Run, p: Player, core: Rect): BuildSite {
  const bodies = [
    ...[...w.players.values()].filter((o) => o.life.k !== 'dead').map((o) => ({ x: o.x, y: o.y, r: WORLD.playerRadius })),
    ...w.zombies.map((z) => ({ x: z.x, y: z.y, r: ZOMBIES[z.kind].radius })),
  ];
  return { day: run.phase.k === 'day', builder: p.life.k === 'alive' ? p : null, core, cover: coverRects(w), bodies, buildings: w.buildings.map(buildingView), scrap: run.scrap };
}

export function build(w: World, id: number, kind: BuildingKind, cx: number, cy: number): BuildRefusal | null {
  const p = w.players.get(id);
  const run = w.run;
  const core = coreRect(w);
  if (!p || !run || !core) return 'notDay';
  const refusal = buildRefusal(siteFor(w, run, p, core), kind, cx, cy);
  if (refusal) return refusal;
  run.scrap -= BUILDINGS[kind].cost;
  const at = { id: newId(w), cx, cy, hp: BUILDINGS[kind].hp };
  w.buildings.push(kind === 'wall' ? { ...at, kind } : { ...at, kind, owner: p.id, ammo: BUILDINGS[kind].turret.ammo, nextFireAt: 0 });
  w.buildingsVersion++;
  statsFor(run, p).built++;
  return null;
}

export function demolish(w: World, id: number, cx: number, cy: number): boolean {
  const p = w.players.get(id);
  const run = w.run;
  const building = w.buildings.find((b) => b.cx === cx && b.cy === cy);
  if (!p || !run || !building || run.phase.k !== 'day' || p.life.k !== 'alive') return false;
  const at = cellCenter(cx, cy);
  if (dist2(at.x, at.y, p.x, p.y) > ZOM.reachPx ** 2) return false;
  w.buildings = w.buildings.filter((b) => b !== building);
  w.buildingsVersion++;
  run.scrap += refundFor(buildingView(building));
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
 * Only a player's own direct hit is sent to the client: a blast's boom already shows, and a crowd's worth of blast or turret hits would fill the snapshot.
 */
export function damageZombie(w: World, z: Zombie, amount: number, attacker: Player | null, via: 'hit' | 'blast' | Shooter = 'hit') {
  const run = w.run;
  if (!run || z.hp <= 0) return;
  const dealt = Math.min(z.hp, amount);
  z.hp -= amount;
  if (via === 'hit') markHit(w, z, dealt, attacker?.id ?? null);
  if (z.hp > 0) return;
  const def = ZOMBIES[z.kind];
  const shooter = via === 'hit' || via === 'blast' ? null : via;
  w.zombies = w.zombies.filter((o) => o !== z);
  run.scrap += def.scrap;
  w.events.push({ e: 'zkill', id: z.id, kind: z.kind, x: z.x, y: z.y, by: shooter ? null : attacker?.id ?? null });
  if (shooter === 'bastion') run.bastionKills++;
  else if (shooter) run.turretKills[shooter][z.kind]++;
  else if (attacker) { attacker.kills++; statsFor(run, attacker).kills++; }
  if (attacker) addScore(w, attacker, def.score);
  if (def.burst) burst(w, run, z, def.burst);
}

function burst(w: World, run: Run, z: Zombie, { radius, damage, building, core: coreBlow }: Burst) {
  explode(w, z.x, z.y, radius, damage, { attacker: null, team: null, label: ZOMBIES[z.kind].name });
  for (const b of w.buildings) if (distToRect(z.x, z.y, cellRect(b.cx, b.cy)) <= radius) biteBuilding(w, b, building);
  if (distToRect(z.x, z.y, coreRect(w)!) <= radius) hurtCore(run, coreBlow * (1 - ZOM.coreArmor));
}

function burnStragglers(w: World) {
  for (const z of w.zombies) w.events.push({ e: 'zkill', id: z.id, kind: z.kind, x: z.x, y: z.y, by: null });
  w.zombies = [];
}

function hordeOf(w: World, night: number, share: number): HordeUnit[] {
  const def = nightOf(night);
  const units: HordeUnit[] = [];
  for (const kind of ZOMBIE_KINDS) {
    for (let left = hordeCount(kind, def.horde[kind] ?? 0, share); left > 0; left -= ZOMBIES[kind].pack) {
      units.push({ kind, side: def.from[Math.floor(rand(w) * def.from.length)]!, n: Math.min(left, ZOMBIES[kind].pack) });
    }
  }
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(rand(w) * (i + 1));
    [units[i], units[j]] = [units[j]!, units[i]!];
  }
  return units;
}

const PACK_SPREAD = 90;

function spawnUnit(w: World, run: Run, { kind, side, n }: HordeUnit) {
  const strip = MAPS[w.map].siege!.horde[side];
  const solids = solidRects(w);
  const r = ZOMBIES[kind].radius;
  const ax = strip.x + rand(w) * strip.w, ay = strip.y + rand(w) * strip.h;
  for (let placed = 0, tries = 0; placed < n && tries < 20 * n; tries++) {
    const x = clamp(ax + (rand(w) - 0.5) * PACK_SPREAD, strip.x, strip.x + strip.w), y = clamp(ay + (rand(w) - 0.5) * PACK_SPREAD, strip.y, strip.y + strip.h);
    if (solids.some((b) => circleHitsRect(x, y, r, b))) continue;
    w.zombies.push({ id: newId(w), kind, x, y, hp: zombieMaxHp(kind, run.night, run.share), attackAt: 0, vx: 0, vy: 0 });
    placed++;
  }
}

function placeAtCore(w: World, p: Player) {
  const at = spawnPoint(w, p.team);
  p.x = at.x;
  p.y = at.y;
}

function dawn(w: World, run: Run) {
  if (run.night === NIGHTS.length) { endRun(w, run, true); return; }
  run.scrap += run.survivors * ZOM.scrapPerSurvivor;
  run.night++;
  run.phase = { k: 'day', endsAt: w.now + ZOM.dayMs };
  for (const p of w.players.values()) {
    if (p.life.k === 'alive') continue;
    placeAtCore(w, p);
    p.life = freshLife(p, w.now);
  }
}

function endRun(w: World, run: Run, won: boolean) {
  for (const p of w.players.values()) statsFor(run, p);
  if (!won) { run.lost += run.survivors; run.survivors = 0; }
  run.phase = { k: 'over', night: run.night, won, restartAt: w.now + ZOM.restartMs };
  w.zombies = [];
}

export function toggleReady(w: World, id: number) {
  const run = w.run, p = w.players.get(id);
  if (!run || run.phase.k !== 'day' || p?.kind !== 'human') return;
  if (!run.ready.delete(id)) run.ready.add(id);
}

function squadReady(w: World, run: Run) {
  const humans = [...w.players.values()].filter((p) => p.kind === 'human' && p.life.k === 'alive');
  return humans.length > 0 && humans.every((p) => run.ready.has(p.id));
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

export function tickRun(w: World, dtMs: number) {
  const run = w.run;
  if (!run) return;
  const phase = run.phase;
  switch (phase.k) {
    case 'day':
      if (w.now >= phase.endsAt || squadReady(w, run)) {
        run.share = ZOM.hordeShare(squadOf(w));
        run.phase = { k: 'night', toSpawn: hordeOf(w, run.night, run.share), nextSpawnAt: w.now, dawnAt: Infinity };
        run.ready.clear();
        run.lost = 0;
      }
      break;
    case 'night':
      if (phase.toSpawn.length > 0 && w.now >= phase.nextSpawnAt && w.zombies.length < ZOM.maxAlive) {
        const wave = phase.toSpawn.splice(0, ZOM.packsPerWave(run.night));
        for (const unit of wave) spawnUnit(w, run, unit);
        phase.nextSpawnAt = w.now + wave.length * ZOM.packGapMs(run.night);
        if (phase.toSpawn.length === 0) phase.dawnAt = w.now + ZOM.stragglersMs;
      }
      if (w.now >= phase.dawnAt) burnStragglers(w);
      if (phase.toSpawn.length === 0 && w.zombies.length === 0) dawn(w, run);
      break;
    case 'over':
      if (w.now >= phase.restartAt) restartRun(w);
      return;
  }
  tickHorde(w, run, dtMs);
  tickTurrets(w, run, MAPS[w.map].siege!.core, dtMs);
  tickSquad(w, run, dtMs);
  if (run.core.hp <= 0 || run.survivors <= 0) endRun(w, run, false);
}
