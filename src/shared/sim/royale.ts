import { COLOR_IDS, CRATE_TIERS, LEVELS, RING, ROYALE, WORLD, type ColorId, type CrateTier } from '../defs.ts';
import { MAPS } from '../maps.ts';
import { KIT } from '../kit.ts';
import { ringAt, type Circle, type RingView, type RoundWinner, type RoyaleResult, type Team } from '../protocol.ts';
import { die, kill } from './combat.ts';
import { goDown, tickDowned } from './downed.ts';
import { circleHitsRect, dist2, rectsOverlap } from './movement.ts';
import { effectiveStats, freshLife, levelForScore, resetProgress } from './stats.ts';
import { clearPointNear, coverRects, crateRect, moveTo, newId, rand, spawnPoint, type Crate, type Player, type Ring, type Royale, type Pose, type RoyaleStats, type World } from './world.ts';

const squadName = (team: ColorId) => `${team[0]!.toUpperCase()}${team.slice(1)} squad`;

const standing = (w: World, team: Team) => [...w.players.values()].some((p) => p.team === team && p.life.k === 'alive');

export const closedPhases = (ring: Ring) => (ring.k === 'closed' ? RING.length : ring.phase);
export const redeploysOpen = (r: Royale) => RING[closedPhases(r.ring)]?.lives === 'many';

export function ringView(ring: Ring): RingView {
  switch (ring.k) {
    case 'waiting': return { phase: ring.phase, from: ring.circle, to: ring.next, shrinkAt: ring.shrinkAt, closeAt: ring.shrinkAt + RING[ring.phase]!.shrinkMs };
    case 'shrinking': return { phase: ring.phase, from: ring.from, to: ring.to, shrinkAt: ring.startAt, closeAt: ring.closeAt };
    case 'closed': return { phase: RING.length, from: ring.circle, to: ring.circle, shrinkAt: ring.closedAt, closeAt: ring.closedAt };
  }
}

const safeCircle = (r: Royale, now: number): Circle => ringAt(ringView(r.ring), now);

const ringDps = (ring: Ring) => RING[ring.k === 'closed' ? RING.length - 1 : ring.phase]!.dps;

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

const SCATTER_CLEAR = 90;

function crateAt(w: World, x: number, y: number, tier: CrateTier): Crate {
  const { piece, hp } = CRATE_TIERS[tier];
  const size = KIT[piece].w;
  return { id: newId(w), piece, r: 0, x: x - size / 2, y: y - size / 2, w: size, h: size, hp, respawnAt: null, tier };
}

function stockCrates(w: World, spin: number) {
  const size = MAPS[w.map].size, centre = size / 2;
  w.crates = w.crates.map((c) => ({ ...c, tier: 'loot' }));
  for (let i = 0; i < ROYALE.caches; i++) {
    const a = spin + ((i + 0.5) / ROYALE.caches) * 2 * Math.PI;
    const at = clearPointNear(coverRects(w), centre + Math.cos(a) * ROYALE.cacheR, centre + Math.sin(a) * ROYALE.cacheR, KIT[CRATE_TIERS.cache.piece].w, size);
    w.crates.push(crateAt(w, at.x, at.y, 'cache'));
  }
  scatter(w, { x: centre, y: centre, r: size }, ROYALE.scatter);
}

function scatter(w: World, within: Circle, count: number) {
  const size = MAPS[w.map].size, centre = size / 2;
  const solids = coverRects(w);
  const crates = [...w.crates];
  const bodies = [...w.players.values()].filter((p) => p.life.k !== 'dead');
  const lo = (c: number) => Math.max(SCATTER_CLEAR, c - within.r), hi = (c: number) => Math.min(size - SCATTER_CLEAR, c + within.r);
  for (let i = 0, placed = 0; i < count * 20 && placed < count; i++) {
    const x = lo(within.x) + rand(w) * (hi(within.x) - lo(within.x)), y = lo(within.y) + rand(w) * (hi(within.y) - lo(within.y));
    if (dist2(x, y, within.x, within.y) > within.r * within.r || solids.some((b) => circleHitsRect(x, y, SCATTER_CLEAR, b))) continue;
    if (bodies.some((p) => dist2(p.x, p.y, x, y) < SCATTER_CLEAR * SCATTER_CLEAR)) continue;
    const crate = crateAt(w, x, y, Math.hypot(x - centre, y - centre) < ROYALE.richR ? 'rich' : 'loot');
    crates.push(crate);
    solids.push(crateRect(crate));
    placed++;
  }
  w.crates = crates;
  w.wallsVersion++;
}

export function farthestEdgeSlot(w: World, team: Team): Pose & { centre: Pose } {
  const r = w.royale!;
  const to = ringView(r.ring).to;
  const reach = Math.max(0, Math.min(ROYALE.edgeR, to.r - ROYALE.cacheR));
  const rivals = [...w.players.values()].filter((p) => p.team !== team && p.life.k !== 'dead' && Number.isFinite(p.x));
  const slots = COLOR_IDS.map((_, i) => {
    const a = r.spin + (i / COLOR_IDS.length) * 2 * Math.PI;
    return { x: to.x + Math.cos(a) * reach, y: to.y + Math.sin(a) * reach, centre: to };
  });
  const room = (s: Pose) => Math.min(Infinity, ...rivals.map((p) => dist2(p.x, p.y, s.x, s.y)));
  return slots.reduce((best, s) => (room(s) > room(best) ? s : best), slots[COLOR_IDS.findIndex((c) => c === team)] ?? slots[0]!);
}

export function newRoyale(w: World): Royale {
  const size = MAPS[w.map].size;
  const circle = { x: size / 2, y: size / 2, r: Math.hypot(size, size) / 2 + WORLD.playerRadius * 4 };
  const next = { x: size / 2, y: size / 2, r: RING[0]!.radius };
  const spin = rand(w) * 2 * Math.PI;
  stockCrates(w, spin);
  const r: Royale = {
    ring: { k: 'waiting', phase: 0, circle, next, shrinkAt: w.now + RING[0]!.waitMs },
    squads: [], out: [], redeployAt: new Map(), regroupAt: new Map(), drops: [], stats: new Map(), killers: new Map(), watching: new Map(), spin,
  };
  scheduleDrop(w, r, next);
  return r;
}

function statsFor(r: Royale, p: Player): RoyaleStats {
  let s = r.stats.get(p.id);
  if (!s) r.stats.set(p.id, (s = { name: p.name, kills: 0, knocks: 0, revives: 0 }));
  return s;
}

export function emptiestSquad(w: World, weigh: (p: Player) => number = () => 1): ColorId {
  const load = (team: ColorId) => [...w.players.values()].reduce((n, p) => n + (p.team === team ? weigh(p) : 0), 0);
  return COLOR_IDS.reduce((best, team) => (load(team) < load(best) ? team : best));
}

function perish(w: World, r: Royale, p: Player, by: Player | null) {
  die(w, p, Infinity);
  if (by && by.id !== p.id) r.killers.set(p.id, by.id);
  if (redeploysOpen(r)) r.redeployAt.set(p.id, w.now + ROYALE.redeployMs);
}

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
      scatter(w, next, ROYALE.wave);
    }
  }
}

function landDrops(w: World, r: Royale) {
  r.drops = r.drops.filter((d) => {
    const half = KIT[CRATE_TIERS.drop.piece].w / 2;
    const footprint = { x: d.x - half, y: d.y - half, w: half * 2, h: half * 2 };
    if (w.now < d.landsAt || [...w.players.values()].some((p) => p.life.k !== 'dead' && rectsOverlap(footprint, { x: p.x, y: p.y, w: 0, h: 0 }, WORLD.playerRadius))) return true;
    w.crates = [...w.crates, crateAt(w, d.x, d.y, 'drop')];
    w.wallsVersion++;
    return false;
  });
}

function burnOutside(w: World, r: Royale, dtMs: number) {
  const c = safeCircle(r, w.now);
  const dps = ringDps(r.ring);
  const onceASecond = w.tick % WORLD.tickHz === 0;
  for (const p of [...w.players.values()]) {
    const life = p.life;
    if (life.k === 'dead' || dist2(p.x, p.y, c.x, c.y) <= c.r * c.r) continue;
    const perSec = dps * effectiveStats(p).maxHp;
    if (onceASecond) w.events.push({ e: 'dmg', attacker: null, victim: p.id, amount: Math.round(perSec), x: p.x, y: p.y, kind: 'player' });
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

function bringBack(w: World, p: Player) {
  resetProgress(p);
  p.lifeKills = 0;
  moveTo(p, spawnPoint(w, p.team));
  p.life = freshLife(p, w.now);
  w.events.push({ e: 'life', id: p.id, name: p.name, k: 'redeployed', by: null });
}

function redeploy(w: World, r: Royale) {
  for (const [team, at] of r.regroupAt) {
    if (w.now < at) continue;
    r.regroupAt.delete(team);
    for (const p of w.players.values()) if (p.team === team && p.life.k === 'dead') bringBack(w, p);
  }
  for (const [id, at] of r.redeployAt) {
    const p = w.players.get(id);
    if (!p || p.life.k !== 'dead') { r.redeployAt.delete(id); continue; }
    if (w.now < at || !standing(w, p.team)) continue;
    r.redeployAt.delete(id);
    bringBack(w, p);
  }
}

const teamKills = (w: World, team: ColorId) => [...w.players.values()].reduce((n, p) => n + (p.team === team ? p.kills : 0), 0);

function eliminate(w: World, r: Royale) {
  for (const p of w.players.values()) if (p.team && !r.squads.includes(p.team)) r.squads.push(p.team);
  const regroups = redeploysOpen(r);
  const fallen = r.squads.filter((s) => !r.out.includes(s) && !r.regroupAt.has(s) && !standing(w, s))
    .sort((a, b) => teamKills(w, a) - teamKills(w, b) || COLOR_IDS.indexOf(b) - COLOR_IDS.indexOf(a));
  for (const team of fallen) {
    const place = regroups ? null : r.squads.length - r.out.length;
    if (regroups) r.regroupAt.set(team, w.now + ROYALE.redeployMs);
    else r.out.push(team);
    for (const p of w.players.values()) {
      if (p.team !== team) continue;
      if (p.life.k === 'downed') perish(w, r, p, null);
      r.redeployAt.delete(p.id);
    }
    w.events.push({ e: 'wiped', team, place });
  }
}

const alive = (p: Player | undefined): p is Player => !!p && p.life.k !== 'dead';

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

export function startRoyale(w: World) {
  for (const p of w.players.values()) {
    if (p.team === null) p.team = emptiestSquad(w, (o) => (o.kind === 'human' ? 1 : 0));
    p.life = freshLife(p, w.now);
  }
}

const SEAT_ORDER = { alive: 0, dead: 1, downed: 2 } as const;

export function seatFor(w: World): Player | null {
  const r = w.royale;
  if (!r || w.match.k !== 'playing' || !redeploysOpen(r)) return null;
  const humans = (team: Team) => [...w.players.values()].filter((p) => p.team === team && p.kind === 'human').length;
  const bots = [...w.players.values()].filter((p) => p.kind === 'bot' && p.team !== null && !r.out.includes(p.team));
  return bots.sort((a, b) => humans(a.team) - humans(b.team) || SEAT_ORDER[a.life.k] - SEAT_ORDER[b.life.k])[0] ?? null;
}

export function takeSeat(w: World, to: Player, from: Player) {
  const r = w.royale!;
  to.team = from.team;
  to.x = from.x;
  to.y = from.y;
  const life = from.life;
  if (life.k === 'alive') to.life = freshLife(to, w.now);
  else if (life.k === 'downed') to.life = { ...life, hp: life.hp * (effectiveStats(to).maxHp / effectiveStats(from).maxHp) };
  else to.life = { k: 'dead', respawnAt: Infinity };
  const redeploy = r.redeployAt.get(from.id);
  r.redeployAt.delete(from.id);
  if (redeploy !== undefined) r.redeployAt.set(to.id, redeploy);
}

export function benchUntilNextMatch(p: Player) {
  p.team = null;
  p.life = { k: 'dead', respawnAt: Infinity };
}

export function resultFor(w: World, r: Royale, p: Player): RoyaleResult | null {
  const place = p.team && placeOf(w, r, p.team);
  if (!place) return null;
  const s = r.stats.get(p.id);
  return { place, of: r.squads.length, kills: s?.kills ?? 0, knocks: s?.knocks ?? 0, revives: s?.revives ?? 0 };
}
