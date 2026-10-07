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

/**
 * A material's surface: faint specks, soft blotches and scratches for wear, and optional seams. `rivets` studs each panel
 * corner. The kit's look is flat and graphic, so every one of these stays quiet: a surface reads by its colour and edges.
 */
export type Grain = { specks: number; blotches: number; scratches: number; seams: 'brick' | 'panel' | null; tile: number; rivets?: boolean };

function canvas(side: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = side;
  return [c, c.getContext('2d')!];
}

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
    // Panels are square plates: a seam down the tile's edge as well as across it.
    if (grain.seams === 'panel') for (let x = course; x <= tile; x += course) { g.moveTo(x - 0.5, 0); g.lineTo(x - 0.5, tile); }
    if (grain.seams === 'brick') {
      for (let row = 0; row < 4; row++) {
        for (const x of row % 2 ? [tile / 4, (3 * tile) / 4] : [0.5, tile / 2]) { g.moveTo(x, row * course); g.lineTo(x, (row + 1) * course); }
      }
    }
    g.stroke();
    if (grain.rivets) {
      g.fillStyle = 'rgba(20, 22, 26, 0.35)';
      const step = tile / 2;
      for (let y = 0; y <= tile; y += step) for (let x = 0; x <= tile; x += step) {
        wrap(tile, x + 5, y + 5, 2, (px, py) => { g.beginPath(); g.arc(px, py, 1.4, 0, Math.PI * 2); g.fill(); });
      }
    }
  }
  return c;
}

/** Hazard tape: diagonal stripes of `a` and `b`, `band` wide, on a square tile that repeats seamlessly. */
export function paintHazard(a: string, b: string, band: number): HTMLCanvasElement {
  const tile = band * 2;
  const [c, g] = canvas(tile);
  g.fillStyle = a;
  g.fillRect(0, 0, tile, tile);
  g.fillStyle = b;
  g.beginPath();
  for (const o of [-tile, 0, tile]) {
    g.moveTo(o, tile);
    g.lineTo(o + band, tile);
    g.lineTo(o + band + tile, 0);
    g.lineTo(o + tile, 0);
    g.closePath();
  }
  g.fill();
  return c;
}

export function paintFoliage(ground: string, leaves: readonly (readonly [string, number])[], tile: number, seed: number): HTMLCanvasElement {
  const [c, g] = canvas(tile);
  const rand = seeded(seed);
  g.fillStyle = ground;
  g.fillRect(0, 0, tile, tile);
  // Flat, chunky leaf clusters rather than fine noise, so a planter reads as one graphic shape like everything else.
  const total = (tile * tile) / 26;
  for (const [color, share] of leaves) {
    g.fillStyle = color;
    for (let i = 0; i < total * share; i++) {
      const r = 2.4 + rand() * 3.2, a = rand() * Math.PI;
      wrap(tile, rand() * tile, rand() * tile, r * 1.6, (x, y) => {
        g.beginPath();
        g.ellipse(x, y, r * 1.5, r * 0.7, a, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  return c;
}

/**
 * The arena floor: poured bone concrete in big slabs. A slab is a shade lighter or darker than its neighbours and its joints
 * are thin dark lines, the way a tactical map shows ground: flat, calm and easy to read figures against.
 */
const FLOOR = { base: '#d9d4c7', slab: 250, slabShift: 0.035, joint: 'rgba(60, 54, 44, 0.16)', stains: 18, specks: 6 } as const;

export function paintFloor(g: CanvasRenderingContext2D, size: number, seed: number) {
  const rand = seeded(seed);
  g.fillStyle = FLOOR.base;
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += FLOOR.slab) {
    for (let x = 0; x < size; x += FLOOR.slab) {
      const k = (rand() - 0.5) * 2 * FLOOR.slabShift;
      g.fillStyle = k > 0 ? `rgba(255, 255, 255, ${k.toFixed(3)})` : `rgba(70, 60, 44, ${(-k).toFixed(3)})`;
      g.fillRect(x, y, FLOOR.slab, FLOOR.slab);
    }
  }
  const area = (size * size) / 1_000_000;
  for (let i = 0; i < FLOOR.stains * area; i++) {
    const r = 60 + rand() * 200;
    blotch(g, rand() * size, rand() * size, r, '96, 84, 66', 0.02 + rand() * 0.025);
  }
  speckle(g, rand, size, FLOOR.specks * area * 100, '#5a544e', '#ffffff');
  g.fillStyle = FLOOR.joint;
  for (let x = FLOOR.slab; x < size; x += FLOOR.slab) g.fillRect(x - 1, 0, 2, size);
  for (let y = FLOOR.slab; y < size; y += FLOOR.slab) g.fillRect(0, y - 1, size, 2);
}
