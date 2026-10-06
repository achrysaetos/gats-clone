import { WORLD, ZOM, ZOMBIES } from '../defs.ts';
import { damagePlayer } from './combat.ts';
import { clamp, dist2, rectsOverlap, segmentEntersRectAt, slide, type Rect } from './movement.ts';
import { MAPS } from '../maps.ts';
import { cellRect } from './build.ts';
import { coreRect, coverRects, solidRects, type Building, type Player, type Run, type World, type Zombie } from './world.ts';

const UNREACHABLE = 0xffff;
const ORTH = 10, DIAG = 14;
const WALL_COST = ZOM.wallCostCells * ORTH;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

const cellAt = (x: number, y: number, grid: number) =>
  clamp(Math.floor(y / ZOM.cell), 0, grid - 1) * grid + clamp(Math.floor(x / ZOM.cell), 0, grid - 1);

function cellsUnder(r: Rect, grid: number, mark: (c: number) => void) {
  const x0 = Math.max(0, Math.floor(r.x / ZOM.cell)), x1 = Math.min(grid - 1, Math.ceil((r.x + r.w) / ZOM.cell) - 1);
  const y0 = Math.max(0, Math.floor(r.y / ZOM.cell)), y1 = Math.min(grid - 1, Math.ceil((r.y + r.h) / ZOM.cell) - 1);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (rectsOverlap(r, cellRect(cx, cy))) mark(cy * grid + cx);
}

/**
 * Each cell's cost to reach the core, by Dijkstra out from the core's cells. Cover is impassable; a squad wall costs `ZOM.wallCostCells` steps
 * to walk into, so the horde takes any open way round and chews through a wall only when the core is walled in.
 * A diagonal step needs both cells it cuts past to be open, so a zombie never clips a corner.
 */
function buildFlow(w: World, core: Rect, grid: number): Uint16Array {
  const blocked = new Uint8Array(grid * grid);
  for (const r of coverRects(w)) cellsUnder(r, grid, (c) => { blocked[c] = 1; });
  const walled = new Uint8Array(grid * grid);
  for (const b of w.buildings) walled[b.cy * grid + b.cx] = 1;
  const cost = new Uint16Array(grid * grid).fill(UNREACHABLE);
  const heap: number[] = [];
  const push = (c: number) => {
    heap.push(c);
    for (let i = heap.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (cost[heap[up]!]! <= cost[c]!) break;
      heap[i] = heap[up]!;
      heap[up] = c;
      i = up;
    }
  };
  const pop = (): number => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && cost[heap[l]!]! < cost[heap[m]!]!) m = l;
        if (r < heap.length && cost[heap[r]!]! < cost[heap[m]!]!) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };
  cellsUnder(core, grid, (c) => { cost[c] = 0; push(c); });
  const done = new Uint8Array(grid * grid);
  while (heap.length > 0) {
    const b = pop();
    if (done[b]) continue;
    done[b] = 1;
    const bx = b % grid, by = (b - bx) / grid;
    const enter = cost[b]! + (walled[b] ? WALL_COST : 0);
    for (const [dx, dy] of NEIGHBORS) {
      const ax = bx + dx, ay = by + dy;
      if (ax < 0 || ay < 0 || ax >= grid || ay >= grid) continue;
      const a = ay * grid + ax;
      if (blocked[a] || done[a]) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && !(open(ax, by) && open(bx, ay))) continue;
      const next = Math.min(UNREACHABLE - 1, enter + (diagonal ? DIAG : ORTH));
      if (next < cost[a]!) { cost[a] = next; push(a); }
    }
  }
  return cost;

  function open(cx: number, cy: number) {
    const c = cy * grid + cx;
    return !blocked[c] && !walled[c];
  }
}

function flowFor(w: World, run: Run, core: Rect, grid: number): Uint16Array {
  const f = run.flow;
  if (f && f.wallsVersion === w.wallsVersion && f.buildingsVersion === w.buildingsVersion) return f.cost;
  run.flow = { wallsVersion: w.wallsVersion, buildingsVersion: w.buildingsVersion, cost: buildFlow(w, core, grid) };
  return run.flow.cost;
}

/** The neighboring cell one step closer to the core, or null when the zombie's cell has no way there. A cell's flow cost leaves out walking into it, so a wall's is added here. */
function nextCell(flow: Uint16Array, c: number, walled: (c: number) => boolean, grid: number): number | null {
  const isOpen = (n: number) => flow[n]! < UNREACHABLE && !walled(n);
  const cx = c % grid, cy = (c - cx) / grid;
  let best: number | null = null, bestCost = UNREACHABLE;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
    const n = ny * grid + nx;
    const diagonal = dx !== 0 && dy !== 0;
    if (diagonal && !(isOpen(ny * grid + cx) && isOpen(cy * grid + nx))) continue;
    const cost = flow[n]! + (diagonal ? DIAG : ORTH) + (walled(n) ? WALL_COST : 0);
    if (flow[n]! < UNREACHABLE && cost < bestCost) { best = n; bestCost = cost; }
  }
  return best;
}

export const distToRect = (x: number, y: number, r: Rect) => Math.sqrt(dist2(x, y, clamp(x, r.x, r.x + r.w), clamp(y, r.y, r.y + r.h)));

/** The nearest squad player standing within the zombie's aggro range with nothing solid between. Downed players are left to their squad. */
function preyFor(w: World, z: Zombie, solids: readonly Rect[]): Player | null {
  let best: Player | null = null, bestD = ZOMBIES[z.kind].aggroPx ** 2;
  for (const p of w.players.values()) {
    if (p.life.k !== 'alive') continue;
    const d = dist2(p.x, p.y, z.x, z.y);
    if (d > bestD || solids.some((s) => segmentEntersRectAt(z.x, z.y, p.x - z.x, p.y - z.y, s) !== null)) continue;
    best = p;
    bestD = d;
  }
  return best;
}

/** The core takes `amount`, and every `ZOM.survivorHp` of it costs a survivor inside, however well the core is mended between. */
export function hurtCore(run: Run, amount: number) {
  run.core.hp = Math.max(0, run.core.hp - amount);
  run.harm += amount;
  const lost = Math.min(run.survivors, Math.floor(run.harm / ZOM.survivorHp));
  run.harm -= lost * ZOM.survivorHp;
  run.survivors -= lost;
  run.lost += lost;
}

export function biteBuilding(w: World, b: Building, amount: number) {
  if (b.hp <= 0) return;
  b.hp -= amount;
  w.events.push({ e: 'dmg', attacker: null, victim: b.id, amount: Math.round(amount * 10) / 10, x: (b.cx + 0.5) * ZOM.cell, y: (b.cy + 0.5) * ZOM.cell, kind: 'building' });
  if (b.hp > 0) return;
  w.buildings = w.buildings.filter((o) => o !== b);
  w.buildingsVersion++;
  w.events.push({ e: 'boom', x: (b.cx + 0.5) * ZOM.cell, y: (b.cy + 0.5) * ZOM.cell, r: ZOM.cell / 2 });
}

function separation(zombies: readonly Zombie[], grid: number): Map<Zombie, { x: number; y: number }> {
  const byCell = new Map<number, Zombie[]>();
  for (const z of zombies) {
    const c = cellAt(z.x, z.y, grid);
    const list = byCell.get(c);
    if (list) list.push(z); else byCell.set(c, [z]);
  }
  const push = new Map<Zombie, { x: number; y: number }>();
  for (const z of zombies) {
    const c = cellAt(z.x, z.y, grid), cx = c % grid, cy = (c - cx) / grid;
    let px = 0, py = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const o of byCell.get((cy + dy) * grid + cx + dx) ?? []) {
          if (o === z) continue;
          const min = ZOMBIES[z.kind].radius + ZOMBIES[o.kind].radius;
          const d2 = dist2(z.x, z.y, o.x, o.y);
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          // Two zombies on the same spot part along their ids, so neither is stuck waiting on the other.
          const ux = d > 0 ? (z.x - o.x) / d : z.id < o.id ? -1 : 1, uy = d > 0 ? (z.y - o.y) / d : 0;
          px += (ux * (min - d)) / 2;
          py += (uy * (min - d)) / 2;
        }
      }
    }
    if (px !== 0 || py !== 0) push.set(z, { x: px, y: py });
  }
  return push;
}

/** Each zombie bites a squad player it can see close by, else the core once in reach, else walks the flow field, biting any wall that stands in the way. */
export function tickHorde(w: World, run: Run, dtMs: number) {
  const core = coreRect(w);
  if (!core) return;
  const size = MAPS[w.map].size, grid = size / ZOM.cell;
  const flow = flowFor(w, run, core, grid);
  const solids = solidRects(w);
  const wallAt = new Map(w.buildings.map((b) => [b.cy * grid + b.cx, b]));
  const mul = ZOM.nightMul(run.night);
  const push = separation(w.zombies, grid);
  for (const z of w.zombies) {
    const def = ZOMBIES[z.kind];
    const reach = def.radius + ZOM.biteReach;
    const damage = def.damage * mul.damage;
    let goal: { x: number; y: number } | null = null;
    let bite: (() => void) | null = null;
    const prey = preyFor(w, z, solids);
    if (prey) {
      if (Math.hypot(prey.x - z.x, prey.y - z.y) <= reach + WORLD.playerRadius) {
        bite = () => damagePlayer(w, prey, damage, { attacker: null, team: null, label: def.name, piercing: false, via: 'bite', fromX: z.x, fromY: z.y });
      } else goal = prey;
    } else if (distToRect(z.x, z.y, core) <= reach) {
      bite = () => hurtCore(run, damage * (1 - ZOM.coreArmor));
    } else {
      const next = nextCell(flow, cellAt(z.x, z.y, grid), (c) => wallAt.has(c), grid);
      const wall = next === null ? undefined : wallAt.get(next);
      if (wall && distToRect(z.x, z.y, cellRect(wall.cx, wall.cy)) <= reach) bite = () => biteBuilding(w, wall, damage * def.buildingDamageMul);
      else if (next === null) goal = { x: core.x + core.w / 2, y: core.y + core.h / 2 };
      else goal = { x: ((next % grid) + 0.5) * ZOM.cell, y: (Math.floor(next / grid) + 0.5) * ZOM.cell };
    }
    if (bite && w.now >= z.attackAt) {
      bite();
      z.attackAt = w.now + def.attackMs;
    }
    let dx = 0, dy = 0;
    if (goal) {
      const d = Math.hypot(goal.x - z.x, goal.y - z.y);
      const step = Math.min(d, (def.speed * dtMs) / 1000);
      if (d > 0) { dx = ((goal.x - z.x) / d) * step; dy = ((goal.y - z.y) / d) * step; }
    }
    const p = push.get(z);
    if (p) { dx += p.x; dy += p.y; }
    const at = dx === 0 && dy === 0 ? z : slide(solids, z.x, z.y, dx, dy, def.radius, size);
    z.vx = ((at.x - z.x) * 1000) / dtMs;
    z.vy = ((at.y - z.y) * 1000) / dtMs;
    z.x = at.x;
    z.y = at.y;
  }
}
