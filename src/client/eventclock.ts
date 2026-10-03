import { WORLD } from '../shared/defs.ts';
import type { GameEvent, Snapshot } from '../shared/protocol.ts';
import { muzzleTip } from './sprites.ts';
import type { Effect } from './state.ts';

export type EffectSpec = Effect extends infer E ? (E extends Effect ? Omit<E, 'born'> : never) : never;
export type PendingEffect = { at: number; fx: EffectSpec };

function effectOf(ev: GameEvent, snap: Snapshot): EffectSpec | null {
  switch (ev.e) {
    case 'impact': return { kind: 'impact', surface: 'wall', x: ev.x, y: ev.y };
    case 'dmg': return { kind: 'impact', surface: ev.kind, x: ev.x, y: ev.y };
    case 'boom': return { kind: 'boom', x: ev.x, y: ev.y, r: ev.r };
    case 'shot': {
      const weapon = snap.players.find((p) => p.id === ev.owner)?.weapon ?? 'pistol';
      return { kind: 'flash', ...muzzleTip(ev.x, ev.y, ev.angle, weapon, WORLD.playerRadius), angle: ev.angle };
    }
    case 'kill': return null;
  }
}

/**
 * Your own player is drawn in the present, so your muzzle flash shows at once. Everything else in the world is
 * drawn on the render clock, behind the server, so its effects wait for that clock to reach their tick and line up
 * with the bullets and bodies that caused them.
 */
export function scheduleEffects(snap: Snapshot, serverMs: number, myId: number): { now: EffectSpec[]; later: PendingEffect[] } {
  const now: EffectSpec[] = [];
  const later: PendingEffect[] = [];
  for (const ev of snap.events) {
    const fx = effectOf(ev, snap);
    if (!fx) continue;
    if (ev.e === 'shot' && ev.owner === myId) now.push(fx);
    else later.push({ at: serverMs, fx });
  }
  return { now, later };
}

export function releaseDue(queue: readonly PendingEffect[], renderMs: number): { due: EffectSpec[]; rest: PendingEffect[] } {
  const due: EffectSpec[] = [];
  const rest: PendingEffect[] = [];
  for (const p of queue) {
    if (p.at <= renderMs) due.push(p.fx);
    else rest.push(p);
  }
  return { due, rest };
}
