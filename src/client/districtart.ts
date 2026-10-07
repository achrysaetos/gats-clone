import { FLOOR } from './palette.ts';
import type { PlanKind } from './decor.ts';

/**
 * Each district's painted ground plan: flat, worn paint on the floor, so it says where you are without pretending to be an
 * obstacle or competing with a player. All paint is the floor's own `wear` value (about 10 to 15 percent lighter than the floor),
 * desaturated, at about half alpha, with floor-coloured chips worn out of it; only the hazard stripes are stronger. Drawn at
 * `scale` around (0, 0), about 380 x 280 px at scale 1. Baked into the ground layer with the rest of the decor.
 */

const TAU = Math.PI * 2;
const PAINT: string = FLOOR.wear;
/** A desaturated mustard for lane lines and bay edges, and a brick red and a dull blue for the few coloured stencils. */
const YELLOW = '#8a7c48', BRICK = '#7e5048', BLUE = '#4a6a96', RUSTY = '#9a6444', DARK = '#26282d';

function word(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string = PAINT, alpha = 0.5) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.font = `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(size * 0.12)}px`;
  // Long names shrink to fit the plan's width.
  const max = 330;
  const w = g.measureText(text).width;
  if (w > max) g.font = `800 ${Math.max(14, size * (max / w))}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.fillText(text, x, y);
  g.restore();
}

function outline(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t = 3.4, color: string = PAINT, alpha = 0.5) {
  g.save(); g.globalAlpha = alpha; g.fillStyle = color;
  g.fillRect(x, y, w, t); g.fillRect(x, y + h - t, w, t); g.fillRect(x, y, t, h); g.fillRect(x + w - t, y, t, h);
  g.restore();
}

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string = PAINT, alpha = 0.5) {
  g.save(); g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(x, y, w, h); g.restore();
}

function stripesRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.6) {
  g.save(); g.globalAlpha = alpha; g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = YELLOW; g.fillRect(x, y, w, h);
  g.fillStyle = DARK;
  for (let o = -h; o < w + h; o += 22) { g.beginPath(); g.moveTo(x + o, y + h); g.lineTo(x + o + 11, y + h); g.lineTo(x + o + 11 + h, y); g.lineTo(x + o + h, y); g.closePath(); g.fill(); }
  g.restore();
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, t = 3.4, color: string = PAINT, alpha = 0.5, dash: number[] = []) {
  g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = t; g.setLineDash(dash); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.restore();
}

type Painter = (g: CanvasRenderingContext2D, rand: () => number, label: string) => void;

const dock: Painter = (g, _r, label) => {
  // Three truck bays with kerb stops and their numbers, under a yellow edge line along the dock face.
  for (let i = 0; i < 3; i++) {
    const x = -150 + i * 105;
    outline(g, x, -110, 90, 200);
    bar(g, x + 10, -118, 70, 8);
    word(g, String(4 + i), x + 45, -30, 44);
    bar(g, x + 12, 72, 66, 8, DARK, 0.5);
  }
  stripesRect(g, -160, 100, 330, 14);
  word(g, label, 10, 140, 34);
};

const containers: Painter = (g, _r, label) => {
  // Footprints where container stacks stand: painted outlines with corner locks, a row letter and a number.
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
    const x = -165 + i * 112, y = -100 + j * 76;
    outline(g, x, y, 100, 62, 3);
    for (const [cx, cy] of [[x, y], [x + 100, y], [x, y + 62], [x + 100, y + 62]] as const) bar(g, cx - 5, cy - 5, 10, 10);
    word(g, `B-${1 + i + j * 3}`, x + 50, y + 31, 28, PAINT, 0.4);
  }
  word(g, label, 0, 82, 46);
};

const office: Painter = (g, _r, label) => {
  // A car park: two facing rows of stalls with a kerb stop in each, an accessible bay, and the lot's name.
  for (const [y, dir] of [[-110, 1], [20, -1]] as const) {
    for (let i = 0; i <= 6; i++) bar(g, -165 + i * 54 - 1.7, dir > 0 ? y : y - 8, 3.4, 98);
    for (let i = 0; i < 6; i++) bar(g, -150 + i * 54, dir > 0 ? y + 12 : y + 78, 24, 6, DARK, 0.5);
  }
  bar(g, -165 + 54, -110, 54, 98, BLUE, 0.4);
  word(g, 'P', -165 + 81, -62, 46, '#aab6c8', 0.5);
  word(g, label, 0, 130, 52);
  bar(g, -190, 112, 380, 3.4);
};

const motor: Painter = (g, rand, label) => {
  // Vehicle bays with wheel chocks, oil under each engine, and the tyre tracks coming in.
  for (let i = 0; i < 3; i++) {
    const x = -150 + i * 105;
    outline(g, x, -100, 90, 170, 3, YELLOW, 0.5);
    g.save(); g.fillStyle = 'rgba(24, 20, 22, 0.34)'; g.beginPath(); g.ellipse(x + 45, -30 + rand() * 10, 22, 14, 0.2, 0, TAU); g.fill(); g.restore();
    for (const o of [18, 62]) bar(g, x + o, 52, 10, 8, DARK, 0.55);
  }
  g.save(); g.strokeStyle = 'rgba(30, 28, 26, 0.17)'; g.lineWidth = 5;
  for (const o of [-12, 12]) { g.beginPath(); g.moveTo(-170 + o, 118); g.quadraticCurveTo(-20, 150 + o, 170, 108 + o); g.stroke(); }
  g.restore();
  word(g, label, 0, 112, 36);
};

const fuel: Painter = (g, rand, label) => {
  // A bund: a hazard-striped containment kerb round a stained pad with painted tank footprints and a notice.
  stripesRect(g, -170, -110, 340, 14); stripesRect(g, -170, 86, 340, 14); stripesRect(g, -170, -110, 14, 210); stripesRect(g, 156, -110, 14, 210);
  g.save(); g.fillStyle = 'rgba(20, 16, 14, 0.2)'; g.fillRect(-156, -96, 312, 182); g.restore();
  for (const x of [-100, 0, 100]) ring(g, x, -30, 38, 3.4, PAINT, 0.45, [12, 9]);
  for (let i = 0; i < 4; i++) { g.save(); g.fillStyle = 'rgba(30, 22, 18, 0.3)'; g.beginPath(); g.ellipse(-110 + rand() * 220, 40 + rand() * 30, 14 + rand() * 12, 8 + rand() * 6, rand(), 0, TAU); g.fill(); g.restore(); }
  word(g, label, 0, 62, 34, RUSTY, 0.55);
};

const scrap: Painter = (g, rand, label) => {
  // Packed dirt and old tyre ruts, a crude hand-painted name, no neat lines at all.
  for (let i = 0; i < 420; i++) {
    const a = rand() * TAU, d = Math.sqrt(rand());
    g.fillStyle = rand() < 0.5 ? 'rgba(112, 92, 66, 0.4)' : 'rgba(34, 28, 24, 0.4)';
    g.fillRect(Math.cos(a) * d * 190, Math.sin(a) * d * 120, 2 + rand() * 3, 1.5 + rand() * 2);
  }
  g.save(); g.strokeStyle = 'rgba(30, 24, 20, 0.2)'; g.lineWidth = 6;
  for (const o of [-14, 14]) { g.beginPath(); g.moveTo(-190, -30 + o); g.quadraticCurveTo(0, 40 + o, 190, -50 + o); g.stroke(); }
  g.restore();
  word(g, label, -8, -2, 62, RUSTY, 0.5);
  word(g, 'NO DUMPING', 6, 54, 26, PAINT, 0.4);
};

const warehouse: Painter = (g, _r, label) => {
  // Aisle lines down the floor, pallet footprints either side, and the aisle name at the head.
  for (const x of [-120, 0, 120]) bar(g, x - 2, -110, 4, 200, YELLOW, 0.5);
  for (const x of [-60, 60, 180]) for (let j = 0; j < 3; j++) outline(g, x - 40, -100 + j * 66, 40, 54, 2.6, PAINT, 0.38);
  word(g, label, 0, 118, 40);
};

const checkpoint: Painter = (g, _r, label) => {
  // A vehicle checkpoint: a brick-and-bone halt line, chevrons funnelling in, and the gate's name.
  g.save(); g.beginPath(); g.rect(-170, -20, 340, 20); g.clip(); g.globalAlpha = 0.5;
  for (let x = -170; x < 170; x += 34) { g.fillStyle = (x / 34) % 2 ? PAINT : BRICK; g.fillRect(x, -20, 34, 20); }
  g.restore();
  g.save(); g.globalAlpha = 0.42; g.fillStyle = PAINT;
  for (let k = 0; k < 3; k++) { const y = 40 + k * 34; g.beginPath(); g.moveTo(-60, y + 34); g.lineTo(0, y + 12); g.lineTo(60, y + 34); g.lineTo(60, y + 22); g.lineTo(0, y); g.lineTo(-60, y + 22); g.closePath(); g.fill(); }
  g.restore();
  word(g, 'HALT', 0, -70, 64, BRICK, 0.55);
  word(g, label, 0, -112, 26);
};

const hq: Painter = (g, _r, label) => {
  // The crossing: a painted compass rose with its name lettered in the middle.
  ring(g, 0, 0, 100, 4, PAINT, 0.45); ring(g, 0, 0, 76, 4, PAINT, 0.45);
  g.save(); g.globalAlpha = 0.45; g.fillStyle = PAINT;
  for (let k = 0; k < 4; k++) { g.save(); g.rotate((k * Math.PI) / 2); g.beginPath(); g.moveTo(100, 0); g.lineTo(150, -16); g.lineTo(150, 16); g.closePath(); g.fill(); g.restore(); }
  g.restore();
  word(g, label.length > 6 ? label : label, 0, 0, label.length > 6 ? 30 : 58);
};

const busbays: Painter = (g, _r, label) => {
  // Four long bus bays with a number each, a shelter outline and a yellow kerb line.
  for (let i = 0; i < 4; i++) { const x = -165 + i * 85; outline(g, x, -110, 72, 190, 3); word(g, String(10 + i), x + 36, -50, 34); bar(g, x + 8, 62, 56, 6, DARK, 0.5); }
  outline(g, -140, 96, 120, 26, 2.6, PAINT, 0.4);
  bar(g, -170, 92, 345, 4, YELLOW, 0.5);
  word(g, label, 40, 128, 34);
};

const stallgrid: Painter = (g, _r, label) => {
  // A grid of trading stalls, each outlined with its number, a walkway line down the middle.
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) { const x = -170 + i * 88, y = j ? 12 : -104; outline(g, x, y, 76, 56, 2.8, PAINT, 0.42); word(g, String(1 + i + j * 4), x + 38, y + 28, 24, PAINT, 0.4); }
  g.save(); g.setLineDash([16, 12]); g.strokeStyle = YELLOW; g.globalAlpha = 0.5; g.lineWidth = 3; g.beginPath(); g.moveTo(-180, -20); g.lineTo(180, -20); g.stroke(); g.restore();
  word(g, label, 0, 110, 44);
};

const civic: Painter = (g, _r, label) => {
  // A flight of steps drawn as nested risers, a flag circle in front, and the building's name.
  for (let i = 0; i < 5; i++) bar(g, -150 + i * 12, -110 + i * 14, 300 - i * 24, 3.4, PAINT, 0.45);
  ring(g, 0, 50, 34, 3.4, PAINT, 0.45); ring(g, 0, 50, 8, 3.4, PAINT, 0.45);
  for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; bar(g, Math.cos(a) * 44 - 1.5, 50 + Math.sin(a) * 44 - 1.5, 3, 3); }
  word(g, label, 0, 112, 40);
};

const fountain: Painter = (g, _r, label) => {
  // Paving laid in rings and spokes around the basin, with the square's name on a band below.
  for (const r of [96, 70, 44]) ring(g, 0, -6, r, 3.4, PAINT, 0.42, r === 70 ? [10, 8] : []);
  for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8 + 0.2; g.save(); g.globalAlpha = 0.4; g.strokeStyle = PAINT; g.lineWidth = 3; g.beginPath(); g.moveTo(Math.cos(a) * 46, -6 + Math.sin(a) * 46); g.lineTo(Math.cos(a) * 96, -6 + Math.sin(a) * 96); g.stroke(); g.restore(); }
  word(g, label, 0, 112, 38);
};

const flowerbeds: Painter = (g, rand, label) => {
  // Round beds ringed in paint, dotted with planting, a looping path between them.
  for (const [x, y, r] of [[-110, -30, 56], [20, -50, 44], [110, 10, 52]] as const) {
    ring(g, x, y, r, 3.2, PAINT, 0.42);
    for (let i = 0; i < 22; i++) { const a = rand() * TAU, d = Math.sqrt(rand()) * (r - 8); g.fillStyle = ['rgba(120,86,86,0.45)', 'rgba(120,120,70,0.45)', 'rgba(90,110,86,0.45)'][i % 3]!; g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 3); }
  }
  g.save(); g.setLineDash([14, 10]); g.strokeStyle = PAINT; g.globalAlpha = 0.4; g.lineWidth = 3; g.beginPath(); g.moveTo(-170, 70); g.quadraticCurveTo(0, 30, 170, 80); g.stroke(); g.restore();
  word(g, label, 0, 112, 38);
};

const cobbles: Painter = (g, rand, label) => {
  // A patch of cobbles: rows of small rounded stones, each a shade off, with the street's name over them.
  g.save(); g.beginPath(); g.ellipse(0, -4, 185, 120, 0, 0, TAU); g.clip();
  for (let y = -130, row = 0; y < 130; y += 17, row++) for (let x = -200 + (row % 2) * 10; x < 200; x += 20) {
    g.fillStyle = `rgba(${96 + Math.floor(rand() * 40)}, ${92 + Math.floor(rand() * 34)}, ${82 + Math.floor(rand() * 30)}, 0.34)`;
    g.beginPath(); g.ellipse(x + rand() * 2, y + rand() * 2, 8.5, 6.5, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30, 28, 26, 0.3)'; g.lineWidth = 1.4; g.stroke();
  }
  g.restore();
  word(g, label, 0, 0, 52, PAINT, 0.45);
};

const wellring: Painter = (g, rand, label) => {
  // Cobbles laid in rings around the well head.
  for (const r of [120, 96, 72, 48]) {
    const n = Math.floor((TAU * r) / 17);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.save(); g.translate(Math.cos(a) * r, Math.sin(a) * r); g.rotate(a); g.fillStyle = `rgba(${100 + Math.floor(rand() * 36)}, ${96 + Math.floor(rand() * 30)}, 86, 0.34)`; g.fillRect(-6, -7, 12, 14); g.strokeStyle = 'rgba(30,28,26,0.3)'; g.lineWidth = 1.2; g.strokeRect(-6, -7, 12, 14); g.restore(); }
  }
  word(g, label, 0, 150, 38);
};

const crusherpad: Painter = (g, rand, label) => {
  // The crusher's concrete pad: a hazard frame, the machine's footprint, the rock heap's circle and rubble scattered round.
  stripesRect(g, -170, -110, 340, 12); stripesRect(g, -170, 90, 340, 12);
  outline(g, -140, -80, 150, 150, 3.2); ring(g, 100, 0, 60, 3.4, PAINT, 0.45, [14, 10]);
  bar(g, -120, -60, 110, 6, DARK, 0.5);
  for (let i = 0; i < 60; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(90,86,76,0.5)' : 'rgba(40,38,34,0.45)'; g.fillRect(-190 + rand() * 380, -110 + rand() * 220, 2 + rand() * 4, 2 + rand() * 3); }
  word(g, label, 0, 128, 38, RUSTY, 0.5);
};

const conveyorline: Painter = (g, _r, label) => {
  // Two belt runs painted as long outlines with chevrons showing the direction of travel, and a yellow keep-clear line either side.
  for (const y of [-70, 30]) {
    outline(g, -185, y, 370, 54, 3, PAINT, 0.45);
    g.save(); g.globalAlpha = 0.42; g.fillStyle = PAINT;
    for (let x = -160; x < 160; x += 52) { g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x + 18, y + 27); g.lineTo(x, y + 42); g.lineTo(x + 8, y + 42); g.lineTo(x + 26, y + 27); g.lineTo(x + 8, y + 12); g.closePath(); g.fill(); }
    g.restore();
    bar(g, -185, y - 12, 370, 3.4, YELLOW, 0.5); bar(g, -185, y + 66, 370, 3.4, YELLOW, 0.5);
  }
  word(g, label, 0, 118, 38);
};

const haulroad: Painter = (g, rand, label) => {
  // A haul road: solid edge lines, a dashed centre, chevrons, deep tyre ruts.
  bar(g, -190, -90, 380, 4, PAINT, 0.5); bar(g, -190, 70, 380, 4, PAINT, 0.5);
  g.save(); g.setLineDash([34, 26]); g.strokeStyle = YELLOW; g.globalAlpha = 0.5; g.lineWidth = 4; g.beginPath(); g.moveTo(-190, -10); g.lineTo(190, -10); g.stroke(); g.restore();
  g.save(); g.strokeStyle = 'rgba(30, 26, 22, 0.2)'; g.lineWidth = 7;
  for (const o of [-48, 34]) { g.beginPath(); g.moveTo(-190, o + rand() * 6); g.quadraticCurveTo(0, o + 12, 190, o - 4); g.stroke(); }
  g.restore();
  g.save(); g.globalAlpha = 0.42; g.fillStyle = PAINT;
  for (const x of [-120, 0, 120]) { g.beginPath(); g.moveTo(x - 20, -62); g.lineTo(x + 16, -62); g.lineTo(x + 36, -40); g.lineTo(x + 16, -18); g.lineTo(x - 20, -18); g.lineTo(x, -40); g.closePath(); g.fill(); }
  g.restore();
  word(g, label, 0, 112, 40);
};

const pit: Painter = (g, rand, label) => {
  // The pit's edge in contour rings: dashed, uneven, each one deeper, with a hazard arc where the drop starts.
  for (const [rx, ry, a] of [[190, 120, 0.4], [150, 92, 0.46], [108, 64, 0.5], [64, 36, 0.55]] as const) {
    g.save(); g.globalAlpha = a; g.strokeStyle = PAINT; g.lineWidth = 3.4; g.setLineDash([16, 10]); g.beginPath();
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * TAU, k = 1 + 0.06 * Math.sin(t * 3 + rx) + (rand() - 0.5) * 0.01; const px = Math.cos(t) * rx * k, py = Math.sin(t) * ry * k; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
    g.closePath(); g.stroke(); g.restore();
  }
  word(g, label, 0, 0, 44);
  word(g, 'DEEP', 0, 40, 22, BRICK, 0.5);
};

const PAINTERS: Readonly<Record<PlanKind, Painter>> = {
  dock, containers, office, motor, hq, fuel, scrap, warehouse, checkpoint,
  busbays, stallgrid, civic, fountain, flowerbeds, cobbles, wellring, crusherpad, conveyorline, haulroad, pit,
};

/** Paints a district's ground plan at (x, y), turned by `rot` and shrunk by `scale`, then wears chips of floor out of it. */
export function paintDistrict(g: CanvasRenderingContext2D, plan: PlanKind, label: string, x: number, y: number, rot: number, scale: number, rand: () => number): void {
  const paint = PAINTERS[plan];
  if (!paint) return;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(scale, scale);
  paint(g, rand, label);
  // Wear: chips of bare floor, worn out of the paint by boots and tyres.
  g.fillStyle = FLOOR.base;
  g.globalAlpha = 0.85;
  for (let i = 0; i < 260; i++) g.fillRect((rand() - 0.5) * 380, (rand() - 0.5) * 260, 1.2 + rand() * 3.4, 1 + rand() * 1.8);
  g.restore();
}
