import { bakedTurn, KIT, placed, type Light, type PieceId, type Placement } from '../../shared/kit.ts';
import { MAPS, type MapId } from '../../shared/maps.ts';

/** A placed kit piece as the painter draws it: its baked look's key and its footprint in map space. */
export type PieceLook = { key: string; p: PieceId; x: number; y: number; w: number; h: number; height: number };

/** The baked look of a placement at a damage stage: `kit.<piece>.<turn>.<stage>`. */
export const pieceKey = (at: Pick<Placement, 'p' | 'r'>, stage = 0): string => `kit.${at.p}.${bakedTurn({ ...at, x: 0, y: 0 })}.${stage}`;

const look = (at: Placement): PieceLook => ({ key: pieceKey(at), p: at.p, ...placed(at).foot, height: KIT[at.p].height });

type MapLooks = { standing: PieceLook[]; overhead: PieceLook[]; lights: Light[] };
const cache = new Map<MapId, MapLooks>();

/**
 * The map's pieces split the way they are drawn: standing pieces with the actors, overhead ones above them, and the lights
 * they throw, which night draws live. Breakable pieces come from the snapshot's crates instead, and flat ones are baked into
 * the map's light layer.
 */
export function mapLooks(id: MapId): MapLooks {
  let got = cache.get(id);
  if (!got) {
    const unbroken = MAPS[id].pieces.filter((at) => !KIT[at.p].breaks);
    got = {
      standing: unbroken.filter((at) => KIT[at.p].height > 0 && !KIT[at.p].overhead).map(look),
      overhead: unbroken.filter((at) => KIT[at.p].overhead).map(look),
      lights: unbroken.flatMap((at) => placed(at).lights),
    };
    cache.set(id, got);
  }
  return got;
}

/** Which damage stage a piece shows having lost `wear` (0..1) of its health. */
export const stageFor = (p: PieceId, wear: number): number => {
  const stages = KIT[p].breaks?.stages ?? 1;
  return Math.min(stages - 1, Math.max(0, Math.floor(wear * stages)));
};
