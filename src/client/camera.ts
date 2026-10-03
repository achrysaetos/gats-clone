export type Camera = { x: number; y: number; scale: number; w: number; h: number };
export type Point = { x: number; y: number };

/**
 * The longer screen axis spans the server's view diameter, matching what the server sends:
 * fitting the shorter axis would show empty, unsynced space at the long edges.
 */
export function makeCamera(center: Point, w: number, h: number, viewRadius: number): Camera {
  return { x: center.x, y: center.y, w, h, scale: Math.max(w, h) / (2 * viewRadius) };
}

export const worldToScreen = (c: Camera, p: Point): Point => ({
  x: (p.x - c.x) * c.scale + c.w / 2,
  y: (p.y - c.y) * c.scale + c.h / 2,
});

export const screenToWorld = (c: Camera, p: Point): Point => ({
  x: (p.x - c.w / 2) / c.scale + c.x,
  y: (p.y - c.h / 2) / c.scale + c.y,
});
