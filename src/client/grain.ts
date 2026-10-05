/** Seeded textures for the floor and every solid's top, painted once and repeated, so every client bakes the same ones. */

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How a material's top is speckled, per 10,000 square units, and what seams cut it; `tile` is the repeat in world units. */
export type Grain = { specks: number; blotches: number; scratches: number; seams: 'brick' | 'panel' | null; tile: number };

function canvas(side: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = side;
  return [c, c.getContext('2d')!];
}

/** Draws `paint` at (x, y) and again across every edge it overlaps, so the tile repeats without a seam. */
function wrap(tile: number, x: number, y: number, reach: number, paint: (x: number, y: number) => void) {
  for (const dx of [-tile, 0, tile]) {
    for (const dy of [-tile, 0, tile]) {
      const px = x + dx, py = y + dy;
      if (px + reach >= 0 && px - reach <= tile && py + reach >= 0 && py - reach <= tile) paint(px, py);
    }
  }
}

function blotch(g: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  const fade = g.createRadialGradient(x, y, 0, x, y, r);
  fade.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  fade.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = fade;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function scratch(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, len: number) {
  let a = rand() * Math.PI * 2;
  g.moveTo(x, y);
  for (let i = 0; i < 4; i++) {
    a += (rand() - 0.5) * 0.9;
    x += (Math.cos(a) * len) / 4;
    y += (Math.sin(a) * len) / 4;
    g.lineTo(x, y);
  }
}

/** Fine grit: mostly faint single dots, with an occasional darker fleck. */
function speckle(g: CanvasRenderingContext2D, rand: () => number, tile: number, count: number, dark: string, light: string) {
  for (let i = 0; i < count; i++) {
    const fleck = rand() < 0.04;
    g.fillStyle = rand() < 0.65 ? dark : light;
    g.globalAlpha = fleck ? 0.35 + rand() * 0.25 : 0.08 + rand() * 0.16;
    const s = fleck ? 0.9 + rand() * 0.6 : 0.5 + rand() * 0.5;
    g.fillRect(rand() * tile, rand() * tile, s, s);
  }
  g.globalAlpha = 1;
}

/** A material's top: its color, mottled and speckled, with hairline scratches and any seams. */
export function paintGrain(top: string, grain: Grain, seed: number): HTMLCanvasElement {
  const { tile } = grain;
  const [c, g] = canvas(tile);
  const rand = seeded(seed);
  g.fillStyle = top;
  g.fillRect(0, 0, tile, tile);
  const area = (tile * tile) / 10_000;
  for (let i = 0; i < grain.blotches * area; i++) {
    const r = 8 + rand() * 26, light = rand() < 0.4;
    wrap(tile, rand() * tile, rand() * tile, r, (x, y) => blotch(g, x, y, r, light ? '255, 255, 255' : '40, 36, 32', light ? 0.08 : 0.07));
  }
  speckle(g, rand, tile, grain.specks * area, '#2a2622', '#ffffff');
  g.strokeStyle = 'rgba(30, 30, 34, 0.12)';
  g.lineWidth = 0.5;
  g.beginPath();
  for (let i = 0; i < grain.scratches * area; i++) scratch(g, rand, rand() * tile, rand() * tile, 6 + rand() * 14);
  g.stroke();
  if (grain.seams) {
    g.strokeStyle = 'rgba(30, 28, 26, 0.28)';
    g.lineWidth = 1;
    g.beginPath();
    const course = grain.seams === 'brick' ? tile / 4 : tile / 2;
    for (let y = course; y <= tile; y += course) { g.moveTo(0, y - 0.5); g.lineTo(tile, y - 0.5); }
    if (grain.seams === 'brick') {
      for (let row = 0; row < 4; row++) {
        for (const x of row % 2 ? [tile / 4, (3 * tile) / 4] : [0.5, tile / 2]) { g.moveTo(x, row * course); g.lineTo(x, (row + 1) * course); }
      }
    }
    g.stroke();
  }
  return c;
}

/** A dense bed of leaves over a dark ground, mostly deep greens with a few lit ones on top, as tight as the planters' in the reference. */
export function paintFoliage(ground: string, leaves: readonly (readonly [string, number])[], tile: number, seed: number): HTMLCanvasElement {
  const [c, g] = canvas(tile);
  const rand = seeded(seed);
  g.fillStyle = ground;
  g.fillRect(0, 0, tile, tile);
  const total = (tile * tile) / 6;
  for (const [color, share] of leaves) {
    g.fillStyle = color;
    for (let i = 0; i < total * share; i++) {
      const r = 1.3 + rand() * 1.9, a = rand() * Math.PI;
      wrap(tile, rand() * tile, rand() * tile, r * 1.6, (x, y) => {
        g.beginPath();
        g.ellipse(x, y, r * 1.5, r * 0.7, a, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  return c;
}

const FLOOR = { base: '#e5e4e6', stains: 40, specks: 40, scratches: 0.25 } as const;

/** The floor inside the arena, in world units, onto a context already scaled to them: pale concrete with faint stains, grit and scratches. */
export function paintFloor(g: CanvasRenderingContext2D, size: number, seed: number) {
  const rand = seeded(seed);
  g.fillStyle = FLOOR.base;
  g.fillRect(0, 0, size, size);
  const area = (size * size) / 1_000_000;
  for (let i = 0; i < FLOOR.stains * area; i++) {
    const r = 80 + rand() * 260, light = rand() < 0.3;
    blotch(g, rand() * size, rand() * size, r, light ? '255, 255, 255' : '120, 110, 100', light ? 0.1 : 0.018 + rand() * 0.02);
  }
  speckle(g, rand, size, FLOOR.specks * area * 100, '#5a544e', '#ffffff');
  g.strokeStyle = 'rgba(70, 66, 62, 0.06)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < FLOOR.scratches * area * 100; i++) scratch(g, rand, rand() * size, rand() * size, 20 + rand() * 70);
  g.stroke();
}
