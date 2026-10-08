import { bakedTurn, KIT, placed, type PieceId, type Placement } from '../../shared/kit.ts';
import { MAPS, type MapId } from '../../shared/maps.ts';

/** A placed kit piece as the painter draws it: its baked look's key and its footprint in map space. */
export type PieceLook = { key: string; p: PieceId; x: number; y: number; w: number; h: number; height: number };

/** The baked look of a placement at a damage stage: `kit.<piece>.<turn>.<stage>`. */
export const pieceKey = (at: Pick<Placement, 'p' | 'r'>, stage = 0): string => `kit.${at.p}.${bakedTurn({ ...at, x: 0, y: 0 })}.${stage}`;

export const pieceLook = (at: Placement): PieceLook => ({ key: pieceKey(at), p: at.p, ...placed(at).foot, height: KIT[at.p].height });

type MapLooks = { standing: PieceLook[]; overhead: PieceLook[] };
const cache = new Map<MapId, MapLooks>();

/**
 * Pieces split the way they are drawn: standing pieces with the actors, overhead ones above them. Breakable pieces come
 * from the snapshot's crates instead, and flat ones are baked into the map's light layer.
 */
export function looksOf(pieces: readonly Placement[]): MapLooks {
  const unbroken = pieces.filter((at) => !KIT[at.p].breaks);
  return {
    standing: unbroken.filter((at) => KIT[at.p].height > 0 && !KIT[at.p].overhead).map(pieceLook),
    overhead: unbroken.filter((at) => KIT[at.p].overhead).map(pieceLook),
  };
}

export function mapLooks(id: MapId): MapLooks {
  let got = cache.get(id);
  if (!got) cache.set(id, (got = looksOf(MAPS[id].pieces)));
  return got;
}

/** Which damage stage a piece shows having lost `wear` (0..1) of its health. */
export const stageFor = (p: PieceId, wear: number): number => {
  const stages = KIT[p].breaks?.stages ?? 1;
  return Math.min(stages - 1, Math.max(0, Math.floor(wear * stages)));
};
