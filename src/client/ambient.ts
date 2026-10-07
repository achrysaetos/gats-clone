import { ZONE_RADIUS, type MapDef } from '../shared/maps.ts';
import { ambientFor, type AmbientConfig, type AmbientGroup, type CritterKind } from './ambientreg.ts';
import { cellOf, putCell, type SpriteId } from './ambientart.ts';
import './ambientmaps.ts';

/**
 * Ambient life (docs/maps/AMBIENT.md): birds on wall tops, rats, cats, bats, fish, tumbleweeds, leaves, litter, steam and a
 * far-off aircraft, all client-only and drawn from pools. Placement is a pure function of the map id (a seeded PRNG), the
 * motion is a pure function of time and events, and nothing here reads or writes the sim, so the golden replay never sees it.
 * The critters react to what the client already knows: muzzle flashes and blasts (a flock bursts up and wheels away, then
 * resettles elsewhere), players walking close (rats and cats scurry, litter is kicked) and shockwaves (litter is blown).
 *
 * `createAmbient()` is the whole engine and touches no canvas until `drawGround`/`drawSky`, so tests drive it directly.
 */

const TAU = Math.PI * 2;
const MAX_CRITS = 170;
const MAX_PUFFS = 56;
const MAX_RINGS = 14;
const MAX_PLAYERS = 64;
const VIEW_DRAW_CAP = 90;

/** Behaviour classes. */
const BIRD = 0, GROUND = 1, DRIFT = 2, ORBIT = 3, FIREFLY = 4, FISH = 5, BAT = 6, PLANE = 7, SOURCE = 8, DEVIL = 9, SNOW = 10;
type Cls = number;

type KindInfo = { cls: Cls; sprite: SpriteId | null; per: number; cap: number; night?: boolean; day?: boolean; speed: number; flapHz: number; radius: number; skit: number; base: number };
const K: Record<CritterKind, KindInfo> = {
  pigeon: { cls: BIRD, sprite: 'pigeon', per: 5, cap: 14, speed: 215, flapHz: 4, radius: 0, skit: 110, base: 1 },
  crow: { cls: BIRD, sprite: 'crow', per: 3, cap: 10, speed: 190, flapHz: 3, radius: 0, skit: 120, base: 1 },
  gull: { cls: BIRD, sprite: 'gull', per: 4, cap: 10, speed: 170, flapHz: 2.5, radius: 0, skit: 120, base: 1 },
  sparrow: { cls: BIRD, sprite: 'sparrow', per: 4, cap: 14, speed: 235, flapHz: 4, radius: 0, skit: 90, base: 1 },
  duck: { cls: BIRD, sprite: 'duck', per: 3, cap: 8, speed: 180, flapHz: 3.5, radius: 0, skit: 130, base: 1 },
  rat: { cls: GROUND, sprite: 'rat', per: 1, cap: 6, speed: 62, flapHz: 0, radius: 6, skit: 210, base: 1 },
  mouse: { cls: GROUND, sprite: 'mouse', per: 1, cap: 4, speed: 58, flapHz: 0, radius: 4, skit: 150, base: 1 },
  cat: { cls: GROUND, sprite: 'cat', per: 1, cap: 3, speed: 50, flapHz: 0, radius: 10, skit: 190, base: 1 },
  dog: { cls: GROUND, sprite: 'dog', per: 1, cap: 2, speed: 62, flapHz: 0, radius: 13, skit: 120, base: 1 },
  fox: { cls: GROUND, sprite: 'fox', per: 1, cap: 3, speed: 58, flapHz: 0, radius: 12, skit: 260, base: 1 },
  bat: { cls: BAT, sprite: 'bat', per: 8, cap: 14, night: true, speed: 165, flapHz: 4, radius: 0, skit: 0, base: 1 },
  moth: { cls: ORBIT, sprite: 'moth', per: 2, cap: 10, night: true, speed: 0, flapHz: 3.4, radius: 0, skit: 0, base: 1 },
  butterfly: { cls: ORBIT, sprite: 'butterfly', per: 2, cap: 8, day: true, speed: 0, flapHz: 3, radius: 0, skit: 0, base: 1 },
  firefly: { cls: FIREFLY, sprite: null, per: 4, cap: 24, night: true, speed: 0, flapHz: 0, radius: 0, skit: 0, base: 1 },
  fish: { cls: FISH, sprite: 'fish', per: 4, cap: 12, speed: 20, flapHz: 2, radius: 0, skit: 0, base: 1 },
  tumbleweed: { cls: DRIFT, sprite: 'tumbleweed', per: 1, cap: 6, speed: 78, flapHz: 0, radius: 11, skit: 0, base: 1 },
  leaf: { cls: DRIFT, sprite: 'leaf', per: 1, cap: 10, speed: 34, flapHz: 0, radius: 3, skit: 0, base: 1.3 },
  paper: { cls: DRIFT, sprite: 'paper', per: 1, cap: 6, speed: 40, flapHz: 0, radius: 5, skit: 0, base: 1.1 },
  snow: { cls: SNOW, sprite: null, per: 1, cap: 90, speed: 0, flapHz: 0, radius: 0, skit: 0, base: 1 },
  dustdevil: { cls: DEVIL, sprite: null, per: 1, cap: 2, speed: 46, flapHz: 0, radius: 0, skit: 0, base: 1 },
  steam: { cls: SOURCE, sprite: null, per: 1, cap: 8, speed: 0, flapHz: 0, radius: 0, skit: 0, base: 1 },
  horn: { cls: SOURCE, sprite: null, per: 1, cap: 3, speed: 0, flapHz: 0, radius: 0, skit: 0, base: 1 },
  aircraft: { cls: PLANE, sprite: null, per: 1, cap: 2, night: true, speed: 0, flapHz: 0, radius: 0, skit: 0, base: 1 },
};

// States.
const PERCH = 0, LAUNCH = 1, FLY = 2, LAND = 3, FADE = 4, AWAY = 5;
const IDLE = 0, WALK = 1, NAP = 2, FLEE = 3, HIDE = 4;

export type Crit = {
  kind: CritterKind; cls: Cls; st: number; x: number; y: number; z: number; vx: number; vy: number; ang: number;
  t0: number; at: number; next: number; hx: number; hy: number; tx: number; ty: number;
  gi: number; pi: number; seed: number; ph: number; sc: number; alpha: number; flip: number; aux: number; aux2: number;
  live: boolean; shown: boolean; init: boolean; when: number; roam: number; pose: number; turn: number; wheelEnd: number;
};
const blank = (): Crit => ({ kind: 'pigeon', cls: BIRD, st: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, ang: 0, t0: 0, at: Infinity, next: 0, hx: 0, hy: 0, tx: 0, ty: 0, gi: 0, pi: -1, seed: 1, ph: 0, sc: 1, alpha: 1, flip: 1, aux: 0, aux2: 0, live: false, shown: true, init: false, when: 0, roam: 180, pose: 0, turn: 0, wheelEnd: 0 });

type Group = { cfg: AmbientGroup; kind: CritterKind; spots: number[]; occ: Uint8Array; rects: number[]; cool: number; streak: number; first: number; n: number };
type Puff = { x: number; y: number; z: number; vx: number; t0: number; life: number; size: number; smoke: boolean; live: boolean };
type Ring = { x: number; y: number; t0: number; live: boolean };
type Pl = { id: number; x: number; y: number; vx: number; vy: number; seen: number };

const WHEN_ANY = 0, WHEN_DAY = 1, WHEN_NIGHT = 2;

export type View = { x0: number; y0: number; x1: number; y1: number };
export type WallLike = { x: number; y: number; w: number; h: number; pts?: readonly number[]; built?: boolean };
export type StepInput = { horde?: readonly (readonly number[])[]; players: readonly { id: number; x: number; y: number; alive: boolean; hidden?: boolean }[]; view: View; dark: number; reduced: boolean; listener?: { x: number; y: number } };

const hashOf = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function rnd(c: Crit): number {
  c.seed = (c.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(c.seed ^ (c.seed >>> 15), 1 | c.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const wrapA = (a: number) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const easeOut = (k: number) => 1 - (1 - k) * (1 - k) * (1 - k);

/* ---------------------------------------------------------------------------------------------- placement */

type Rect = { x: number; y: number; w: number; h: number };
const NOT_PERCH = new Set(['water', 'pond', 'hedge', 'embhedge', 'drift']);

function placementOf(map: MapDef, mapId: string, cfg: AmbientConfig): Group[] {
  const rand = mulberry(hashOf(mapId));
  const size = map.size;
  const solid = map.walls;
  const keepOut: Rect[] = [];
  for (const r of [...map.spawns.red, ...map.spawns.blue, ...map.spawns.ffa]) keepOut.push({ x: r.x - 160, y: r.y - 160, w: r.w + 320, h: r.h + 320 });
  for (const z of map.zones) keepOut.push({ x: z.x - ZONE_RADIUS - 80, y: z.y - ZONE_RADIUS - 80, w: 2 * (ZONE_RADIUS + 80), h: 2 * (ZONE_RADIUS + 80) });
  const inside = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  const dist2Rect = (r: Rect, x: number, y: number) => { const dx = Math.max(r.x - x, 0, x - r.x - r.w), dy = Math.max(r.y - y, 0, y - r.y - r.h); return Math.hypot(dx, dy); };
  const free = (x: number, y: number, pad: number, avoid: readonly Rect[]) => {
    for (const w of solid) if (inside(w, x, y, pad)) return false;
    for (const p of map.polys ?? []) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of p.points) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); } if (inside({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, x, y, pad)) return false; }
    for (const k of keepOut) if (inside(k, x, y)) return false;
    for (const a of avoid) if (inside(a, x, y)) return false;
    return true;
  };
  const nearWall = (x: number, y: number) => { let d = Infinity; for (const w of solid) d = Math.min(d, dist2Rect(w, x, y)); return d; };
  const groups: Group[] = [];

  for (const [gi, grp] of cfg.groups.entries()) {
    const info = K[grp.kind];
    const avoid = grp.avoid ?? [];
    const count = Math.min(info.cap, grp.count ?? grp.at?.length ?? info.per);
    // Birds get spare perches to resettle on after a scare.
    const want = info.cls === BIRD && !(grp.at && grp.at.length >= count * 1.5) ? Math.ceil(count * 1.8) : count;
    const spots: number[] = [];
    const on = grp.on ?? (info.cls === BIRD || info.cls === BAT ? 'wall' : info.cls === FISH ? 'water' : info.cls === ORBIT || info.cls === PLANE ? 'air' : 'ground');
    const areas: Rect[] = grp.in?.length ? [...grp.in] : [{ x: 220, y: 220, w: size - 440, h: size - 440 }];
    const inArea = (x: number, y: number) => areas.some((a) => inside(a, x, y));
    const rects: number[] = [];

    for (const a of grp.at ?? []) if (spots.length / 2 < Math.max(want, grp.at!.length) && (info.cls === SOURCE || info.cls === BAT || info.cls === ORBIT || info.cls === DEVIL || free(a.x, a.y, 0, []) || on === 'wall' || on === 'air' || info.cls === BIRD)) spots.push(a.x, a.y);

    if (info.cls === FISH) {
      const mats = grp.materials ?? ['water', 'pond'];
      const ponds: Rect[] = grp.in?.length ? [...grp.in] : solid.filter((w) => mats.includes(w.material) && w.w >= 60 && w.h >= 60);
      for (const p of ponds) rects.push(p.x, p.y, p.w, p.h);
    } else if (info.cls === DEVIL || info.cls === SNOW || (info.cls === DRIFT) || info.cls === PLANE) {
      // View-anchored or path-bound: no anchors needed.
    } else if (info.cls === SOURCE || (grp.at?.length && grp.at.length >= want)) {
      // Anchors are the whole point.
    } else if (on === 'wall' && (info.cls === BIRD || info.cls === BAT)) {
      const mats = grp.materials;
      const cands: { x: number; y: number }[] = [];
      for (const w of solid) {
        if (mats ? !mats.includes(w.material) : NOT_PERCH.has(w.material)) continue;
        const long = Math.max(w.w, w.h), short = Math.min(w.w, w.h);
        if (short > 150 || long < 56) continue;
        const along = 0.12 + rand() * 0.76;
        const x = w.w >= w.h ? w.x + w.w * along : w.x + w.w * (0.35 + rand() * 0.3);
        const y = w.w >= w.h ? w.y + w.h * (0.35 + rand() * 0.3) : w.y + w.h * along;
        if (inArea(x, y) && !keepOut.some((k) => inside(k, x, y)) && !avoid.some((a) => inside(a, x, y))) cands.push({ x, y });
      }
      for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cands[i], cands[j]] = [cands[j]!, cands[i]!]; }
      const taken = new Uint8Array(cands.length);
      const clusterOf = Math.max(2, Math.min(info.per, 5));
      for (let i = 0; i < cands.length && spots.length / 2 < want; i++) {
        if (taken[i]) continue;
        taken[i] = 1;
        // Seeds are kept apart; a flock gathers the nearest free tops around its seed.
        const seed = cands[i]!;
        let tooClose = false;
        for (let k = 0; k < spots.length; k += 2) if (Math.hypot(spots[k]! - seed.x, spots[k + 1]! - seed.y) < 420) tooClose = true;
        if (tooClose) continue;
        spots.push(seed.x, seed.y);
        const size2 = 1 + Math.floor(rand() * clusterOf);
        const near = cands.map((c, j) => ({ j, d: taken[j] ? Infinity : Math.hypot(c.x - seed.x, c.y - seed.y) })).filter((e) => e.d < 240).sort((a, b) => a.d - b.d);
        for (const e of near.slice(0, size2 - 1)) { if (spots.length / 2 >= want) break; if (Math.hypot(cands[e.j]!.x - seed.x, cands[e.j]!.y - seed.y) < 20) continue; taken[e.j] = 1; spots.push(cands[e.j]!.x, cands[e.j]!.y); }
      }
      // Few suitable walls on a sparse map: relax the spacing rule.
      for (let i = 0; i < cands.length && spots.length / 2 < want; i++) if (!taken[i]) { taken[i] = 1; spots.push(cands[i]!.x, cands[i]!.y); }
    } else {
      // Open floor in a quiet margin: beside a wall, off every lane, pad and zone.
      const wantNear = info.cls === GROUND || info.cls === BIRD;
      for (let tries = 0; tries < 400 && spots.length / 2 < want; tries++) {
        const a = areas[Math.floor(rand() * areas.length)]!;
        const x = a.x + rand() * a.w, y = a.y + rand() * a.h;
        if (!free(x, y, 30, avoid)) continue;
        if (wantNear) { const d = nearWall(x, y); if (d < 36 || d > 140) continue; }
        let tooClose = false;
        for (let k = 0; k < spots.length; k += 2) if (Math.hypot(spots[k]! - x, spots[k + 1]! - y) < (info.cls === GROUND ? 500 : 140)) tooClose = true;
        if (tooClose) continue;
        spots.push(x, y);
      }
    }
    groups.push({ cfg: grp, kind: grp.kind, spots, occ: new Uint8Array(spots.length / 2), rects, cool: 0, streak: 0, first: 0, n: 0 });
    void gi;
  }
  return groups;
}

/* ---------------------------------------------------------------------------------------------- walls */

type Index = { cell: number; cells: Map<number, number[]>; rects: { x: number; y: number; w: number; h: number; pts: readonly number[] | null; cx: number; cy: number }[] };
function indexWalls(walls: readonly WallLike[]): Index {
  const idx: Index = { cell: 256, cells: new Map(), rects: [] };
  for (const w of walls) {
    if (w.built) continue;
    let cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    if (w.pts && w.pts.length >= 6) { cx = 0; cy = 0; const n = w.pts.length / 2; for (let i = 0; i < w.pts.length; i += 2) { cx += w.pts[i]!; cy += w.pts[i + 1]!; } cx /= n; cy /= n; }
    const r = { x: w.x, y: w.y, w: w.w, h: w.h, pts: w.pts && w.pts.length >= 6 ? w.pts : null, cx, cy };
    const n = idx.rects.push(r) - 1;
    for (let gx = Math.floor((w.x - 40) / idx.cell); gx <= Math.floor((w.x + w.w + 40) / idx.cell); gx++)
      for (let gy = Math.floor((w.y - 40) / idx.cell); gy <= Math.floor((w.y + w.h + 40) / idx.cell); gy++) {
        const key = gx * 4096 + gy;
        const list = idx.cells.get(key);
        if (list) list.push(n); else idx.cells.set(key, [n]);
      }
  }
  return idx;
}

let hitNx = 0, hitNy = 0;
/** Pushes a circle out of the walls near it; returns whether it moved and leaves the last push direction in hitNx/hitNy. */
function pushOut(idx: Index, c: Crit, r: number): boolean {
  const list = idx.cells.get(Math.floor(c.x / idx.cell) * 4096 + Math.floor(c.y / idx.cell));
  if (!list) return false;
  let hit = false;
  for (let i = 0; i < list.length; i++) {
    const w = idx.rects[list[i]!]!;
    if (c.x < w.x - r || c.x > w.x + w.w + r || c.y < w.y - r || c.y > w.y + w.h + r) continue;
    if (w.pts) {
      // Convex polygon: the edge it has sunk deepest past.
      let best = -Infinity, bnx = 0, bny = 0;
      const p = w.pts;
      for (let k = 0; k < p.length; k += 2) {
        const ax = p[k]!, ay = p[k + 1]!, bx = p[(k + 2) % p.length]!, by = p[(k + 3) % p.length]!;
        let nx = by - ay, ny = -(bx - ax);
        const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
        if (nx * (w.cx - ax) + ny * (w.cy - ay) > 0) { nx = -nx; ny = -ny; }
        const d = nx * (c.x - ax) + ny * (c.y - ay);
        if (d > best) { best = d; bnx = nx; bny = ny; }
      }
      if (best < r) { c.x += bnx * (r - best); c.y += bny * (r - best); hitNx = bnx; hitNy = bny; hit = true; }
      continue;
    }
    const px = clamp(c.x, w.x, w.x + w.w), py = clamp(c.y, w.y, w.y + w.h);
    let dx = c.x - px, dy = c.y - py;
    const d = Math.hypot(dx, dy);
    if (d >= r) continue;
    if (d > 0.001) { dx /= d; dy /= d; c.x += dx * (r - d); c.y += dy * (r - d); }
    else {
      const l = c.x - w.x, rr = w.x + w.w - c.x, t = c.y - w.y, b = w.y + w.h - c.y, m = Math.min(l, rr, t, b);
      dx = m === l ? -1 : m === rr ? 1 : 0; dy = m === t ? -1 : m === b ? 1 : 0;
      c.x += dx * (m + r); c.y += dy * (m + r);
    }
    hitNx = dx; hitNy = dy; hit = true;
  }
  return hit;
}

/* ---------------------------------------------------------------------------------------------- the engine */

export type AmbientSound = (id: 'amb:flutter' | 'amb:caw' | 'amb:gull', x: number, y: number, gain: number) => void;

export function createAmbient() {
  const crits: Crit[] = Array.from({ length: MAX_CRITS }, blank);
  const puffs: Puff[] = Array.from({ length: MAX_PUFFS }, () => ({ x: 0, y: 0, z: 0, vx: 0, t0: 0, life: 0, size: 0, smoke: false, live: false }));
  const rings: Ring[] = Array.from({ length: MAX_RINGS }, () => ({ x: 0, y: 0, t0: 0, live: false }));
  const pls: Pl[] = Array.from({ length: MAX_PLAYERS }, () => ({ id: -1, x: 0, y: 0, vx: 0, vy: 0, seen: 0 }));
  let plN = 0;
  let groups: Group[] = [];
  let count = 0;
  let mapKey = '';
  let wind = { x: 16, y: -7 };
  let index: Index = { cell: 256, cells: new Map(), rects: [] };
  let wallsRef: readonly WallLike[] | null = null;
  let last = -1;
  let mapSize = 6000;
  let sound: AmbientSound | null = null;
  const lastSound = { flutter: -1e9, caw: -1e9, gull: -1e9 };
  const lastNow = { v: 0 };
  let darkNow = 0, reducedNow = false;
  let horde: readonly (readonly number[])[] | null = null;

  const view: View = { x0: 0, y0: 0, x1: 1, y1: 1 };

  function spawn(kind: CritterKind, gi: number, g: Group, x: number, y: number, seed: number): Crit | null {
    if (count >= MAX_CRITS) return null;
    const info = K[kind], c = crits[count++]!;
    const whenCfg = g.cfg.when ?? 'any';
    Object.assign(c, blank(), { kind, cls: info.cls, x, y, hx: x, hy: y, tx: x, ty: y, gi, seed: seed | 0, sc: (g.cfg.scale ?? 1) * info.base, live: true, roam: g.cfg.roam ?? 180,
      when: whenCfg === 'day' ? WHEN_DAY : whenCfg === 'night' ? WHEN_NIGHT : g.cfg.when === undefined ? (info.night ? WHEN_NIGHT : info.day ? WHEN_DAY : WHEN_ANY) : WHEN_ANY });
    c.ph = rnd(c) * TAU; c.ang = rnd(c) * TAU; c.flip = rnd(c) < 0.5 ? -1 : 1;
    c.alpha = c.when === WHEN_ANY ? 1 : 0;
    return c;
  }

  function load(mapId: string, map: MapDef, walls: readonly WallLike[], cfg: AmbientConfig = ambientFor(mapId, map)) {
    mapKey = mapId; mapSize = map.size; count = 0;
    for (const c of crits) c.live = false;
    for (const p of puffs) p.live = false;
    for (const r of rings) r.live = false;
    wind = cfg.wind ?? { x: 16, y: -7 };
    groups = placementOf(map, mapId, cfg);
    setWalls(walls);
    for (const [gi, g] of groups.entries()) {
      const info = K[g.kind], n = g.spots.length / 2;
      const s0 = hashOf(`${mapId}:${gi}:${g.kind}`);
      if (info.cls === BIRD) {
        const birds = Math.min(n, K[g.kind].cap, g.cfg.count ?? n);
        for (let i = 0; i < birds; i++) { const c = spawn(g.kind, gi, g, g.spots[i * 2]!, g.spots[i * 2 + 1]!, s0 + i * 977); if (c) { c.pi = i; g.occ[i] = 1; c.next = 8000 + rnd(c) * 60000; c.at = Infinity; } }
      } else if (info.cls === GROUND) {
        const want = Math.min(info.cap, g.cfg.count ?? n);
        for (let i = 0; i < Math.min(want, Math.max(n, 0)); i++) { const c = spawn(g.kind, gi, g, g.spots[i * 2]!, g.spots[i * 2 + 1]!, s0 + i * 977); if (c) { c.next = 1500 + rnd(c) * 6000; c.st = IDLE; } }
      } else if (info.cls === BAT) {
        const want = Math.min(info.cap, g.cfg.count ?? info.per);
        for (let i = 0; i < want && n > 0; i++) { const k = i % n; const c = spawn('bat', gi, g, g.spots[k * 2]!, g.spots[k * 2 + 1]!, s0 + i * 977); if (c) { c.alpha = 0; c.shown = false; c.st = PERCH; } }
      } else if (info.cls === ORBIT) {
        const want = Math.min(info.cap, g.cfg.count ?? n * info.per);
        for (let i = 0; i < want && n > 0; i++) { const k = i % n; const c = spawn(g.kind, gi, g, g.spots[k * 2]!, g.spots[k * 2 + 1]!, s0 + i * 977); if (c) { c.aux = (rnd(c) < 0.5 ? -1 : 1) * (1.1 + rnd(c) * 0.9); c.next = 2000 + rnd(c) * 4000; } }
      } else if (info.cls === FIREFLY) {
        const want = Math.min(info.cap, g.cfg.count ?? info.per * Math.max(1, n));
        for (let i = 0; i < want; i++) { const k = n ? i % n : 0; const c = spawn('firefly', gi, g, n ? g.spots[k * 2]! : mapSize / 2, n ? g.spots[k * 2 + 1]! : mapSize / 2, s0 + i * 977); if (c) c.roam = g.cfg.roam ?? 110; }
      } else if (info.cls === FISH) {
        const rn = g.rects.length / 4;
        const want = rn ? Math.min(info.cap, g.cfg.count ?? info.per * rn) : 0;
        for (let i = 0; i < want; i++) {
          const k = i % rn, rx = g.rects[k * 4]!, ry = g.rects[k * 4 + 1]!, rw = g.rects[k * 4 + 2]!, rh = g.rects[k * 4 + 3]!;
          const c = spawn('fish', gi, g, 0, 0, s0 + i * 977);
          if (c) { c.aux2 = k; c.x = rx + 16 + rnd(c) * Math.max(1, rw - 32); c.y = ry + 16 + rnd(c) * Math.max(1, rh - 32); c.tx = c.x; c.ty = c.y; c.next = rnd(c) * 3000; }
        }
      } else if (info.cls === DRIFT || info.cls === SNOW) {
        const want = Math.min(info.cap, g.cfg.count ?? info.per * 3);
        for (let i = 0; i < want; i++) { const c = spawn(g.kind, gi, g, 0, 0, s0 + i * 977); if (c) { c.init = false; c.live = true; } }
      } else if (info.cls === DEVIL) {
        const c = spawn('dustdevil', gi, g, 0, 0, s0); if (c) { c.next = 12000 + rnd(c) * 25000; c.st = 0; }
      } else if (info.cls === SOURCE) {
        for (let i = 0; i < n; i++) { const c = spawn(g.kind, gi, g, g.spots[i * 2]!, g.spots[i * 2 + 1]!, s0 + i * 977); if (c) c.next = 800 + rnd(c) * 3000; }
      } else if (info.cls === PLANE) {
        const c = spawn('aircraft', gi, g, 0, 0, s0); if (c) c.next = 5000 + rnd(c) * 15000;
      }
    }
    last = -1;
  }

  function setWalls(walls: readonly WallLike[]) { if (walls === wallsRef) return; wallsRef = walls; index = indexWalls(walls); }

  /* ------------------------------------------------------------------ events */

  const near = (c: Crit, x: number, y: number, r: number) => Math.abs(c.x - x) < r && Math.abs(c.y - y) < r && Math.hypot(c.x - x, c.y - y) < r;

  function scareBirds(x: number, y: number, r: number, now: number) {
    for (let i = 0; i < count; i++) {
      const c = crits[i]!;
      if (c.cls !== BIRD || c.st !== PERCH || c.at !== Infinity) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      // A bird that has only just landed is jumpy only about what is close.
      if (d < r && (now >= c.wheelEnd || d < 170)) { c.at = now + d * 0.55 + rnd(c) * 140; c.aux = x; c.aux2 = y; }
    }
  }

  function shot(x: number, y: number, now: number) {
    scareBirds(x, y, 340, now);
    for (let i = 0; i < count; i++) {
      const c = crits[i]!;
      if (c.cls === GROUND && c.st !== FLEE && c.st !== HIDE && near(c, x, y, 300)) startFlee(c, x, y, now);
      else if (c.cls === FISH && near(c, x, y, 420)) scareFish(c, x, y, now);
    }
  }

  function boom(x: number, y: number, r: number, now: number) {
    scareBirds(x, y, 620 + r * 2, now);
    const R = 260 + r * 3;
    for (let i = 0; i < count; i++) {
      const c = crits[i]!;
      if (c.cls === GROUND && c.st !== FLEE && c.st !== HIDE && near(c, x, y, 1000)) startFlee(c, x, y, now);
      else if (c.cls === FISH && near(c, x, y, 900)) scareFish(c, x, y, now);
      else if (c.cls === DRIFT || c.cls === ORBIT) {
        const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy);
        if (c.cls === DRIFT && d < R) {
          const k = (1 - d / R), s = (c.kind === 'tumbleweed' ? 330 : 560) * k * k + 70 * k, nx = dx / (d || 1), ny = dy / (d || 1);
          c.vx += nx * s; c.vy += ny * s; c.z = Math.max(c.z, c.kind === 'tumbleweed' ? 10 : 26 * k); c.aux2 = (rnd(c) - 0.5) * 14 * k;
        }
      }
    }
    // Bats pour out of their roost when it is dark and a blast goes off anywhere near.
    for (const g of groups) {
      if (K[g.kind].cls !== BAT || now < g.cool || (darkNow < 0.18 && g.cfg.when !== 'any') || reducedNow) continue;
      let rx = 0, ry = 0;
      if (g.spots.length >= 2) { rx = g.spots[0]!; ry = g.spots[1]!; } else continue;
      if (Math.hypot(rx - x, ry - y) > 1700) continue;
      g.cool = now + 28000;
      g.streak = Math.atan2(mapSize / 2 - ry, mapSize / 2 - rx) + (Math.sin(now) > 0 ? 0.6 : -0.6);
      let k = 0;
      for (let i = 0; i < count; i++) {
        const c = crits[i]!;
        if (c.cls !== BAT || groups[c.gi] !== g || c.st !== PERCH) continue;
        c.at = now + 120 + k++ * 90; c.aux = x; c.aux2 = y;
      }
    }
  }

  function scareFish(c: Crit, x: number, y: number, now: number) {
    const a = Math.atan2(c.y - y, c.x - x) + (rnd(c) - 0.5) * 1.2;
    c.st = 1; c.t0 = now; c.ang = a; c.vx = Math.cos(a) * 150; c.vy = Math.sin(a) * 150;
    if (!reducedNow) for (const r of rings) if (!r.live) { r.live = true; r.x = c.x; r.y = c.y; r.t0 = now; break; }
  }

  function startFlee(c: Crit, x: number, y: number, now: number) {
    const info = K[c.kind];
    if (c.kind === 'dog' && Math.hypot(c.x - x, c.y - y) > 200) return;
    c.st = FLEE; c.t0 = now; c.aux = x; c.aux2 = y;
    if (reducedNow) { c.st = HIDE; c.t0 = now; c.next = now + 7000; return; }
    c.ang = Math.atan2(c.y - y, c.x - x) + (rnd(c) - 0.5) * 0.5;
    c.next = now + 1100 + rnd(c) * 900;
    if (c.kind === 'rat' || c.kind === 'mouse') { c.tx = c.hx; c.ty = c.hy; c.turn = 1; } else c.turn = 0;
    void info;
  }

  /* ------------------------------------------------------------------ players */

  function trackPlayers(list: StepInput['players'], now: number, dt: number) {
    for (let i = 0; i < list.length && i < MAX_PLAYERS; i++) {
      const p = list[i]!;
      if (!p.alive || p.hidden) continue;
      let slot: Pl | null = null;
      for (let k = 0; k < plN; k++) if (pls[k]!.id === p.id) { slot = pls[k]!; break; }
      if (!slot) { if (plN >= MAX_PLAYERS) continue; slot = pls[plN++]!; slot.id = p.id; slot.x = p.x; slot.y = p.y; slot.vx = 0; slot.vy = 0; }
      if (dt > 0) { const k = Math.min(1, dt * 8); slot.vx += ((p.x - slot.x) / dt - slot.vx) * k; slot.vy += ((p.y - slot.y) / dt - slot.vy) * k; }
      if (Math.hypot(p.x - slot.x, p.y - slot.y) > 400) { slot.vx = 0; slot.vy = 0; }
      slot.x = p.x; slot.y = p.y; slot.seen = now;
    }
    // Forget anyone not seen this frame (compacting in place).
    let w = 0;
    for (let k = 0; k < plN; k++) { const p = pls[k]!; if (now - p.seen < 400) { if (w !== k) { const t = pls[w]!; pls[w] = p; pls[k] = t; } w++; } }
    plN = w;
  }

  function nearestPlayer(x: number, y: number, r: number): Pl | null {
    let best: Pl | null = null, bd = r;
    for (let k = 0; k < plN; k++) { const p = pls[k]!; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  /* ------------------------------------------------------------------ per-kind steps */

  function pickPerch(c: Crit, g: Group, ex: number, ey: number): void {
    const n = g.spots.length / 2;
    let best = -1;
    for (let t = 0; t < 10 && n > 1; t++) {
      const k = Math.floor(rnd(c) * n);
      if (g.occ[k] || k === c.pi) continue;
      const px = g.spots[k * 2]!, py = g.spots[k * 2 + 1]!;
      if (Math.hypot(px - ex, py - ey) < 520 || Math.hypot(px - c.x, py - c.y) < 380) continue;
      best = k; break;
    }
    if (best < 0) { let bd = -1; for (let k = 0; k < n; k++) if (!g.occ[k] && k !== c.pi) { const d = Math.hypot(g.spots[k * 2]! - c.x, g.spots[k * 2 + 1]! - c.y); if (d > bd) { bd = d; best = k; } } }
    if (best < 0) best = c.pi >= 0 ? c.pi : 0;
    c.pi = best; g.occ[best] = 1;
    c.tx = g.spots[best * 2]!; c.ty = g.spots[best * 2 + 1]!;
  }

  function stepBird(c: Crit, now: number, dt: number) {
    const g = groups[c.gi]!, info = K[c.kind];
    switch (c.st) {
      case PERCH: {
        // Slow life on the perch: a peck, a look the other way, and now and then a hop across to a quieter spot.
        if (c.pose === 1 && now - c.t0 > 380) c.pose = 0;
        if (now > c.t0 + 1800 + (c.seed & 1023) * 2 && c.pose === 0) {
          c.t0 = now; c.seed = (c.seed + 1) | 0;
          const r = rnd(c);
          if (c.kind !== 'crow' && r < 0.45) c.pose = 1; else if (r < 0.62) c.flip = -c.flip;
        }
        if (c.at === Infinity && horde) {
          // Zombies: crows lift off as the horde walks in.
          for (let h = 0; h < horde.length; h++) { const z = horde[h]!; if (Math.abs(z[2]! - c.x) < 330 && Math.abs(z[3]! - c.y) < 330) { c.at = now + rnd(c) * 400; c.aux = z[2]!; c.aux2 = z[3]!; break; } }
        }
        if (c.at === Infinity) {
          const p = nearestPlayer(c.x, c.y, info.skit);
          if (p) { c.at = now + rnd(c) * 120; c.aux = p.x; c.aux2 = p.y; }
          else if (now > c.next) { c.at = now; c.aux = c.x + (rnd(c) - 0.5) * 80; c.aux2 = c.y + (rnd(c) - 0.5) * 80; c.next = now + 50000 + rnd(c) * 90000; }
        }
        if (c.at <= now) {
          c.at = Infinity;
          if (reducedNow) { g.occ[c.pi] = 0; pickPerch(c, g, c.aux, c.aux2); c.st = FADE; c.t0 = now; break; }
          c.st = LAUNCH; c.t0 = now; c.pose = 2;
          g.occ[c.pi] = 0;
          pickPerch(c, g, c.aux, c.aux2);
          // Away from the scare, then curving round toward the new perch.
          c.ang = Math.atan2(c.y - c.aux2, c.x - c.aux) + (rnd(c) - 0.5) * 1.1;
          c.turn = (rnd(c) < 0.5 ? -1 : 1) * (0.45 + rnd(c) * 0.5);
          c.wheelEnd = now + 1500 + rnd(c) * 1500;
          c.flip = Math.cos(c.ang) >= 0 ? 1 : -1;
          // A burst rustles the whole flock's neighbourhood once.
          if (sound && now - lastSound.flutter > 2200 && !reducedNow) { lastSound.flutter = now; sound('amb:flutter', c.x, c.y, 0.5); }
        }
        // A rare voice from the perch.
        if (c.kind === 'crow' && now > c.next - 1e9 && sound && now - lastSound.caw > 9000 && (c.seed & 255) === ((now / 997) | 0) % 256) { lastSound.caw = now; sound('amb:caw', c.x, c.y, 0.4); }
        if (c.kind === 'gull' && sound && now - lastSound.gull > 11000 && (c.seed & 255) === ((now / 997) | 0) % 256) { lastSound.gull = now; sound('amb:gull', c.x, c.y, 0.4); }
        break;
      }
      case LAUNCH: {
        const t = now - c.t0;
        if (t < 140) c.pose = 2; else if (t < 270) c.pose = 3;
        else { c.st = FLY; c.t0 = now; c.pose = 0; c.vx = Math.cos(c.ang) * info.speed * 0.5; c.vy = Math.sin(c.ang) * info.speed * 0.5; }
        c.z = easeOut(clamp((t - 100) / 300, 0, 1)) * 14;
        break;
      }
      case FLY: case LAND: {
        const t = (now - c.t0) / 1000;
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (now < c.wheelEnd) c.ang += c.turn * dt;
        else { const da = wrapA(Math.atan2(dy, dx) - c.ang); c.ang += clamp(da, -2.4 * dt, 2.4 * dt); }
        const target = c.st === LAND ? Math.max(40, info.speed * clamp(d / 150, 0.25, 1)) : info.speed * (0.6 + 0.4 * easeOut(clamp(t / 0.7, 0, 1)));
        const sp = Math.hypot(c.vx, c.vy), sp2 = sp + (target - sp) * Math.min(1, dt * 3);
        c.vx = Math.cos(c.ang) * sp2; c.vy = Math.sin(c.ang) * sp2;
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.st === FLY) {
          c.z += (62 - c.z) * Math.min(1, dt * 1.6);
          if (now >= c.wheelEnd && d < 190) { c.st = LAND; c.t0 = now; }
        } else {
          c.z = Math.max(0, Math.min(c.z, d * 0.34));
          if (d < 16) { c.st = AWAY; c.t0 = now; c.x = c.tx; c.y = c.ty; c.z = 0; c.pose = 2; c.vx = 0; c.vy = 0; c.flip = Math.cos(c.ang) >= 0 ? 1 : -1; }
        }
        break;
      }
      case AWAY: { // settling: squash, then stand
        if (now - c.t0 > 200) { c.st = PERCH; c.pose = 0; c.t0 = now; c.wheelEnd = now + 6000; c.next = now + 30000 + rnd(c) * 90000; }
        break;
      }
      case FADE: { // reduced motion: dissolve, wait, reappear at the new perch
        const t = now - c.t0;
        if (t < 450) c.alpha = 1 - t / 450;
        else if (t < 7000) { c.alpha = 0; c.x = c.tx; c.y = c.ty; c.z = 0; }
        else if (t < 7450) c.alpha = (t - 7000) / 450;
        else { c.alpha = 1; c.st = PERCH; c.pose = 0; c.t0 = now; }
        break;
      }
    }
  }

  function stepGround(c: Crit, now: number, dt: number, inRange: boolean) {
    const info = K[c.kind];
    const fast = c.kind === 'rat' || c.kind === 'mouse';
    const sitter = !fast;
    const threat = inRange && c.st !== HIDE ? nearestPlayer(c.x, c.y, info.skit) : null;
    if (threat && c.st !== FLEE) startFlee(c, threat.x, threat.y, now);
    if (threat && c.st === FLEE && !reducedNow) { c.aux = threat.x; c.aux2 = threat.y; }
    switch (c.st) {
      case IDLE:
        if (now > c.next) {
          if (reducedNow) { c.next = now + 20000; break; }
          const r = rnd(c);
          if (sitter && r < 0.28) { c.st = NAP; c.next = now + 14000 + rnd(c) * 26000; }
          else {
            const a = rnd(c) * TAU, rr = 40 + rnd(c) * c.roam;
            c.tx = clamp(c.hx + Math.cos(a) * rr, 60, mapSize - 60); c.ty = clamp(c.hy + Math.sin(a) * rr, 60, mapSize - 60);
            c.st = WALK; c.t0 = now; c.aux = c.x; c.aux2 = c.y;
          }
        }
        break;
      case NAP: if (now > c.next) { c.st = IDLE; c.next = now + 2000 + rnd(c) * 4000; } break;
      case WALK: {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (d < 8 || now - c.t0 > 14000) { c.st = IDLE; c.next = now + 2500 + rnd(c) * 9000; break; }
        c.ang += clamp(wrapA(Math.atan2(dy, dx) - c.ang), -4 * dt, 4 * dt);
        const sp = info.speed * (fast ? 1 : 0.9);
        c.x += Math.cos(c.ang) * sp * dt; c.y += Math.sin(c.ang) * sp * dt;
        if (pushOut(index, c, info.radius)) { c.st = IDLE; c.next = now + 600 + rnd(c) * 1500; c.hx = c.x; c.hy = c.y; }
        break;
      }
      case FLEE: {
        if (reducedNow) break;
        const sp = info.speed * (fast ? 3.4 : c.kind === 'dog' ? 1.8 : 3.6);
        if (c.turn === 1) { // to the burrow
          const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
          c.ang += clamp(wrapA(Math.atan2(dy, dx) - c.ang), -9 * dt, 9 * dt);
          c.x += Math.cos(c.ang) * sp * dt; c.y += Math.sin(c.ang) * sp * dt;
          if (pushOut(index, c, info.radius)) c.ang += (rnd(c) - 0.5) * 3;
          if (d < 14) { c.st = HIDE; c.t0 = now; c.next = now + 5000 + rnd(c) * 8000; c.x = c.tx; c.y = c.ty; }
        } else {
          const away = Math.atan2(c.y - c.aux2, c.x - c.aux);
          c.ang += clamp(wrapA(away - c.ang), -7 * dt, 7 * dt);
          const px = c.x, py = c.y;
          c.x += Math.cos(c.ang) * sp * dt; c.y += Math.sin(c.ang) * sp * dt;
          if (pushOut(index, c, info.radius)) { c.ang += hitNx * 0 + (rnd(c) < 0.5 ? 1.3 : -1.3); }
          if (Math.hypot(c.x - px, c.y - py) < sp * dt * 0.2) c.ang += 1.5;
          if (now > c.next && !(threat && Math.hypot(threat.x - c.x, threat.y - c.y) < info.skit)) { c.st = IDLE; c.next = now + 2000 + rnd(c) * 3000; c.hx = clamp(c.x, 60, mapSize - 60); c.hy = clamp(c.y, 60, mapSize - 60); }
        }
        break;
      }
      case HIDE: {
        const t = now - c.t0;
        const wasFade = reducedNow ? 450 : 160;
        c.alpha = t < wasFade ? 1 - t / wasFade : now >= c.next - wasFade ? clamp(1 - (c.next - now) / wasFade, 0, 1) : 0;
        if (now >= c.next) { c.st = IDLE; c.alpha = 1; c.next = now + 3000 + rnd(c) * 5000; if (reducedNow) { c.x = c.hx; c.y = c.hy; } }
        break;
      }
    }
  }

  function stepDrift(c: Crit, now: number, dt: number) {
    const info = K[c.kind];
    const tw = c.kind === 'tumbleweed';
    if (!c.init) { c.init = true; c.x = view.x0 + rnd(c) * (view.x1 - view.x0); c.y = view.y0 + rnd(c) * (view.y1 - view.y0); c.vx = wind.x; c.vy = wind.y; c.aux2 = 0; }
    if (reducedNow) return;
    // Wind: a breeze that swells and drops, with a lazy sideways meander for light things.
    const t = now / 1000;
    const swell = 0.75 + 0.55 * Math.sin(t / 5.3 + c.ph) * Math.sin(t / 2.1 + c.ph * 2);
    const wl = Math.hypot(wind.x, wind.y) || 1, wx = wind.x / wl, wy = wind.y / wl;
    const gust = info.speed * swell * (wl > 30 ? wl / 30 : 1);
    const meander = tw ? 0 : Math.sin(t * 0.8 + c.ph) * info.speed * 0.5;
    const gx = wx * gust - wy * meander, gy = wy * gust + wx * meander;
    const air = c.z > 1;
    const k = Math.min(1, dt * (air ? 0.9 : tw ? 1.3 : 2.2));
    c.vx += (gx - c.vx) * k; c.vy += (gy - c.vy) * k;
    // Players running through kick things along.
    for (let i = 0; i < plN; i++) {
      const p = pls[i]!, dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy), r = 46 + info.radius;
      if (d < r) {
        const sp = Math.hypot(p.vx, p.vy), s = (tw ? 70 : 150) + sp * (tw ? 0.55 : 0.9);
        c.vx += (dx / (d || 1)) * s * dt * 9 + p.vx * dt * 3; c.vy += (dy / (d || 1)) * s * dt * 9 + p.vy * dt * 3;
        if (!tw) c.z = Math.max(c.z, 8 + sp * 0.05);
        c.aux2 = (rnd(c) - 0.5) * 12;
      }
    }
    // Dust devils swirl whatever they pass.
    for (let i = 0; i < count; i++) {
      const dv = crits[i]!;
      if (dv.cls !== DEVIL || dv.st !== 1) continue;
      const dx = c.x - dv.x, dy = c.y - dv.y, d = Math.hypot(dx, dy);
      if (d < 150) { const f = (1 - d / 150) * 260 * dt; c.vx += (-dy / (d || 1)) * f - (dx / (d || 1)) * f * 0.4; c.vy += (dx / (d || 1)) * f - (dy / (d || 1)) * f * 0.4; c.z = Math.max(c.z, 10 * (1 - d / 150)); }
    }
    if (c.z > 0) c.z = Math.max(0, c.z - (tw ? 55 : 22) * dt);
    c.x += c.vx * dt; c.y += c.vy * dt;
    const sp = Math.hypot(c.vx, c.vy);
    if (tw) { c.ang += (sp / 11) * dt * (c.seed & 1 ? 1 : -1); c.pose = (c.pose + sp * dt) % 1000; }
    else { c.ang += (c.aux2 + Math.sin(t * 1.3 + c.ph) * 1.2) * dt; c.aux2 *= Math.max(0, 1 - dt * 1.5); c.pose = (c.pose + dt * 2.2) % 6283; }
    if (pushOut(index, c, info.radius)) {
      if (tw) { const dot = c.vx * hitNx + c.vy * hitNy; if (dot < 0) { c.vx -= 1.7 * dot * hitNx; c.vy -= 1.7 * dot * hitNy; c.z = Math.max(c.z, 6); } }
      else { const dot = c.vx * hitNx + c.vy * hitNy; if (dot < 0) { c.vx -= dot * hitNx; c.vy -= dot * hitNy; } c.aux += 1; }
    } else c.aux = 0;
    // Left the stage (or pinned against a wall for long): come back in from upwind.
    const m = 280;
    if (c.x < view.x0 - m || c.x > view.x1 + m || c.y < view.y0 - m || c.y > view.y1 + m || c.aux > 90) {
      const horiz = Math.abs(wx) > Math.abs(wy);
      for (let tries = 0; tries < 6; tries++) {
        if (horiz) { c.x = wx > 0 ? view.x0 - 40 : view.x1 + 40; c.y = view.y0 + rnd(c) * (view.y1 - view.y0); }
        else { c.y = wy > 0 ? view.y0 - 40 : view.y1 + 40; c.x = view.x0 + rnd(c) * (view.x1 - view.x0); }
        c.x += wx * rnd(c) * 200 * -1; c.y += wy * rnd(c) * 200 * -1;
        if (!pushOut(index, c, info.radius + 8)) break;
      }
      c.vx = wx * info.speed; c.vy = wy * info.speed; c.aux = 0; c.z = 0;
    }
  }

  function stepOrbit(c: Crit, now: number, dt: number) {
    if (reducedNow) { c.x = c.hx + 16; c.y = c.hy; c.z = 26; c.ang = Math.PI / 2; return; }
    const t = now / 1000;
    if (now > c.next) { c.aux = -c.aux; c.next = now + 2500 + rnd(c) * 5000; }
    c.ph += c.aux * dt;
    const r = 15 + 14 * Math.sin(t * 0.7 + c.seed % 7) + (c.kind === 'butterfly' ? 18 : 0);
    const nx = c.hx + Math.cos(c.ph) * r, ny = c.hy + Math.sin(c.ph) * r * 0.8;
    c.ang = Math.atan2(ny - c.y, nx - c.x);
    c.x = nx; c.y = ny; c.z = 26 + 7 * Math.sin(t * 1.3 + c.ph);
  }

  function stepFirefly(c: Crit, now: number) {
    const t = now / 1000;
    c.x = c.hx + Math.sin(t * 0.21 + c.ph) * c.roam + Math.sin(t * 0.53 + c.ph * 2) * c.roam * 0.3;
    c.y = c.hy + Math.cos(t * 0.17 + c.ph * 1.7) * c.roam * 0.7 + Math.cos(t * 0.47 + c.ph) * c.roam * 0.25;
    c.z = 16 + 6 * Math.sin(t * 0.6 + c.ph);
  }

  function stepFish(c: Crit, now: number, dt: number) {
    const g = groups[c.gi]!, k = c.aux2 | 0;
    const rx = g.rects[k * 4]!, ry = g.rects[k * 4 + 1]!, rw = g.rects[k * 4 + 2]!, rh = g.rects[k * 4 + 3]!;
    if (c.st === 1) { // darting
      const t = (now - c.t0) / 1000;
      const f = Math.max(0, 1 - t / 0.7);
      c.x += c.vx * f * dt; c.y += c.vy * f * dt;
      if (t > 0.7) { c.st = 0; c.next = now + 900 + rnd(c) * 1500; c.vx = 0; c.vy = 0; }
    } else {
      if (reducedNow) return;
      if (now > c.next) { c.tx = rx + 16 + rnd(c) * Math.max(1, rw - 32); c.ty = ry + 16 + rnd(c) * Math.max(1, rh - 32); c.next = now + 6000 + rnd(c) * 9000; }
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      if (d > 6) { c.ang += clamp(wrapA(Math.atan2(dy, dx) - c.ang), -1.3 * dt, 1.3 * dt); const sp = K.fish.speed * Math.min(1, d / 40 + 0.3); c.x += Math.cos(c.ang) * sp * dt; c.y += Math.sin(c.ang) * sp * dt; }
    }
    c.x = clamp(c.x, rx + 14, rx + rw - 14); c.y = clamp(c.y, ry + 14, ry + rh - 14);
    if (c.st === 1) c.ang = Math.atan2(c.vy, c.vx);
  }

  function stepBat(c: Crit, now: number, dt: number) {
    const g = groups[c.gi]!;
    const t = (now - c.t0) / 1000;
    if (c.st === PERCH) {
      if (c.at <= now) { c.at = Infinity; c.st = FLY; c.t0 = now; c.x = c.hx; c.y = c.hy; c.shown = true; c.alpha = 0; c.z = 20; c.ang = g.streak + (rnd(c) - 0.5) * 0.8; c.wheelEnd = now + 5500 + rnd(c) * 3500; c.turn = (rnd(c) - 0.5) * 0.7; }
      else if ((darkNow > 0.18 || g.cfg.when === 'any') && !reducedNow && now > g.cool + 40000 && (c.seed & 7) === 0 && now > c.next) { // a lone flyby now and then
        c.next = now + 60000 + rnd(c) * 60000;
        g.streak = rnd(c) * TAU; g.cool = now; c.at = now;
      }
      return;
    }
    c.alpha = Math.min(1, c.alpha + dt * 5);
    const sp = K.bat.speed * (0.85 + 0.25 * Math.sin(now / 600 + c.ph));
    if (now < c.wheelEnd) c.ang += (c.turn + Math.sin(now / 420 + c.ph) * 1.5) * dt;
    else { const dx = c.hx - c.x, dy = c.hy - c.y; c.ang += clamp(wrapA(Math.atan2(dy, dx) - c.ang), -2.2 * dt, 2.2 * dt); if (Math.hypot(dx, dy) < 60) { c.st = PERCH; c.shown = false; c.alpha = 0; c.next = now + 20000; return; } }
    c.x += Math.cos(c.ang) * sp * dt; c.y += Math.sin(c.ang) * sp * dt; c.z = 38 + 8 * Math.sin(now / 700 + c.ph);
    void t;
  }

  function puff(x: number, y: number, now: number, smoke: boolean, size: number, life: number) {
    for (const p of puffs) if (!p.live) { p.live = true; p.x = x; p.y = y; p.z = 4; p.vx = wind.x * 0.5; p.t0 = now; p.life = life; p.size = size; p.smoke = smoke; return; }
  }

  function stepSource(c: Crit, now: number) {
    if (reducedNow || now < c.next) return;
    if (c.kind === 'steam') { for (let i = 0; i < 3; i++) puff(c.x + (rnd(c) - 0.5) * 6, c.y + (rnd(c) - 0.5) * 4 - i * 3, now + i * 140, false, 12, 1500); c.next = now + 2200 + rnd(c) * 2600; }
    else { for (let i = 0; i < 5; i++) puff(c.x + (rnd(c) - 0.5) * 8, c.y - i * 4, now + i * 260, true, 22, 3200); c.next = now + (groups[c.gi]!.cfg.periodMs ?? 70000) * (0.8 + 0.4 * rnd(c)); }
  }

  function stepDevil(c: Crit, now: number, dt: number) {
    if (reducedNow) { c.st = 0; return; }
    const wl = Math.hypot(wind.x, wind.y) || 1, wx = wind.x / wl, wy = wind.y / wl;
    if (c.st === 0) {
      if (now > c.next) {
        c.st = 1; c.t0 = now;
        const horiz = Math.abs(wx) > Math.abs(wy);
        c.x = horiz ? (wx > 0 ? view.x0 - 60 : view.x1 + 60) : view.x0 + (0.2 + rnd(c) * 0.6) * (view.x1 - view.x0);
        c.y = horiz ? view.y0 + (0.2 + rnd(c) * 0.6) * (view.y1 - view.y0) : (wy > 0 ? view.y0 - 60 : view.y1 + 60);
        c.ang = Math.atan2(wy, wx);
      }
      return;
    }
    const t = (now - c.t0) / 1000;
    const a = c.ang + Math.sin(t * 0.35 + c.ph) * 0.7;
    c.x += Math.cos(a) * K.dustdevil.speed * dt; c.y += Math.sin(a) * K.dustdevil.speed * dt;
    if (pushOut(index, c, 14)) c.ang += 0.5;
    c.alpha = Math.min(1, t / 1.5);
    if (t > 8 && (c.x < view.x0 - 200 || c.x > view.x1 + 200 || c.y < view.y0 - 200 || c.y > view.y1 + 200 || t > 55)) { c.st = 0; c.next = now + 40000 + rnd(c) * 50000; }
  }

  function stepPlane(c: Crit, now: number) {
    const g = groups[c.gi]!;
    const path = g.cfg.path;
    if (!path || reducedNow) { c.st = 0; return; }
    const dur = g.cfg.periodMs ?? 90000;
    if (c.st === 0) { if (now > c.next) { c.st = 1; c.t0 = now; } return; }
    const p = (now - c.t0) / dur;
    if (p >= 1) { c.st = 0; c.next = now + dur * (0.5 + rnd(c)); return; }
    c.x = path[0].x + (path[1].x - path[0].x) * p; c.y = path[0].y + (path[1].y - path[0].y) * p;
    c.ang = Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);
    c.alpha = Math.min(1, p * 12, (1 - p) * 12);
  }

  /* ------------------------------------------------------------------ the frame step */

  function step(now: number, input: StepInput) {
    if (!groups.length) return;
    const dt = last < 0 ? 0 : clamp((now - last) / 1000, 0, 0.05);
    last = now; lastNow.v = now;
    view.x0 = input.view.x0; view.y0 = input.view.y0; view.x1 = input.view.x1; view.y1 = input.view.y1;
    darkNow = input.dark; reducedNow = input.reduced; horde = input.horde?.length ? input.horde : null;
    trackPlayers(input.players, now, dt);
    const cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2, reach = Math.hypot(view.x1 - view.x0, view.y1 - view.y0) / 2 + 700;
    for (let i = 0; i < count; i++) {
      const c = crits[i]!;
      if (!c.live) continue;
      // Time of day: day things fade out at night and the other way round.
      if (c.cls !== BAT && c.cls !== PLANE && c.cls !== DEVIL && c.cls !== BIRD && c.cls !== GROUND) {
        const want = c.when === WHEN_NIGHT ? clamp((darkNow - 0.12) / 0.25, 0, 1) : c.when === WHEN_DAY ? clamp(1 - (darkNow - 0.15) / 0.3, 0, 1) : 1;
        if (c.cls === FIREFLY || c.cls === ORBIT || c.cls === FISH || c.cls === DRIFT || c.cls === SNOW) c.alpha += (want - c.alpha) * Math.min(1, dt * 2);
      }
      const inRange = Math.abs(c.x - cx) < reach && Math.abs(c.y - cy) < reach;
      switch (c.cls) {
        case BIRD: stepBird(c, now, dt); break;
        case GROUND: stepGround(c, now, dt, inRange); break;
        case DRIFT: stepDrift(c, now, dt); break;
        case ORBIT: if (c.alpha > 0.01) stepOrbit(c, now, dt); break;
        case FIREFLY: if (c.alpha > 0.01) stepFirefly(c, now); break;
        case FISH: stepFish(c, now, dt); break;
        case BAT: stepBat(c, now, dt); break;
        case SOURCE: stepSource(c, now); break;
        case DEVIL: stepDevil(c, now, dt); break;
        case PLANE: if (darkNow > 0.12 || c.when === WHEN_ANY) stepPlane(c, now); break;
        case SNOW: if (!c.init) { c.init = true; c.x = rnd(c); c.y = rnd(c); } c.pose = 18 + (c.seed & 15) * 1.6; break;
      }
    }
    for (const p of puffs) if (p.live) { const t = now - p.t0; if (t > p.life) p.live = false; else if (t >= 0) { p.z += (p.smoke ? 14 : 24) * dt; p.x += p.vx * dt; } }
    for (const r of rings) if (r.live && now - r.t0 > 900) r.live = false;
  }

  /* ------------------------------------------------------------------ drawing */

  const frameFor = (now: number, hz: number, n: number, phase = 0) => ((Math.floor((now / 1000) * hz * n + phase) % n) + n) % n;
  const onScreen = (v: View, x: number, y: number, m: number) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
  const BONE = '#e2dccb', SMOKE = '#5a5550';

  /** The ground layer: drifting litter, creatures on the floor and on wall tops, burrows, ripples, steam and the shadows of flyers. */
  function drawGround(ctx: CanvasRenderingContext2D, now: number, v: View, dark: number) {
    if (!count) return;
    const night = dark > 0.5;
    let drawn = 0;
    // Burrows and ripples first.
    for (let i = 0; i < count; i++) {
      const c = crits[i]!;
      if (!c.live || (c.kind !== 'rat' && c.kind !== 'mouse') || !onScreen(v, c.hx, c.hy, 40)) continue;
      ctx.fillStyle = 'rgba(14, 12, 10, 0.55)'; ctx.beginPath(); ctx.ellipse(c.hx, c.hy + 1, 8, 4.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(125, 119, 106, 0.55)'; ctx.beginPath(); ctx.ellipse(c.hx - 0.6, c.hy - 0.8, 8.4, 4.4, 0, Math.PI * 0.95, Math.PI * 1.95); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(125, 119, 106, 0.6)'; ctx.stroke();
    }
    for (const r of rings) if (r.live && onScreen(v, r.x, r.y, 40)) {
      const k = (now - r.t0) / 900;
      ctx.globalAlpha = 0.42 * (1 - k); ctx.strokeStyle = BONE; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 4 + 20 * easeOut(k), 2.6 + 13 * easeOut(k), 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < count && drawn < VIEW_DRAW_CAP; i++) {
      const c = crits[i]!;
      if (!c.live || c.alpha < 0.02) continue;
      const info = K[c.kind];
      if (!onScreen(v, c.x, c.y, 80)) continue;
      switch (c.cls) {
        case BIRD: {
          drawn++;
          if (c.st === FLY || c.st === LAND || (c.st === LAUNCH && c.z > 3)) {
            // The shadow far below a flying bird: down and right, away from the key light, smaller the higher it goes.
            const s = info.sprite === 'gull' ? 11 : info.sprite === 'sparrow' ? 5 : 8, o = c.z * 0.9;
            ctx.globalAlpha = 0.3 * c.alpha; ctx.fillStyle = '#0a0c12';
            ctx.beginPath(); ctx.ellipse(c.x + o * 0.62, c.y + o * 0.78, s * (1.5 - c.z / 200), s * 0.8, c.ang, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
            break;
          }
          const cell = cellOf(info.sprite!, c.pose, night);
          ctx.save(); ctx.translate(c.x, c.y); if (c.alpha < 1) ctx.globalAlpha = c.alpha;
          ctx.scale(c.flip * c.sc * (c.pose === 2 ? 1.04 : 1), c.sc * (c.pose === 2 ? 0.96 : 1));
          putCell(ctx, cell); ctx.restore();
          break;
        }
        case GROUND: {
          drawn++;
          const rest = c.st === NAP ? 5 : c.st === IDLE ? 4 : c.st === HIDE ? 4 : -1;
          const spd = c.st === FLEE ? 4 : 2.2;
          const frame = rest >= 0 ? rest : frameFor(now, spd, 4, c.ph);
          const cell = cellOf(info.sprite!, frame, night);
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang); if (c.alpha < 1) ctx.globalAlpha = c.alpha; ctx.scale(c.sc, c.sc);
          putCell(ctx, cell); ctx.restore();
          break;
        }
        case DRIFT: {
          drawn++;
          const air = c.z > 1;
          if (air) { ctx.globalAlpha = 0.28 * c.alpha; ctx.fillStyle = '#0a0c12'; ctx.beginPath(); ctx.ellipse(c.x + 1 + c.z * 0.3, c.y + 2 + c.z * 0.4, 6, 3, 0, 0, TAU); ctx.fill(); }
          const cell = cellOf(info.sprite!, c.kind === 'leaf' ? (c.seed & 3) % 3 : c.kind === 'paper' ? c.seed & 1 : 0, night);
          ctx.save(); ctx.translate(c.x, c.y - c.z * 0.55); ctx.rotate(c.ang);
          ctx.globalAlpha = c.alpha;
          if (c.kind !== 'tumbleweed') ctx.scale(c.sc, c.sc * (0.45 + 0.55 * Math.abs(Math.cos(c.pose)))); else ctx.scale(c.sc, c.sc);
          putCell(ctx, cell); ctx.restore(); ctx.globalAlpha = 1;
          break;
        }
        case FISH: {
          drawn++;
          const cell = cellOf('fish', frameFor(now, c.st === 1 ? 3.5 : 1.5, 3, c.ph), false);
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang); ctx.globalAlpha = 0.9 * c.alpha; ctx.scale(c.sc, c.sc); putCell(ctx, cell); ctx.restore(); ctx.globalAlpha = 1;
          break;
        }
        case DEVIL: {
          if (c.st !== 1) break;
          drawn++;
          ctx.fillStyle = '#d2cab4';
          for (let k = 0; k < 7; k++) {
            const h = k / 6, rr = 7 + 24 * h, off = Math.sin(now / 900 + k * 0.9) * (2 + 5 * h);
            ctx.globalAlpha = (0.34 - 0.2 * h) * c.alpha;
            ctx.beginPath(); ctx.ellipse(c.x + off + h * 14, c.y - h * 52, rr, rr * 0.38, 0, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 0.5 * c.alpha;
          for (let k = 0; k < 6; k++) { const a = now / 600 + k * 1.05, h = ((k * 0.37 + now / 3000) % 1); ctx.fillRect(c.x + Math.cos(a) * (8 + 14 * h) + h * 14 - 1, c.y - h * 52 + Math.sin(a) * 4 - 1, 2.4, 2.4); }
          ctx.globalAlpha = 1;
          break;
        }
        default: break;
      }
    }
    for (const p of puffs) {
      if (!p.live) continue;
      const t = (now - p.t0) / p.life;
      if (t < 0 || !onScreen(v, p.x, p.y, 60)) continue;
      const r = p.size * (0.5 + 0.9 * easeOut(t));
      ctx.globalAlpha = (p.smoke ? 0.55 : 0.6) * (1 - t) * (1 - t * 0.4);
      ctx.fillStyle = p.smoke ? (night ? '#3a3835' : SMOKE) : (night ? '#9aa3b0' : BONE);
      ctx.beginPath(); ctx.arc(p.x, p.y - p.z * 0.6, r, 0, TAU); ctx.fill();
      ctx.globalAlpha *= 0.7; ctx.fillStyle = p.smoke ? '#7a756e' : '#fffcf0';
      ctx.beginPath(); ctx.arc(p.x - r * 0.28, p.y - p.z * 0.6 - r * 0.3, r * 0.5, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Above the walls and roofs: flyers, moths, fireflies, snow, aircraft lights. */
  function drawSky(ctx: CanvasRenderingContext2D, now: number, v: View, dark: number) {
    if (!count) return;
    const night = dark > 0.35;
    let glows = 0;
    for (let i = 0; i < count; i++) {
      const c = crits[i]!;
      if (!c.live || c.alpha < 0.02) continue;
      const info = K[c.kind];
      switch (c.cls) {
        case BIRD: {
          if (!(c.st === FLY || c.st === LAND || (c.st === LAUNCH && c.z > 3)) || !onScreen(v, c.x, c.y - c.z * 0.6, 90)) break;
          const fly = (info.sprite + '.fly') as SpriteId;
          const landing = c.st === LAND && c.z < 10;
          const frame = landing ? 1 + frameFor(now, 4, 2, c.ph) : c.st === LAUNCH ? frameFor(now, 4, 4, c.ph) : frameFor(now, info.flapHz, 4, c.ph);
          const dim = dark > 0.5;
          ctx.save(); ctx.translate(c.x, c.y - c.z * 0.6); ctx.rotate(c.ang);
          const s = c.sc * (1 + c.z / 260);
          ctx.scale(s, s); if (c.alpha < 1) ctx.globalAlpha = c.alpha;
          putCell(ctx, cellOf(fly, frame, dim)); ctx.restore();
          break;
        }
        case BAT: {
          if (c.st === PERCH || !onScreen(v, c.x, c.y, 90)) break;
          ctx.save(); ctx.translate(c.x, c.y - c.z * 0.6); ctx.rotate(c.ang); ctx.globalAlpha = c.alpha; ctx.scale(c.sc, c.sc);
          putCell(ctx, cellOf('bat', frameFor(now, 4, 4, c.ph), dark > 0.5)); ctx.restore(); ctx.globalAlpha = 1;
          // Its shadow on the ground far below.
          ctx.globalAlpha = 0.25 * c.alpha; ctx.fillStyle = '#0a0c12'; ctx.beginPath(); ctx.ellipse(c.x + c.z * 0.6, c.y + c.z * 0.8, 9, 4, c.ang, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          break;
        }
        case ORBIT: {
          if (!onScreen(v, c.x, c.y, 60)) break;
          const sprite = c.kind === 'moth' ? 'moth' : 'butterfly';
          const fr = reducedNow ? 1 : frameFor(now, info.flapHz, 3, c.ph);
          ctx.save(); ctx.translate(c.x, c.y - c.z * 0.55); ctx.rotate(c.ang); ctx.globalAlpha = c.alpha; ctx.scale(c.sc * 0.9, c.sc * 0.9);
          putCell(ctx, cellOf(sprite, fr, dark > 0.5)); ctx.restore(); ctx.globalAlpha = 1;
          break;
        }
        case SNOW: {
          const w = v.x1 - v.x0, h = v.y1 - v.y0, t = now / 1000;
          const sp = c.pose;
          const x = v.x0 + (((c.x + t * (wind.x * 0.004 + 0.012) * (1 + (c.seed & 3) * 0.1)) % 1) + 1) % 1 * w;
          const y = v.y0 + (((c.y + t * sp * 0.0016 / (h / 1000)) % 1) + 1) % 1 * h;
          const sway = reducedNow ? 0 : Math.sin(t * 0.9 + c.ph) * 5;
          ctx.globalAlpha = 0.75 * c.alpha; ctx.fillStyle = BONE;
          const z = 2 + (c.seed & 3) * 0.55;
          ctx.fillRect(x + sway, y, z, z);
          break;
        }
        default: break;
      }
    }
    ctx.globalAlpha = 1;
    // Lights: fireflies and the aircraft, additive.
    if (night || count) {
      let started = false;
      for (let i = 0; i < count && glows < 60; i++) {
        const c = crits[i]!;
        if (!c.live || c.alpha < 0.02) continue;
        if (c.cls === FIREFLY) {
          if (!onScreen(v, c.x, c.y, 40)) continue;
          const pulse = reducedNow ? 0.6 : Math.pow(Math.max(0, Math.sin(now / 1000 * 0.9 + c.ph * 3)), 3);
          if (pulse < 0.04) continue;
          if (!started) { ctx.globalCompositeOperation = 'lighter'; started = true; }
          ctx.globalAlpha = pulse * c.alpha;
          ctx.save(); ctx.translate(c.x, c.y - c.z * 0.5); ctx.scale(0.6, 0.6); putCell(ctx, cellOf('glowGreen', 0, false)); ctx.restore();
          glows++;
        } else if (c.cls === PLANE && c.st === 1) {
          if (!started) { ctx.globalCompositeOperation = 'lighter'; started = true; }
          const nx = -Math.sin(c.ang), ny = Math.cos(c.ang), a = c.alpha * (reducedNow ? 0 : 1);
          const blink = (now % 1200) < 110 ? 1 : 0;
          ctx.globalAlpha = a;
          for (const [ox, oy, col, r] of [[nx * 9, ny * 9, '#ff3b30', 2.3], [-nx * 9, -ny * 9, '#35e08a', 2.3], [-Math.cos(c.ang) * 8, -Math.sin(c.ang) * 8, '#ffffff', blink ? 2.8 : 0]] as const) {
            if (r <= 0) continue;
            ctx.fillStyle = col; ctx.globalAlpha = a * 0.22; ctx.beginPath(); ctx.arc(c.x + ox, c.y + oy, r * 3.2, 0, TAU); ctx.fill();
            ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(c.x + ox, c.y + oy, r, 0, TAU); ctx.fill();
          }
          glows++;
        }
      }
      if (started) { ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
    }
  }

  return {
    load, step, shot, boom, drawGround, drawSky, setWalls,
    setSound(s: AmbientSound | null) { sound = s; },
    get mapKey() { return mapKey; },
    get crits(): readonly Crit[] { return crits; },
    get count() { return count; },
    get groups() { return groups; },
    puffsLive: () => puffs.reduce((n, p) => n + (p.live ? 1 : 0), 0),
    reset() { count = 0; groups = []; mapKey = ''; last = -1; for (const c of crits) c.live = false; },
  };
}

export type Ambient = ReturnType<typeof createAmbient>;
export const MAX_AMBIENT = MAX_CRITS;
