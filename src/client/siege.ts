import { WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES } from '../shared/defs.ts';
import type { BuildingView, PlayerView, RunView, ZombieView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { clock } from './derive.ts';
import { HIT_FLASH_MS } from './effects.ts';
import { INK, PALETTE, shade, ZOMBIE_LOOK } from './palette.ts';
import type { Effect } from './state.ts';
import { WALL_SHADOW } from './textures.ts';
import type { Ghost } from './zombies.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;

const WALL_LOOK = { top: '#bdb4a3', face: '#7d7568', edge: '#d9d1c1', mortar: '#8f8778' } as const;
const CORE_LOOK = { plate: '#2d3340', rim: '#4a5262', glow: '#4fd1e8' } as const;
const CORE_HIT_MS = 180;
export const CORE_ALERT_MS = 1500;

/** When the core was last bitten, for the alert. Only the night can bite it, so dawn and the report clear the alert at once. */
export function nextCoreHitAt(prev: RunView | null | undefined, run: RunView | null | undefined, now: number, hitAt: number): number {
  if (run?.phase !== 'night') return -Infinity;
  return prev && run.core.hp < prev.core.hp ? now : hitAt;
}

/** Damage numbers and impact effects name walls by their center, since a wall's view carries no id. */
const cellKey = (x: number, y: number) => `${Math.floor(x / ZOM.cell)},${Math.floor(y / ZOM.cell)}`;

export function wallFlashes(effects: readonly Effect[], now: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const fx of effects) if (fx.kind === 'impact' && fx.surface === 'building' && now - fx.born < HIT_FLASH_MS) out.set(cellKey(fx.x, fx.y), fx.born);
  return out;
}

/** A cell's cracks, fixed by its position so a wall cracks the same way every frame. */
function cracksOf(cx: number, cy: number): number[][] {
  let seed = (cx * 73856093) ^ (cy * 19349663);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  return Array.from({ length: 3 }, () => {
    const x = 8 + rnd() * 34, y = 6 + rnd() * 20;
    return [x, y, x + (rnd() - 0.5) * 22, y + 8 + rnd() * 10, x + (rnd() - 0.5) * 30, y + 16 + rnd() * 14];
  });
}
const crackCache = new Map<string, number[][]>();

export function drawBuildings(ctx: CanvasRenderingContext2D, buildings: readonly BuildingView[], flashes: ReadonlyMap<string, number>, now: number) {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  for (const b of buildings) ctx.rect(b.cx * ZOM.cell + WALL_SHADOW.x, b.cy * ZOM.cell + WALL_SHADOW.y, ZOM.cell, ZOM.cell);
  ctx.fill();
  for (const b of buildings) {
    const { x, y, w, h } = cellRect(b.cx, b.cy);
    const wear = 1 - 0.4 * (1 - b.hp / 10);
    ctx.fillStyle = shade(WALL_LOOK.face, wear);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = shade(WALL_LOOK.top, wear);
    ctx.fillRect(x, y, w, h - 7);
    ctx.fillStyle = shade(WALL_LOOK.edge, wear);
    ctx.fillRect(x, y, w, 2.5);
    ctx.strokeStyle = shade(WALL_LOOK.mortar, wear);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const course = (h - 7) / 3;
    for (let i = 1; i < 3; i++) { ctx.moveTo(x, y + i * course); ctx.lineTo(x + w, y + i * course); }
    for (let i = 0; i < 3; i++) {
      for (const bx of i % 2 ? [w / 2] : [w / 4, (3 * w) / 4]) { ctx.moveTo(x + bx, y + i * course); ctx.lineTo(x + bx, y + (i + 1) * course); }
    }
    ctx.stroke();
    const cracks = b.hp <= 2 ? 3 : b.hp <= 5 ? 2 : b.hp <= 8 ? 1 : 0;
    if (cracks) {
      const key = `${b.cx},${b.cy}`;
      let lines = crackCache.get(key);
      if (!lines) crackCache.set(key, (lines = cracksOf(b.cx, b.cy)));
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const c of lines.slice(0, cracks)) { ctx.moveTo(x + c[0]!, y + c[1]!); ctx.lineTo(x + c[2]!, y + c[3]!); ctx.lineTo(x + c[4]!, y + c[5]!); }
      ctx.stroke();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    const hit = flashes.get(`${b.cx},${b.cy}`);
    if (hit !== undefined) {
      ctx.globalAlpha = 0.7 * (1 - (now - hit) / HIT_FLASH_MS);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }
}

export function drawCore(ctx: CanvasRenderingContext2D, run: RunView, now: number, hitAt: number) {
  const { x, y } = run.core;
  const r = coreRectAt(run.core);
  const frac = Math.max(0, run.core.hp / run.core.maxHp);
  const hit = Math.max(0, 1 - (now - hitAt) / CORE_HIT_MS);
  const jolt = hit * 3;
  ctx.save();
  ctx.translate(Math.sin(now * 0.09) * jolt, Math.cos(now * 0.11) * jolt);
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  ctx.globalAlpha = 0.16 + 0.1 * pulse;
  ctx.fillStyle = CORE_LOOK.glow;
  ctx.beginPath();
  ctx.arc(x, y, 92 + 6 * pulse, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.shadow;
  ctx.fillRect(r.x + 10, r.y + 12, r.w, r.h);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 14);
  ctx.fillStyle = CORE_LOOK.plate;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(r.x + 9, r.y + 9, r.w - 18, r.h - 18, 9);
  ctx.lineWidth = 3;
  ctx.strokeStyle = CORE_LOOK.rim;
  ctx.stroke();
  ctx.fillStyle = CORE_LOOK.rim;
  for (const [bx, by] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    ctx.beginPath();
    ctx.arc(x + bx * 37, y + by * 37, 4, 0, TAU);
    ctx.fill();
  }
  const s = 26 + 3 * pulse;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y);
  ctx.closePath();
  ctx.fillStyle = frac > 0.35 ? CORE_LOOK.glow : PALETTE.hpBad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(x, y - s + 6); ctx.lineTo(x + s * 0.3, y - 2); ctx.lineTo(x, y + 2);
  ctx.closePath();
  ctx.fill();
  if (hit > 0) {
    ctx.globalAlpha = 0.65 * hit;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'butt';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(27, 29, 34, 0.55)';
  ctx.beginPath();
  ctx.arc(x, y, 80, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = frac > 0.5 ? PALETTE.hpGood : frac > 0.25 ? PALETTE.gold : PALETTE.hpBad;
  ctx.beginPath();
  ctx.arc(x, y, 80, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  ctx.stroke();
  ctx.restore();
}

/** Each zombie faces the way it last moved, kept between frames since the snapshot carries no heading. */
export function faceZombies(faces: Map<number, { x: number; y: number; a: number }>, zombies: readonly ZombieView[], toward: { x: number; y: number }) {
  const seen = new Set<number>();
  for (const [id, , x, y] of zombies) {
    seen.add(id);
    const f = faces.get(id);
    if (!f) faces.set(id, { x, y, a: Math.atan2(toward.y - y, toward.x - x) });
    else if (Math.hypot(x - f.x, y - f.y) > 1.5) { f.a = Math.atan2(y - f.y, x - f.x); f.x = x; f.y = y; }
  }
  for (const id of faces.keys()) if (!seen.has(id)) faces.delete(id);
}

function addCircles(ctx: CanvasRenderingContext2D, xyr: readonly number[], pad: number) {
  for (let i = 0; i < xyr.length; i += 3) {
    const r = xyr[i + 2]! + pad;
    ctx.moveTo(xyr[i]! + r, xyr[i + 1]!);
    ctx.arc(xyr[i]!, xyr[i + 1]!, r, 0, TAU);
  }
}

/** One path per kind and part, outlined by an ink underlay rather than strokes, so a full horde costs a handful of fills rather than hundreds of draws. */
export function drawZombies(ctx: CanvasRenderingContext2D, zombies: readonly ZombieView[], faces: ReadonlyMap<number, { a: number }>, flashes: ReadonlyMap<number, number>, now: number) {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  for (const [, kind, x, y] of zombies) {
    const r = ZOMBIES[ZOMBIE_KINDS[kind]].radius;
    ctx.moveTo(x + 5 + r, y + 7);
    ctx.arc(x + 5, y + 7, r, 0, TAU);
  }
  ctx.fill();
  ZOMBIE_KINDS.forEach((kind, k) => {
    const look = ZOMBIE_LOOK[kind];
    const r = ZOMBIES[kind].radius;
    const mine = zombies.filter((z) => z[1] === k);
    if (!mine.length) return;
    const limbs: number[] = [];
    for (const [id, , x, y] of mine) {
      const a = faces.get(id)?.a ?? 0;
      const sway = Math.sin(now / 180 + id) * 0.18;
      for (const side of [-1, 1]) {
        const arm = a + side * 0.55 + sway;
        limbs.push(x + Math.cos(arm) * r * 1.05, y + Math.sin(arm) * r * 1.05, r * 0.38);
        if (kind === 'brute') limbs.push(x + Math.cos(a + side * Math.PI / 2) * r * 0.78, y + Math.sin(a + side * Math.PI / 2) * r * 0.78, r * 0.5);
      }
    }
    const half = look.line / 2;
    ctx.fillStyle = INK;
    ctx.beginPath();
    addCircles(ctx, limbs, half);
    for (const [, , x, y] of mine) { ctx.moveTo(x + r + half, y); ctx.arc(x, y, r + half, 0, TAU); }
    ctx.fill();
    ctx.fillStyle = look.arm;
    ctx.beginPath();
    addCircles(ctx, limbs, -half);
    ctx.fill();
    ctx.fillStyle = look.body;
    ctx.beginPath();
    for (const [, , x, y] of mine) { ctx.moveTo(x + r - half, y); ctx.arc(x, y, r - half, 0, TAU); }
    ctx.fill();
    ctx.fillStyle = look.eye;
    ctx.beginPath();
    for (const [id, , x, y] of mine) {
      const a = faces.get(id)?.a ?? 0;
      for (const side of [-1, 1]) {
        const ex = x + Math.cos(a + side * 0.42) * r * 0.55, ey = y + Math.sin(a + side * 0.42) * r * 0.55;
        ctx.moveTo(ex + r * 0.16, ey);
        ctx.arc(ex, ey, r * 0.16, 0, TAU);
      }
    }
    ctx.fill();
  });
  for (const [id, kind, x, y] of zombies) {
    const hit = flashes.get(id);
    if (hit === undefined) continue;
    ctx.globalAlpha = 0.85 * (1 - (now - hit) / HIT_FLASH_MS);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, ZOMBIES[ZOMBIE_KINDS[kind]].radius, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const [, kind, x, y, hp] of zombies) {
    if (kind !== 1) continue;
    const r = ZOMBIES.brute.radius;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 24, y - r - 16, 48, 8);
    ctx.fillStyle = hp > 3 ? PALETTE.hpBad : '#ff9f43';
    ctx.fillRect(x - 22, y - r - 14, 44 * (hp / 10), 4);
  }
}

export function drawDowned(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, serverNow: number | null, self: boolean) {
  const down = p.downed;
  if (!down) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(4, 6, R * 1.05, R * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.95, R * 0.62, 0, 0, TAU);
  ctx.fillStyle = shade(color, 0.6);
  ctx.fill();
  ctx.lineWidth = self ? 4 : 3;
  ctx.strokeStyle = self ? '#ffffff' : INK;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
  ctx.moveTo(0, -6); ctx.lineTo(0, 6);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(27, 29, 34, 0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, R + 12, 0, TAU);
  ctx.stroke();
  if (down.revive > 0) {
    ctx.strokeStyle = PALETTE.hpGood;
    ctx.beginPath();
    ctx.arc(0, 0, R + 12, -Math.PI / 2, -Math.PI / 2 + down.revive * TAU);
    ctx.stroke();
  }
  if (serverNow !== null) {
    const left = down.bleedOutAt - serverNow;
    ctx.font = '850 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText(clock(left), 0, -R - 20);
    ctx.fillStyle = left < 8000 ? PALETTE.hunted : '#ffffff';
    ctx.fillText(clock(left), 0, -R - 20);
  }
  ctx.restore();
}

const GHOST_LOOK = { ok: PALETTE.hpGood, no: PALETTE.hpBad, down: '#ff9f43' } as const;

export function drawGhost(ctx: CanvasRenderingContext2D, ghost: Ghost, self: { x: number; y: number }, core: { x: number; y: number }, now: number) {
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -now / 60;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 211, 77, 0.55)';
  ctx.beginPath();
  ctx.arc(core.x, core.y, ZOM.buildRadius, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.arc(self.x, self.y, ZOM.reachPx, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  const { x, y, w, h } = cellRect(ghost.cx, ghost.cy);
  const color = ghost.refusal === null ? GHOST_LOOK.ok : ghost.refusal === 'taken' ? GHOST_LOOK.down : GHOST_LOOK.no;
  ctx.globalAlpha = 0.35 + 0.1 * Math.sin(now / 160);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  if (!ghost.label) return;
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.strokeText(ghost.label, x + w / 2, y - 10);
  ctx.fillStyle = color === GHOST_LOOK.ok ? '#ffffff' : color;
  ctx.fillText(ghost.label, x + w / 2, y - 10);
}
