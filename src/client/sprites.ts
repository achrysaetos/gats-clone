import type { WeaponId } from '../shared/defs.ts';

type Part = { x: number; y: number; w: number; h: number; tone: 0 | 1 | 2 };

const TONES = ['#2a2d34', '#454a55', '#6b7280'] as const;

export const GUN_PARTS: Record<WeaponId, readonly Part[]> = {
  pistol: [
    { x: 0.55, y: -0.17, w: 0.55, h: 0.34, tone: 1 },
    { x: 1.0, y: -0.11, w: 0.45, h: 0.22, tone: 0 },
  ],
  smg: [
    { x: 0.5, y: -0.2, w: 0.75, h: 0.4, tone: 1 },
    { x: 0.8, y: 0.15, w: 0.18, h: 0.4, tone: 0 },
    { x: 1.2, y: -0.12, w: 0.55, h: 0.24, tone: 0 },
  ],
  shotgun: [
    { x: 0.45, y: -0.2, w: 0.6, h: 0.4, tone: 2 },
    { x: 1.0, y: -0.17, w: 0.95, h: 0.34, tone: 0 },
    { x: 1.1, y: 0.1, w: 0.55, h: 0.15, tone: 1 },
  ],
  assault: [
    { x: 0.45, y: -0.19, w: 0.85, h: 0.38, tone: 1 },
    { x: 0.85, y: 0.15, w: 0.2, h: 0.45, tone: 0 },
    { x: 1.25, y: -0.11, w: 0.8, h: 0.22, tone: 0 },
    { x: 0.75, y: -0.33, w: 0.35, h: 0.14, tone: 2 },
  ],
  sniper: [
    { x: 0.45, y: -0.17, w: 0.85, h: 0.34, tone: 2 },
    { x: 1.25, y: -0.08, w: 1.35, h: 0.16, tone: 0 },
    { x: 0.7, y: -0.42, w: 0.6, h: 0.2, tone: 0 },
  ],
  lmg: [
    { x: 0.4, y: -0.25, w: 0.95, h: 0.5, tone: 1 },
    { x: 0.7, y: 0.2, w: 0.45, h: 0.35, tone: 2 },
    { x: 1.3, y: -0.14, w: 0.95, h: 0.28, tone: 0 },
    { x: 1.9, y: 0.12, w: 0.08, h: 0.3, tone: 0 },
  ],
};

export function drawGun(ctx: CanvasRenderingContext2D, weapon: WeaponId, radius: number, flat?: string) {
  for (const p of GUN_PARTS[weapon]) {
    ctx.fillStyle = flat ?? TONES[p.tone];
    ctx.fillRect(p.x * radius, p.y * radius, p.w * radius, p.h * radius);
  }
}

export function muzzleTip(x: number, y: number, angle: number, weapon: WeaponId, radius: number) {
  const reach = Math.max(...GUN_PARTS[weapon].map((p) => p.x + p.w)) * radius;
  return { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach };
}

const ALL_PARTS = Object.values(GUN_PARTS).flat();
const bounds = (parts: readonly Part[]) => ({
  minX: Math.min(...parts.map((p) => p.x)),
  maxX: Math.max(...parts.map((p) => p.x + p.w)),
  minY: Math.min(...parts.map((p) => p.y)),
  maxY: Math.max(...parts.map((p) => p.y + p.h)),
});

export function drawSilhouette(canvas: HTMLCanvasElement, weapon: WeaponId, color: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const all = bounds(ALL_PARTS);
  const r = Math.min((canvas.width * 0.9) / (all.maxX - all.minX), (canvas.height * 0.85) / (all.maxY - all.minY));
  const { minX, maxX, minY, maxY } = bounds(GUN_PARTS[weapon]);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate((canvas.width - (maxX + minX) * r) / 2, (canvas.height - (maxY + minY) * r) / 2);
  drawGun(ctx, weapon, r, color);
  ctx.restore();
}
