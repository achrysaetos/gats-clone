import { INK, shade, tint } from './palette.ts';
import { LIGHT } from './tilt.ts';

/**
 * The toy-soldier cel kit shared by the bodies and their cosmetics (bodies.ts, hats.ts): shapes traced as paths, filled in the
 * art bible's two hard steps (a dark crescent away from the key light, a light one toward it) under a bold ink outline.
 */
export const TAU = Math.PI * 2;
/** How far, as a share of the radius, the dark and light crescents of a body's cel shading reach in. */
export const CEL = { shadeShift: 0.16, lightShift: 0.12 } as const;

/** A shape's outline traced as subpaths into the current path, without beginning a new one. */
export type Trace = (g: CanvasRenderingContext2D) => void;

export const ellipse = (cx: number, cy: number, rx: number, ry: number): Trace => (g) => {
  g.moveTo(cx + rx, cy);
  g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
};
export const roundBox = (x0: number, y0: number, x1: number, y1: number, r: number): Trace => (g) => {
  g.moveTo(x0 + r, y0);
  g.arcTo(x1, y0, x1, y1, r);
  g.arcTo(x1, y1, x0, y1, r);
  g.arcTo(x0, y1, x0, y0, r);
  g.arcTo(x0, y0, x1, y0, r);
  g.closePath();
};
/** A closed polygon through `pts`, optionally with rounded joins drawn by the stroke's `lineJoin`. */
export const polygon = (...pts: readonly (readonly [number, number])[]): Trace => (g) => {
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.closePath();
};

/**
 * Fills a part with the kit's two hard cel steps, in a sprite drawn turned by `turn`: a dark crescent on the side away from
 * the light, a light one toward it, both measured in the world's frame. `size` sets how deep the crescents reach, and an
 * ink outline `ink` wide goes round it first. Seen at the world's three-quarter angle, a part standing from height `rise`
 * to `rise + lip` shows its top face that far up-screen and its darker front face below it, down-screen.
 */
export function celPart(g: CanvasRenderingContext2D, trace: Trace, base: string, turn: number, size: number, ink: number, lip = 0, rise = -lip / 2) {
  const c = Math.cos(turn), s = Math.sin(turn);
  const local = (dx: number, dy: number): [number, number] => [dx * c + dy * s, -dx * s + dy * c];
  const steps = Math.ceil(lip / 0.5);
  const sweep = (paint: () => void) => {
    for (let i = 0; i <= steps; i++) {
      const [x, y] = local(0, -rise - (steps ? (lip * i) / steps : 0));
      g.translate(x, y);
      g.beginPath();
      trace(g);
      g.translate(-x, -y);
      paint();
    }
  };
  g.lineJoin = 'round';
  if (ink > 0) {
    g.lineWidth = ink * 2;
    g.strokeStyle = INK;
    sweep(() => g.stroke());
  }
  if (lip > 0) {
    g.fillStyle = shade(base, 0.66);
    sweep(() => g.fill());
  }
  const [tx, ty] = local(0, -rise - lip);
  g.save();
  g.translate(tx, ty);
  if (lip > 0 && ink > 0) {
    // The ink line where the top face meets the front face.
    g.beginPath();
    trace(g);
    g.lineWidth = ink * 1.2;
    g.strokeStyle = INK;
    g.stroke();
  }
  g.beginPath();
  trace(g);
  g.clip();
  g.fillStyle = shade(base, 0.76);
  g.fill();
  const [dx, dy] = local(-LIGHT.x * size * CEL.shadeShift, -LIGHT.y * size * CEL.shadeShift);
  g.translate(dx, dy);
  g.beginPath();
  trace(g);
  g.fillStyle = base;
  g.fill();
  g.translate(-dx, -dy);
  const [lx, ly] = local(LIGHT.x * size * CEL.lightShift, LIGHT.y * size * CEL.lightShift);
  g.beginPath();
  trace(g);
  g.translate(lx, ly);
  trace(g);
  g.translate(-lx, -ly);
  g.fillStyle = tint(base, 0.3);
  g.fill('evenodd');
  g.restore();
}

/**
 * Lays the same two cel steps over paint already on a part's top face (a camo pattern, a print): `trace` is the face in the
 * current frame, turned by `turn`. The dark crescent and the light one are translucent so the pattern shows through them.
 */
export function celOver(g: CanvasRenderingContext2D, trace: Trace, turn: number, size: number, dark = 0.24, light = 0.16) {
  const c = Math.cos(turn), s = Math.sin(turn);
  const local = (dx: number, dy: number): [number, number] => [dx * c + dy * s, -dx * s + dy * c];
  g.save();
  g.beginPath();
  trace(g);
  g.clip();
  const [dx, dy] = local(-LIGHT.x * size * CEL.shadeShift, -LIGHT.y * size * CEL.shadeShift);
  g.beginPath();
  trace(g);
  g.translate(dx, dy);
  trace(g);
  g.translate(-dx, -dy);
  g.fillStyle = `rgba(10, 12, 20, ${dark})`;
  g.fill('evenodd');
  const [lx, ly] = local(LIGHT.x * size * CEL.lightShift, LIGHT.y * size * CEL.lightShift);
  g.beginPath();
  trace(g);
  g.translate(lx, ly);
  trace(g);
  g.translate(-lx, -ly);
  g.fillStyle = `rgba(255, 255, 255, ${light})`;
  g.fill('evenodd');
  g.restore();
}
