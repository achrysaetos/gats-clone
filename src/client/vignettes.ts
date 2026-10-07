import type { MapDef, MapWall } from '../shared/maps.ts';
import type { Keepout, Region } from './decor.ts';

/**
 * The hand-set small stories of a yard (the part that says someone cared): a forklift with its door open and a lunchbox on the
 * seat, a dartboard on the office wall, a guard booth with a tiny TV, a chalk tally of days, a cat on a container, and a few
 * easter eggs in the dead corners. Each district gets its own two or three; each map has one thread of lore running through its
 * posters. Everything lives in the margins: floor pieces hug walls outside the keep-out, wall pieces sit on a wall's face or top.
 * Placement is pure and seeded (nothing here touches the DOM); vignetteart.ts draws them.
 */

export type VKind =
  | 'forklift' | 'cones' | 'ashbin' | 'bike' | 'camp' | 'carcube' | 'barrier' | 'tires' | 'drums' | 'toolchest' | 'bench' | 'duck'
  | 'tally' | 'dartboard' | 'tag' | 'heart' | 'kilroy'
  | 'poster' | 'flag' | 'booth' | 'charger' | 'cat';

/** The kinds drawn into the baked floor; the rest are drawn per frame (they sit on walls or move). */
export const FLOOR_VIGNETTES: ReadonlySet<VKind> = new Set<VKind>(['forklift', 'cones', 'ashbin', 'bike', 'camp', 'carcube', 'barrier', 'tires', 'drums', 'toolchest', 'bench', 'duck']);
/** Found-it-yourself pieces: small, low in contrast, in the quietest corners. */
export const EASTER_EGGS: ReadonlySet<VKind> = new Set<VKind>(['duck', 'tag', 'heart', 'kilroy']);

export type Vignette = { k: VKind; x: number; y: number; rot: number; region: number; seed: number; wall: number; text?: readonly string[]; w?: number; h?: number };

export type Spot = { wi: number; wall: MapWall; side: 'n' | 's' | 'e' | 'w'; px: number; py: number; len: number; t: number };

/** One thread per map, told across its posters: what this yard was, and what happened to it. */
export const LORE: Record<string, readonly (readonly string[])[]> = {
  Causeway: [['CAUSEWAY FREIGHT', 'EST. 1961'], ['NIGHT SHIFT', 'LOCK UP BY 10'], ['0 DAYS WITHOUT', 'AN INCIDENT'], ['UNION MEETING', 'TUES. BRING SNACKS'], ['WHO TOOK THE', 'GOOD FORKLIFT?'], ['THE TOY TRAINS', 'RUN LATE AGAIN']],
  Plaza: [['PLAZA DEPOT No.2', 'OPEN SINCE 74'], ['SUMMER FAIR', 'CANCELLED'], ['LOST CAT', "ANSWERS TO 'SARGE'"], ['FOUND: ONE BOOT', 'ASK AT LOT C'], ['THE FAIR WILL', 'RETURN. PROBABLY'], ['PARK AT YOUR', 'OWN RISK']],
  'Old Town': [['OLD TOWN WORKS', 'SINCE 1888'], ['CLOCK STOPPED', 'AT 3:10'], ['MIND THE GAP', 'IT BITES'], ['SHIFT BELL', 'AT SIX'], ['THE LAST TRAIN', 'LEFT AT DUSK'], ['SOLDIERS WANTED', 'APPLY WITHIN']],
  Quarry: [['QUARRY No.9', 'STONE & GRAVEL'], ['BLAST AT 4PM', 'STAND CLEAR'], ['SIREN TEST', 'FRIDAYS'], ['COFFEE IS', 'FOR CLOSERS'], ['THE BIG ONE', 'STILL DOWN THERE'], ['DIG DEEP', 'DIG HONEST']],
};
const FALLBACK_LORE: readonly (readonly string[])[] = [['NIGHT OP', 'KEEP QUIET'], ['AUTHORISED', 'TOYS ONLY']];

type Ctx = {
  map: Pick<MapDef, 'name' | 'size' | 'walls'>;
  keep: Keepout;
  rand: () => number;
  regions: readonly Region[];
  regionAt: (x: number, y: number, size: number) => number;
  /** Candidate places along every wall side, in a random order. */
  spots: readonly Spot[];
  outward: (s: Spot, off: number) => { x: number; y: number };
  openness: (s: Spot) => number;
  face: (w: MapWall) => number;
  /** Walls carrying a landmark: no wall-top piece goes there, except the cat. */
  landWalls: ReadonlySet<number>;
  landmarks: readonly { kind: string; x: number; y: number; w: number; h: number; region: number; wall: number }[];
  /** Fixture positions already placed, so a story never sits on a lamp. */
  fixtures: readonly { x: number; y: number }[];
};

/** One of each egg, in the district named, found in the spot furthest from any lane. */
const EGGS: readonly { k: VKind; region: number }[] = [{ k: 'duck', region: 6 }, { k: 'tag', region: 3 }, { k: 'heart', region: 2 }, { k: 'kilroy', region: 5 }];

const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};

const FACE_KINDS: ReadonlySet<VKind> = new Set<VKind>(['tally', 'dartboard', 'tag', 'heart', 'kilroy']);
const TOP_KINDS: ReadonlySet<VKind> = new Set<VKind>(['poster', 'flag', 'booth', 'charger']);
const FLOOR_R: Partial<Record<VKind, number>> = { forklift: 34, cones: 20, ashbin: 14, bike: 24, camp: 34, carcube: 26, barrier: 34, tires: 18, drums: 24, toolchest: 22, bench: 28, duck: 8 };

export function placeVignettes(c: Ctx): { vignettes: Vignette[]; lanterns: { x: number; y: number }[] } {
  const out: Vignette[] = [];
  const lanterns: { x: number; y: number }[] = [];
  const lore = LORE[c.map.name] ?? FALLBACK_LORE;
  let posterIx = 0;
  const near = (x: number, y: number, d: number) => out.some((v) => Math.hypot(v.x - x, v.y - y) < d) || c.fixtures.some((f) => Math.hypot(f.x - x, f.y - y) < Math.max(40, d * 0.5));
  const laneDist = (x: number, y: number) => c.keep.lanes.reduce((m, l) => Math.min(m, distToSeg(x, y, l.ax, l.ay, l.bx, l.by)), Infinity);
  const solidWall = (s: Spot) => s.wall.material !== 'planter';

  const put = (k: VKind, region: number, quiet: boolean): boolean => {
    const cands = c.spots.filter((s) => c.regionAt(s.px, s.py, c.map.size) === region && solidWall(s));
    if (k === 'cat') {
      const lm = c.landmarks.find((l) => l.region === region);
      if (!lm) return false;
      // The cat sits on a container roof, off-centre where the roof is least busy.
      out.push({ k, x: lm.x + lm.w * (0.25 + c.rand() * 0.5), y: lm.y + lm.h * (0.3 + c.rand() * 0.4), rot: 0, region, seed: Math.floor(c.rand() * 1e6), wall: lm.wall });
      return true;
    }
    let best: { v: Vignette; score: number } | null = null;
    for (const s of cands) {
      let v: Vignette | null = null;
      const seed = Math.floor(c.rand() * 1e6);
      if (FACE_KINDS.has(k)) {
        if (s.side !== 's' || c.face(s.wall) < 14 || s.len < 70 || s.t < 24 || s.t > s.len - 24) continue;
        v = { k, x: s.px, y: s.py, rot: 0, region, seed, wall: s.wi };
      } else if (TOP_KINDS.has(k)) {
        if (c.landWalls.has(s.wi)) continue;
        const w = s.wall;
        if (k === 'poster' && (Math.min(w.w, w.h) < 50 || Math.max(w.w, w.h) < 80)) continue;
        if (k === 'booth' && (w.w < 80 || w.h < 50)) continue;
        if (k === 'flag' && Math.max(w.w, w.h) < 60) continue;
        if (k === 'charger') {
          const p = c.outward(s, 16);
          if (c.keep.blocked(p.x, p.y, 12) || s.len < 60) continue;
          v = { k, x: p.x, y: p.y, rot: s.side === 'n' || s.side === 's' ? 0 : Math.PI / 2, region, seed, wall: s.wi };
        } else {
          v = { k, x: w.x + w.w / 2, y: w.y + w.h / 2, rot: w.w >= w.h ? 0 : Math.PI / 2, region, seed, wall: s.wi, w: w.w, h: w.h };
          if (k === 'poster') v.text = lore[posterIx % lore.length]!;
          if (k === 'flag') { v.x = w.x + (c.rand() < 0.5 ? 14 : w.w - 14); v.y = w.y + w.h - 12; }
        }
      } else {
        const r = FLOOR_R[k] ?? 20;
        const p = c.outward(s, 8 + r);
        if (c.keep.blocked(p.x, p.y, r)) continue;
        v = { k, x: p.x, y: p.y, rot: s.side === 'n' || s.side === 's' ? 0 : Math.PI / 2, region, seed, wall: s.wi };
        if (s.side === 'n' || s.side === 'e') v.rot += Math.PI;
      }
      if (near(v.x, v.y, FACE_KINDS.has(k) ? 90 : 160)) continue;
      if (k === 'poster' && out.some((o) => o.k === 'poster' && o.wall === s.wi)) continue;
      // Stories prefer the quiet end of a district; eggs insist on the quietest spot of all.
      const score = laneDist(v.x, v.y) * (quiet ? 3 : 1) + c.rand() * 150;
      if (!best || score > best.score) best = { v, score };
      if (!quiet && best && out.length > 400) break;
    }
    if (!best) return false;
    out.push(best.v);
    if (k === 'poster') posterIx++;
    if (k === 'camp') lanterns.push({ x: best.v.x + Math.cos(best.v.rot + 0.9) * 24, y: best.v.y + Math.sin(best.v.rot + 0.9) * 24 });
    return true;
  };

  for (const [ri, reg] of c.regions.entries()) for (const k of reg.stories) put(k, ri, false);
  for (const e of EGGS) put(e.k, e.region, true);
  return { vignettes: out, lanterns };
}
