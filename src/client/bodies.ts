import { INK, PALETTE, shade, tint } from './palette.ts';
import { LIGHT } from './tilt.ts';

const SCALE_STEP = 20;
/** How far, as a share of the radius, the dark and light crescents of a body's cel shading reach in. */
const CEL = { shadeShift: 0.16, lightShift: 0.12 } as const;
const RIM = 1.8;
const SHADOW_SHIFT = 0.55;
const SHADOW_FEATHER = 1.3;

const sprites = new Map<string, HTMLCanvasElement>();
let spritesScale = 0;

function canvas(side: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(side);
  return [c, c.getContext('2d')!];
}

function cached(key: string, pxPerUnit: number, paint: (px: number) => HTMLCanvasElement): HTMLCanvasElement {
  const px = Math.round(pxPerUnit * SCALE_STEP) / SCALE_STEP;
  if (px !== spritesScale) { sprites.clear(); spritesScale = px; }
  let image = sprites.get(key);
  if (!image) sprites.set(key, (image = paint(px)));
  return image;
}

function disc(g: CanvasRenderingContext2D, r: number, fill: string | CanvasGradient) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
}

export function bodySprite(color: string, radius: number, armor: number, pxPerUnit: number): HTMLCanvasElement {
  return cached(`${color}|${radius}|${armor}`, pxPerUnit, (px) => {
    const [c, g] = canvas((radius + 1) * 2 * px);
    g.scale(px, px);
    g.translate(radius + 1, radius + 1);
    disc(g, radius, INK);
    const r = radius - RIM - armor;
    // Cel-shaded like the walls and guns: a hard darker crescent away from the light, a hard lighter one toward it.
    g.save();
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.clip();
    disc(g, r, shade(color, 0.8));
    g.translate(-r * CEL.shadeShift, -r * CEL.shadeShift);
    disc(g, r, color);
    g.translate(r * CEL.shadeShift, r * CEL.shadeShift);
    g.fillStyle = tint(color, 0.32);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.arc(r * CEL.lightShift, r * CEL.lightShift, r, 0, Math.PI * 2, true);
    g.fill();
    g.restore();
    return c;
  });
}

export function drawBody(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, radius: number) {
  ctx.drawImage(image, x - radius - 1, y - radius - 1, (radius + 1) * 2, (radius + 1) * 2);
}

function shadowSprite(radius: number, pxPerUnit: number): HTMLCanvasElement {
  return cached(`shadow|${radius}`, pxPerUnit, (px) => {
    const reach = radius * SHADOW_FEATHER;
    const [c, g] = canvas(reach * 2 * px);
    g.scale(px, px);
    const fade = g.createRadialGradient(reach, reach, radius * 0.6, reach, reach, reach);
    fade.addColorStop(0, PALETTE.contact);
    fade.addColorStop(1, 'rgba(20, 24, 32, 0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, reach * 2, reach * 2);
    return c;
  });
}

export function drawBodyShadows(ctx: CanvasRenderingContext2D, bodies: readonly { x: number; y: number; r: number }[], pxPerUnit: number) {
  for (const b of bodies) {
    const reach = b.r * SHADOW_FEATHER;
    ctx.drawImage(shadowSprite(b.r, pxPerUnit), b.x + LIGHT.x * b.r * SHADOW_SHIFT - reach, b.y + LIGHT.y * b.r * SHADOW_SHIFT - reach, reach * 2, reach * 2);
  }
}
