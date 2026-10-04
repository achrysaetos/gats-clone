import { GUNS, WORLD } from '../defs.ts';
import type {
  BulletView, CrateView, GameEvent, LeaderRow, MatchView, PlayerView, SelfView, Snapshot, ThrownKind, ThrownView, WallView, ZoneView,
} from '../protocol.ts';
import { VIEW_ASPECT, VIEW_PRELOAD_MARGIN, viewExtents } from '../protocol.ts';
import { MAP_NOTICE_MS, MAPS, nextMap } from '../maps.ts';
import { GAS_RADIUS } from './abilities.ts';
import { dist2 } from './movement.ts';
import { abilityOf, effectiveStats, pendingPick } from './stats.ts';
import { isEnemy, sameTeam, type Player, type World } from './world.ts';

const GHILLIE_STILL_MS = 600;
const HIDDEN_REVEAL_DIST = 140;

export function wallViews(w: World): WallView[] {
  return w.walls.map(({ x, y, w: ww, h, built }) => ({ x, y, w: ww, h, built }));
}

function isHidden(w: World, p: Player): boolean {
  return p.life.k === 'alive' && effectiveStats(p).ghillie && w.now - p.life.lastMoveAt >= GHILLIE_STILL_MS && w.now >= p.revealedUntil;
}

function playerView(w: World, p: Player): PlayerView {
  const life = p.life;
  const stats = effectiveStats(p);
  const alive = life.k === 'alive';
  return {
    id: p.id, name: p.name, x: p.x, y: p.y, angle: p.angle,
    hp: alive ? Math.ceil(life.hp) : 0, maxHp: stats.maxHp,
    armor: alive ? Math.ceil(life.armor) : 0, maxArmor: stats.maxArmor,
    color: p.loadout.color, gun: p.gun, team: p.team,
    alive, hidden: isHidden(w, p), shield: stats.shield, dashing: alive && life.dash !== null,
    score: p.score, level: p.level, armorTier: p.loadout.armor,
  };
}

function selfView(w: World, p: Player): SelfView {
  const life = p.life;
  const stats = effectiveStats(p);
  const ability = abilityOf(p);
  return {
    id: p.id,
    ammo: life.k === 'alive' ? life.ammo : 0,
    mag: stats.mag,
    speed: stats.speed,
    reloading: life.k === 'alive' && life.reloadUntil !== null,
    reloadFrac: life.k === 'alive' && life.reloadUntil !== null
      ? Math.min(1, Math.max(0, 1 - (life.reloadUntil - w.now) / GUNS[p.gun].reloadMs))
      : 0,
    perks: { ...p.perks },
    pending: pendingPick(p),
    ability,
    abilityReadyIn: ability ? Math.max(0, p.abilityReadyAt - w.now) : 0,
    alive: life.k === 'alive',
    dash: life.k === 'alive' ? life.dash : null,
    respawnIn: life.k === 'dead' ? Math.max(0, life.respawnAt - w.now) : 0,
    kills: p.kills,
    deaths: p.deaths,
    viewRadius: stats.viewRadius,
  };
}

function leaderboard(w: World): LeaderRow[] {
  return [...w.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, score: p.score, team: p.team }));
}

function matchView(w: World): MatchView {
  const untilChange = w.mapChangeAt - w.now;
  return {
    mode: w.mode,
    map: MAPS[w.map].name,
    nextMap: MAPS[nextMap(w.mode, w.map)].name,
    mapChangeIn: untilChange <= MAP_NOTICE_MS ? Math.max(0, untilChange) : 0,
    teamScore: { red: Math.floor(w.teamScore.red), blue: Math.floor(w.teamScore.blue) },
    winner: w.match.k === 'over' ? w.match.winner : null,
    restartIn: w.match.k === 'over' ? Math.max(0, w.match.restartAt - w.now) : 0,
  };
}

const THROWN_RADIUS: Record<ThrownKind, number> = { grenade: 10, fragGrenade: 10, gasGrenade: 10, landMine: 14, gasCloud: GAS_RADIUS };

export function snapshotFor(w: World, id: number, events: readonly GameEvent[] = w.events, aspect: number = VIEW_ASPECT.max): Snapshot {
  const me = w.players.get(id);
  if (!me) throw new Error(`no player ${id}`);
  const stats = effectiveStats(me);
  const visible = viewExtents(stats.viewRadius, aspect);
  const halfW = visible.halfW + VIEW_PRELOAD_MARGIN, halfH = visible.halfH + VIEW_PRELOAD_MARGIN;
  const inView = (x: number, y: number, pad = 0) => Math.abs(x - me.x) <= halfW + pad && Math.abs(y - me.y) <= halfH + pad;

  const players: PlayerView[] = [];
  for (const p of w.players.values()) {
    if (p.id !== me.id) {
      if (p.life.k !== 'alive' || !inView(p.x, p.y, WORLD.playerRadius)) continue;
      const seesHidden = !isEnemy(me, p) || stats.thermal || dist2(p.x, p.y, me.x, me.y) < HIDDEN_REVEAL_DIST ** 2;
      if (isHidden(w, p) && !seesHidden) continue;
    }
    players.push(playerView(w, p));
  }
  const bullets: BulletView[] = w.bullets
    .filter((b) => inView(b.x, b.y, 100))
    .map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, owner: b.owner, gun: b.gun }));
  const crates: CrateView[] = w.crates
    .filter((c) => c.respawnAt === null && inView(c.x, c.y, c.size))
    .map((c) => ({ id: c.id, x: c.x, y: c.y, hp: c.hp, size: c.size }));
  const thrown: ThrownView[] = w.thrown
    .filter((t) => inView(t.x, t.y, THROWN_RADIUS[t.kind]))
    .filter((t) => {
      if (t.kind !== 'landMine' || t.owner === me.id || stats.thermal) return true;
      const owner = w.players.get(t.owner);
      return !!owner && !isEnemy(me, owner);
    })
    .map((t) => ({ id: t.id, kind: t.kind, x: t.x, y: t.y, r: THROWN_RADIUS[t.kind], owner: t.owner }));
  const zones: ZoneView[] = w.zones.map((z) => ({ id: z.id, x: z.x, y: z.y, r: z.r, owner: z.owner, capturing: z.capturing, progress: z.progress }));
  const minimap = [...w.players.values()]
    .filter((p) => p.id !== me.id && p.life.k === 'alive' && (sameTeam(me, p) || w.now < p.revealedUntil))
    .map((p) => ({ x: p.x, y: p.y, team: p.team }));
  const visibleEvents = events.filter((e) => e.e === 'kill' || inView(e.x, e.y, 300));

  return {
    t: 'snap', tick: w.tick, ackSeq: me.seq, self: selfView(w, me),
    players, bullets, crates, thrown, zones, minimap, leaderboard: leaderboard(w), match: matchView(w), events: visibleEvents,
  };
}
