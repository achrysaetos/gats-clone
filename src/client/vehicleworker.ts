/**
 * The vehicle baker, run in a worker (public/vehicles.js) so a big plane never stalls a frame: it builds the model for a
 * kind, livery and variant, renders it (vehiclemesh.ts) and posts the pixels back.
 */
import { bakeRaw } from './vehiclemesh.ts';
import { modelOf, type VehicleKind } from './vehiclemodels.ts';

export type BakeJob = { id: number; kind: VehicleKind; livery: string; variant: string; number: string; rot: number; scale: number; res: number; ss: number };

const scope = self as unknown as { fonts?: FontFaceSet; location: Location; onmessage: ((e: MessageEvent<BakeJob>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void };
// The stencils on the airframes are set in the game's own condensed face.
const font = (async () => {
  try {
    const f = new FontFace('Barlow Condensed', `url(${new URL('fonts/barlow-condensed-latin-700-normal.woff2', scope.location.href)})`, { weight: '700' });
    await f.load();
    scope.fonts?.add(f);
  } catch { /* the fallback face will do */ }
})();

scope.onmessage = async (e) => {
  const j = e.data;
  try {
    await font;
    const r = bakeRaw(modelOf(j.kind, j.livery, j.variant, j.number), { rot: j.rot, scale: j.scale, res: j.res, ss: j.ss });
    scope.postMessage({ id: j.id, w: r.w, h: r.h, ox: r.ox, oy: r.oy, res: r.res, ms: r.ms, px: r.px }, [r.px.buffer]);
  } catch (err) {
    // The page bakes this one itself.
    scope.postMessage({ id: j.id, error: String((err as Error)?.stack ?? err) });
  }
};
