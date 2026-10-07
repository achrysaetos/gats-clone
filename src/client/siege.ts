import { BUILDINGS, WORLD, ZOM, type TurretKind } from '../shared/defs.ts';
import type { BuildingView, PlayerView, RunView, Snapshot, ZombieView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { clock } from './derive.ts';
import { HIT_FLASH_MS } from './effects.ts';
import { INK, PALETTE, tint } from './palette.ts';
import { drawFallenSoldier } from './bodies.ts';
import { CORE_GLOW, drawCoreBody } from './coreart.ts';
import { coreFlash, onStrike, siege } from './siegefx.ts';
import { animateZombies, biteTarget, cellId, drawHorde } from './zombieart.ts';
import type { Effect } from './state.ts';
import { LIGHT } from './tilt.ts';
import type { Ghost } from './zombies.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;

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

/**
 * A worn turret: gashes across its mount from the claws (one more at each step of wear, fixed per cell), and once badly
 * hurt a red damage lamp blinking on it. Its smoke rises from siegefx.ts.
 */
function drawTurretWear(ctx: CanvasRenderingContext2D, b: BuildingView, cx: number, cy: number, now: number) {
  const marks = b.hp <= 2 ? 3 : b.hp <= 3 ? 2 : 1;
  let seed = (b.cx * 73856093) ^ (b.cy * 19349663);
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < marks; i++) {
    // Three parallel claw rakes across one side of the mount.
    const a = rnd() * TAU, ox = cx + Math.cos(a) * 9, oy = cy + Math.sin(a) * 9, d = a + Math.PI / 2;
    for (let k = -1; k <= 1; k++) {
      const px = ox + Math.cos(a) * k * 2.4, py = oy + Math.sin(a) * k * 2.4;
      ctx.moveTo(px - Math.cos(d) * 5, py - Math.sin(d) * 5);
      ctx.lineTo(px + Math.cos(d) * 5, py + Math.sin(d) * 5);
    }
  }
  ctx.stroke();
  if (b.hp <= 3 && Math.floor(now / 300) % 2) {
    ctx.fillStyle = PALETTE.hunted;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(cx - 11, cy - 11, 5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx - 11, cy - 11, 2.2, 0, TAU);
    ctx.fill();
  }
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
      if (b.hp <= 5) drawTurretWear(ctx, b, x + w / 2, y + h / 2 - 2, now);
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

/**
 * The Bastion's ground, under everything: a hazard-taped ring painted round it on the floor, the kit's orange on ink, and a
 * cool underglow that breathes with its crystal. The light it gives off is drawn later, over the night (siegefx.ts).
 */
export function drawCoreGlow(ctx: CanvasRenderingContext2D, run: RunView, now: number) {
  const { x, y } = run.core;
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  ctx.globalAlpha = 0.05 + 0.04 * pulse;
  ctx.fillStyle = CORE_GLOW;
  ctx.beginPath();
  ctx.arc(x, y, 104, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, 104, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([10, 10]);
  ctx.lineDashOffset = 0;
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#d9541f';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export function drawCoreTop(ctx: CanvasRenderingContext2D, run: RunView, now: number, hitAt: number, pxPerUnit = 1) {
  drawCoreBody(ctx, run, now, coreFlash(siege, hitAt, now), pxPerUnit);
}

/**
 * The horde: each zombie's walk and bite advanced from where it is drawn (zombieart.ts), each blow that lands on the core, a
 * building or a squad player bursting sparks and chips off it (siegefx.ts), then the horde drawn batched by kind.
 */
export function drawZombies(ctx: CanvasRenderingContext2D, zombies: readonly ZombieView[], snap: Pick<Snapshot, 'run' | 'buildings' | 'players'>, flashes: ReadonlyMap<number, number>, now: number, pxPerUnit: number) {
  const core = snap.run ? coreRectAt(snap.run.core) : null;
  const buildingAt = new Map((snap.buildings ?? []).map((b) => [cellId(b.cx, b.cy), b]));
  const players = snap.players.filter((p) => p.alive).map((p) => ({ x: p.x, y: p.y, r: R }));
  animateZombies(zombies, now, snap.run?.core ?? { x: 0, y: 0 }, (kind, x, y) => biteTarget(kind, x, y, core, buildingAt, players), (st) => onStrike(siege, st, now));
  drawHorde(ctx, zombies, flashes, now, pxPerUnit);
}

/**
 * A downed squadmate: their own soldier lying where they fell, in their colour (they are not dead yet), reaching and
 * struggling; a ring on the floor pulsing red faster as they bleed out; round them the bleed-out draining and, once someone
 * holds use, the revive filling in green; a medic plate bobbing over them; and the time left.
 */
export function drawDowned(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, serverNow: number | null, self: boolean, now = 0, pxPerUnit = 1) {
  const down = p.downed;
  if (!down) return;
  const left = serverNow === null ? ZOM.bleedOutMs : Math.max(0, down.bleedOutAt - serverNow);
  const urgency = 1 - Math.min(1, left / ZOM.bleedOutMs);
  const beat = 0.5 + 0.5 * Math.sin(now / (260 - 150 * urgency));
  // The pulse on the floor, under the body.
  ctx.globalAlpha = (0.18 + 0.22 * beat) * (down.revive > 0 ? 0.4 : 1);
  ctx.fillStyle = down.revive > 0 ? PALETTE.hpGood : PALETTE.hpBad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R + 8 + 5 * beat, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  const struggle = Math.sin(now / 320 + p.id) * 0.25;
  drawFallenSoldier(ctx, color, p.x, p.y, R, { angle: p.angle, splay: [0.5 + struggle, 0.7 - struggle], loll: 0.15 * Math.sin(now / 500 + p.id), scale: 1 }, pxPerUnit);
  // Bleed-out draining, then the revive filling over it.
  const ring = R + 12;
  ctx.lineCap = 'butt';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(28, 31, 38, 0.55)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, ring, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = left < 8000 ? PALETTE.hunted : '#ff9f43';
  ctx.beginPath();
  ctx.arc(p.x, p.y, ring, -Math.PI / 2, -Math.PI / 2 + (1 - urgency) * TAU);
  ctx.stroke();
  if (down.revive > 0) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = PALETTE.hpGood;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ring, -Math.PI / 2, -Math.PI / 2 + down.revive * TAU);
    ctx.stroke();
  }
  if (self) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ring + 5, 0, TAU);
    ctx.stroke();
  }
  // The medic plate: a white cross on the kit's green, ink-edged, bobbing.
  const mx = p.x, my = p.y - R - 30 + Math.sin(now / 300) * 2;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(mx, my, 9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = down.revive > 0 ? PALETTE.hpGood : tint(PALETTE.hpBad, 0.1 * beat);
  ctx.beginPath();
  ctx.arc(mx, my, 7.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mx - 1.6, my - 4.5, 3.2, 9);
  ctx.fillRect(mx - 4.5, my - 1.6, 9, 3.2);
  if (serverNow !== null) {
    ctx.font = '750 12px "Barlow Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(28, 31, 38, 0.8)';
    ctx.strokeText(clock(left), p.x, p.y + R + 24);
    ctx.fillStyle = left < 8000 ? PALETTE.hunted : '#ffffff';
    ctx.fillText(clock(left), p.x, p.y + R + 24);
  }
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
