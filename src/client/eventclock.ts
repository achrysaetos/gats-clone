import { BUILDINGS, WORLD, ZOMBIE_KINDS, ZOMBIES } from '../shared/defs.ts';
import { segmentEntersCircleAt } from '../shared/sim/movement.ts';
import type { GameEvent, Snapshot } from '../shared/protocol.ts';
import { muzzleTip } from './sprites.ts';
import type { Effect } from './state.ts';

export type EffectSpec = Effect extends infer E ? (E extends Effect ? Omit<E, 'born'> : never) : never;
export type PendingEffect = { at: number; fx: EffectSpec };

function effectOf(ev: GameEvent, snap: Snapshot): EffectSpec | null {
  switch (ev.e) {
    case 'impact': return { kind: 'impact', surface: 'wall', x: ev.x, y: ev.y, victim: null };
    case 'dmg': return { kind: 'impact', surface: ev.kind, x: ev.x, y: ev.y, victim: ev.kind === 'player' || ev.kind === 'zombie' ? ev.victim : null };
    case 'boom': return { kind: 'boom', x: ev.x, y: ev.y, r: ev.r };
    case 'shot': return { kind: 'flash', ...muzzleTip(ev.x, ev.y, ev.angle, ev.gun, WORLD.playerRadius), angle: ev.angle };
    case 'slash': return { kind: 'slash', x: ev.x, y: ev.y, angle: ev.angle };
    case 'zkill': return { kind: 'splat', x: ev.x, y: ev.y, zombie: ev.kind };
    case 'turret': {
      const def = BUILDINGS[ev.kind].turret;
      const x = ev.x + Math.cos(ev.angle) * def.muzzle, y = ev.y + Math.sin(ev.angle) * def.muzzle;
      const dx = Math.cos(ev.angle) * def.range, dy = Math.sin(ev.angle) * def.range;
      // The round stops in the first zombie on its line, as the server's does.
      const hit = Math.min(1, ...(snap.zombies ?? []).map(([, k, zx, zy]) => segmentEntersCircleAt(x, y, dx, dy, zx, zy, ZOMBIES[ZOMBIE_KINDS[k]!].radius) ?? 1));
      return { kind: 'tracer', turret: ev.kind, x, y, angle: ev.angle, reach: hit * def.range };
    }
    case 'hunted':
    case 'life': return null;
    case 'kill': {
      const blow = snap.events.filter((d) => d.e === 'dmg' && d.kind === 'player' && d.victim === ev.victimId).at(-1);
      return blow?.e === 'dmg' ? { kind: 'death', x: blow.x, y: blow.y, victim: ev.victimId } : null;
    }
  }
}

const isOwnShot = (ev: GameEvent, myId: number) => ev.e === 'shot' && ev.owner === myId;

export function scheduleEffects(snap: Snapshot, serverMs: number, myId: number): { now: EffectSpec[]; later: PendingEffect[] } {
  const now: EffectSpec[] = [];
  const later: PendingEffect[] = [];
  for (const ev of snap.events) {
    const fx = effectOf(ev, snap);
    if (!fx) continue;
    if (isOwnShot(ev, myId)) now.push(fx);
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
