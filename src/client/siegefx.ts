import { ZOM, ZOMBIES } from '../shared/defs.ts';
import type { BuildingView, RunView, Snapshot } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { coreCracks, coreStage, drawCoreLight, glowSprite } from './coreart.ts';
import { drawParticles } from './effects.ts';
import { burst, createBudget, createPool, take, type Budget, type ParticlePool } from './particles.ts';
import type { Strike } from './zombieart.ts';

const TAU = Math.PI * 2;
const HALF = ZOM.coreHalf;

/** The siege's own particles, apart from the shooting's, so a night of chewing never starves gunfire of sparks. */
export const SIEGE_CAP = 700;
const HEAL_MS = 900;
const PUFF_MS = 220;
const PUFF_CAP = 48;
const LAMP = '#ffb347';

type Puff = { x: number; y: number; angle: number; size: number; born: number };
type View = { x0: number; y0: number; x1: number; y1: number };

/**
 * `strikes` budgets the full burst of a landed blow (more than that a second get a lone spark), `coreHp` is the health last
 * seen, for hits and repairs, `emit` the fractional emissions owed per source, so smoke keeps its rate at any frame rate.
 */
export type SiegeFx = {
  pool: ParticlePool; strikes: Budget; puffs: Puff[]; nextPuff: number;
  coreHp: number | null; healAt: number; lastCoreStrike: { x: number; y: number; angle: number; at: number } | null;
  emit: Map<string, number>; at: number; sparkAt: number;
  /** When the core last flashed: a horde biting all night would otherwise hold it white. */
  flashAt: number;
};

export const createSiegeFx = (): SiegeFx => ({
  pool: createPool(SIEGE_CAP), strikes: createBudget(24, 12), puffs: [], nextPuff: 0,
  coreHp: null, healAt: -Infinity, lastCoreStrike: null, emit: new Map(), at: -Infinity, sparkAt: -Infinity, flashAt: -Infinity,
});

export const siege = createSiegeFx();

export const FLASH_MS = 180;
/** The shortest gap between two of the core's hit flashes; bites in between only jolt it through the sparks. */
export const FLASH_GAP_MS = 600;

/** How bright the core's hit flash is now (0..1), from when it was last bitten, flashing at most once per `FLASH_GAP_MS`. */
export function coreFlash(fx: SiegeFx, hitAt: number, now: number): number {
  if (hitAt > fx.flashAt && hitAt - fx.flashAt >= FLASH_GAP_MS) fx.flashAt = hitAt;
  return Math.max(0, 1 - (now - fx.flashAt) / FLASH_MS);
}

function addPuff(fx: SiegeFx, p: Puff) {
  if (fx.puffs.length < PUFF_CAP) fx.puffs.push(p);
  else { fx.puffs[fx.nextPuff] = p; fx.nextPuff = (fx.nextPuff + 1) % PUFF_CAP; }
}

/**
 * A blow landing. On the core or a building: hot sparks fan back off the struck face, chips of plate and grit fly, and a
 * small white hit puff marks it; on a player, a puff of grit. Past the budget a blow gets a single spark.
 */
export function onStrike(fx: SiegeFx, s: Strike, now: number, rand: () => number = Math.random) {
  const back = s.angle + Math.PI;
  const big = ZOMBIES[s.kind].radius / 16;
  if (s.target.on === 'core') fx.lastCoreStrike = { x: s.target.x, y: s.target.y, angle: back, at: now };
  if (!take(fx.strikes, now)) {
    if (s.target.on !== 'player') burst(fx.pool, 'hotSparks', s.target.x, s.target.y, back, now, rand, undefined, 0.2);
    return;
  }
  if (s.target.on === 'player') {
    burst(fx.pool, 'dust', s.target.x, s.target.y, back, now, rand, undefined, 0.6);
    return;
  }
  burst(fx.pool, 'hotSparks', s.target.x, s.target.y, back, now, rand, undefined, Math.min(1.6, 0.7 * big));
  burst(fx.pool, 'chips', s.target.x, s.target.y, back, now, rand, undefined, Math.min(1.5, 0.6 * big));
  burst(fx.pool, 'dust', s.target.x, s.target.y, back, now, rand, undefined, 0.6);
  addPuff(fx, { x: s.target.x, y: s.target.y, angle: back, size: 8 + 5 * big, born: now });
}

/** Spends `rate` per second of `dt` on `key`, returning how many whole emissions are due now. */
export function due(fx: SiegeFx, key: string, rate: number, dtMs: number): number {
  const owed = (fx.emit.get(key) ?? 0) + (rate * dtMs) / 1000;
  const n = Math.floor(owed);
  fx.emit.set(key, owed - n);
  return n;
}

/** Where on the core's top a corner plume rises: the starts of its corner cracks, pulled in a little. */
function plumeAt(run: RunView, i: number) {
  const c = coreCracks(run.core.x, run.core.y)[i * 2]!;
  return { x: run.core.x + c.x * 0.8, y: run.core.y + c.y * 0.8 };
}

/**
 * The core's wear in motion: a bite (health falling) bursts sparks and chips off the side the horde last struck and jolts
 * it; a repair (health rising) lifts cool motes off it; smoke climbs from its damaged corners, thicker as it weakens, with
 * embers when critical; charge spits from its cracks below half; and its fall throws a last burst.
 */
function updateCore(fx: SiegeFx, run: RunView, now: number, dt: number, rand: () => number) {
  const hp = run.core.hp, prev = fx.coreHp;
  fx.coreHp = hp;
  const { x, y } = run.core;
  if (prev !== null && hp < prev) {
    const s = fx.lastCoreStrike && now - fx.lastCoreStrike.at < 1500 ? fx.lastCoreStrike : null;
    const a = s ? s.angle : rand() * TAU;
    const px = s ? s.x : x + Math.cos(a) * HALF, py = s ? s.y : y + Math.sin(a) * HALF;
    if (take(fx.strikes, now)) {
      burst(fx.pool, 'zap', px, py, a, now, rand);
      burst(fx.pool, 'chips', px, py, a, now, rand);
    }
    if (hp <= 0) {
      for (let i = 0; i < 4; i++) {
        burst(fx.pool, 'chips', x, y, (i / 4) * TAU, now, rand, undefined, 3);
        burst(fx.pool, 'smoke', x, y, (i / 4) * TAU, now, rand, '#5a5550');
      }
      burst(fx.pool, 'zap', x, y, 0, now, rand, undefined, 4);
    }
  } else if (prev !== null && hp > prev && run.phase !== 'over') {
    fx.healAt = now;
    if (due(fx, 'mend', 14, Math.max(dt, 70))) {
      burst(fx.pool, 'mend', x + (rand() - 0.5) * HALF * 1.6, y + (rand() - 0.5) * HALF * 1.6, -Math.PI / 2, now, rand);
    }
  }
  const frac = Math.max(0, hp / run.core.maxHp);
  const stage = coreStage(frac);
  for (let i = 0; i < stage.smoke; i++) {
    const n = due(fx, `core${i}`, stage.smokeRate, dt);
    if (!n) continue;
    const at = plumeAt(run, i);
    const tone = stage.dark > 0.6 ? '#3f3c38' : stage.dark > 0.3 ? '#5a5550' : '#77716a';
    for (let j = 0; j < n; j++) burst(fx.pool, 'plume', at.x + (rand() - 0.5) * 6, at.y + (rand() - 0.5) * 6, 0, now, rand, tone, 1 + stage.dark);
    if (stage.dark >= 1 || run.phase === 'over') burst(fx.pool, 'embers', at.x, at.y, 0, now, rand, undefined, 0.5 * n);
  }
  if (stage.sparkEveryMs !== Infinity && now - fx.sparkAt > stage.sparkEveryMs * (0.6 + rand() * 0.8) && hp > 0) {
    fx.sparkAt = now;
    const cracks = coreCracks(x, y).slice(0, Math.max(1, stage.cracks));
    const c = cracks[Math.floor(rand() * cracks.length)]!;
    const l = c.lines;
    const j = Math.floor(rand() * (l.length / 4)) * 4;
    burst(fx.pool, 'zap', x + l[j + 2]!, y + l[j + 3]!, Math.atan2(c.y, c.x), now, rand, undefined, 0.6);
  }
}

/** Worn buildings smoke, and badly worn ones smoulder: embers off walls, sparks off turrets. */
function updateBuildings(fx: SiegeFx, buildings: readonly BuildingView[], view: View, now: number, dt: number, rand: () => number) {
  for (const b of buildings) {
    if (b.hp > 5) continue;
    const r = cellRect(b.cx, b.cy);
    if (r.x > view.x1 || r.x + r.w < view.x0 || r.y > view.y1 || r.y + r.h < view.y0) continue;
    const key = `${b.cx},${b.cy}`;
    const bad = b.hp <= 2;
    const n = due(fx, key, bad ? 4 : 1.6, dt);
    for (let i = 0; i < n; i++) {
      burst(fx.pool, 'plume', r.x + r.w * (0.3 + rand() * 0.4), r.y + r.h * (0.3 + rand() * 0.4), 0, now, rand, bad ? '#3f3c38' : '#5a5550', bad ? 1.2 : 0.8);
      if (bad && rand() < 0.5) burst(fx.pool, b.kind === 'wall' ? 'embers' : 'hotSparks', r.x + r.w / 2, r.y + r.h / 2, rand() * TAU, now, rand, undefined, 0.5);
    }
  }
}

/** The small white hit puff where a blow lands: a burst of short strokes and a ring, gone in a blink. */
function drawPuffs(ctx: CanvasRenderingContext2D, fx: SiegeFx, now: number, pxPerUnit: number) {
  // Each blow is a light source for a blink: a warm pool on whatever it struck.
  const warm = glowSprite(LAMP, pxPerUnit);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.puffs) {
    const k = (now - p.born) / PUFF_MS;
    if (k < 0 || k >= 1) continue;
    const reach = p.size * 3.2;
    ctx.globalAlpha = 0.5 * (1 - k) * (1 - k);
    ctx.drawImage(warm, p.x - reach, p.y - reach, reach * 2, reach * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  for (const p of fx.puffs) {
    const k = (now - p.born) / PUFF_MS;
    if (k < 0 || k >= 1) continue;
    const e = 1 - (1 - k) * (1 - k);
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 2.6 * (1 - k) + 1;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const a = p.angle + i * 0.45;
      ctx.moveTo(p.x + Math.cos(a) * p.size * (0.3 + 0.5 * e), p.y + Math.sin(a) * p.size * (0.3 + 0.5 * e));
      ctx.lineTo(p.x + Math.cos(a) * p.size * (0.7 + 0.8 * e), p.y + Math.sin(a) * p.size * (0.7 + 0.8 * e));
    }
    ctx.stroke();
    ctx.lineWidth = 1.6 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * e), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * The siege's late pass, over the night's shade: the core's light, then the siege's smoke, sparks and embers, then the hit
 * puffs. Advances the emitters by the time since the last frame.
 */
export function drawSiegeFx(ctx: CanvasRenderingContext2D, snap: Snapshot, view: View, now: number, night: number, pxPerUnit: number, coreHitAt: number, fx: SiegeFx = siege, rand: () => number = Math.random) {
  const run = snap.run;
  if (!run) { fx.coreHp = null; fx.at = now; return; }
  const dt = fx.at === -Infinity ? 0 : Math.max(0, Math.min(100, now - fx.at));
  fx.at = now;
  const core = coreRectAt(run.core);
  const coreSeen = core.x - 200 < view.x1 && core.x + core.w + 200 > view.x0 && core.y - 200 < view.y1 && core.y + core.h + 200 > view.y0;
  updateCore(fx, run, now, coreSeen ? dt : 0, rand);
  updateBuildings(fx, snap.buildings ?? [], view, now, dt, rand);
  if (coreSeen) {
    const hit = coreFlash(fx, coreHitAt, now);
    drawCoreLight(ctx, run, now, hit, Math.max(0, 1 - (now - fx.healAt) / HEAL_MS), night, pxPerUnit);
  }
  drawParticles(ctx, fx.pool, now, night);
  drawPuffs(ctx, fx, now, pxPerUnit);
}

