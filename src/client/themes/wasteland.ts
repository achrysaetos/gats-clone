import { registerAmbient } from '../ambientreg.ts';
import { registerTheme } from './registry.ts';
import { paintWastelandFloor } from './wastelandfloor.ts';
import { wastelandOver, wastelandUnder } from './wastelandlive.ts';
import { WASTELAND_GEO } from './wastelandpoly.ts';
import { WASTELAND_WALLS } from './wastelandwalls.ts';

/**
 * Wasteland: a settlers' town years after the fall, at dusk. This file registers the theme; the ground is wastelandfloor.ts,
 * the rect walls wastelandwalls.ts, the polygon set pieces, doors and roofs wastelandpoly.ts, and the hand-placed stories
 * and everything that moves are wastelanddecor.ts and wastelandlive.ts.
 */
registerTheme('wasteland', {
  floor: paintWastelandFloor,
  walls: WASTELAND_WALLS,
  under: wastelandUnder,
  over: wastelandOver,
  drawPoly: WASTELAND_GEO.drawPoly,
  roof: WASTELAND_GEO.roof,
  door: WASTELAND_GEO.door,
  dusk: 0.4,
});
