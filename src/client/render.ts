import { COLORS, WORLD, type ArmorId } from '../shared/defs.ts';
import type { CrateView, PlayerView, Snapshot, Team, ThrownView, WallView, ZoneView } from '../shared/protocol.ts';
import { screenToWorld, type Camera } from './camera.ts';
import { NUMBER_MS, type DamageNumber } from './feedback.ts';
import { drawGun } from './sprites.ts';
import { EFFECT_LIFE_MS, type Session } from './state.ts';

export const PALETTE = {
  outside: '#a9aea6',
  floor: '#e9e7e0',
  grid: '#d9d6cc',
  border: '#555b66',
  wall: '#4a5060',
  wallTop: '#5d6476',
  builtWall: '#9b7a46',
  builtWallTop: '#b38f57',
  crate: '#c99a5c',
  crateEdge: '#8d6432',
  bullet: '#2f2a22',
  ownBullet: '#b8860b',
  text: '#1d2128',
  hpGood: '#30a46c',
  hpBad: '#e5484d',
  shield: 'rgba(110, 180, 255, 0.9)',
  gas: 'rgba(130, 190, 60, 0.28)',
  gasEdge: 'rgba(95, 150, 40, 0.55)',
  neutral: '#8b8f98',
} as const;

export const TEAM_COLORS: Record<Exclude<Team, null>, string> = { red: COLORS.red, blue: COLORS.blue };
const ARMOR_RING: Record<ArmorId, number> = { none: 2, light: 4, medium: 6, heavy: 8 };
const GRID = 100;
const TAU = Math.PI * 2;

export function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(Math.min(255, Math.max(0, ((v >> s) & 255) * f)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

const teamColor = (t: Team) => (t ? TEAM_COLORS[t] : PALETTE.neutral);

/** Players on a team wear its color, so the loadout color can never pass a red player off as blue. */
export const bodyColor = (p: Pick<PlayerView, 'color' | 'team'>): string => (p.team ? TEAM_COLORS[p.team] : COLORS[p.color]);

export type Frame = { snap: Snapshot; s: Session; cam: Camera; dpr: number; now: number; selfAngle: number | null };

export function drawWorld(ctx: CanvasRenderingContext2D, f: Frame) {
  const { cam, dpr, snap, s, now } = f;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.outside;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const k = dpr * cam.scale;
  ctx.setTransform(k, 0, 0, k, dpr * (cam.w / 2 - cam.x * cam.scale), dpr * (cam.h / 2 - cam.y * cam.scale));

  const tl = screenToWorld(cam, { x: 0, y: 0 });
  const br = screenToWorld(cam, { x: cam.w, y: cam.h });
  drawFloor(ctx, s.worldSize, tl, br, cam.scale);

  const myTeam = snap.players.find((p) => p.id === s.myId)?.team ?? null;
  for (const [i, z] of snap.zones.entries()) drawZone(ctx, z, i);
  for (const t of snap.thrown) if (t.kind === 'gasCloud' || t.kind === 'landMine') drawThrown(ctx, t, now);
  for (const c of snap.crates) drawCrate(ctx, c);
  for (const w of s.walls) drawWall(ctx, w);
  for (const p of snap.players) drawTrail(ctx, p, bodyColor(p), s.trails.get(p.id), now);

  ctx.lineCap = 'round';
  for (const b of snap.bullets) {
    ctx.strokeStyle = b.owner === s.myId ? PALETTE.ownBullet : PALETTE.bullet;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const p of snap.players) {
    if (!p.alive) continue;
    const angle = p.id === s.myId && f.selfAngle !== null ? f.selfAngle : p.angle;
    drawPlayer(ctx, { ...p, angle }, bodyColor(p), p.id !== s.myId && p.team !== null && p.team === myTeam);
  }
  for (const t of snap.thrown) if (t.kind !== 'gasCloud' && t.kind !== 'landMine') drawThrown(ctx, t, now);
  drawEffects(ctx, s, now);
  for (const p of snap.players) if (p.alive && !p.hidden) drawLabel(ctx, p, p.id === s.myId);
  drawDamageNumbers(ctx, s.feedback.numbers, now);
}

function drawFloor(ctx: CanvasRenderingContext2D, size: number, tl: { x: number; y: number }, br: { x: number; y: number }, scale: number) {
  ctx.fillStyle = PALETTE.floor;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1.5 / Math.max(scale, 0.5);
  ctx.beginPath();
  const x0 = Math.max(0, Math.floor(tl.x / GRID) * GRID);
  const y0 = Math.max(0, Math.floor(tl.y / GRID) * GRID);
  for (let x = x0; x <= Math.min(size, br.x); x += GRID) { ctx.moveTo(x, Math.max(0, tl.y)); ctx.lineTo(x, Math.min(size, br.y)); }
  for (let y = y0; y <= Math.min(size, br.y); y += GRID) { ctx.moveTo(Math.max(0, tl.x), y); ctx.lineTo(Math.min(size, br.x), y); }
  ctx.stroke();
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 10;
  ctx.strokeRect(-5, -5, size + 10, size + 10);
}

function drawZone(ctx: CanvasRenderingContext2D, z: ZoneView, index: number) {
  const color = teamColor(z.owner);
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.13;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
  const progress = Math.min(1, Math.abs(z.progress));
  if (progress > 0) {
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 10;
    ctx.strokeStyle = teamColor(z.capturing ?? z.owner);
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r - 12, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String.fromCharCode(65 + index), z.x, z.y);
  ctx.globalAlpha = 1;
}

function drawCrate(ctx: CanvasRenderingContext2D, c: CrateView) {
  const h = c.size / 2;
  const cx = c.x + h, cy = c.y + h;
  const health = Math.max(0, Math.min(1, c.hp / WORLD.crateHp));
  ctx.fillStyle = shade(PALETTE.crate, 0.75 + 0.25 * health);
  ctx.fillRect(cx - h, cy - h, c.size, c.size);
  ctx.strokeStyle = PALETTE.crateEdge;
  ctx.lineWidth = 4;
  ctx.strokeRect(cx - h + 2, cy - h + 2, c.size - 4, c.size - 4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - h, cy - h); ctx.lineTo(cx + h, cy + h);
  ctx.moveTo(cx + h, cy - h); ctx.lineTo(cx - h, cy + h);
  ctx.stroke();
  if (health < 0.67) {
    ctx.strokeStyle = '#3d2a14';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.7, cy - h); ctx.lineTo(cx - h * 0.2, cy - h * 0.3); ctx.lineTo(cx - h * 0.5, cy + h * 0.2);
    if (health < 0.34) { ctx.moveTo(cx + h, cy + h * 0.1); ctx.lineTo(cx + h * 0.3, cy + h * 0.4); ctx.lineTo(cx + h * 0.4, cy + h); }
    ctx.stroke();
  }
}

function drawWall(ctx: CanvasRenderingContext2D, w: WallView) {
  ctx.fillStyle = w.built ? PALETTE.builtWall : PALETTE.wall;
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = w.built ? PALETTE.builtWallTop : PALETTE.wallTop;
  const inset = Math.min(6, w.w / 4, w.h / 4);
  ctx.fillRect(w.x + inset, w.y + inset, w.w - inset * 2, w.h - inset * 2);
  if (w.built) {
    ctx.strokeStyle = PALETTE.builtWall;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let d = 16; d < w.w + w.h; d += 16) {
      ctx.moveTo(w.x + Math.min(d, w.w), w.y + Math.max(0, d - w.w));
      ctx.lineTo(w.x + Math.max(0, d - w.h), w.y + Math.min(d, w.h));
    }
    ctx.stroke();
  }
}

function drawThrown(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  ctx.beginPath();
  switch (t.kind) {
    case 'gasCloud':
      ctx.arc(t.x, t.y, t.r, 0, TAU);
      ctx.fillStyle = PALETTE.gas;
      ctx.fill();
      ctx.strokeStyle = PALETTE.gasEdge;
      ctx.lineWidth = 3;
      ctx.stroke();
      return;
    case 'landMine':
      ctx.arc(t.x, t.y, 11, 0, TAU);
      ctx.fillStyle = '#3b3f46';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4, 0, TAU);
      ctx.fillStyle = Math.floor(now / 400) % 2 ? '#ff4d4f' : '#7a1f21';
      ctx.fill();
      return;
    case 'grenade':
    case 'fragGrenade':
    case 'gasGrenade': {
      const band = t.kind === 'gasGrenade' ? '#7bb33a' : t.kind === 'fragGrenade' ? '#d9822b' : '#c7c9cc';
      if (t.kind === 'fragGrenade') {
        ctx.strokeStyle = '#2d3138';
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.moveTo(t.x + Math.cos(a) * 8, t.y + Math.sin(a) * 8);
          ctx.lineTo(t.x + Math.cos(a) * 13, t.y + Math.sin(a) * 13);
        }
        ctx.stroke();
        ctx.beginPath();
      }
      ctx.arc(t.x, t.y, 10, 0, TAU);
      ctx.fillStyle = '#2d3138';
      ctx.fill();
      ctx.fillStyle = band;
      ctx.fillRect(t.x - 10, t.y - 3, 20, 6);
      return;
    }
  }
}

function drawTrail(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, trail: { x: number; y: number; at: number }[] | undefined, now: number) {
  if (!trail?.length) return;
  ctx.fillStyle = color;
  for (const pt of trail) {
    const age = (now - pt.at) / TRAIL_MS;
    if (age >= 1) continue;
    ctx.globalAlpha = 0.35 * (1 - age);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, WORLD.playerRadius * (1 - age * 0.4), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export const TRAIL_MS = 260;

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, friendly: boolean) {
  const R = WORLD.playerRadius;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = p.hidden ? 0.25 : 1;
  ctx.rotate(p.angle);
  drawGun(ctx, p.weapon, R);
  ctx.rotate(-p.angle);
  const ring = ARMOR_RING[p.armorTier];
  ctx.beginPath();
  ctx.arc(0, 0, R - ring / 2, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = ring;
  ctx.strokeStyle = shade(color, 0.55);
  ctx.stroke();
  if (friendly) {
    ctx.beginPath();
    ctx.moveTo(-11, -R - 24);
    ctx.lineTo(11, -R - 24);
    ctx.lineTo(0, -R - 9);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  if (p.shield) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 10, p.angle - 1.05, p.angle + 1.05);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.shield;
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, p: PlayerView, self: boolean) {
  const R = WORLD.playerRadius;
  ctx.font = `${self ? 700 : 600} 15px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(p.name, p.x, p.y + R + 22);
  const w = 54;
  const x = p.x - w / 2;
  const y = p.y + R + 29;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y, w, 6);
  const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
  ctx.fillStyle = frac > 0.35 ? PALETTE.hpGood : PALETTE.hpBad;
  ctx.fillRect(x, y, w * frac, 6);
  if (p.maxArmor > 0) {
    ctx.fillStyle = '#5b8def';
    ctx.fillRect(x, y + 7, w * Math.max(0, p.armor / p.maxArmor), 3);
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, s: Session, now: number) {
  for (const fx of s.effects) {
    const k = (now - fx.born) / EFFECT_LIFE_MS[fx.kind];
    if (k < 0 || k >= 1) continue;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    switch (fx.kind) {
      case 'impact':
        drawImpact(ctx, fx.surface, fx.x, fx.y, k);
        break;
      case 'boom':
        ctx.arc(fx.x, fx.y, fx.r * (0.35 + 0.65 * Math.sqrt(k)), 0, TAU);
        ctx.fillStyle = 'rgba(255, 160, 50, 0.45)';
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(200, 70, 20, 0.7)';
        ctx.stroke();
        break;
      case 'flash': {
        const c = Math.cos(fx.angle), s = Math.sin(fx.angle);
        ctx.moveTo(fx.x - s * 6, fx.y + c * 6);
        ctx.lineTo(fx.x + c * 18, fx.y + s * 18);
        ctx.lineTo(fx.x + s * 6, fx.y - c * 6);
        ctx.closePath();
        ctx.fillStyle = '#ffb02e';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(fx.x + c * 3, fx.y + s * 3, 5, 0, TAU);
        ctx.fillStyle = '#fff3b0';
        ctx.fill();
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

const IMPACT = {
  wall: { color: '#ffe08a', count: 5, reach: 14, size: 2 },
  crate: { color: '#8d6432', count: 4, reach: 16, size: 4 },
  player: { color: '#7a0b0b', count: 6, reach: 18, size: 3.5 },
} as const;

/** Debris flies outward along fixed angles derived from the position, so a spark does not flicker between frames. */
function drawImpact(ctx: CanvasRenderingContext2D, surface: keyof typeof IMPACT, x: number, y: number, k: number) {
  const { color, count, reach, size } = IMPACT[surface];
  const spin = (x * 12.9898 + y * 78.233) % TAU;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const a = spin + (i / count) * TAU;
    const d = 4 + reach * Math.sqrt(k);
    const r = size * (1 - k * 0.6);
    ctx.fillRect(x + Math.cos(a) * d - r / 2, y + Math.sin(a) * d - r / 2, r, r);
  }
}

function drawDamageNumbers(ctx: CanvasRenderingContext2D, numbers: readonly DamageNumber[], now: number) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const n of numbers) {
    const k = (now - n.born) / NUMBER_MS;
    if (k < 0 || k >= 1) continue;
    const player = n.kind === 'player';
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `800 ${player ? 24 : 17}px system-ui, sans-serif`;
    const label = String(Math.max(1, Math.round(n.amount)));
    const y = n.y - WORLD.playerRadius - 24 - 46 * k;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 16, 10, 0.85)';
    ctx.strokeText(label, n.x, y);
    ctx.fillStyle = player ? '#ffd34d' : '#f3e2c4';
    ctx.fillText(label, n.x, y);
  }
  ctx.globalAlpha = 1;
}
