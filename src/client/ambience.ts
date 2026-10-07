import { ZOM } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import type { Point } from './camera.ts';
import { NIGHT } from './palette.ts';
import { seeded } from './grain.ts';

/**
 * The air over the arena: a soft vignette, a few drifting motes of dust and, in Zombies' night, a lighting pass that
 * darkens everything except what a player, a turret or the core lights. All of it is cheap enough for a software canvas:
 * the vignette is four gradient strips, the dust a few dozen specks, and the night shade is drawn small and scaled up.
 */

let vignette: { w: number; h: number; strength: number; image: HTMLCanvasElement } | null = null;

/**
 * Darkens the screen's edges. The four strips are painted once into a screen-sized canvas and blitted, since a gradient
 * fill costs a software canvas several ms a frame where a plain blit costs a fraction of that. Drawn in screen pixels.
 */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, strength: number) {
  const pw = Math.ceil(w * dpr), ph = Math.ceil(h * dpr);
  if (!vignette || vignette.w !== pw || vignette.h !== ph || vignette.strength !== strength) {
    const image = vignette?.image ?? document.createElement('canvas');
    image.width = pw;
    image.height = ph;
    const g = image.getContext('2d')!;
    const reachX = Math.min(pw * 0.26, 320 * dpr), reachY = Math.min(ph * 0.26, 230 * dpr);
    const grad = (x0: number, y0: number, x1: number, y1: number) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(12, 14, 20, ${strength})`);
      gr.addColorStop(0.4, `rgba(12, 14, 20, ${strength * 0.3})`);
      gr.addColorStop(1, 'rgba(12, 14, 20, 0)');
      return gr;
    };
    for (const [x, y, ww, hh, gr] of [
      [0, 0, reachX, ph, grad(0, 0, reachX, 0)], [pw - reachX, 0, reachX, ph, grad(pw, 0, pw - reachX, 0)],
      [0, 0, pw, reachY, grad(0, 0, 0, reachY)], [0, ph - reachY, pw, reachY, grad(0, ph, 0, ph - reachY)],
    ] as const) { g.fillStyle = gr; g.fillRect(x, y, ww, hh); }
    vignette = { w: pw, h: ph, strength, image };
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const img = vignette.image;
  const rx = Math.min(pw * 0.26, 320 * dpr), ry = Math.min(ph * 0.26, 230 * dpr);
  ctx.drawImage(img, 0, 0, rx, ph, 0, 0, rx, ph);
  ctx.drawImage(img, pw - rx, 0, rx, ph, pw - rx, 0, rx, ph);
  ctx.drawImage(img, rx, 0, pw - rx * 2, ry, rx, 0, pw - rx * 2, ry);
  ctx.drawImage(img, rx, ph - ry, pw - rx * 2, ry, rx, ph - ry, pw - rx * 2, ry);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const MOTES = 46;
const moteSeed = (() => {
  const rand = seeded(91);
  return Array.from({ length: MOTES }, () => ({ x: rand(), y: rand(), vx: 4 + rand() * 9, vy: 2 + rand() * 6, size: 1.1 + rand() * 2, phase: rand() * 6.28, depth: 0.6 + rand() * 0.35 }));
})();

/** Drifting dust, lit warm by day and cold by night. They float a little above the ground, so they slide against it as the camera moves. */
export function drawDust(ctx: CanvasRenderingContext2D, tl: Point, br: Point, now: number, dark: number) {
  const vw = br.x - tl.x, vh = br.y - tl.y, t = now / 1000;
  ctx.fillStyle = dark > 0.5 ? 'rgba(190, 210, 255, 1)' : 'rgba(255, 246, 222, 1)';
  for (const m of moteSeed) {
    const ox = (((m.x * vw + t * m.vx - tl.x * (1 - m.depth)) % vw) + vw) % vw;
    const oy = (((m.y * vh + t * m.vy + Math.sin(t * 0.7 + m.phase) * 14 - tl.y * (1 - m.depth)) % vh) + vh) % vh;
    ctx.globalAlpha = (0.16 + 0.16 * Math.sin(t * 1.3 + m.phase)) * (dark > 0.5 ? 0.9 : 1);
    ctx.fillRect(tl.x + ox, tl.y + oy, m.size, m.size);
  }
  ctx.globalAlpha = 1;
}

export type Light = { x: number; y: number; r: number; warm?: boolean; angle?: number };

const CELL = 4;
let shade: HTMLCanvasElement | null = null;

/**
 * Night: the world under a cold blue shade with soft holes cut where light falls. The shade is painted at 1/4 scale on a
 * small canvas and stretched over the view, which also softens every edge for free. Players carry a lamp and a wider
 * beam toward their aim, turrets glow amber, and the core is a hearth.
 */
export function drawNight(ctx: CanvasRenderingContext2D, tl: Point, br: Point, dark: number, lights: readonly Light[]) {
  const vw = br.x - tl.x, vh = br.y - tl.y;
  const w = Math.max(8, Math.ceil(vw / CELL)), h = Math.max(8, Math.ceil(vh / CELL));
  if (!shade) shade = document.createElement('canvas');
  if (shade.width !== w || shade.height !== h) { shade.width = w; shade.height = h; }
  const g = shade.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.fillStyle = NIGHT.shade;
  g.globalAlpha = Math.min(0.85, NIGHT.alpha * 1.3);
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  const to = (x: number, y: number): [number, number] => [(x - tl.x) / CELL, (y - tl.y) / CELL];
  for (const l of lights) {
    const [x, y] = to(l.x, l.y), r = l.r / CELL;
    if (x + r * 1.6 < 0 || y + r * 1.6 < 0 || x - r * 1.6 > w || y - r * 1.6 > h) continue;
    const pool = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    pool.addColorStop(0, 'rgba(0, 0, 0, 1)');
    pool.addColorStop(0.55, 'rgba(0, 0, 0, 0.7)');
    pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = pool;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    if (l.angle !== undefined) {
      // The beam is two nested wedges, so its edge steps down rather than ending in a hard line.
      const reach = r * 1.7;
      for (const [half, alpha] of [[0.5, 0.32], [0.3, 0.4]] as const) {
        const beam = g.createRadialGradient(x, y, r * 0.3, x, y, reach);
        beam.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
        beam.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = beam;
        g.beginPath();
        g.moveTo(x, y);
        g.arc(x, y, reach, l.angle - half, l.angle + half);
        g.closePath();
        g.fill();
      }
    }
  }
  g.globalCompositeOperation = 'source-over';
  for (const l of lights) {
    if (!l.warm) continue;
    const [x, y] = to(l.x, l.y), r = l.r / CELL;
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 0.9);
    glow.addColorStop(0, 'rgba(255, 150, 60, 0.22)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    g.fillStyle = glow;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = dark;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(shade, tl.x, tl.y, vw, vh);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 1;
}

/** Who and what carries light tonight: each player a lamp and a beam along their aim, each turret an amber lamp, and the core a hearth. */
export function nightLights(snap: Snapshot, selfId: number, selfAngle: number | null): Light[] {
  const lights: Light[] = [];
  for (const p of snap.players) if (p.alive && !p.hidden) lights.push({ x: p.x, y: p.y, r: 210, angle: p.id === selfId && selfAngle !== null ? selfAngle : p.angle });
  for (const b of snap.buildings ?? []) if (b.kind !== 'wall') lights.push({ x: (b.cx + 0.5) * ZOM.cell, y: (b.cy + 0.5) * ZOM.cell, r: 190, warm: true });
  if (snap.run) lights.push({ x: snap.run.core.x, y: snap.run.core.y, r: 380, warm: true });
  return lights;
}
