import type { Problem } from '../../shared/maplint.ts';
import type { Center } from '../../shared/maps.ts';
import type { Rect } from '../../shared/sim/movement.ts';
import { sameTarget, type Geom, type Handle, type Target } from './model.ts';

/** The editor's own camera: a map point at the screen's centre and screen pixels per game unit. */
export type EditorCam = { x: number; y: number; scale: number; w: number; h: number };

export const toScreen = (c: EditorCam, p: Center): Center => ({ x: (p.x - c.x) * c.scale + c.w / 2, y: (p.y - c.y) * c.scale + c.h / 2 });
export const toMap = (c: EditorCam, p: Center): Center => ({ x: (p.x - c.w / 2) / c.scale + c.x, y: (p.y - c.h / 2) / c.scale + c.y });

/** Screen pixels from a rect handle's far corner within which a press resizes it. */
export const CORNER_PX = 9;

const COLORS: Record<string, string> = {
  red: '#e5484d', blue: '#3e8ef7', ffa: '#46c26b', attack: '#ff8a3d', defend: '#9b7bff', zone: '#ffd34d',
  terminal: '#4fd1e8', pad: '#4fd1e8', lane: '#ffb020', core: '#4fd1e8', horde: '#a3463f', mark: '#e8e2c8', piece: '#ffffff',
};

function colorOf(t: Target, twin: boolean): string {
  if (t.k === 'spawn') return COLORS[twin && t.side === 'red' ? 'blue' : t.side]!;
  if (t.k === 'extract') return COLORS[t.side]!;
  return COLORS[t.k]!;
}

export type Overlay = {
  cam: EditorCam;
  size: number;
  grid: number;
  showGrid: boolean;
  handles: readonly Handle[];
  selected: Target | null;
  hovered: Handle | null;
  ghost: Rect | null;
  problems: readonly Problem[];
  focus: number | null;
};

/** Everything the editor draws over the world: the edge, the grid, spawns and zones, the selection and the lint's marks. */
export function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay) {
  const { cam } = o;
  const rect = (r: Rect) => {
    const a = toScreen(cam, r);
    return [a.x, a.y, r.w * cam.scale, r.h * cam.scale] as const;
  };
  ctx.save();
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(...rect({ x: 0, y: 0, w: o.size, h: o.size }));
  if (o.showGrid) drawGrid(ctx, cam, o.size, o.grid);

  for (const h of o.handles) {
    if (h.target.k === 'piece') continue;
    const color = colorOf(h.target, h.twin);
    ctx.setLineDash(h.twin || h.target.k === 'mark' ? [6, 5] : []);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color + (h.target.k === 'mark' ? '00' : '22');
    shape(ctx, cam, h.geom, true);
    if (cam.scale > 0.12) label(ctx, cam, h.geom, h.label, color);
  }
  ctx.setLineDash([]);

  if (o.hovered && !(o.selected && sameTarget(o.hovered.target, o.selected))) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    shape(ctx, cam, o.hovered.geom, false);
  }
  if (o.selected) {
    for (const h of o.handles) {
      if (!sameTarget(h.target, o.selected)) continue;
      ctx.setLineDash(h.twin ? [8, 6] : []);
      ctx.strokeStyle = h.twin ? 'rgba(255,211,77,0.75)' : '#ffd34d';
      ctx.lineWidth = h.twin ? 2 : 3;
      shape(ctx, cam, h.geom, false);
      if (!h.twin && h.geom.kind === 'rect' && h.target.k !== 'piece') {
        const [x, y, w, hh] = rect(h.geom.rect);
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(x + w - CORNER_PX / 2 - 2, y + hh - CORNER_PX / 2 - 2, CORNER_PX, CORNER_PX);
      }
    }
    ctx.setLineDash([]);
  }
  if (o.ghost) {
    ctx.strokeStyle = '#7cf29a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(...rect(o.ghost));
    ctx.setLineDash([]);
  }
  drawProblems(ctx, cam, o.problems, o.focus);
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, cam: EditorCam, size: number, grid: number) {
  let step = grid;
  while (step * cam.scale < 10) step *= 4;
  const tl = toMap(cam, { x: 0, y: 0 }), br = toMap(cam, { x: cam.w, y: cam.h });
  const x0 = Math.max(0, Math.floor(tl.x / step) * step), x1 = Math.min(size, br.x);
  const y0 = Math.max(0, Math.floor(tl.y / step) * step), y1 = Math.min(size, br.y);
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) { const s = toScreen(cam, { x, y: 0 }).x; ctx.moveTo(s, toScreen(cam, { x, y: Math.max(0, tl.y) }).y); ctx.lineTo(s, toScreen(cam, { x, y: Math.min(size, br.y) }).y); }
  for (let y = y0; y <= y1; y += step) { const s = toScreen(cam, { x: 0, y }).y; ctx.moveTo(toScreen(cam, { x: Math.max(0, tl.x), y }).x, s); ctx.lineTo(toScreen(cam, { x: Math.min(size, br.x), y }).x, s); }
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function shape(ctx: CanvasRenderingContext2D, cam: EditorCam, g: Geom, fill: boolean) {
  ctx.beginPath();
  if (g.kind === 'rect') {
    const a = toScreen(cam, g.rect);
    ctx.rect(a.x, a.y, g.rect.w * cam.scale, g.rect.h * cam.scale);
  } else {
    const c = toScreen(cam, g.at);
    ctx.arc(c.x, c.y, g.r * cam.scale, 0, Math.PI * 2);
    ctx.moveTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y); ctx.moveTo(c.x, c.y - 6); ctx.lineTo(c.x, c.y + 6);
  }
  if (fill) ctx.fill();
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, cam: EditorCam, g: Geom, text: string, color: string) {
  const at = g.kind === 'rect' ? toScreen(cam, { x: g.rect.x, y: g.rect.y }) : toScreen(cam, { x: g.at.x - g.r * 0.7, y: g.at.y - g.r * 0.7 });
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(12,14,18,0.7)';
  ctx.fillRect(at.x + 3, at.y + 3, ctx.measureText(text).width + 8, 16);
  ctx.fillStyle = color;
  ctx.fillText(text, at.x + 7, at.y + 15);
}

/** Each placed problem as a numbered red pin; the side panel lists them under the same numbers. */
function drawProblems(ctx: CanvasRenderingContext2D, cam: EditorCam, problems: readonly Problem[], focus: number | null) {
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  problems.forEach((p, i) => {
    if (!p.at) return;
    const s = toScreen(cam, p.at);
    const r = i === focus ? 14 : 10;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(229,72,77,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e5484d';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(String(i + 1), s.x, s.y + 0.5);
    if (i === focus || cam.scale > 0.35) {
      ctx.textAlign = 'left';
      const w = ctx.measureText(p.text).width;
      ctx.fillStyle = 'rgba(20,6,8,0.82)';
      ctx.fillRect(s.x + r + 8, s.y - 10, w + 12, 20);
      ctx.fillStyle = '#ffd7d8';
      ctx.fillText(p.text, s.x + r + 14, s.y + 0.5);
      ctx.textAlign = 'center';
    }
  });
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}
