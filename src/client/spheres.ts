import { PALETTE, shade, tint } from './palette.ts';
import { LIGHT } from './tilt.ts';

/** Bodies are glossy spheres lit by the one fixed light, so a body's shading never turns with it and each look is painted once per screen scale. */
const SCALE_STEP = 20;
const SHADOW_SPREAD = 1.4;
const SHADOW_SHIFT = 0.35;

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

function paintBall(g: CanvasRenderingContext2D, color: string, r: number) {
  const body = g.createRadialGradient(-r * 0.33, -r * 0.4, r * 0.06, 0, 0, r);
  body.addColorStop(0, tint(color, 0.85));
  body.addColorStop(0.2, tint(color, 0.3));
  body.addColorStop(0.7, color);
  body.addColorStop(1, shade(color, 0.6));
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
}

/** A body of `color` and `radius`; an armored one wears a steel band `band` wide around it. */
export function sphereSprite(color: string, radius: number, band: number, pxPerUnit: number): HTMLCanvasElement {
  return cached(`${color}|${radius}|${band}`, pxPerUnit, (px) => {
    const [c, g] = canvas((radius + 1) * 2 * px);
    g.scale(px, px);
    g.translate(radius + 1, radius + 1);
    if (band) {
      const steel = g.createLinearGradient(-radius, -radius, radius, radius);
      steel.addColorStop(0, '#e4e8ee');
      steel.addColorStop(0.45, PALETTE.steel);
      steel.addColorStop(1, PALETTE.steelDark);
      g.fillStyle = steel;
      g.beginPath();
      g.arc(0, 0, radius, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, radius - band, 0, Math.PI * 2);
      g.stroke();
    }
    paintBall(g, color, radius - band);
    g.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, radius - 0.5, 0, Math.PI * 2);
    g.stroke();
    return c;
  });
}

export function drawSphere(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, radius: number) {
  ctx.drawImage(image, x - radius - 1, y - radius - 1, (radius + 1) * 2, (radius + 1) * 2);
}

function contactSprite(radius: number, pxPerUnit: number): HTMLCanvasElement {
  return cached(`shadow|${radius}`, pxPerUnit, (px) => {
    const reach = radius * SHADOW_SPREAD;
    const [c, g] = canvas(reach * 2 * px);
    g.scale(px, px);
    const fade = g.createRadialGradient(reach, reach, radius * 0.15, reach, reach, reach);
    fade.addColorStop(0, PALETTE.contact);
    fade.addColorStop(0.6, 'rgba(20, 24, 32, 0.2)');
    fade.addColorStop(1, 'rgba(20, 24, 32, 0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, reach * 2, reach * 2);
    return c;
  });
}

/** Soft shadows on the floor beneath bodies, pushed along the light. */
export function drawContactShadows(ctx: CanvasRenderingContext2D, bodies: readonly { x: number; y: number; r: number }[], pxPerUnit: number) {
  for (const b of bodies) {
    const reach = b.r * SHADOW_SPREAD;
    ctx.drawImage(contactSprite(b.r, pxPerUnit), b.x + LIGHT.x * b.r * SHADOW_SHIFT - reach, b.y + LIGHT.y * b.r * SHADOW_SHIFT - reach, reach * 2, reach * 2);
  }
}
