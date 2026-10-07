import { byGun, GUNS, type GunId, type WeaponId } from '../shared/defs.ts';
import { INK } from './palette.ts';

type Part = { x: number; y: number; w: number; h: number; accent?: true };

const BASE_PARTS: Record<WeaponId, readonly Part[]> = {
  pistol: [
    { x: 0.55, y: -0.17, w: 0.55, h: 0.34 },
    { x: 1.0, y: -0.11, w: 0.45, h: 0.22 },
  ],
  smg: [
    { x: 0.5, y: -0.2, w: 0.75, h: 0.4 },
    { x: 0.8, y: 0.15, w: 0.18, h: 0.4 },
    { x: 1.2, y: -0.12, w: 0.55, h: 0.24 },
  ],
  shotgun: [
    { x: 0.45, y: -0.2, w: 0.6, h: 0.4 },
    { x: 1.0, y: -0.17, w: 0.95, h: 0.34 },
    { x: 1.1, y: 0.1, w: 0.55, h: 0.15 },
  ],
  assault: [
    { x: 0.45, y: -0.19, w: 0.85, h: 0.38 },
    { x: 0.85, y: 0.15, w: 0.2, h: 0.45 },
    { x: 1.25, y: -0.11, w: 0.8, h: 0.22 },
    { x: 0.75, y: -0.33, w: 0.35, h: 0.14 },
  ],
  sniper: [
    { x: 0.45, y: -0.17, w: 0.85, h: 0.34 },
    { x: 1.25, y: -0.08, w: 1.35, h: 0.16 },
    { x: 0.7, y: -0.42, w: 0.6, h: 0.2 },
  ],
  lmg: [
    { x: 0.4, y: -0.25, w: 0.95, h: 0.5 },
    { x: 0.7, y: 0.2, w: 0.45, h: 0.35 },
    { x: 1.3, y: -0.14, w: 0.95, h: 0.28 },
    { x: 1.9, y: 0.12, w: 0.08, h: 0.3 },
  ],
};

const rearOf = (parts: readonly Part[]) => Math.min(...parts.map((p) => p.x));

/** The base silhouette stretched by the gun's look: longer and thicker, its muzzle part repeated per barrel, and an accent stripe on the receiver. */
function partsOf(gun: GunId): Part[] {
  const { base, look } = GUNS[gun];
  const src = BASE_PARTS[base];
  const rear = rearOf(src);
  const muzzle = src.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a));
  const stretched = (p: Part): Part => ({ x: rear + (p.x - rear) * look.length, y: p.y * look.width, w: p.w * look.length, h: p.h * look.width });
  const parts: Part[] = [];
  for (const p of src) {
    const s = stretched(p);
    if (p !== muzzle || look.barrels === 1) { parts.push(s); continue; }
    const gap = s.h * 1.15;
    for (let i = 0; i < look.barrels; i++) parts.push({ ...s, y: s.y + (i - (look.barrels - 1) / 2) * gap });
  }
  if (GUNS[gun].stage > 0) {
    const body = stretched(src[0]!);
    parts.push({ x: body.x + body.w * 0.15, y: body.y + body.h * 0.3, w: body.w * 0.7, h: body.h * 0.4, accent: true });
  }
  if (look.hands !== 2) return parts;
  const half = Math.max(...parts.map((p) => p.y + p.h)) * 1.1;
  return [-1, 1].flatMap((side) => parts.map((p) => ({ ...p, y: p.y + side * half })));
}

const GUN_PARTS: Record<GunId, readonly Part[]> = byGun(partsOf);

export function drawGun(ctx: CanvasRenderingContext2D, gun: GunId, radius: number, flat?: string) {
  for (const p of GUN_PARTS[gun]) {
    if (flat && p.accent) continue;
    ctx.fillStyle = flat ?? (p.accent ? GUNS[gun].look.accent : INK);
    ctx.fillRect(p.x * radius, p.y * radius, p.w * radius, p.h * radius);
  }
}

export function muzzleTip(x: number, y: number, angle: number, gun: GunId, radius: number) {
  const reach = Math.max(...GUN_PARTS[gun].map((p) => p.x + p.w)) * radius;
  return { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach };
}
