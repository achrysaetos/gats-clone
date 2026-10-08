import type { DamageKind } from '../shared/protocol.ts';
import { INK, PALETTE, shade } from './palette.ts';
import { damageNumbersOn } from './settings.ts';

/**
 * Chunky toy numbers over what you hit. Hits on one victim inside `windowMs` of each other stack into one number that
 * pops again on every hit and counts up ("+14 +14" become 28), with the last few hits shown as small chips beside it.
 */
export const NUM = { windowMs: 420, fadeMs: 480, rise: 34, cap: 24, bigAt: 60, popMs: 150, chipMs: 380, chips: 3, gap: 24 } as const;

export type Chip = { amount: number; at: number };
export type Num = {
  victim: number; kind: DamageKind; x: number; y: number; total: number; count: number;
  born: number; touched: number; chips: Chip[];
  /** The scale the number pops from at its last touch. */
  from: number;
  /** Lift added by a newer number for the same victim taking the lowest spot, easing in from `pushFrom` at `pushedAt`. */
  push: number; pushFrom: number; pushedAt: number;
};
export type HitIn = { victim: number; kind: DamageKind; amount: number; x: number; y: number };

export const NUM_LIFE_MS = NUM.windowMs + NUM.fadeMs;
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
export const popBack = (t: number): number => {
  const c = Math.min(1, Math.max(0, t)), k = 1.9;
  return 1 + (k + 1) * (c - 1) ** 3 + k * (c - 1) ** 2;
};

export const isLiveNum = (n: Num, now: number) => now - n.touched < NUM_LIFE_MS;

/** How high the number's resting spot is lifted, eased from its previous lift. */
const pushOf = (n: Num, now: number) => n.pushFrom + (n.push - n.pushFrom) * easeOut((now - n.pushedAt) / 160);

/** Adds one of your hits: stacks into this victim's open number, or opens a new one and nudges the older ones up. */
export function addHit(list: Num[], hit: HitIn, now: number): void {
  const open = list.find((n) => n.victim === hit.victim && now - n.touched < NUM.windowMs);
  if (open) {
    open.total += hit.amount;
    open.count++;
    open.x = hit.x;
    open.y = hit.y;
    open.touched = now;
    open.from = Math.min(1.7, 1.28 + 0.05 * open.count);
    open.chips.push({ amount: hit.amount, at: now });
    if (open.chips.length > NUM.chips) open.chips.shift();
    return;
  }
  for (const n of list) {
    if (n.victim !== hit.victim) continue;
    n.pushFrom = pushOf(n, now);
    n.push += NUM.gap;
    n.pushedAt = now;
  }
  list.push({ ...hit, total: hit.amount, count: 1, born: now, touched: now, chips: [{ amount: hit.amount, at: now }], from: 0.3, push: 0, pushFrom: 0, pushedAt: now });
  // A full list drops its oldest, so a flood of hits (a minigun on a crowd) never grows it.
  if (list.length > NUM.cap) list.splice(0, list.length - NUM.cap);
}

export const sweepNums = (list: Num[], now: number): void => {
  for (let i = list.length - 1; i >= 0; i--) if (!isLiveNum(list[i]!, now)) list.splice(i, 1);
};

/** Point size from the stacked total: a pistol tap is small, a bolt-action's 135 is huge. */
export const sizeOf = (total: number, kind: DamageKind): number => Math.min(40, Math.max(15, 13 + 2.2 * Math.sqrt(total))) * (kind === 'player' || kind === 'zombie' || kind === 'target' ? 1 : 0.72);

export const isBig = (n: Pick<Num, 'total'>) => n.total >= NUM.bigAt;

/** Bone for a tap, spark for a combo, lamp amber for a big hit: the reward gold stays for kills and medals. */
export const colorOf = (n: Pick<Num, 'total' | 'count'>): string => (isBig(n) ? '#ffb347' : n.count >= 3 ? '#ffd27a' : '#ece6d6');

export const scaleOf = (n: Num, now: number): number => n.from + (1 - n.from) * popBack((now - n.touched) / NUM.popMs);

export const alphaOf = (n: Num, now: number): number => {
  const k = (now - n.touched - NUM.windowMs) / NUM.fadeMs;
  return k <= 0 ? 1 : Math.max(0, 1 - k * k);
};

/** World units above the victim's mark. */
export const liftOf = (n: Num, now: number): number => {
  const age = Math.max(0, now - n.touched);
  return 12 + pushOf(n, now) + NUM.rise * 0.3 * easeOut(age / NUM.windowMs) + NUM.rise * 0.7 * easeOut((age - NUM.windowMs) / NUM.fadeMs);
};

const FONT = '"Barlow Condensed", system-ui, sans-serif';

function chunkyText(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, fill: string) {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.strokeStyle = INK;
  // A hard extruded edge below, like a toy's lip, then the face.
  ctx.fillStyle = shade(fill, 0.62);
  ctx.strokeText(label, x, y + size * 0.1);
  ctx.fillText(label, x, y + size * 0.1);
  ctx.strokeText(label, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(label, x, y);
}

export function drawNums(ctx: CanvasRenderingContext2D, list: readonly Num[], now: number, markY: number, reduced = false) {
  if (!damageNumbersOn()) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const n of list) {
    if (!isLiveNum(n, now)) continue;
    const a = alphaOf(n, now);
    const size = sizeOf(n.total, n.kind);
    const y = n.y + markY - liftOf(n, now);
    const sc = reduced ? 1 : scaleOf(n, now);
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(n.x, y);
    ctx.scale(sc, sc);
    chunkyText(ctx, String(Math.max(1, Math.round(n.total))), 0, 0, size, colorOf(n));
    ctx.restore();
    if (n.count >= 2) {
      // The last few hits as small chips beside the total, each lifting off and fading in turn.
      let side = 1;
      for (let i = n.chips.length - 1; i >= 0; i--) {
        const c = n.chips[i]!, age = now - c.at;
        if (age >= NUM.chipMs) continue;
        const k = age / NUM.chipMs;
        ctx.globalAlpha = a * (1 - k * k);
        const cs = Math.max(12, size * 0.5);
        ctx.font = `900 ${size}px ${FONT}`;
        const w = ctx.measureText(String(Math.round(n.total))).width * sc * 0.5;
        const cx = n.x + side * (w + cs * 0.7 + (n.chips.length - 1 - i) * 4), cy = y - cs * 0.3 - 12 * easeOut(k) - (n.chips.length - 1 - i) * 3;
        chunkyText(ctx, `+${Math.round(c.amount)}`, cx, cy, cs, PALETTE.tracer);
        side = -side;
      }
    }
  }
  ctx.globalAlpha = 1;
}
