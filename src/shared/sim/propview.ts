import { PROP_KINDS, PROPS } from '../defs.ts';
import type { PropView } from '../protocol.ts';
import type { Rect } from './movement.ts';

/** The footprint of a prop as the wire shows it (`PropView`), or null when it blocks nobody: a flying tank or a pack on the floor. */
export function propViewRect(v: PropView): Rect | null {
  const [, kind, x, y, state] = v;
  const k = PROP_KINDS[kind]!;
  if ((k === 'propane' && state === 0) || ((k === 'medic' || k === 'ammo') && state === 11)) return null;
  const h = PROPS[k].size / 2;
  return { x: x - h, y: y - h, w: 2 * h, h: 2 * h };
}
