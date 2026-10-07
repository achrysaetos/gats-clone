export function seeded(seed: number): () => number {
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
export type Grain = { specks: number; blotches: number; scratches: number; seams: 'brick' | 'panel' | 'bags' | 'planks' | null; tile: number; rivets?: boolean };

export function canvas(side: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
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

export function blotch(g: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
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

export function speckle(g: CanvasRenderingContext2D, rand: () => number, tile: number, count: number, dark: string, light: string) {
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
  if (grain.seams === 'bags') paintBags(g, tile, rand);
  else if (grain.seams === 'planks') paintPlanks(g, tile, rand);
  else if (grain.seams) {
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
    if (grain.seams === 'panel') paintPlates(g, tile, tile / 2);
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

/** Pressed plates: a light lip along each plate's top-left and a dark one along its bottom-right, in the kit's two cel steps. */
function paintPlates(g: CanvasRenderingContext2D, tile: number, plate: number) {
  for (let y = 0; y < tile; y += plate) {
    for (let x = 0; x < tile; x += plate) {
      g.fillStyle = 'rgba(255, 255, 255, 0.1)';
      g.fillRect(x + 1, y + 1, plate - 2, 2);
      g.fillRect(x + 1, y + 1, 2, plate - 2);
      g.fillStyle = 'rgba(10, 12, 16, 0.16)';
      g.fillRect(x + 1, y + plate - 3, plate - 2, 2);
      g.fillRect(x + plate - 3, y + 1, 2, plate - 2);
    }
  }
}

/** A sandbag wall seen from above: rows of stuffed bags, each with a lit crown, a shaded underside and a stitched seam. */
function paintBags(g: CanvasRenderingContext2D, tile: number, rand: () => number) {
  const rows = 6, bagW = tile / 4, rowH = tile / rows;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < 4; i++) {
      const x0 = i * bagW + (row % 2 ? bagW / 2 : 0), y0 = row * rowH;
      for (const wrapX of [0, -tile]) {
        const x = x0 + wrapX;
        if (x + bagW < 0 || x > tile) continue;
        const k = (rand() - 0.5) * 0.12;
        g.fillStyle = k > 0 ? `rgba(255, 244, 220, ${k.toFixed(3)})` : `rgba(60, 46, 26, ${(-k).toFixed(3)})`;
        g.beginPath();
        g.roundRect(x + 0.5, y0 + 0.5, bagW - 1, rowH - 1, 4);
        g.fill();
        g.fillStyle = 'rgba(255, 246, 224, 0.2)';
        g.beginPath();
        g.roundRect(x + 3, y0 + 2, bagW - 8, rowH * 0.4, 3);
        g.fill();
        g.fillStyle = 'rgba(52, 40, 22, 0.2)';
        g.fillRect(x + 3, y0 + rowH - 4, bagW - 6, 2);
        g.strokeStyle = 'rgba(46, 36, 22, 0.55)';
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(x + 0.5, y0 + 0.5, bagW - 1, rowH - 1, 4);
        g.stroke();
        g.strokeStyle = 'rgba(46, 36, 22, 0.38)';
        g.beginPath();
        g.moveTo(x + bagW * 0.3, y0 + rowH / 2); g.lineTo(x + bagW * 0.7, y0 + rowH / 2);
        g.stroke();
      }
    }
  }
}

/** Boards laid side by side seen from above: each its own tone, a dark gap between, a lit upper edge, a few grain streaks and a nail at each end. */
function paintPlanks(g: CanvasRenderingContext2D, tile: number, rand: () => number) {
  const rows = 4, h = tile / rows;
  for (let row = 0; row < rows; row++) {
    const y0 = row * h, k = (rand() - 0.5) * 0.16;
    g.fillStyle = k > 0 ? `rgba(255, 232, 190, ${k.toFixed(3)})` : `rgba(40, 24, 8, ${(-k).toFixed(3)})`;
    g.fillRect(0, y0, tile, h);
    g.fillStyle = 'rgba(255, 240, 210, 0.2)';
    g.fillRect(0, y0 + 1, tile, 2);
    g.fillStyle = 'rgba(20, 12, 4, 0.62)';
    g.fillRect(0, y0 + h - 3, tile, 3);
    g.strokeStyle = 'rgba(46, 28, 10, 0.3)';
    g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = rand() * tile, y = y0 + 4 + rand() * (h - 8);
      g.moveTo(x, y);
      g.lineTo(x + 8 + rand() * 18, y + (rand() - 0.5) * 2);
    }
    g.stroke();
    g.fillStyle = 'rgba(20, 14, 8, 0.55)';
    for (const x of [4, tile - 4]) { g.beginPath(); g.arc(x, y0 + h / 2, 1.3, 0, Math.PI * 2); g.fill(); }
  }
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
