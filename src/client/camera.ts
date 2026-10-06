import { clampAspect, viewExtents } from '../shared/protocol.ts';

export type Camera = { x: number; y: number; scale: number; w: number; h: number; viewHalfW: number; viewHalfH: number };
export type Point = { x: number; y: number };

export const viewAspect = (w: number, h: number): number => clampAspect(w / h);

export function makeCamera(center: Point, w: number, h: number, viewRadius: number): Camera {
  const { halfW: viewHalfW, halfH: viewHalfH } = viewExtents(viewRadius, viewAspect(w, h));
  return { x: center.x, y: center.y, w, h, viewHalfW, viewHalfH, scale: Math.min(w / (2 * viewHalfW), h / (2 * viewHalfH)) };
}

const VIEW_EASE_MS = 150;
export const easeView = (shown: number, target: number, dtMs: number): number => target + (shown - target) * Math.exp(-dtMs / VIEW_EASE_MS);

export const worldToScreen = (c: Camera, p: Point): Point => ({
  x: (p.x - c.x) * c.scale + c.w / 2,
  y: (p.y - c.y) * c.scale + c.h / 2,
});

export const screenToWorld = (c: Camera, p: Point): Point => ({
  x: (p.x - c.w / 2) / c.scale + c.x,
  y: (p.y - c.h / 2) / c.scale + c.y,
});
