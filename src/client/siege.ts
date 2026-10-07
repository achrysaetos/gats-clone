import { BUILDINGS, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type TurretKind } from '../shared/defs.ts';
import type { BuildingView, PlayerView, RunView, Snapshot, ZombieView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { clock } from './derive.ts';
import { HIT_FLASH_MS } from './effects.ts';
import { INK, PALETTE, shade, tint, ZOMBIE_LOOK } from './palette.ts';
import { bodySprite, drawBody } from './bodies.ts';
import type { Effect } from './state.ts';
import { LIGHT } from './tilt.ts';
import type { Ghost } from './zombies.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;

const CORE_GLOW = '#4fd1e8';
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

/** `to` is the angle of the turret's last shot (fired at `firedAt`), and `drawn` eases toward it, last eased at `at`. */
export type TurretAim = { to: number; drawn: number; at: number; firedAt: number };

/** A turret turns only to fire, so each shot's angle is its aim until the next; aims of turrets gone from the snapshot are dropped. */
export function aimTurrets(aims: Map<string, TurretAim>, snap: Snapshot, now: number) {
  for (const ev of snap.events) {
    if (ev.e !== 'turret') continue;
    const key = cellKey(ev.x, ev.y), aim = aims.get(key);
    if (aim) { aim.to = ev.angle; aim.firedAt = now; } else aims.set(key, { to: ev.angle, drawn: ev.angle, at: now, firedAt: now });
  }
  if (!snap.buildings) return;
  const standing = new Set(snap.buildings.map((b) => `${b.cx},${b.cy}`));
  for (const key of aims.keys()) if (!standing.has(key)) aims.delete(key);
}

const TURN_PER_SEC = 14;
const RECOIL_MS = 110;

/** The barrel's drawn angle eases toward its aim; a turret that never fired faces away from the core. */
function barrelOf(aims: Map<string, TurretAim>, b: BuildingView, core: { x: number; y: number }, now: number): { angle: number; recoil: number } {
  const aim = aims.get(`${b.cx},${b.cy}`);
  if (!aim) return { angle: Math.atan2((b.cy + 0.5) * ZOM.cell - core.y, (b.cx + 0.5) * ZOM.cell - core.x), recoil: 0 };
  const d = aim.to - aim.drawn;
  aim.drawn += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, ((now - aim.at) / 1000) * TURN_PER_SEC);
  aim.at = now;
  return { angle: aim.drawn, recoil: Math.max(0, 1 - (now - aim.firedAt) / RECOIL_MS) };
}

/**
 * A turret wears the world's kit: a gunmetal mount on its pad, outlined in ink and cel-shaded in two hard steps toward the
 * world's light, with a gun on top in the guns' own tones (gunart.ts) that turns to aim. The kind's accent is a muted
 * stripe on the gun and its ammo gauge, one colour per kind so the four read apart at a glance.
 */
const TURRET_LOOK: Record<TurretKind, { gun: string; accent: string }> = {
  sentry: { gun: '#555c67', accent: '#e0a43a' },
  cannon: { gun: '#6a7255', accent: '#d0573a' },
  scatter: { gun: '#666b74', accent: '#5fa595' },
  mortar: { gun: '#b19d72', accent: '#9a86c4' },
};
const MOUNT = { top: '#4f5560', dark: '#2c3037', r: 15 } as const;
const BARREL = '#2c3037';
const TURRET_SHINE = 'rgba(255, 255, 255, 0.28)';

/** An octagon, the clipped-corner plate of the interface turned into a mount. */
function octagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const c = r * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx - r + c, cy - r); ctx.lineTo(cx + r - c, cy - r); ctx.lineTo(cx + r, cy - r + c); ctx.lineTo(cx + r, cy + r - c);
  ctx.lineTo(cx + r - c, cy + r); ctx.lineTo(cx - r + c, cy + r); ctx.lineTo(cx - r, cy + r - c); ctx.lineTo(cx - r, cy - r + c);
  ctx.closePath();
}

/** One gun part in the turret's turning frame: base tone, a light band on the side toward the light, a dark band away, ink edge. */
function turretPart(ctx: CanvasRenderingContext2D, base: string, x: number, y: number, w: number, h: number, angle: number) {
  // Which local side faces the world's light, so the bands stay put as the gun turns.
  const lit = Math.sin(angle) * LIGHT.x - Math.cos(angle) * LIGHT.y < 0 ? -1 : 1;
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const band = Math.max(1.2, h * 0.28);
  ctx.fillStyle = tint(base, 0.24);
  ctx.fillRect(x, lit < 0 ? y : y + h - band, w, band);
  ctx.fillStyle = tint(base, -0.3);
  ctx.fillRect(x, lit < 0 ? y + h - band : y, w, band);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x, y, w, h);
}

function drawTurretHead(ctx: CanvasRenderingContext2D, kind: TurretKind, cx: number, cy: number, angle: number, recoil: number) {
  const look = TURRET_LOOK[kind];
  const r = MOUNT.r;
  // The mount: a crisp drop shadow, the plate, its two cel steps and an ink outline.
  ctx.fillStyle = 'rgba(20, 22, 28, 0.35)';
  octagon(ctx, cx + LIGHT.x * 4, cy + LIGHT.y * 4, r);
  ctx.fill();
  octagon(ctx, cx, cy, r);
  ctx.fillStyle = MOUNT.top;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = tint(MOUNT.top, 0.2);
  ctx.fillRect(cx - r, cy - r, r * 2, 3);
  ctx.fillRect(cx - r, cy - r, 3, r * 2);
  ctx.fillStyle = tint(MOUNT.top, -0.3);
  ctx.fillRect(cx - r, cy + r - 3, r * 2, 3);
  ctx.fillRect(cx + r - 3, cy - r, 3, r * 2);
  ctx.restore();
  octagon(ctx, cx, cy, r);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  // The gun, in its own turning frame.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-recoil * 5, 0);
  const reach = BUILDINGS[kind].turret.muzzle;
  switch (kind) {
    case 'sentry':
      for (const side of [-1, 1]) turretPart(ctx, BARREL, 6, side * 4.5 - 2, reach - 6, 4, angle);
      turretPart(ctx, look.gun, -9, -8, 17, 16, angle);
      break;
    case 'cannon':
      turretPart(ctx, BARREL, 6, -4, reach - 12, 8, angle);
      turretPart(ctx, BARREL, reach - 9, -6, 9, 12, angle);
      turretPart(ctx, look.gun, -10, -9, 19, 18, angle);
      break;
    case 'scatter':
      ctx.beginPath();
      ctx.moveTo(6, -4); ctx.lineTo(reach, -8.5); ctx.lineTo(reach, 8.5); ctx.lineTo(6, 4); ctx.closePath();
      ctx.fillStyle = BARREL;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = TURRET_SHINE;
      ctx.fillRect(9, -1, reach - 11, 1.4);
      turretPart(ctx, look.gun, -8, -8, 16, 16, angle);
      break;
    case 'mortar':
      turretPart(ctx, look.gun, -9, -10, 16, 20, angle);
      turretPart(ctx, BARREL, 0, -7, reach, 14, angle);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(reach - 3.5, 0, 4.5, 0, TAU);
      ctx.fill();
      break;
  }
  // The kind's accent stripe across the gun's back.
  ctx.fillStyle = look.accent;
  ctx.fillRect(-6, -5, 3, 10);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-6, -5, 3, 10);
  ctx.restore();
}

/** The ammo gauge: an ink-edged slot under the mount, filled in the kind's accent, flashing red when dry. */
function drawAmmo(ctx: CanvasRenderingContext2D, b: BuildingView & { kind: TurretKind }, now: number) {
  const { x, y, w, h } = cellRect(b.cx, b.cy);
  const empty = b.ammo === 0;
  const gx = x + 8, gy = y + h - 9, gw = w - 16, gh = 5;
  ctx.fillStyle = 'rgba(20, 22, 28, 0.8)';
  ctx.fillRect(gx, gy, gw, gh);
  if (!(empty && Math.floor(now / 250) % 2)) {
    ctx.fillStyle = empty ? PALETTE.hpBad : TURRET_LOOK[b.kind].accent;
    ctx.fillRect(gx + 1, gy + 1, empty ? gw - 2 : Math.max(2, ((gw - 2) * b.ammo) / 10), gh - 2);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(gx, gy, gw, gh);
}

export function drawSiegeTops(
  ctx: CanvasRenderingContext2D, buildings: readonly BuildingView[], flashes: ReadonlyMap<string, number>, aims: Map<string, TurretAim>, core: { x: number; y: number }, now: number, pxPerUnit: number,
) {
  for (const b of buildings) {
    const { x, y, w, h } = cellRect(b.cx, b.cy);
    if (b.kind !== 'wall') {
      const barrel = barrelOf(aims, b, core, now);
      drawTurretHead(ctx, b.kind, x + w / 2, y + h / 2 - 2, barrel.angle, barrel.recoil);
      drawAmmo(ctx, b, now);
    }
    const hit = flashes.get(`${b.cx},${b.cy}`);
    if (hit !== undefined) {
      ctx.globalAlpha = 0.7 * (1 - (now - hit) / HIT_FLASH_MS);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }
}

export function drawCoreGlow(ctx: CanvasRenderingContext2D, run: RunView, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  ctx.globalAlpha = 0.14 + 0.08 * pulse;
  ctx.fillStyle = CORE_GLOW;
  ctx.beginPath();
  ctx.arc(run.core.x, run.core.y, 100 + 6 * pulse, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawCoreTop(ctx: CanvasRenderingContext2D, run: RunView, now: number, hitAt: number) {
  const { x, y } = run.core;
  const r = coreRectAt(run.core);
  const frac = Math.max(0, run.core.hp / run.core.maxHp);
  const hit = Math.max(0, 1 - (now - hitAt) / CORE_HIT_MS);
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  ctx.fillStyle = '#5a6476';
  ctx.beginPath();
  for (const [bx, by] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    ctx.moveTo(x + bx * 37 + 3.5, y + by * 37);
    ctx.arc(x + bx * 37, y + by * 37, 3.5, 0, TAU);
  }
  ctx.fill();
  const jolt = hit * 3;
  const jx = x + Math.sin(now * 0.09) * jolt, jy = y + Math.cos(now * 0.11) * jolt;
  const glow = frac > 0.35 ? CORE_GLOW : PALETTE.hpBad;
  ctx.globalAlpha = 0.3 + 0.15 * pulse;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(jx, jy, 30, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  const sz = 24 + 3 * pulse;
  ctx.beginPath();
  ctx.moveTo(jx, jy - sz); ctx.lineTo(jx + sz * 0.7, jy); ctx.lineTo(jx, jy + sz); ctx.lineTo(jx - sz * 0.7, jy);
  ctx.closePath();
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.moveTo(jx, jy - sz + 5); ctx.lineTo(jx + sz * 0.32, jy - 2); ctx.lineTo(jx, jy + 2);
  ctx.closePath();
  ctx.fill();
  if (hit > 0) {
    ctx.globalAlpha = 0.6 * hit;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(28, 31, 38, 0.3)';
  ctx.beginPath();
  ctx.arc(x, y, 84, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = frac > 0.5 ? PALETTE.hpGood : frac > 0.25 ? PALETTE.gold : PALETTE.hpBad;
  ctx.beginPath();
  ctx.arc(x, y, 84, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  ctx.stroke();
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

export function drawZombies(ctx: CanvasRenderingContext2D, zombies: readonly ZombieView[], faces: ReadonlyMap<number, { a: number }>, flashes: ReadonlyMap<number, number>, now: number, pxPerUnit: number) {
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
        limbs.push(x + Math.cos(arm) * r * 1.05, y + Math.sin(arm) * r * 1.05, r * 0.36);
        if (look.shoulders) limbs.push(x + Math.cos(a + side * Math.PI / 2) * r * 0.8, y + Math.sin(a + side * Math.PI / 2) * r * 0.8, r * 0.46);
      }
    }
    ctx.fillStyle = shade(look.arm, 0.7);
    ctx.beginPath();
    addCircles(ctx, limbs, 1);
    ctx.fill();
    ctx.fillStyle = look.arm;
    ctx.beginPath();
    addCircles(ctx, limbs, 0);
    ctx.fill();
    const body = bodySprite(look.body, r, look.armor, pxPerUnit);
    for (const [, , x, y] of mine) drawBody(ctx, body, x, y, r);
    ctx.fillStyle = look.eye;
    ctx.beginPath();
    for (const [id, , x, y] of mine) {
      const a = faces.get(id)?.a ?? 0;
      for (const side of [-1, 1]) {
        const ex = x + Math.cos(a + side * 0.42) * r * 0.55, ey = y + Math.sin(a + side * 0.42) * r * 0.55;
        ctx.moveTo(ex + r * 0.15, ey);
        ctx.arc(ex, ey, r * 0.15, 0, TAU);
      }
    }
    ctx.fill();
  });
  for (const [id, kind, x, y] of zombies) {
    const hit = flashes.get(id);
    if (hit === undefined) continue;
    ctx.globalAlpha = 0.8 * (1 - (now - hit) / HIT_FLASH_MS);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, ZOMBIES[ZOMBIE_KINDS[kind]].radius, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const [, kind, x, y, hp] of zombies) {
    if (!ZOMBIE_LOOK[ZOMBIE_KINDS[kind]].bar) continue;
    const r = ZOMBIES[ZOMBIE_KINDS[kind]].radius, half = r - 2;
    ctx.fillStyle = 'rgba(28, 31, 38, 0.45)';
    ctx.beginPath();
    ctx.roundRect(x - half - 1, y - r - 13, half * 2 + 2, 6, 3);
    ctx.fill();
    ctx.fillStyle = hp > 3 ? PALETTE.hpBad : '#ff9f43';
    ctx.beginPath();
    ctx.roundRect(x - half, y - r - 12, Math.max(4, half * 2 * (hp / 10)), 4, 2);
    ctx.fill();
  }
}

export function drawDowned(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, serverNow: number | null, self: boolean) {
  const down = p.downed;
  if (!down) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = PALETTE.contact;
  ctx.beginPath();
  ctx.ellipse(LIGHT.x * 8, LIGHT.y * 8, R, R * 0.66, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.8);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.95, R * 0.62, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
  ctx.moveTo(0, -5); ctx.lineTo(0, 5);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = self ? color : 'rgba(28, 31, 38, 0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, R + 10, 0, TAU);
  ctx.stroke();
  if (down.revive > 0) {
    ctx.strokeStyle = PALETTE.hpGood;
    ctx.beginPath();
    ctx.arc(0, 0, R + 10, -Math.PI / 2, -Math.PI / 2 + down.revive * TAU);
    ctx.stroke();
  }
  if (serverNow !== null) {
    const left = down.bleedOutAt - serverNow;
    ctx.font = '750 12px "Barlow Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(28, 31, 38, 0.7)';
    ctx.strokeText(clock(left), 0, -R - 22);
    ctx.fillStyle = left < 8000 ? PALETTE.hunted : '#ffffff';
    ctx.fillText(clock(left), 0, -R - 22);
  }
  ctx.restore();
}

const GHOST_LOOK = { ok: PALETTE.hpGood, no: PALETTE.hpBad, down: '#ff9f43' } as const;

export function drawGhost(ctx: CanvasRenderingContext2D, ghost: Ghost, self: { x: number; y: number }, core: { x: number; y: number }, now: number, pxPerUnit: number) {
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -now / 60;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 90, 31, 0.7)';
  ctx.beginPath();
  ctx.arc(core.x, core.y, ZOM.buildRadius, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40, 44, 52, 0.45)';
  ctx.beginPath();
  ctx.arc(self.x, self.y, ZOM.reachPx, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  const { x, y, w, h } = cellRect(ghost.cx, ghost.cy);
  const color = ghost.refusal === null ? GHOST_LOOK.ok : ghost.refusal === 'taken' ? GHOST_LOOK.down : GHOST_LOOK.no;
  if (ghost.kind !== 'wall' && ghost.refusal !== 'taken') {
    ctx.globalAlpha = 0.6;
    drawTurretHead(ctx, ghost.kind, x + w / 2, y + h / 2 - 2, Math.atan2(y + h / 2 - core.y, x + w / 2 - core.x), 0);
  }
  ctx.globalAlpha = 0.3 + 0.1 * Math.sin(now / 160);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  if (!ghost.label) return;
  ctx.font = '800 14px "Barlow Condensed", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lw = ctx.measureText(ghost.label).width + 16;
  // The interface's plate: gunmetal with its top-right and bottom-left corners clipped.
  const lx = x + w / 2 - lw / 2, ly = y - 34, c = 6;
  ctx.fillStyle = 'rgba(30, 33, 40, 0.9)';
  ctx.beginPath();
  ctx.moveTo(lx, ly); ctx.lineTo(lx + lw - c, ly); ctx.lineTo(lx + lw, ly + c); ctx.lineTo(lx + lw, ly + 24); ctx.lineTo(lx + c, ly + 24); ctx.lineTo(lx, ly + 24 - c);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color === GHOST_LOOK.ok ? '#ffffff' : color;
  ctx.fillText(ghost.label, x + w / 2, y - 21);
}
