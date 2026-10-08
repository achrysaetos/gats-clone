import { KIT, type PieceId } from '../../shared/kit.ts';

/** The greybox colours of a piece with no baked look yet: its top, its south face and its outline. */
export type BlockLook = { top: number; face: number; edge: number };

const BY_MATERIAL: Record<(typeof KIT)[PieceId]['material'], BlockLook> = {
  concrete: { top: 0xb9bcc0, face: 0x6c7077, edge: 0x4a4e55 },
  metal: { top: 0x7d8796, face: 0x434a55, edge: 0x2e333b },
  wood: { top: 0xb58c58, face: 0x6e5132, edge: 0x4a3520 },
  planter: { top: 0x5b6e45, face: 0x5e5a50, edge: 0x3a3830 },
  sandbag: { top: 0xb0a27a, face: 0x6f654a, edge: 0x4d4532 },
};
const BY_PIECE: Partial<Record<PieceId, BlockLook>> = {
  'container.blue': { top: 0x3f6a9a, face: 0x24405e, edge: 0x172a3e },
  'container.rust': { top: 0x9a5a3a, face: 0x5c3422, edge: 0x3c2216 },
  'container.grey': { top: 0x8a8f96, face: 0x52565c, edge: 0x34373b },
  'barrel.red': { top: 0xc23a2e, face: 0x6e1e18, edge: 0x4a1410 },
  'forklift': { top: 0xd9a92a, face: 0x7a5e16, edge: 0x4a3a0e },
  'crate.drop': { top: 0x5a6a4a, face: 0x34402a, edge: 0xffd34d },
};

export const blockLook = (p: PieceId): BlockLook => BY_PIECE[p] ?? BY_MATERIAL[KIT[p].material];
