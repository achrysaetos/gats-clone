import type { WallView } from '../../shared/protocol.ts';

type MapWallLike = { x: number; y: number; w: number; h: number; material: string };

/** Names a wall layout, so a client can find the map baked for the walls the server sent without being told the map's id. */
export function layoutKey(walls: readonly MapWallLike[]): string {
  const text = walls.map((w) => `${w.material}${w.x},${w.y},${w.w},${w.h}`).sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const mapLayoutKey = (walls: readonly WallView[]) => layoutKey(walls.flatMap((w) => (w.built ? [] : [w])));
