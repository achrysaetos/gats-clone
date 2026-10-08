import { blotch, seeded } from '../grain.ts';
import { C, TAU, ell, hash, hexA, rr, type G } from './summitkit.ts';
import { both, contact, flags, hazard, label, needles, planks, stain, tiles, type Variant } from './summitdraw.ts';

/**
 * The ground of every site that is not a room of the lodge: the deck of tubs and the sauna yard, the lift apron and the
 * ice garden, the pine woods and the tree farm, the garage bay and the terminal platform, the fuel house and the
 * observatory, the car park and the shuttle loop, the fishing hut and the Zamboni shed. Each is painted in west-half
 * coordinates under `both`, so the east half is the same cover dressed as another place.
 */

/* -- the deck / the sauna yard -------------------------------------------------------------------------------------------- */

function deck(g: G, v: Variant) {
  const x = 400, y = 1500, w = 1300, h = 600;
  g.fillStyle = 'rgba(10, 14, 28, 0.3)'; g.fillRect(x + 6, y + 8, w, h);
  if (v === 0) {
    planks(g, x, y, w, h, { board: 24, seed: 101, base: '#7a5a38', hi: '#8e6a44', lo: '#664a2c' });
    g.strokeStyle = 'rgba(10, 8, 6, 0.6)'; g.lineWidth = 5; g.strokeRect(x, y, w, h);
    // Rounds of worn wood round each tub, where wet feet go.
    for (const [tx, ty] of [[650, 1800], [1000, 1740], [1350, 1830]] as const) {
      g.fillStyle = 'rgba(30, 20, 10, 0.34)'; ell(g, tx, ty, 150, 150); g.fill();
      g.strokeStyle = 'rgba(190, 160, 110, 0.3)'; g.lineWidth = 3; ell(g, tx, ty, 150, 150); g.stroke();
      blotch(g, tx, ty, 200, '220, 235, 250', 0.1);
    }
    // Towels, slippers, a tray with two mugs: flat, so nothing here reads as cover.
    const towel = (tx: number, ty: number, c: string, rot: number) => { g.save(); g.translate(tx, ty); g.rotate(rot); g.fillStyle = c; g.fillRect(-18, -10, 36, 20); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-18, -10, 36, 4); g.strokeStyle = C.ink; g.lineWidth = 1.6; g.strokeRect(-18, -10, 36, 20); g.restore(); };
    towel(800, 1900, '#d8dde6', 0.2); towel(1160, 1900, '#c86a5a', -0.3); towel(520, 1930, '#6a9ab0', 0.1); towel(1220, 1620, '#e0d8c0', 0.5);
    for (const [sx, sy] of [[830, 1930], [1190, 1930], [560, 1950]] as const) { g.fillStyle = '#3a3040'; ell(g, sx, sy, 9, 5, 0.3); g.fill(); ell(g, sx + 14, sy + 2, 9, 5, 0.3); g.fill(); }
    g.fillStyle = '#3a2a1a'; rr(g, 905, 1925, 54, 36, 5); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#e8e0d0'; ell(g, 920, 1943, 8, 8); g.fill(); ell(g, 944, 1943, 8, 8); g.fill();
    // The mat by the bar door.
    g.fillStyle = '#26282c'; rr(g, 1440, 2052, 120, 44, 6); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
    label(g, v, 'APRES SKI', 1500, 2074, 15, hexA(C.yellow, 0.7), { spacing: 3 });
    label(g, v, 'HOT TUBS  •  TOWELS AT THE BAR', 900, 2052, 20, 'rgba(232, 214, 176, 0.4)', { spacing: 5 });
  } else {
    flags(g, x, y, w, h, '#5a6168', 105);
    g.strokeStyle = 'rgba(10, 12, 18, 0.6)'; g.lineWidth = 5; g.strokeRect(x, y, w, h);
    // Duckboards of cedar from the door out to the barrel saunas, and round the plunge pools.
    planks(g, 1470, 1700, 90, 400, { board: 14, seed: 106, base: '#a8845a', hi: '#bc9a6c', lo: '#8c6a44', vertical: true });
    for (const [tx, ty] of [[650, 1800], [1000, 1740], [1350, 1830]] as const) {
      g.fillStyle = 'rgba(14, 24, 34, 0.38)'; ell(g, tx, ty, 150, 150); g.fill();
      g.strokeStyle = 'rgba(200, 235, 250, 0.4)'; g.lineWidth = 4; ell(g, tx, ty, 150, 150); g.stroke();
      blotch(g, tx, ty, 220, '190, 230, 255', 0.14);
    }
    blotch(g, 1620, 1650, 220, '255, 130, 80', 0.12);
    label(g, v, 'COLD PLUNGE  •  3 MIN', 900, 2052, 20, 'rgba(200, 235, 250, 0.45)', { spacing: 5 });
    // A bucket and a ladle left by the door, a birch whisk drying.
    g.fillStyle = '#6a4a2c'; ell(g, 1420, 1990, 12, 12); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.6; g.stroke();
  }
}

/* -- the lift apron / the ice garden --------------------------------------------------------------------------------------- */

function lift(g: G, v: Variant) {
  // The shed floor, under its roof.
  const x = 2050, y = 450, w = 750, h = 450;
  if (v === 0) {
    // Diamond plate, bolted, with a yellow safety edge along the platform.
    g.fillStyle = '#4a5560'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(160, 175, 190, 0.1)';
    for (let tx = x; tx < x + w; tx += 25) for (let ty = y; ty < y + h; ty += 25) { g.save(); g.translate(tx + 12, ty + 12); g.rotate(((tx + ty) / 25) % 2 ? 0.78 : -0.78); g.fillRect(-6, -1.5, 12, 3); g.restore(); }
    g.strokeStyle = 'rgba(14, 18, 24, 0.55)'; g.lineWidth = 2;
    for (let tx = x; tx <= x + w; tx += 150) { g.beginPath(); g.moveTo(tx, y); g.lineTo(tx, y + h); g.stroke(); }
    for (let ty = y; ty <= y + h; ty += 150) { g.beginPath(); g.moveTo(x, ty); g.lineTo(x + w, ty); g.stroke(); }
    hazard(g, x, y + h - 14, w, 14);
    g.fillStyle = hexA(C.yellow, 0.7); for (let i = 0; i < 8; i++) { const ax = 2240 + i * 70; g.beginPath(); g.moveTo(ax, 700); g.lineTo(ax + 30, 715); g.lineTo(ax, 730); g.closePath(); g.fill(); }
    label(g, v, 'LOAD HERE', 2500, 760, 22, 'rgba(232, 220, 190, 0.4)', { spacing: 6 });
    // Snow the wind drove in at the two open ends, and a dropped glove.
    blotch(g, x + 20, 640, 110, '205, 222, 244', 0.22); blotch(g, x + w - 20, 790, 110, '205, 222, 244', 0.22);
    g.fillStyle = '#a8402e'; ell(g, 2420, 850, 9, 6, 0.4); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
    // The apron outside the gate, plowed down to the slab.
    g.fillStyle = '#58626e'; g.fillRect(2200, 950, 420, 300);
    g.strokeStyle = 'rgba(14, 18, 24, 0.55)'; g.lineWidth = 2; for (let tx = 2200; tx <= 2620; tx += 140) { g.beginPath(); g.moveTo(tx, 950); g.lineTo(tx, 1250); g.stroke(); } for (let ty = 950; ty <= 1250; ty += 150) { g.beginPath(); g.moveTo(2200, ty); g.lineTo(2620, ty); g.stroke(); }
    blotch(g, 2410, 1100, 170, '210, 225, 245', 0.14);
    label(g, v, 'TICKETS', 2410, 1190, 22, hexA(C.yellow, 0.4), { spacing: 6 });
  } else {
    g.fillStyle = '#6ea4bc'; g.fillRect(x, y, w, h);
    // Polished ice tiles in an octagon and diamond pattern, each with a pale facet.
    for (let tx = x; tx < x + w; tx += 75) for (let ty = y; ty < y + h; ty += 75) {
      const k = hash(tx, ty, 3);
      g.fillStyle = k > 0.5 ? 'rgba(210, 240, 252, 0.18)' : 'rgba(30, 80, 110, 0.14)';
      g.beginPath(); g.moveTo(tx + 22, ty + 2); g.lineTo(tx + 53, ty + 2); g.lineTo(tx + 73, ty + 22); g.lineTo(tx + 73, ty + 53); g.lineTo(tx + 53, ty + 73); g.lineTo(tx + 22, ty + 73); g.lineTo(tx + 2, ty + 53); g.lineTo(tx + 2, ty + 22); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(190, 230, 248, 0.5)'; g.lineWidth = 2; for (let tx = x; tx <= x + w; tx += 75) { g.beginPath(); g.moveTo(tx, y); g.lineTo(tx, y + h); g.stroke(); } for (let ty = y; ty <= y + h; ty += 75) { g.beginPath(); g.moveTo(x, ty); g.lineTo(x + w, ty); g.stroke(); }
    g.strokeStyle = 'rgba(190, 230, 248, 0.5)'; g.lineWidth = 5; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    // The snowflake mosaic on the plaza outside, set in glass.
    g.save(); g.translate(2410, 1120);
    g.fillStyle = 'rgba(20, 60, 90, 0.3)'; ell(g, 0, 0, 170, 170); g.fill();
    g.strokeStyle = 'rgba(210, 240, 252, 0.7)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 160, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 130, 0, TAU); g.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU; g.save(); g.rotate(a);
      g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(120, 0); g.stroke();
      for (const [d, l] of [[50, 30], [84, 24]] as const) { g.lineWidth = 4; g.beginPath(); g.moveTo(d, 0); g.lineTo(d + l * 0.6, l * 0.8); g.moveTo(d, 0); g.lineTo(d + l * 0.6, -l * 0.8); g.stroke(); }
      g.restore();
    }
    g.restore();
    label(g, v, 'ICE GARDEN', 2410, 1290, 26, 'rgba(210, 240, 252, 0.5)', { spacing: 8 });
    blotch(g, 2410, 1100, 260, '120, 210, 255', 0.16);
  }
}

/* -- the woods / the tree farm --------------------------------------------------------------------------------------------- */

function woods(g: G, v: Variant) {
  const rand = seeded(v ? 131 : 121);
  if (v === 0) {
    // Forest floor: the snow thinner and bluer under the boughs, needles and twigs fallen through, deer tracks across.
    for (let i = 0; i < 90; i++) blotch(g, 100 + rand() * 1400, 100 + rand() * 1500, 60 + rand() * 120, '24, 52, 56', 0.12);
    needles(g, 60, 60, 1440, 1540, 1600, 123);
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const x = 120 + rand() * 1300, y = 120 + rand() * 1400, a = rand() * TAU, l = 20 + rand() * 40; g.strokeStyle = 'rgba(70, 48, 30, 0.5)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); g.strokeStyle = 'rgba(190, 210, 230, 0.25)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l - 2); g.stroke(); }
    // The cabin's porch and the path from its door.
    planks(g, 520, 950, 160, 70, { board: 14, seed: 124, base: '#6a4a2c', hi: '#7e5836', lo: '#563a22' });
    g.strokeStyle = 'rgba(10, 8, 6, 0.5)'; g.lineWidth = 3; g.strokeRect(520, 950, 160, 70);
    // A woodpile against the cabin wall, flat from above: split ends in rows.
    g.fillStyle = '#5a3e24'; g.fillRect(860, 640, 54, 260); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(860, 640, 54, 260);
    g.fillStyle = C.logEnd; for (let i = 0; i < 12; i++) for (let k = 0; k < 2; k++) { ell(g, 874 + k * 26, 654 + i * 21, 8, 8); g.fill(); g.strokeStyle = 'rgba(60, 36, 16, 0.7)'; g.lineWidth = 1.2; g.stroke(); }
    // Antler rack and a chopping block.
    g.fillStyle = '#6a4a2c'; ell(g, 720, 1040, 20, 20); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke(); g.strokeStyle = 'rgba(40, 24, 10, 0.6)'; g.lineWidth = 1.5; ell(g, 720, 1040, 12, 12); g.stroke(); ell(g, 720, 1040, 5, 5); g.stroke();
  } else {
    // Rows of planted trees: furrows with a stump to a stride, tags on stakes, a loading pallet at the end of each.
    for (let i = 0; i < 60; i++) blotch(g, 100 + rand() * 1400, 100 + rand() * 1500, 70 + rand() * 120, '60, 70, 60', 0.08);
    g.lineCap = 'round';
    for (let row = 0; row < 15; row++) {
      const yy = 260 + row * 96;
      g.strokeStyle = 'rgba(46, 60, 84, 0.3)'; g.lineWidth = 16; g.beginPath(); g.moveTo(140, yy); g.lineTo(1440, yy); g.stroke();
      g.strokeStyle = 'rgba(200, 216, 236, 0.1)'; g.lineWidth = 6; g.beginPath(); g.moveTo(140, yy - 2); g.lineTo(1440, yy - 2); g.stroke();
      for (let xx = 180; xx < 1420; xx += 78) {
        if (hash(row, xx, 5) < 0.18) continue;
        g.fillStyle = '#3a2a1c'; ell(g, xx, yy, 7, 7); g.fill(); g.fillStyle = C.logEnd; ell(g, xx, yy - 1, 4.4, 4); g.fill();
        if (hash(row, xx, 8) < 0.25) { g.fillStyle = hexA(C.red, 0.8); g.fillRect(xx + 6, yy - 8, 4, 6); }
      }
    }
    for (let i = 0; i < 4; i++) { g.save(); g.translate(1430, 300 + i * 340); planks(g, -34, -24, 68, 48, { board: 8, seed: 140 + i, nails: false }); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-34, -24, 68, 48); g.restore(); }
    // Sawdust where the sawmill lets out.
    for (let i = 0; i < 14; i++) blotch(g, 640 + rand() * 280, 930 + rand() * 120, 30 + rand() * 40, '226, 196, 140', 0.2);
  }
}

/* -- the garage / the cable car terminal -------------------------------------------------------------------------------- */

function garage(g: G, v: Variant) {
  const bay = [{ x: 650, y: 5050, w: 650, h: 200 }, { x: 300, y: 5300, w: 1000, h: 450 }];
  const office = { x: 300, y: 5050, w: 300, h: 200 };
  if (v === 0) {
    for (const b of bay) tiles(g, b.x, b.y, b.w, b.h, 100, '#6a6a68', '#64645f', 'rgba(24, 24, 26, 0.7)', 151, 0.05);
    planks(g, office.x, office.y, office.w, office.h, { board: 20, seed: 152, base: '#6a4a2c', hi: '#7e5836', lo: '#563a22' });
    // The groomer's bay: a yellow box, oil under the cab, drag marks to the big doors.
    g.strokeStyle = hexA(C.yellow, 0.75); g.lineWidth = 5; g.setLineDash([36, 20]); g.strokeRect(540, 5290, 480, 230); g.setLineDash([]);
    stain(g, 780, 5400, 90, '12, 12, 14', 0.3, 153); stain(g, 920, 5480, 40, '12, 12, 14', 0.28, 154); stain(g, 1100, 5640, 50, '12, 12, 14', 0.22, 155);
    g.strokeStyle = 'rgba(14, 14, 16, 0.3)'; g.lineWidth = 16; g.beginPath(); g.moveTo(740, 5750); g.lineTo(780, 5520); g.moveTo(900, 5750); g.lineTo(880, 5520); g.stroke();
    g.fillStyle = '#26282c'; ell(g, 1180, 5420, 16, 16); g.fill(); g.strokeStyle = 'rgba(10,10,12,0.8)'; g.lineWidth = 3; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(1166, 5420 + k * 6); g.lineTo(1194, 5420 + k * 6); g.stroke(); }
    label(g, v, 'KEEP CLEAR - GROOMER BAY', 1000, 5540, 16, hexA(C.yellow, 0.5), { spacing: 3 });
    // Snow in the doorway and a skein of old extension cord.
    blotch(g, 880, 5730, 130, '205, 222, 244', 0.22);
    g.strokeStyle = '#d9a02a'; g.lineWidth = 3; g.beginPath(); g.moveTo(1290, 5440); g.bezierCurveTo(1200, 5520, 1260, 5600, 1160, 5640); g.stroke();
  } else {
    for (const b of bay) tiles(g, b.x, b.y, b.w, b.h, 100, '#cfd6da', '#c5ced4', 'rgba(60, 76, 90, 0.5)', 156, 0.04);
    tiles(g, office.x, office.y, office.w, office.h, 50, '#a8b8c0', '#9eb0b8', 'rgba(40, 56, 66, 0.5)', 157, 0.04);
    // The platform edge: a tactile yellow strip, and the cabin's berth lines.
    g.fillStyle = hexA(C.yellow, 0.8); g.fillRect(300, 5700, 1000, 28);
    g.fillStyle = 'rgba(40, 50, 56, 0.6)'; for (let i = 0; i < 100; i++) g.fillRect(304 + i * 10, 5708, 4, 10);
    g.strokeStyle = 'rgba(40, 80, 140, 0.55)'; g.lineWidth = 5; g.setLineDash([36, 20]); g.strokeRect(540, 5290, 480, 230); g.setLineDash([]);
    label(g, v, 'MIND THE GAP', 790, 5680, 15, 'rgba(30, 36, 44, 0.65)', { spacing: 4 });
    label(g, v, 'GONDOLA 1', 780, 5540, 20, 'rgba(40, 80, 140, 0.45)', { spacing: 6 });
    blotch(g, 880, 5730, 130, '205, 222, 244', 0.2);
  }
  // The yard: the groomer's wide tracks come and go, whoever's shed it is.
  g.strokeStyle = 'rgba(46, 60, 88, 0.26)'; g.lineWidth = 22; g.lineCap = 'round';
  g.beginPath(); g.moveTo(800, 5860); g.bezierCurveTo(780, 5900, 900, 5920, 1100, 5900); g.stroke();
  g.beginPath(); g.moveTo(830, 5860); g.bezierCurveTo(810, 5895, 930, 5920, 1120, 5896); g.stroke();
}

/* -- the fuel house / the observatory --------------------------------------------------------------------------------- */

function dome(g: G, v: Variant) {
  const cx = 2300, cy = 5300;
  g.save(); g.translate(cx, cy);
  // The ground round it: scree, worn to the path.
  for (let i = 0; i < 12; i++) blotch(g, (hash(i, v, 1) - 0.5) * 760, (hash(i, v, 2) - 0.5) * 760, 70 + hash(i, v, 3) * 90, '70, 66, 62', 0.12);
  if (v === 0) {
    g.fillStyle = '#58585a'; g.beginPath(); g.arc(0, 0, 238, 0, TAU); g.fill();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.strokeStyle = 'rgba(14, 14, 16, 0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 238, Math.sin(a) * 238); g.stroke(); }
    g.strokeStyle = hexA(C.yellow, 0.8); g.lineWidth = 10; g.setLineDash([30, 24]); g.beginPath(); g.arc(0, 0, 200, 0, TAU); g.stroke(); g.setLineDash([]);
    stain(g, 60, 70, 90, '10, 10, 12', 0.34, 161); stain(g, -90, -40, 60, '10, 10, 12', 0.3, 162);
    g.fillStyle = '#2a2c30'; ell(g, -120, 100, 14, 14); g.fill();
    label(g, v, 'NO NAKED FLAME', 0, 130, 17, hexA(C.hazard, 0.7), { spacing: 3 });
    label(g, v, 'DIESEL', 0, -140, 22, hexA(C.yellow, 0.6), { spacing: 8 });
  } else {
    g.fillStyle = '#2f3a58'; g.beginPath(); g.arc(0, 0, 238, 0, TAU); g.fill();
    // A star chart in the floor: rings of brass, the zodiac's ticks, constellations in gold dots.
    g.strokeStyle = hexA(C.brassHi, 0.7); g.lineWidth = 3; for (const r of [226, 190, 120, 60]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
    g.lineWidth = 2; for (let k = 0; k < 72; k++) { const a = (k / 72) * TAU, l = k % 6 === 0 ? 22 : 10; g.beginPath(); g.moveTo(Math.cos(a) * 226, Math.sin(a) * 226); g.lineTo(Math.cos(a) * (226 - l), Math.sin(a) * (226 - l)); g.stroke(); }
    g.fillStyle = hexA(C.brassHi, 0.85);
    for (let i = 0; i < 46; i++) { const a = hash(i, 4, 7) * TAU, r = 30 + hash(i, 5, 7) * 170; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 1.6 + hash(i, 6, 7) * 2.4, 0, TAU); g.fill(); }
    g.strokeStyle = hexA(C.brassHi, 0.4); g.lineWidth = 1.6;
    for (const pts of [[[-120, -60], [-84, -90], [-50, -70], [-30, -100]], [[70, 60], [100, 90], [136, 70], [150, 108]], [[-60, 120], [-20, 140], [20, 124]]] as const) { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); }
    g.fillStyle = hexA(C.brassHi, 0.5); g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const r = k % 2 ? 30 : 56; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    label(g, v, 'N', 0, 205, 22, hexA(C.brassHi, 0.8), { spacing: 2 });
  }
  g.restore();
}

/* -- the car park / the shuttle loop --------------------------------------------------------------------------------------- */

const CARS: readonly (readonly [number, number, number])[] = [[760, 4130, 0.05], [1180, 4170, -0.04], [1600, 4120, 0.02], [900, 4620, Math.PI + 0.06], [1480, 4600, Math.PI - 0.03]];

function lot(g: G, v: Variant) {
  if (v === 0) {
    // The lot was ploughed before the storm: dark asphalt bays between the berms, lines half buried.
    g.fillStyle = 'rgba(46, 54, 70, 0.6)'; g.fillRect(500, 4000, 1500, 220); g.fillRect(500, 4500, 1500, 220);
    g.fillStyle = 'rgba(40, 48, 64, 0.55)'; g.fillRect(500, 4220, 1500, 280);
    g.strokeStyle = 'rgba(210, 218, 232, 0.4)'; g.lineWidth = 4;
    for (let x = 560; x <= 1960; x += 140) { g.beginPath(); g.moveTo(x, 4010); g.lineTo(x, 4200); g.moveTo(x, 4520); g.lineTo(x, 4710); g.stroke(); }
    g.fillStyle = 'rgba(210, 218, 232, 0.3)'; for (let x = 780; x < 1900; x += 320) { g.beginPath(); g.moveTo(x, 4330); g.lineTo(x + 50, 4360); g.lineTo(x, 4390); g.lineTo(x + 8, 4360); g.closePath(); g.fill(); }
    label(g, v, 'LODGE GUESTS ONLY', 1260, 4360, 22, 'rgba(232, 220, 190, 0.28)', { spacing: 6 });
    for (const [x, y] of CARS) { blotch(g, x, y + 20, 200, '30, 40, 64', 0.18); }
    // Drifts banked against the tyres, and one car's tracks that never came back out.
    g.strokeStyle = 'rgba(46, 60, 88, 0.3)'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(520, 4380); g.bezierCurveTo(640, 4350, 700, 4250, 760, 4200); g.stroke();
  } else {
    // The shuttle loop: setts and a painted lane, two bays for the buses.
    flags(g, 3950, 1150, 1950, 950, '#59616a', 171);
    g.fillStyle = 'rgba(30, 36, 48, 0.4)'; g.fillRect(3950, 1450, 1950, 330);
    g.fillStyle = hexA(C.yellow, 0.55); for (let x = 3990; x < 5900; x += 90) g.fillRect(x, 1612, 50, 6);
    g.strokeStyle = hexA(C.yellow, 0.5); g.lineWidth = 6; for (const [bx, by] of [[4300, 1220], [4900, 1220], [4300, 1760], [4900, 1760]] as const) g.strokeRect(bx, by, 330, 130);
    label(g, v, 'SHUTTLE', 5100, 1520, 40, hexA(C.yellow, 0.4), { spacing: 14 });
    label(g, v, 'BAY 1', 4465, 1285, 18, 'rgba(232, 220, 190, 0.4)', { spacing: 4 });
    label(g, v, 'BAY 2', 5065, 1285, 18, 'rgba(232, 220, 190, 0.4)', { spacing: 4 });
  }
}

/* -- the staging yard / the loading yard ------------------------------------------------------------------------------------- */

/** The south-west corner where the first squad used to muster: a ploughed apron, bay lines half buried, sled tracks running north from the lamp. */
function staging(g: G, v: Variant) {
  const x = 110, y = 4440, w = 520, h = 540;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (v === 0) {
    g.fillStyle = 'rgba(46, 54, 70, 0.62)'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(14, 18, 28, 0.45)'; g.lineWidth = 2;
    for (let tx = x; tx <= x + w; tx += 130) { g.beginPath(); g.moveTo(tx, y); g.lineTo(tx, y + h); g.stroke(); }
    for (let ty = y; ty <= y + h; ty += 135) { g.beginPath(); g.moveTo(x, ty); g.lineTo(x + w, ty); g.stroke(); }
    // Bays for the pickup and the sleds, half under snow.
    g.strokeStyle = 'rgba(210, 218, 232, 0.38)'; g.lineWidth = 4;
    g.strokeRect(188, 4440, 148, 340); g.strokeRect(392, 4716, 82, 180); g.strokeRect(482, 4716, 82, 180);
    // Two lines of track from the sled bays, and the pickup's tyre prints, in the snow of the apron's edge.
    g.strokeStyle = 'rgba(40, 54, 82, 0.34)'; g.lineWidth = 7; g.lineCap = 'round';
    for (const dx of [-9, 9]) { g.beginPath(); g.moveTo(437 + dx, 4900); g.bezierCurveTo(440 + dx, 4800, 520 + dx, 4620, 600 + dx, 4440); g.stroke(); }
    blotch(g, 262, 4780, 120, '30, 40, 64', 0.2); blotch(g, 480, 4830, 110, '30, 40, 64', 0.2);
  } else {
    flags(g, x, y, w, h, '#5c646c', 191);
    g.strokeStyle = hexA(C.yellow, 0.5); g.lineWidth = 5; g.setLineDash([36, 24]); g.strokeRect(x + 14, y + 14, w - 28, h - 28); g.setLineDash([]);
    g.strokeStyle = 'rgba(14, 18, 24, 0.4)'; g.lineWidth = 3; g.strokeRect(188, 4440, 148, 340); g.strokeRect(392, 4716, 82, 180); g.strokeRect(482, 4716, 82, 180);
    blotch(g, 262, 4780, 120, '20, 24, 32', 0.2);
  }
  g.restore();
  label(g, v, v === 0 ? 'PATROL STAGING' : 'LOADING YARD', 160, 4700, 20, v === 0 ? 'rgba(232, 220, 190, 0.3)' : hexA(C.yellow, 0.34), { spacing: 6, rot: -Math.PI / 2 });
}

/* -- the fishing hut / the Zamboni shed -------------------------------------------------------------------------------------- */

function hut(g: G, v: Variant) {
  const x = 2350, y = 4100, w = 350, h = 250;
  if (v === 0) {
    g.fillStyle = '#5a8aa0'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 8; i++) blotch(g, x + hash(i, 1, 9) * w, y + hash(i, 2, 9) * h, 40, '190, 225, 240', 0.12);
    // Three holes cut through the ice, chipped ice heaped round the rims.
    for (const [hx, hy] of [[2430, 4160], [2540, 4290], [2640, 4170]] as const) {
      g.fillStyle = 'rgba(214, 238, 248, 0.5)'; ell(g, hx, hy, 34, 28); g.fill();
      g.fillStyle = '#0c1c2a'; ell(g, hx, hy, 24, 19); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
      g.fillStyle = 'rgba(255, 255, 255, 0.25)'; ell(g, hx - 7, hy - 6, 8, 4); g.fill();
    }
    planks(g, x, 4215, w, 28, { board: 14, seed: 181, base: '#6a4a2c', hi: '#7e5836', lo: '#563a22' });
    // The stove's sooty patch, a bucket ring.
    blotch(g, 2380, 4310, 50, '30, 24, 20', 0.4);
    g.strokeStyle = 'rgba(30, 24, 20, 0.4)'; g.lineWidth = 3; ell(g, 2660, 4310, 12, 12); g.stroke();
  } else {
    g.fillStyle = '#6e6c68'; g.fillRect(x, y, w, h);
    tiles(g, x, y, w, h, 100, 'rgba(0,0,0,0)', 'rgba(255,255,255,0.04)', 'rgba(14, 14, 16, 0.5)', 182, 0.05);
    g.strokeStyle = hexA(C.yellow, 0.7); g.lineWidth = 5; g.setLineDash([30, 20]); g.strokeRect(x + 18, y + 18, w - 36, h - 36); g.setLineDash([]);
    // The machine's wide tyre bands, ice shavings in drifts, a floor drain.
    g.fillStyle = 'rgba(14, 14, 16, 0.3)'; g.fillRect(x + 30, y + 54, w - 60, 28); g.fillRect(x + 30, y + 170, w - 60, 28);
    for (let i = 0; i < 10; i++) blotch(g, x + 20 + hash(i, 3, 9) * (w - 40), y + 30 + hash(i, 4, 9) * (h - 60), 24, '220, 238, 248', 0.22);
    g.fillStyle = '#26282c'; ell(g, x + w - 40, y + h - 40, 14, 14); g.fill();
    label(g, v, 'ICE RESURFACING', x + w / 2, y + 26, 13, hexA(C.yellow, 0.55), { spacing: 3 });
  }
}

export function paintSites(g: G, _size: number, _seed: number) {
  both(g, (gg, v) => { woods(gg, v); deck(gg, v); lift(gg, v); lot(gg, v); staging(gg, v); garage(gg, v); dome(gg, v); hut(gg, v); });
  void contact; void planks; void hexA;
}
