import type { Point } from './camera.ts';
import { ambientFor, resolveLights, selectLights, type ResolvedLight } from './lighting.ts';
import type { Mood } from './mood.ts';
import { seeded } from './grain.ts';

/**
 * The plain-canvas night: what a device without the shader pass sees. It paints the same lights the GL pass would
 * (lighting.ts collects them either way), without shadows: the world multiplied by the map's ambient colour, coloured
 * pools added to that, a second additive pass so a pool glows above the floor instead of merely un-darkening it, visible
 * beams for the cones that have them, drifting fog banks and rain streaks. All of it is drawn small and scaled up, so the
 * cost is a few gradient fills on a thumbnail and two blits, cheap enough for a software canvas.
 */

const CELL = 4;
const MAX_LIGHTS = 30;
let shade: HTMLCanvasElement | null = null;
let glow: HTMLCanvasElement | null = null;

const css = (rgb: readonly number[], a: number) => `rgba(${Math.round(rgb[0]! * 255)}, ${Math.round(rgb[1]! * 255)}, ${Math.round(rgb[2]! * 255)}, ${a})`;

/** One pool: bright at the heart, falling off with a long tail, so it reads as light and not as a disc. */
function pool(g: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: readonly number[], a: number) {
  const gr = g.createRadialGradient(x, y, r * 0.04, x, y, r);
  gr.addColorStop(0, css(rgb, Math.min(1, a)));
  gr.addColorStop(0.35, css(rgb, Math.min(1, a) * 0.62));
  gr.addColorStop(0.7, css(rgb, Math.min(1, a) * 0.2));
  gr.addColorStop(1, css(rgb, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A cone: the same pool clipped to a wedge, with the edge feathered by two nested wedges. */
function wedge(g: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, half: number, rgb: readonly number[], a: number) {
  for (const [k, w] of [[1, 0.55], [0.55, 0.45]] as const) {
    const gr = g.createRadialGradient(x, y, r * 0.05, x, y, r);
    gr.addColorStop(0, css(rgb, Math.min(1, a * w)));
    gr.addColorStop(0.5, css(rgb, Math.min(1, a * w) * 0.5));
    gr.addColorStop(1, css(rgb, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, r, angle - half * k, angle + half * k);
    g.closePath();
    g.fill();
  }
}

/** A beam: a long thin wedge that stays bright toward its far end more than a pool does, as a shaft through the air. */
function shaft(g: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, half: number, rgb: readonly number[], a: number) {
  const gr = g.createLinearGradient(x, y, x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  gr.addColorStop(0, css(rgb, Math.min(1, a)));
  gr.addColorStop(0.35, css(rgb, Math.min(1, a) * 0.5));
  gr.addColorStop(1, css(rgb, 0));
  for (const k of [1, 0.55, 0.28]) {
    g.fillStyle = gr;
    g.globalAlpha = k === 1 ? 0.5 : k === 0.55 ? 0.6 : 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(angle - half * k) * r, y + Math.sin(angle - half * k) * r);
    g.lineTo(x + Math.cos(angle + half * k) * r, y + Math.sin(angle + half * k) * r);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
}

const fogSeed = (() => { const rand = seeded(44); return Array.from({ length: 9 }, () => ({ x: rand(), y: rand(), r: 0.5 + rand() * 0.6, v: 0.6 + rand() * 0.8, ph: rand() * 6.28 })); })();
const rainSeed = (() => { const rand = seeded(17); return Array.from({ length: 150 }, () => ({ x: rand(), y: rand(), v: 0.8 + rand() * 0.7, len: 0.6 + rand() * 0.8 })); })();

/**
 * Paints the night over the world drawn so far. `dark` is the eased 0..1 dusk. Returns the number of lights painted, for the dev probe.
 * `lights` defaults to every live light (lighting.ts); the view is culled and capped.
 */
export function drawNightFx(ctx: CanvasRenderingContext2D, tl: Point, br: Point, dark: number, now: number, mood: Mood | undefined, lights?: readonly ResolvedLight[]): number {
  const vw = br.x - tl.x, vh = br.y - tl.y;
  const w = Math.max(8, Math.ceil(vw / CELL)), h = Math.max(8, Math.ceil(vh / CELL));
  if (!shade) { shade = document.createElement('canvas'); glow = document.createElement('canvas'); }
  if (shade.width !== w || shade.height !== h) { shade.width = w; shade.height = h; glow!.width = w; glow!.height = h; }
  const amb = ambientFor(dark, false, mood);
  const view = { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y };
  const picked = selectLights(lights ?? resolveLights(now), view, MAX_LIGHTS, 0);
  const g = shade.getContext('2d')!, gg = glow!.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  gg.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.fillStyle = css(amb.rgb, 1);
  g.fillRect(0, 0, w, h);
  gg.globalCompositeOperation = 'source-over';
  gg.clearRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  gg.globalCompositeOperation = 'lighter';
  const to = (x: number, y: number): [number, number] => [(x - tl.x) / CELL, (y - tl.y) / CELL];
  const k = amb.gain * 0.8;
  for (const l of picked) {
    const [x, y] = to(l.x, l.y), r = l.radius / CELL, lv = l.level * k;
    if (l.cone) {
      wedge(g, x, y, r * 1.1, l.cone.angle, l.cone.half, l.rgb, lv * 0.95);
      wedge(gg, x, y, r * 1.1, l.cone.angle, l.cone.half, l.rgb, lv * 0.3);
      if (l.beam > 0 && amb.shafts > 0.01) shaft(gg, x, y, r * 1.25, l.cone.angle, l.cone.half * 0.8 + 0.04, l.rgb, lv * l.beam * 0.5);
      // The source itself: a small pool, so a lamp is lit even when its cone faces away.
      pool(g, x, y, Math.min(r * 0.35, 40), l.rgb, lv * 0.5);
    } else {
      pool(g, x, y, r, l.rgb, lv * 0.75);
      pool(gg, x, y, r * 0.85, l.rgb, lv * 0.5);
    }
  }
  // Fog: a few big soft banks, drifting, lit a little by the pools they sit in.
  if (amb.fog) {
    const t = now / 1000, [dx, dy] = amb.fog.drift;
    gg.globalCompositeOperation = 'lighter';
    for (const f of fogSeed) {
      const fx = (((f.x * vw * 1.6 + t * dx * f.v - tl.x * 0.4) % (vw * 1.6)) + vw * 1.6) % (vw * 1.6) - vw * 0.3;
      const fy = (((f.y * vh * 1.6 + t * dy * f.v + Math.sin(t * 0.07 + f.ph) * 40 - tl.y * 0.4) % (vh * 1.6)) + vh * 1.6) % (vh * 1.6) - vh * 0.3;
      const r = Math.max(vw, vh) * 0.32 * f.r / CELL, x = fx / CELL, y = fy / CELL;
      pool(gg, x, y, r, amb.fog.rgb, amb.fog.density * 0.1 * (0.6 + 0.4 * Math.sin(t * 0.2 + f.ph)));
    }
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  ctx.drawImage(shade, tl.x, tl.y, vw, vh);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(0.9, 0.2 + 0.7 * dark);
  ctx.drawImage(glow!, tl.x, tl.y, vw, vh);
  if (amb.rain > 0) {
    const t = now / 1000, len = 26 * (vh / 900 + 0.4);
    ctx.globalAlpha = 0.16 + 0.18 * amb.rain;
    ctx.strokeStyle = 'rgb(180, 205, 245)';
    ctx.lineWidth = Math.max(1, vw / 1100);
    ctx.beginPath();
    const n = Math.round(rainSeed.length * (0.4 + 0.6 * amb.rain));
    for (let i = 0; i < n; i++) {
      const d = rainSeed[i]!;
      const x = ((d.x * vw * 1.2 + t * 60 * d.v) % (vw * 1.2)) - vw * 0.1;
      const y = ((d.y * (vh + len * 2) + t * 900 * d.v) % (vh + len * 2)) - len;
      ctx.moveTo(tl.x + x, tl.y + y);
      ctx.lineTo(tl.x + x - 5 * d.len, tl.y + y + len * d.len);
    }
    ctx.stroke();
  }
  ctx.restore();
  return picked.length;
}
