import { ZOM, type TurretKind } from '../shared/defs.ts';
import type { RunView, Snapshot, ZombieView } from '../shared/protocol.ts';
import { HIT_FLASH_MS } from './effects.ts';
import type { Effect } from './state.ts';

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

const TURN_PER_SEC = 14;

/** Eases each turret's drawn barrel toward its last shot's angle. */
export function easeTurrets(aims: ReadonlyMap<string, TurretAim>, now: number) {
  for (const aim of aims.values()) {
    const d = aim.to - aim.drawn;
    aim.drawn += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, ((now - aim.at) / 1000) * TURN_PER_SEC);
    aim.at = now;
  }
}

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

export const TURRET_LOOK: Record<TurretKind, { head: string; barrel: string; accent: string; ammo: string }> = {
  sentry: { head: '#7a8291', barrel: '#2c313b', accent: '#f5c400', ammo: '#f5c400' },
  cannon: { head: '#6e6052', barrel: '#22262d', accent: '#e5484d', ammo: '#ff9f43' },
  scatter: { head: '#5f7f7a', barrel: '#262c30', accent: '#3fd1b8', ammo: '#3fd1b8' },
  mortar: { head: '#5a5f4a', barrel: '#1f2326', accent: '#b98cff', ammo: '#b98cff' },
};

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
