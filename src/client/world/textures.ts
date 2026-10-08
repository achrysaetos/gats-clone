import { Texture } from 'pixi.js';

/**
 * Small textures drawn once at start: soft glows, streaks and marks that read the same at any zoom and cost nothing to bake.
 * Everything with a look of its own comes from the baked atlas instead.
 */
const TAU = Math.PI * 2;

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return Texture.from(c);
}

const radial = (size: number, stops: readonly [number, string][]) => paint(size, size, (g) => {
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
});

/** One ring stroke over a 128px square, `width` of it thick, optionally dashed. */
const ring = (width: number, dash?: [number, number]) => paint(128, 128, (g) => {
  g.strokeStyle = '#fff';
  g.lineWidth = width;
  if (dash) { g.setLineDash(dash); g.lineCap = 'round'; }
  g.beginPath();
  g.arc(64, 64, 64 - width, 0, TAU);
  g.stroke();
});

export function createTextures() {
  return {
    white: Texture.WHITE,
    /** A soft white disc fading to nothing at its edge: glows, lights, flashes. */
    glow: radial(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]),
    /** A firmer disc for contact shadows and hit flashes. */
    disc: radial(64, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]),
    /** A round light that keeps most of its strength to its edge, for night lights. */
    light: radial(128, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]),
    /** A tracer: bright at the head (right), fading to nothing at the tail, soft across. */
    streak: paint(128, 16, (g) => {
      const along = g.createLinearGradient(0, 0, 128, 0);
      along.addColorStop(0, 'rgba(255,255,255,0)');
      along.addColorStop(0.7, 'rgba(255,255,255,0.75)');
      along.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = along;
      g.fillRect(0, 0, 128, 16);
      g.globalCompositeOperation = 'destination-in';
      const across = g.createLinearGradient(0, 0, 0, 16);
      across.addColorStop(0, 'rgba(0,0,0,0)');
      across.addColorStop(0.5, 'rgba(0,0,0,1)');
      across.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = across;
      g.fillRect(0, 0, 128, 16);
    }),
    ring: ring(4),
    ringDashed: ring(4, [14, 10]),
    /** A third of a ring, centred on east: the riot shield's arc. */
    arc: paint(128, 128, (g) => {
      g.strokeStyle = '#fff';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(64, 64, 56, -1.05, 1.05);
      g.stroke();
    }),
    /** Corner ticks round a ring: the hunted mark. */
    brackets: paint(128, 128, (g) => {
      g.strokeStyle = '#fff';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(64, 64, 52, 0, TAU);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        g.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
        g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62);
      }
      g.stroke();
    }),
    /** An upward chevron with a dark outline, one per evolution stage. */
    chevron: paint(32, 20, (g) => {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [width, color] of [[8, 'rgba(28,31,38,0.55)'], [4, '#fff']] as const) {
        g.lineWidth = width;
        g.strokeStyle = color;
        g.beginPath();
        g.moveTo(5, 15);
        g.lineTo(16, 5);
        g.lineTo(27, 15);
        g.stroke();
      }
    }),
    /** A spent brass casing seen from above. */
    casing: paint(16, 8, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 8);
      grad.addColorStop(0, '#f6d58a');
      grad.addColorStop(0.5, '#c8962e');
      grad.addColorStop(1, '#7a5a1a');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(1, 1.5, 14, 5, 2);
      g.fill();
    }),
  };
}
