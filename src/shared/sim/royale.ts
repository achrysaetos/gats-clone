import { COLOR_IDS, LEVELS, RING, ROYALE, WORLD, type ColorId } from '../defs.ts';
import { MAPS } from '../maps.ts';
import { ringAt, type Circle, type RingView, type RoundWinner, type RoyaleResult, type Team } from '../protocol.ts';
import { die, kill } from './combat.ts';
import { goDown, tickDowned } from './downed.ts';
import { circleHitsRect, dist2, rectsOverlap } from './movement.ts';
import { effectiveStats, freshLife, levelForScore, resetProgress } from './stats.ts';
import { coverRects, crateRect, newId, rand, spawnPoint, type Player, type Ring, type Royale, type RoyaleStats, type World } from './world.ts';

export const squadName = (team: ColorId) => `${team[0]!.toUpperCase()}${team.slice(1)} squad`;

const standing = (w: World, team: Team) => [...w.players.values()].some((p) => p.team === team && p.life.k === 'alive');

/** Phases closed so far: a waiting or shrinking phase has closed every phase before it. */
export const closedPhases = (ring: Ring) => (ring.k === 'closed' ? RING.length : ring.phase);
export const redeploysOpen = (r: Royale) => closedPhases(r.ring) < ROYALE.redeployPhases;

export function ringView(ring: Ring): RingView {
  switch (ring.k) {
    case 'waiting': return { phase: ring.phase, from: ring.circle, to: ring.next, shrinkAt: ring.shrinkAt, closeAt: ring.shrinkAt + RING[ring.phase]!.shrinkMs };
    case 'shrinking': return { phase: ring.phase, from: ring.from, to: ring.to, shrinkAt: ring.startAt, closeAt: ring.closeAt };
    case 'closed': return { phase: RING.length, from: ring.circle, to: ring.circle, shrinkAt: ring.closedAt, closeAt: ring.closedAt };
  }
}

export const safeCircle = (r: Royale, now: number): Circle => ringAt(ringView(r.ring), now);

const ringDps = (ring: Ring) => RING[ring.k === 'closed' ? RING.length - 1 : ring.phase]!.dps;

/** A random spot within `within` px of `c` where a player stands clear of the map's walls, kept far enough in from the edges that a circle of `edge` px round it stays mostly on the map. */
function clearSpotIn(w: World, c: Circle, within: number, edge: number): { x: number; y: number } {
  const size = MAPS[w.map].size;
  const margin = Math.max(WORLD.playerRadius * 2, Math.min(edge, size / 2) * 0.6);
  const solids = coverRects(w);
  for (let i = 0; i < 80; i++) {
    const a = rand(w) * 2 * Math.PI, d = Math.sqrt(rand(w)) * within;
    const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (x < margin || y < margin || x > size - margin || y > size - margin) continue;
    if (!solids.some((b) => circleHitsRect(x, y, WORLD.playerRadius * 2, b))) return { x, y };
  }
  return { x: c.x, y: c.y };
}

const nextCircle = (w: World, from: Circle, r: number): Circle => ({ ...clearSpotIn(w, from, Math.max(0, from.r - r), r), r });

function scheduleDrop(w: World, r: Royale, into: Circle) {
  const at = clearSpotIn(w, into, into.r, 0);
  r.drops.push({ ...at, landsAt: w.now + ROYALE.dropLandMs });
}

export function newRoyale(w: World): Royale {
  const size = MAPS[w.map].size;
  const circle = { x: size / 2, y: size / 2, r: ROYALE.startRadius };
  const next = nextCircle(w, circle, RING[0]!.radius);
  const r: Royale = {
    ring: { k: 'waiting', phase: 0, circle, next, shrinkAt: w.now + RING[0]!.waitMs },
    squads: [], out: [], redeployAt: new Map(), drops: [], stats: new Map(), killers: new Map(), watching: new Map(),
  };
  scheduleDrop(w, r, next);
  return r;
}

export function statsFor(r: Royale, p: Player): RoyaleStats {
  let s = r.stats.get(p.id);
  if (!s) r.stats.set(p.id, (s = { name: p.name, kills: 0, knocks: 0, revives: 0 }));
  return s;
}

/** Fewest players first, so solo joiners and bots spread one squad at a time. */
export function emptiestSquad(w: World, weigh: (p: Player) => number = () => 1): ColorId {
  const load = (team: ColorId) => [...w.players.values()].reduce((n, p) => n + (p.team === team ? weigh(p) : 0), 0);
  return COLOR_IDS.reduce((best, team) => (load(team) < load(best) ? team : best));
}

/** Dead for the match unless a redeploy is still open, in which case they come back beside a squadmate once it is due. */
function perish(w: World, r: Royale, p: Player, by: Player | null) {
  die(w, p, Infinity);
  if (by && by.id !== p.id) r.killers.set(p.id, by.id);
  if (redeploysOpen(r)) r.redeployAt.set(p.id, w.now + ROYALE.redeployMs(p.deaths));
}

/** The kill path's call: knocked while a squadmate still stands, dead otherwise. Returns whether it was a knock. */
export function fall(w: World, r: Royale, victim: Player, by: Player | null): boolean {
  if (![...w.players.values()].some((p) => p.id !== victim.id && p.team === victim.team && p.life.k === 'alive')) {
    perish(w, r, victim, by);
    return false;
  }
  goDown(w, victim, effectiveStats(victim).maxHp * ROYALE.knockHpFrac);
  if (by && by.id !== victim.id) r.killers.set(victim.id, by.id);
  return true;
}

export function hurtDowned(w: World, victim: Player, amount: number, by: Player | null) {
  const r = w.royale, life = victim.life;
  if (!r || life.k !== 'downed') return;
  const dealt = Math.min(life.hp, amount);
  life.hp -= amount;
  if (by) w.events.push({ e: 'dmg', attacker: by.id, victim: victim.id, amount: Math.round(dealt * 10) / 10, x: victim.x, y: victim.y, kind: 'player' });
  if (life.hp > 0) return;
  w.events.push({ e: 'life', id: victim.id, name: victim.name, k: 'finished', by: by?.id ?? null });
  if (by && by.id !== victim.id) statsFor(r, by).kills++;
  perish(w, r, victim, by);
}

/** A supply drop jumps its breaker to their next level pick; a player with every pick made gets full health, a full magazine and their ability back instead. */
export function openDrop(w: World, p: Player) {
  const next = LEVELS[p.level + 1];
  if (next) {
    p.score = Math.max(p.score, next.score);
    p.level = levelForScore(p.score);
  } else if (p.life.k === 'alive') {
    const stats = effectiveStats(p);
    p.life.hp = stats.maxHp;
    p.life.ammo = stats.mag;
    p.life.reloadUntil = null;
    p.abilityReadyAt = 0;
  }
}

function advanceRing(w: World, r: Royale) {
  const ring = r.ring;
  if (ring.k === 'waiting' && w.now >= ring.shrinkAt) {
    r.ring = { k: 'shrinking', phase: ring.phase, from: ring.circle, to: ring.next, startAt: ring.shrinkAt, closeAt: ring.shrinkAt + RING[ring.phase]!.shrinkMs };
  } else if (ring.k === 'shrinking' && w.now >= ring.closeAt) {
    const phase = ring.phase + 1;
    const row = RING[phase];
    if (!row) r.ring = { k: 'closed', circle: ring.to, closedAt: w.now };
    else {
      const next = nextCircle(w, ring.to, row.radius);
      r.ring = { k: 'waiting', phase, circle: ring.to, next, shrinkAt: w.now + row.waitMs };
      scheduleDrop(w, r, next);
    }
    if (!redeploysOpen(r)) r.redeployAt.clear();
  }
}

function landDrops(w: World, r: Royale) {
  const half = ROYALE.dropSize / 2;
  r.drops = r.drops.filter((d) => {
    const crate = { id: 0, x: d.x - half, y: d.y - half, size: ROYALE.dropSize, hp: ROYALE.dropHp, respawnAt: null, drop: true as const };
    // A drop waits for the ground under it to clear rather than landing on someone.
    if (w.now < d.landsAt || [...w.players.values()].some((p) => p.life.k !== 'dead' && rectsOverlap(crateRect(crate), { x: p.x, y: p.y, w: 0, h: 0 }, WORLD.playerRadius))) return true;
    w.crates = [...w.crates, { ...crate, id: newId(w) }];
    w.wallsVersion++;
    return false;
  });
}

/** Outside the circle: a share of max health a second, through armor and the spawn shield, and no regeneration. Hit markers come once a second, not every tick. */
function burnOutside(w: World, r: Royale, dtMs: number) {
  const c = safeCircle(r, w.now);
  const dps = ringDps(r.ring);
  const marker = w.tick % WORLD.tickHz === 0;
  for (const p of [...w.players.values()]) {
    const life = p.life;
    if (life.k === 'dead' || dist2(p.x, p.y, c.x, c.y) <= c.r * c.r) continue;
    const perSec = dps * effectiveStats(p).maxHp;
    if (marker) w.events.push({ e: 'dmg', attacker: null, victim: p.id, amount: Math.round(perSec), x: p.x, y: p.y, kind: 'player' });
    if (life.k === 'downed') { hurtDowned(w, p, (perSec * dtMs) / 1000, null); continue; }
    life.hp -= (perSec * dtMs) / 1000;
    life.lastDamageAt = w.now;
    if (life.hp <= 0) kill(w, p, null, 'Ring');
  }
}

function tickKnocked(w: World, r: Royale, dtMs: number) {
  const revivers = new Set<Player>();
  for (const p of w.players.values()) {
    const outcome = tickDowned(w, p, dtMs, revivers);
    if (outcome === 'bledOut') perish(w, r, p, null);
    else if (outcome) statsFor(r, outcome).revives++;
  }
}

function redeploy(w: World, r: Royale) {
  for (const [id, at] of r.redeployAt) {
    const p = w.players.get(id);
    if (!p || p.life.k !== 'dead') { r.redeployAt.delete(id); continue; }
    if (w.now < at || !standing(w, p.team)) continue;
    r.redeployAt.delete(id);
    resetProgress(p);
    p.lifeKills = 0;
    const spot = spawnPoint(w, p.team);
    p.x = spot.x;
    p.y = spot.y;
    p.life = freshLife(p, w.now);
    w.events.push({ e: 'life', id: p.id, name: p.name, k: 'redeployed', by: null });
  }
}

const teamKills = (w: World, team: ColorId) => [...w.players.values()].reduce((n, p) => n + (p.team === team ? p.kills : 0), 0);

/** Squads that lose their last standing player in the same tick place by kills, the bloodier squad higher. */
function eliminate(w: World, r: Royale) {
  for (const p of w.players.values()) if (p.team && !r.squads.includes(p.team)) r.squads.push(p.team);
  const fallen = r.squads.filter((s) => !r.out.includes(s) && !standing(w, s))
    .sort((a, b) => teamKills(w, a) - teamKills(w, b) || COLOR_IDS.indexOf(b) - COLOR_IDS.indexOf(a));
  for (const team of fallen) {
    const place = r.squads.length - r.out.length;
    r.out.push(team);
    for (const p of w.players.values()) {
      if (p.team !== team) continue;
      r.redeployAt.delete(p.id);
      if (p.life.k === 'downed') perish(w, r, p, null);
    }
    w.events.push({ e: 'wiped', team, place });
  }
}

const alive = (p: Player | undefined): p is Player => !!p && p.life.k !== 'dead';

/** A dead player watches a squadmate still up, else whoever took their life, else anyone left, keeping one target until it falls. */
function watch(w: World, r: Royale) {
  for (const p of w.players.values()) {
    if (p.life.k !== 'dead') { r.watching.delete(p.id); continue; }
    if (alive(w.players.get(r.watching.get(p.id) ?? -1))) continue;
    const others = [...w.players.values()].filter((o) => o.id !== p.id);
    const target = others.find((o) => o.team === p.team && o.life.k === 'alive') ?? others.find((o) => o.team === p.team && alive(o))
      ?? [w.players.get(r.killers.get(p.id) ?? -1)].find(alive) ?? others.find((o) => o.life.k === 'alive');
    if (target) r.watching.set(p.id, target.id);
    else r.watching.delete(p.id);
  }
}

export function tickRoyale(w: World, dtMs: number) {
  const r = w.royale;
  if (!r) return;
  advanceRing(w, r);
  landDrops(w, r);
  burnOutside(w, r, dtMs);
  tickKnocked(w, r, dtMs);
  redeploy(w, r);
  eliminate(w, r);
  watch(w, r);
}

export function placeOf(w: World, r: Royale, team: ColorId): number | null {
  const i = r.out.indexOf(team);
  if (i >= 0) return r.squads.length - i;
  return w.match.k === 'over' && r.squads.includes(team) ? 1 : null;
}

export function royaleWinner(w: World): RoundWinner | null {
  const r = w.royale;
  if (!r || r.squads.length < 2) return null;
  const left = r.squads.filter((s) => !r.out.includes(s));
  if (left.length > 1) return null;
  const team = left[0] ?? r.out[r.out.length - 1]!;
  return { name: squadName(team), id: null, note: 'Last squad standing' };
}

export function royaleKill(w: World, killer: Player, victim: Player) {
  if (!w.royale) return;
  const s = statsFor(w.royale, killer);
  if (victim.life.k === 'downed') s.knocks++;
  else s.kills++;
}

/** A new match brings everyone back and seats anyone who sat the last one out, humans spread one per squad. */
export function startRoyale(w: World) {
  for (const p of w.players.values()) {
    if (p.team === null) p.team = emptiestSquad(w, (o) => (o.kind === 'human' ? 1 : 0));
    p.life = freshLife(p, w.now);
  }
}

export function resultFor(w: World, r: Royale, p: Player): RoyaleResult | null {
  const place = p.team && placeOf(w, r, p.team);
  if (!place) return null;
  const s = r.stats.get(p.id);
  return { place, of: r.squads.length, kills: s?.kills ?? 0, knocks: s?.knocks ?? 0, revives: s?.revives ?? 0 };
}
