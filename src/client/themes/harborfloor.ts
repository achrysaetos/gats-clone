import type { Pt } from '../../shared/geom.ts';
import type { MapDef } from '../../shared/maps.ts';
import { CAUSEWAY_DISTRICT, DISTRICTS, QUAY, ROOMS, SIZE, type District } from '../../shared/maps/causewaydata.ts';
import { stencil, type FloorPlan } from '../floor.ts';
import { blotch, canvas, seeded } from '../grain.ts';
import { FLOOR, INK } from '../palette.ts';
import { MAPS } from '../../shared/maps.ts';
import { C, TAU, hexA, painted } from './harborkit.ts';

/**
 * The Harbour's floor, baked once: wet asphalt aprons, big cut-stone quays, cobbles round the lighthouse and across the causeway,
 * planks on the pier, ice-bright tile in the fish shed and terrazzo in customs, every district washed in the colour of its lamps. Along
 * every shore runs a coping stone, the crane has its rails, the dry dock its keel blocks, and the quay edge its yellow safety line.
 * The water itself is only an underlay here (the shader in harborwater.ts paints over it every frame), and the ships' decks are
 * drawn per frame beside it so they can ride the swell.
 */

type G = CanvasRenderingContext2D;

const CITY = (): MapDef => MAPS.causeway;

/** Runs `paint` once for the west half and once more turned half a turn about the map centre, with `east` set the second time. */
function both(g: G, paint: (east: boolean) => void): void {
  paint(false);
  g.save();
  g.translate(SIZE, SIZE);
  g.rotate(Math.PI);
  paint(true);
  g.restore();
}

const turn = (b: { x: number; y: number; w: number; h: number }) => ({ x: SIZE - b.x - b.w, y: SIZE - b.y - b.h, w: b.w, h: b.h });

/* -- tiles ------------------------------------------------------------------------------------------------------ */

function tile(side: number, seed: number, paint: (p: CanvasRenderingContext2D, rand: () => number) => void): HTMLCanvasElement {
  const [c, p] = canvas(side);
  paint(p, seeded(seed));
  return c;
}

const speck = (p: CanvasRenderingContext2D, rand: () => number, side: number, n: number, dark: string, light: string) => {
  for (let i = 0; i < n; i++) {
    p.fillStyle = rand() < 0.62 ? dark : light;
    p.globalAlpha = 0.07 + rand() * 0.16;
    const s = 0.8 + rand() * 1.6;
    p.fillRect(rand() * side, rand() * side, s, s);
  }
  p.globalAlpha = 1;
};

function asphaltTile(): HTMLCanvasElement {
  return tile(256, 11, (p, rand) => {
    p.fillStyle = C.asphalt; p.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14; i++) blotch(p, rand() * 256, rand() * 256, 40 + rand() * 60, rand() < 0.5 ? '255, 255, 255' : '10, 12, 16', 0.05);
    speck(p, rand, 256, 900, '#2a2c30', '#8a8e92');
    p.strokeStyle = 'rgba(25, 26, 30, 0.5)'; p.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) { p.beginPath(); let x = rand() * 256, y = rand() * 256; p.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * 60; y += (rand() - 0.2) * 36; p.lineTo(x, y); } p.stroke(); }
  });
}

/** Big cut-stone paving: blocks 160 x 80 in running bond with a pale joint. */
function quayTile(): HTMLCanvasElement {
  return tile(320, 23, (p, rand) => {
    p.fillStyle = C.quaySeam; p.fillRect(0, 0, 320, 320);
    for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
      const x = k * 160 + (r % 2) * 80, y = r * 80;
      const v = rand();
      p.fillStyle = v < 0.34 ? C.quayHi : v < 0.7 ? C.quay : C.quayLo;
      p.fillRect(x + 2, y + 2, 156, 76);
      p.fillStyle = 'rgba(255,255,255,0.05)'; p.fillRect(x + 2, y + 2, 156, 5);
      if (rand() < 0.4) blotch(p, x + 20 + rand() * 120, y + 20 + rand() * 40, 26 + rand() * 20, '20, 22, 26', 0.12);
    }
    speck(p, rand, 320, 500, '#2a2c30', '#b8bcbe');
  });
}

function cobbleTile(): HTMLCanvasElement {
  return tile(192, 31, (p, rand) => {
    p.fillStyle = C.cobbleLo; p.fillRect(0, 0, 192, 192);
    const S = 24;
    for (let r = -1; r < 9; r++) for (let k = -1; k < 9; k++) {
      const x = k * S + (r % 2) * (S / 2) + (rand() - 0.5) * 3, y = r * S * 0.9 + (rand() - 0.5) * 3;
      const v = rand();
      p.fillStyle = v < 0.3 ? C.cobbleHi : v < 0.75 ? C.cobble : '#6e685d';
      p.beginPath(); p.ellipse(x + S / 2, y + S / 2, S * 0.46, S * 0.42, 0, 0, TAU); p.fill();
      p.fillStyle = 'rgba(255,255,255,0.08)'; p.beginPath(); p.ellipse(x + S * 0.42, y + S * 0.38, S * 0.2, S * 0.14, 0, 0, TAU); p.fill();
    }
  });
}

function plankTile(): HTMLCanvasElement {
  return tile(256, 41, (p, rand) => {
    p.fillStyle = C.plankLo; p.fillRect(0, 0, 256, 256);
    const H = 32;
    for (let r = 0; r < 8; r++) {
      let x = -rand() * 160;
      while (x < 256) {
        const w = 120 + rand() * 120;
        const v = rand();
        p.fillStyle = v < 0.33 ? C.plankHi : v < 0.7 ? C.plank : '#7b5d3c';
        p.fillRect(x + 1.5, r * H + 1.5, w - 3, H - 3);
        p.fillStyle = 'rgba(255, 230, 180, 0.08)'; p.fillRect(x + 1.5, r * H + 1.5, w - 3, 3);
        p.strokeStyle = 'rgba(40, 26, 14, 0.35)'; p.lineWidth = 1;
        p.beginPath(); p.moveTo(x + 6, r * H + 8 + rand() * 16); p.lineTo(x + w - 10, r * H + 8 + rand() * 16); p.stroke();
        p.fillStyle = 'rgba(30, 22, 14, 0.7)';
        for (const nx of [x + 8, x + w - 8]) { p.beginPath(); p.arc(nx, r * H + 6, 1.4, 0, TAU); p.arc(nx, r * H + H - 6, 1.4, 0, TAU); p.fill(); }
        x += w;
      }
    }
  });
}

function tilesTile(a: string, b: string): HTMLCanvasElement {
  return tile(200, 51, (p, rand) => {
    const T = 50;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      p.fillStyle = (x + y) & 1 ? b : a; p.fillRect(x * T, y * T, T, T);
      const k = (rand() - 0.5) * 0.07; p.fillStyle = k > 0 ? `rgba(255,255,255,${k})` : `rgba(0,0,0,${-k})`; p.fillRect(x * T, y * T, T, T);
    }
    p.strokeStyle = 'rgba(30, 40, 44, 0.55)'; p.lineWidth = 2; p.beginPath();
    for (let i = 1; i < 4; i++) { p.moveTo(i * T, 0); p.lineTo(i * T, 200); p.moveTo(0, i * T); p.lineTo(200, i * T); }
    p.stroke();
  });
}

function deckplateTile(): HTMLCanvasElement {
  return tile(96, 61, (p, rand) => {
    p.fillStyle = '#566069'; p.fillRect(0, 0, 96, 96);
    p.fillStyle = '#6b7681';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const ox = x * 24 + ((y & 1) ? 12 : 0), oy = y * 24;
      p.save(); p.translate(ox + 12, oy + 12); p.rotate(((x + y) & 1) ? 0.7 : -0.7); p.fillRect(-8, -2, 16, 4); p.restore();
    }
    speck(p, rand, 96, 80, '#20262c', '#a8b4c0');
    p.strokeStyle = 'rgba(20,24,30,0.55)'; p.lineWidth = 1.5; p.strokeRect(0.5, 0.5, 95, 95);
  });
}

function concreteTile(): HTMLCanvasElement {
  return tile(250, 71, (p, rand) => {
    p.fillStyle = '#6a6a66'; p.fillRect(0, 0, 250, 250);
    for (let i = 0; i < 10; i++) blotch(p, rand() * 250, rand() * 250, 30 + rand() * 60, rand() < 0.5 ? '255,255,255' : '10,10,12', 0.05);
    speck(p, rand, 250, 600, '#2a2a2a', '#b0b0a8');
    p.strokeStyle = '#3d3d3b'; p.lineWidth = 3; p.strokeRect(0, 0, 250, 250);
  });
}

function scrapTile(): HTMLCanvasElement {
  return tile(256, 81, (p, rand) => {
    p.fillStyle = '#5a5144'; p.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 22; i++) blotch(p, rand() * 256, rand() * 256, 20 + rand() * 50, rand() < 0.5 ? '120, 70, 40' : '20, 18, 14', 0.12);
    speck(p, rand, 256, 1100, '#2a2620', '#a09078');
    for (let i = 0; i < 40; i++) { p.fillStyle = rand() < 0.5 ? '#3a342c' : '#7a6c56'; p.beginPath(); p.ellipse(rand() * 256, rand() * 256, 2 + rand() * 3, 1.5 + rand() * 2, rand() * 3, 0, TAU); p.fill(); }
  });
}

function terrazzoTile(): HTMLCanvasElement {
  return tile(160, 91, (p, rand) => {
    p.fillStyle = '#9aa592'; p.fillRect(0, 0, 160, 160);
    const cols = ['#c9d2bd', '#7d8a78', '#d8dccb', '#6d7a6e', '#b2bba3'];
    for (let i = 0; i < 160; i++) { p.fillStyle = cols[Math.floor(rand() * cols.length)]!; p.globalAlpha = 0.55; p.beginPath(); p.ellipse(rand() * 160, rand() * 160, 1.5 + rand() * 3, 1 + rand() * 2, rand() * 3, 0, TAU); p.fill(); }
    p.globalAlpha = 1;
    p.strokeStyle = 'rgba(50,60,50,0.4)'; p.lineWidth = 2; p.strokeRect(0, 0, 160, 160);
  });
}

type Pat = Record<string, CanvasPattern>;
let pats: { g: G; set: Pat } | null = null;
function patterns(g: G): Pat {
  if (pats && pats.g === g) return pats.set;
  const mk = (c: HTMLCanvasElement) => g.createPattern(c, 'repeat')!;
  const set: Pat = {
    asphalt: mk(asphaltTile()), quay: mk(quayTile()), cobble: mk(cobbleTile()), plank: mk(plankTile()), tile: mk(tilesTile('#8fa6a4', '#7d9594')), cafe: mk(tilesTile('#d8cfa8', '#a8483a')),
    deckplate: mk(deckplateTile()), concrete: mk(concreteTile()), scrap: mk(scrapTile()), terrazzo: mk(terrazzoTile()), wetTile: mk(tilesTile('#6f8f95', '#5f7f86')), office: mk(tilesTile('#a9b09c', '#98a08c')),
  };
  pats = { g, set };
  return set;
}

const FLOOR_PAT: Record<District['floor'], string> = { quay: 'quay', asphalt: 'asphalt', cobble: 'cobble', deckplate: 'deckplate', tile: 'tile', plank: 'plank', gravel: 'scrap', scrap: 'scrap', concrete: 'concrete' };
const ROOM_PAT: Record<string, string> = { shed: 'wetTile', office: 'terrazzo', cafe: 'cafe', cabin: 'deckplate', plant: 'concrete', navy: 'deckplate', loft: 'plank' };

/* -- the floor -------------------------------------------------------------------------------------------------- */

const pathOf = (g: G, pts: readonly Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };

export function paintHarborFloor(g: G, size: number, seed: number, plan: FloorPlan): void {
  const set = patterns(g);
  const rand = seeded(seed ^ 0x4a52);
  const map = CITY();
  const water = (map.polys ?? []).filter((p) => p.material === 'water');

  g.fillStyle = set.asphalt!;
  g.fillRect(0, 0, size, size);

  // Districts: each its own paving, then a wash of its lamps' colour.
  const districts = (east: boolean) => {
    for (const d of DISTRICTS) {
      g.fillStyle = set[FLOOR_PAT[d.floor]]!;
      g.fillRect(d.x, d.y, d.w, d.h);
      g.fillStyle = `rgba(${d.wash}, 0.06)`;
      g.fillRect(d.x, d.y, d.w, d.h);
      void east;
    }
  };
  // The quay apron is stone from the water's edge to the container rows.
  both(g, (east) => {
    districts(east);
    g.fillStyle = set.quay!; g.fillRect(QUAY, 960, 480, 4100);
    g.fillStyle = `rgba(255, 199, 102, 0.05)`; g.fillRect(QUAY, 1840, 480, 1760);
  });
  g.fillStyle = set.cobble!;
  g.fillRect(2600, 2800, 800, 400);
  g.fillStyle = `rgba(${CAUSEWAY_DISTRICT.wash}, 0.07)`;
  g.fillRect(CAUSEWAY_DISTRICT.x, CAUSEWAY_DISTRICT.y, CAUSEWAY_DISTRICT.w, CAUSEWAY_DISTRICT.h);

  // Rooms: a floor of their own under every roof.
  both(g, () => {
    for (const r of ROOMS) {
      const pat = ROOM_PAT[r.material] ?? 'concrete';
      g.fillStyle = set[pat]!;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = 'rgba(20, 24, 30, 0.12)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = 'rgba(20, 22, 28, 0.5)'; g.lineWidth = 6; g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    }
  });

  // Water underlay (the shader paints over it) and coping stone round every shore.
  g.fillStyle = C.deep;
  for (const w of water) { pathOf(g, w.points); g.fill(); }
  g.save();
  g.beginPath();
  g.rect(-200, -200, size + 400, size + 400);
  for (const w of water) w.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.clip('evenodd');
  g.lineJoin = 'round';
  for (const w of water) {
    pathOf(g, w.points);
    g.strokeStyle = C.coping; g.lineWidth = 2 * 22; g.stroke();
    g.strokeStyle = 'rgba(40, 44, 50, 0.5)'; g.lineWidth = 2 * 22 + 3; g.globalCompositeOperation = 'destination-over';
    g.globalCompositeOperation = 'source-over';
  }
  for (const w of water) {
    pathOf(g, w.points);
    g.strokeStyle = 'rgba(255, 255, 255, 0.1)'; g.lineWidth = 2 * 22 - 8; g.stroke();
    g.strokeStyle = 'rgba(30, 33, 38, 0.55)'; g.lineWidth = 2 * 22; g.setLineDash([46, 90]); g.stroke(); g.setLineDash([]);
  }
  g.restore();

  // The container yard's kerb where the quay apron meets it: a dark lip with white dashes.
  both(g, () => {
    g.fillStyle = 'rgba(20, 22, 26, 0.55)'; g.fillRect(1372, 1840, 12, 1760);
    g.fillStyle = hexA(C.paintWhite, 0.5);
    for (let y = 1850; y < 3590; y += 70) g.fillRect(1376, y, 4, 36);
  });

  // The yellow safety line down the quay, and the crane's rails.
  g.fillStyle = hexA(C.paint, 0.7);
  for (let y = 1000; y < 5000; y += 60) if (!(y > 2640 && y < 3200)) g.fillRect(QUAY + 96, y, 7, 38);
  both(g, () => {
    for (const x of [940, 1226]) {
      g.fillStyle = 'rgba(20, 22, 26, 0.55)';
      for (let y = 2360; y < 3460; y += 34) g.fillRect(x - 17, y, 34, 9);
      g.fillStyle = '#8a929a'; g.fillRect(x - 3, 2360, 6, 1100);
      g.fillStyle = '#4c535a'; g.fillRect(x + 3, 2360, 3, 1100);
    }
  });

  // The dry dock's pit: a sunken floor of dark concrete, a drain down the middle, keel blocks under the hull, steps at the gates.
  both(g, () => {
    g.fillStyle = set.concrete!; g.fillRect(1964, 294, 592, 912);
    g.fillStyle = 'rgba(8, 10, 14, 0.38)'; g.fillRect(1964, 294, 592, 912);
    g.fillStyle = 'rgba(8, 10, 14, 0.5)'; g.fillRect(2250, 294, 20, 912);
    g.fillStyle = '#5a4630';
    for (let y = 480; y < 1060; y += 64) { g.fillRect(2200, y, 120, 26); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2200, y + 20, 120, 6); g.fillStyle = '#5a4630'; }
    g.fillStyle = 'rgba(20, 22, 26, 0.5)';
    for (let k = 0; k < 4; k++) { g.fillRect(1964, 700 + k * 24, 30 - k * 6, 20); g.fillRect(2556 - 30 + k * 6, 700 + k * 24, 30 - k * 6, 20); }
    g.fillStyle = hexA(C.paint, 0.55);
    for (let x = 1980; x < 2540; x += 36) g.fillRect(x, 1182, 18, 6);
    painted(g, 'DOCK 2 · 32 FT', 2410, 1130, 26, hexA(C.paintWhite, 0.5), 0, 0.14);
  });

  // Painted names, large enough to read from the air.
  both(g, (east) => {
    const stencilAt = (text: string, x: number, y: number, size: number, rot: number, color = hexA('#928d7f', 0.42)) => painted(g, text, x, y, size, color, rot, 0.16);
    stencilAt(east ? 'BERTH 4' : 'BERTH 1', 1110, 2300, 96, -Math.PI / 2);
    stencilAt(east ? 'BERTH 5' : 'BERTH 2', 1110, 4440, 86, -Math.PI / 2);
    stencilAt(east ? 'BERTH 6' : 'BERTH 3', 1110, 1470, 80, -Math.PI / 2);
    stencilAt(east ? 'REEFER STACKS' : 'CONTAINER STACKS', 1960, 1790, 74, 0);
    stencilAt(east ? 'TRAWLER ROW' : "FISHERMEN'S WHARF", 1500, 3880, 66, 0);
    stencilAt(east ? 'BONDED STORES' : 'CUSTOMS', 2270, 4900, 74, 0);
    stencilAt(east ? 'SLIPWAY' : 'DRY DOCK', 2260, 190, 80, 0);
    stencilAt(east ? 'SCRAP ROW' : 'SALVAGE YARD', 2830, 600, 56, -Math.PI / 2);
  });
  painted(g, 'THE CAUSEWAY', SIZE / 2 - 250, SIZE / 2, 46, hexA('#928d7f', 0.42), -Math.PI / 2, 0.22);
  painted(g, 'THE CAUSEWAY', SIZE / 2 + 250, SIZE / 2, 46, hexA('#928d7f', 0.42), Math.PI / 2, 0.22);

  // Stains and cracks, where the day's work leaves them.
  g.globalAlpha = 0.7;
  for (let i = 0; i < 240; i++) {
    const x = rand() * size, y = rand() * size;
    if (water.some((w) => pointIn(x, y, w.points))) continue;
    if (rand() < 0.5) blotch(g, x, y, 22 + rand() * 40, '12, 14, 18', 0.2);
    else blotch(g, x, y, 14 + rand() * 24, '90, 130, 150', 0.15);
  }
  g.globalAlpha = 1;
  void INK; void stencil; void FLOOR;

  // Pads and zones.
  const hazard = (() => {
    const [c, p] = canvas(24);
    p.fillStyle = C.paint; p.fillRect(0, 0, 24, 24);
    p.fillStyle = '#2b2e34'; p.beginPath();
    for (const o of [-24, 0, 24]) { p.moveTo(o, 24); p.lineTo(o + 12, 24); p.lineTo(o + 36, 0); p.lineTo(o + 24, 0); p.closePath(); }
    p.fill();
    return g.createPattern(c, 'repeat')!;
  })();
  for (const [i, pad] of plan.pads.entries()) {
    const tint = pad.team === 'red' ? FLOOR.red : pad.team === 'blue' ? FLOOR.blue : null;
    g.globalAlpha = 0.5; g.fillStyle = hazard;
    g.beginPath(); g.rect(pad.x - 14, pad.y - 14, pad.w + 28, pad.h + 28); g.rect(pad.x - 6, pad.y - 6, pad.w + 12, pad.h + 12); g.fill('evenodd');
    g.globalAlpha = 0.18; g.fillStyle = tint ?? '#20242c'; g.fillRect(pad.x, pad.y, pad.w, pad.h);
    g.globalAlpha = 0.75; g.fillStyle = tint ?? C.paint;
    const arm = Math.min(46, pad.w / 2, pad.h / 2), t = 7;
    for (const [cx, cy, sx, sy] of [[pad.x, pad.y, 1, 1], [pad.x + pad.w, pad.y, -1, 1], [pad.x, pad.y + pad.h, 1, -1], [pad.x + pad.w, pad.y + pad.h, -1, -1]] as const) {
      g.fillRect(Math.min(cx, cx + sx * arm), Math.min(cy, cy + sy * t), arm, t);
      g.fillRect(Math.min(cx, cx + sx * t), Math.min(cy, cy + sy * arm), t, arm);
    }
    g.globalAlpha = 0.5; g.fillStyle = '#d8d4c4';
    const text = pad.team === 'red' ? `A${(i % 9) + 1}` : pad.team === 'blue' ? `b${(i % 9) + 1}` : `P${(i % 9) + 1}`;
    const th = Math.min(32, pad.h * 0.4, pad.w * 0.5);
    if (th >= 16) stencil(g, text, pad.x + pad.w / 2 - (text.length * (th * 0.52 + th * 0.24)) / 2, pad.y + pad.h / 2 - th / 2, th);
    g.globalAlpha = 1;
  }
  for (const z of plan.zones) {
    const r = plan.zoneRadius;
    g.globalAlpha = 0.16; g.fillStyle = '#10161c'; g.beginPath(); g.arc(z.x, z.y, r - 6, 0, TAU); g.fill();
    g.globalAlpha = 0.6; g.fillStyle = hazard;
    for (let k = 0; k < 24; k++) { const a0 = (k / 24) * TAU + 0.03, a1 = ((k + 0.62) / 24) * TAU; g.beginPath(); g.arc(z.x, z.y, r + 12, a0, a1); g.arc(z.x, z.y, r + 22, a1, a0, true); g.closePath(); g.fill(); }
    g.globalAlpha = 1;
  }
  for (const z of plan.zones) blotch(g, z.x, z.y, 320, '255, 226, 170', 0.07);

  // The map's edge.
  const rim = 150;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, rim, 0, 0, size, rim], [0, size, 0, size - rim, 0, size - rim, size, rim],
    [0, 0, rim, 0, 0, 0, rim, size], [size, 0, size - rim, 0, size - rim, 0, rim, size],
  ] as const) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(12, 14, 18, 0.45)'); grad.addColorStop(0.35, 'rgba(12, 14, 18, 0.16)'); grad.addColorStop(1, 'rgba(12, 14, 18, 0)');
    g.fillStyle = grad; g.fillRect(rx, ry, rw, rh);
  }
  void turn;
}

function pointIn(x: number, y: number, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
