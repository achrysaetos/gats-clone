import type { Light } from './ambience.ts';
import type { DecorPlan, Fixture, Mount } from './decor.ts';
import { landmarkSprite } from './landmarks.ts';
import { drawMoths, drawVignettes } from './vignetteart.ts';
import { ALARM_COLOR, BEACON_COLOR, EXIT_COLOR, LAMP_COLOR, TUBE_COLOR, WINDOW_COLOR, lampColor, pickDecorLights, spinAt, tubeOn, type FxState, type View } from './fixturelight.ts';
import { INK, teamColor } from './palette.ts';

/**
 * Draws the environment's fixtures in the toy-soldier kit (docs/art/STYLE.md): ink outline, a hard highlight on the lit
 * side, a hard shade on the far side, a contact shadow, and a soft pool of additive light only on the light itself. Walls
 * carry lamps, tubes, windows, exit plates, pipes and vent fans; the floor carries work lights, uplights and post lamps; the
 * outer boundary carries chain-link fence. Everything animated is slow (a beacon turns at 0.4 Hz, a fan at 0.8 Hz, steam
 * drifts) and holds still under reduced motion. Fixtures are drawn over the walls and under the bodies, every frame, culled to the view.
 * What they shine into the world is fixturelight.ts, fed by lightfeed.ts.
 */

const TAU = Math.PI * 2;
const GUNMETAL = '#4f5560', GUNMETAL_DARK = '#3d4450', STEEL = '#7d838d', BONE = '#ece6d6', AMBER = '#ffb347', BULB = '#ffd98a';
const CONTACT = 'rgba(20, 24, 32, 0.3)', HIGHLIGHT = 'rgba(255, 255, 255, 0.24)', SHADE = 'rgba(10, 12, 16, 0.3)';

const glows = new Map<string, HTMLCanvasElement>();
/** A soft round glow in one colour: a pooled light sprite, the only gradient in the kit. */
function glowSprite(color: string): HTMLCanvasElement {
  let c = glows.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.45)'));
    grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glows.set(color, c);
  }
  return c;
}

const GLOW = { amber: 'rgba(255, 191, 110, 1)', warm: 'rgba(255, 220, 160, 1)', cool: 'rgba(200, 228, 255, 1)', green: 'rgba(125, 255, 176, 1)', red: 'rgba(255, 90, 74, 1)', beacon: 'rgba(255, 179, 71, 1)' } as const;

/** 'rgba(r, g, b, 1)' for a '#rrggbb' lamp colour, so a district's lamps glow in its own light. */
const rgbaOf = (hex: string): string => { const v = parseInt(hex.slice(1), 16); return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, 1)`; };

function glow(ctx: CanvasRenderingContext2D, color: keyof typeof GLOW | `#${string}`, x: number, y: number, r: number, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(glowSprite(color.startsWith('#') ? rgbaOf(color) : GLOW[color as keyof typeof GLOW]), x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

const inkPath = (ctx: CanvasRenderingContext2D, w = 2) => { ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke(); };

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, outline = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  inkPath(ctx, outline);
}

function contact(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = CONTACT;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** The cel steps on a round top: a hard highlight wedge on the lit side, a hard shade wedge on the far side. */
function celDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = HIGHLIGHT;
  ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r * 0.2, y - r); ctx.lineTo(x - r, y + r * 0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = SHADE;
  ctx.beginPath(); ctx.moveTo(x + r, y + r); ctx.lineTo(x - r * 0.2, y + r); ctx.lineTo(x + r, y - r * 0.2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

const lit = (st: FxState) => 0.62 + 0.38 * st.dark;

/** A caged work lamp on a wall's lane-facing edge: gunmetal housing, a bulb and two cage bars. */
function drawLamp(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const nx = Math.cos(f.angle), ny = Math.sin(f.angle), k = lit(st);
  const x = f.x + nx * 2, y = f.y + ny * 2;
  const tone = lampColor(f);
  glow(ctx, tone, x + nx * 8, y + ny * 8, 38, 0.42 * k);
  if (f.side === 's') {
    // The lamp washes the wall's front face below it with warm light.
    const top = f.y + 7, fh = f.face ?? 16;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `${rgbaOf(tone).replace(', 1)', `, ${0.2 * k})`)}`;
    ctx.beginPath(); ctx.moveTo(x - 7, top); ctx.lineTo(x + 7, top); ctx.lineTo(x + 20, top + fh); ctx.lineTo(x - 20, top + fh); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  contact(ctx, x + 2, y + 4, 8, 4);
  disc(ctx, x, y, 7.2, GUNMETAL, 2);
  celDisc(ctx, x, y, 7.2);
  ctx.beginPath(); ctx.arc(x, y, 4.3, 0, TAU);
  ctx.fillStyle = tone; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU);
  ctx.fillStyle = '#fff1c8'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4.3, y); ctx.lineTo(x + 4.3, y); ctx.moveTo(x, y - 4.3); ctx.lineTo(x, y + 4.3);
  inkPath(ctx, 1.1);
  ctx.beginPath(); ctx.arc(x, y, 7.2, 0, TAU);
  inkPath(ctx, 2);
  ctx.beginPath(); ctx.arc(x - 2.4, y - 2.6, 1.1, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
}

/** A tripod work light standing at a wall's foot, its lens facing out into the yard. */
function drawWork(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const { x, y, angle: a } = f, k = lit(st);
  glow(ctx, f.region >= 0 ? lampColor(f) : 'warm', x + Math.cos(a) * 20, y + Math.sin(a) * 20, 52, 0.4 * k);
  contact(ctx, x + 3, y + 5, 14, 6);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const la = a + 0.6 + (i * TAU) / 3, lx = x + Math.cos(la) * 11, ly = y + Math.sin(la) * 11 * 0.8 + 2;
    ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(lx, ly);
    ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.stroke();
    ctx.strokeStyle = STEEL; ctx.lineWidth = 1.8; ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.save();
  ctx.translate(x, y - 3);
  ctx.rotate(a);
  ctx.beginPath(); ctx.rect(-3, -6, 15, 12);
  ctx.fillStyle = GUNMETAL_DARK; ctx.fill();
  ctx.fillStyle = HIGHLIGHT; ctx.fillRect(-3, -6, 15, 3);
  inkPath(ctx, 2);
  ctx.fillStyle = '#fff4d6';
  ctx.fillRect(9.2, -4.6, 3, 9.2);
  ctx.restore();
  disc(ctx, x, y - 3, 3, STEEL, 1.6);
}

/** A hazard beacon: ringed dome on a wall corner with two slow amber sweeps. */
function drawBeacon(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState, color: string, glowKey: 'beacon' | 'red', on: boolean) {
  const x = f.x + Math.cos(f.angle) * 2, y = f.y + Math.sin(f.angle) * 2;
  const a = spinAt(f, st.now, st.reduced, glowKey === 'red' ? 0.7 : 0.4);
  if (on) {
    glow(ctx, glowKey, x, y, 34, 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glowKey === 'red' ? 'rgba(255, 90, 74, 0.34)' : 'rgba(255, 179, 71, 0.3)';
    for (const o of [0, Math.PI]) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 44, a + o - 0.3, a + o + 0.3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  contact(ctx, x + 2, y + 4, 9, 4);
  disc(ctx, x, y, 8, GUNMETAL_DARK, 2);
  disc(ctx, x, y, 5.2, on ? color : (glowKey === 'red' ? '#7a2a2d' : '#8a6a38'), 1.6);
  celDisc(ctx, x, y, 5.2);
  ctx.beginPath(); ctx.arc(x - 1.6, y - 1.8, 1, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
}

const faceTop = (f: Fixture) => f.y + 7;

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.beginPath(); ctx.rect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = HIGHLIGHT; ctx.fillRect(x, y, w, 2);
  ctx.beginPath(); ctx.rect(x, y, w, h);
  inkPath(ctx, 1.6);
}

/** A green exit plate on a wall's front face, with a running arrow. */
function drawExit(ctx: CanvasRenderingContext2D, f: Fixture) {
  const w = f.w ?? 28, h = f.h ?? 11, x = f.x - w / 2, y = faceTop(f) + 2.5;
  glow(ctx, 'green', f.x, y + h / 2, 34, 0.5);
  plate(ctx, x, y, w, h, '#1c5a3c');
  ctx.strokeStyle = EXIT_COLOR; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.fillStyle = '#c9ffe0';
  ctx.fillRect(x + 6, y + h / 2 - 1.1, 11, 2.2);
  ctx.beginPath(); ctx.moveTo(x + 16, y + h / 2 - 3.6); ctx.lineTo(x + 22.5, y + h / 2); ctx.lineTo(x + 16, y + h / 2 + 3.6); ctx.closePath(); ctx.fill();
}

/** A fluorescent tube in a steel hood on a wall's front face; on the rare stutter it dies and comes back. */
function drawTube(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const w = f.w ?? 36, h = f.h ?? 5, x = f.x - w / 2, y = faceTop(f) + 4;
  const on = tubeOn(f, st.now, st.reduced);
  if (on) glow(ctx, 'cool', f.x, y + h / 2, 44, 0.45 * lit(st));
  plate(ctx, x - 2, y - 2, w + 4, h + 4, GUNMETAL_DARK);
  ctx.fillStyle = on ? '#eaf7ff' : '#6f7b86';
  ctx.fillRect(x + 1, y, w - 2, h);
  if (on) { ctx.fillStyle = TUBE_COLOR; ctx.fillRect(x + 1, y + h - 1.4, w - 2, 1.4); }
}

/** A lit window in a wall's front face: amber glass, a cross of ink mullions and a curtain shade. */
function drawWindow(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const w = f.w ?? 30, h = Math.min(f.h ?? 10, (f.face ?? 16) - 4), x = f.x - w / 2, y = faceTop(f) + 2.5;
  glow(ctx, 'warm', f.x, y + h / 2, 48, 0.4 * lit(st));
  ctx.beginPath(); ctx.rect(x, y, w, h);
  ctx.fillStyle = WINDOW_COLOR; ctx.fill();
  ctx.fillStyle = 'rgba(84, 52, 24, 0.5)'; ctx.fillRect(x, y, w, 2.6);
  ctx.fillStyle = HIGHLIGHT; ctx.fillRect(x, y + h - 2, w * 0.45, 2);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x + w / 3, y); ctx.lineTo(x + w / 3, y + h); ctx.moveTo(x + (2 * w) / 3, y); ctx.lineTo(x + (2 * w) / 3, y + h);
  inkPath(ctx, 1.2);
  ctx.beginPath(); ctx.rect(x, y, w, h);
  inkPath(ctx, 1.8);
}

/** A low uplight beside a spawn pad: a gunmetal dome with a lens ringed in the pad's team colour. */
function drawUplight(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const { x, y } = f;
  glow(ctx, lampColor(f), x, y, 34, 0.45 * lit(st));
  contact(ctx, x + 2, y + 4, 10, 5);
  disc(ctx, x, y, 8, GUNMETAL_DARK, 2);
  ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU);
  ctx.fillStyle = BULB; ctx.fill();
  ctx.lineWidth = 1.8; ctx.strokeStyle = f.team ? teamColor(f.team) : AMBER; ctx.stroke();
  celDisc(ctx, x, y, 5);
  ctx.beginPath(); ctx.arc(x - 1.6, y - 1.8, 1, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
}

/** A vent fan sunk in a wall's top face, its four blades turning slowly. */
function drawFan(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const s = f.w ?? 24, x = f.x - s / 2, y = f.y - s / 2;
  ctx.beginPath(); ctx.rect(x, y, s, s);
  ctx.fillStyle = '#2b2e34'; ctx.fill();
  inkPath(ctx, 2);
  const r = s / 2 - 3, a = spinAt(f, st.now, st.reduced, 0.8);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(a);
  ctx.fillStyle = STEEL;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.5, -r * 0.55, r, -r * 0.2); ctx.lineTo(r * 0.9, r * 0.3); ctx.quadraticCurveTo(r * 0.4, r * 0.35, 0, 0);
    ctx.fill();
    inkPath(ctx, 1.1);
  }
  ctx.restore();
  disc(ctx, f.x, f.y, 2.6, GUNMETAL, 1.4);
  ctx.beginPath(); ctx.rect(x, y, s, s);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 1; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
}

/** Steam from a floor vent: three tiny puffs rising and thinning; reduced motion draws one still wisp. */
function drawSteam(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  ctx.fillStyle = 'rgb(232, 228, 216)';
  for (let i = 0; i < 3; i++) {
    const u = st.reduced ? 0.35 : ((st.now / 3400 + f.phase + i / 3) % 1);
    if (st.reduced && i > 0) break;
    ctx.globalAlpha = 0.2 * Math.sin(Math.PI * u);
    ctx.beginPath();
    ctx.arc(f.x + Math.sin((u + f.phase) * 6) * 3, f.y - 4 - u * 34, 3 + u * 7, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A floodlight on a wall: a double lamp bar facing the core, dark by day and blazing at night. */
function drawFlood(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const on = Math.min(1, Math.max(0, (st.dark - 0.08) / 0.4));
  const a = f.angle;
  if (on > 0.02) glow(ctx, 'warm', f.x + Math.cos(a) * 16, f.y + Math.sin(a) * 16, 90, 0.55 * on);
  contact(ctx, f.x + 3, f.y + 6, 16, 7);
  disc(ctx, f.x, f.y, 10, GUNMETAL_DARK, 2.2);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(a);
  ctx.beginPath(); ctx.rect(2, -13, 12, 26);
  ctx.fillStyle = GUNMETAL; ctx.fill();
  ctx.fillStyle = HIGHLIGHT; ctx.fillRect(2, -13, 12, 4);
  inkPath(ctx, 2);
  for (const o of [-6.5, 6.5]) {
    ctx.beginPath(); ctx.arc(11, o, 4.2, 0, TAU);
    ctx.fillStyle = on > 0.3 ? '#fff6dc' : '#8a8f98'; ctx.fill();
    inkPath(ctx, 1.4);
  }
  ctx.restore();
}

/** A scoreboard plate standing on the range's back wall, its sign reading down the wall. */
function drawScoreboard(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const w = f.w ?? 38, h = f.h ?? 230, x = f.x - w / 2, y = f.y - h / 2;
  contact(ctx, f.x + 4, f.y + 6, w / 2 + 3, h / 2);
  plate(ctx, x, y, w, h, '#2b2e34');
  ctx.beginPath(); ctx.rect(x + 3, y + 3, w - 6, h - 6);
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.55)'; ctx.lineWidth = 1.4; ctx.stroke();
  glow(ctx, 'amber', f.x, f.y, 100, 0.25 * lit(st));
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = AMBER;
  ctx.font = '800 25px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(f.text ?? 'RANGE', 0, -3);
  // A row of LED pips under the word: lane lights, one per lane.
  ctx.fillStyle = 'rgba(255, 179, 71, 0.85)';
  for (let i = 0; i < 6; i++) ctx.fillRect(-45 + i * 16, 9, 10, 3.5);
  ctx.restore();
}

/** A range booth lamp: a gunmetal hood over the bay, its lens strip toward the lane. */
function drawBooth(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  glow(ctx, 'amber', f.x + 22, f.y, 64, 0.45 * lit(st));
  contact(ctx, f.x + 2, f.y + 5, 16, 6);
  plate(ctx, f.x - 14, f.y - 8, 28, 16, GUNMETAL);
  ctx.fillStyle = BULB; ctx.fillRect(f.x + 8, f.y - 6, 4, 12);
  ctx.beginPath(); ctx.rect(f.x - 14, f.y - 8, 28, 16);
  inkPath(ctx, 2);
}

/** A lamp post on a lane boundary: a pole's contact and cast shadow, and a caged lamp head. */
function drawPost(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  glow(ctx, 'amber', f.x, f.y - 14, 46, 0.45 * lit(st));
  ctx.strokeStyle = 'rgba(20, 24, 32, 0.24)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + 20, f.y + 24); ctx.stroke();
  ctx.lineCap = 'butt';
  contact(ctx, f.x, f.y + 2, 8, 4);
  disc(ctx, f.x, f.y, 5, GUNMETAL_DARK, 2);
  ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x, f.y - 14);
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = STEEL; ctx.lineWidth = 2; ctx.stroke();
  disc(ctx, f.x, f.y - 15, 6.5, GUNMETAL, 2);
  celDisc(ctx, f.x, f.y - 15, 6.5);
  ctx.beginPath(); ctx.arc(f.x, f.y - 15, 3.6, 0, TAU);
  ctx.fillStyle = BULB; ctx.fill();
  ctx.beginPath(); ctx.arc(f.x - 2, f.y - 17, 1, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
}

/** A hurricane lantern by a camp cot: a small gunmetal cage round a flame that gutters (still under reduced motion). */
function drawLantern(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  const flick = st.reduced ? 1 : 0.85 + 0.15 * Math.sin(st.now / 170 + f.phase * 9);
  glow(ctx, 'amber', f.x, f.y - 3, 34, 0.5 * flick * lit(st));
  contact(ctx, f.x + 2, f.y + 2, 6, 3);
  ctx.beginPath(); ctx.rect(f.x - 3.6, f.y - 6, 7.2, 8);
  ctx.fillStyle = BULB; ctx.fill(); ctx.fillStyle = HIGHLIGHT; ctx.fillRect(f.x - 3.6, f.y - 6, 7.2, 2);
  ctx.beginPath(); ctx.rect(f.x - 3.6, f.y - 6, 7.2, 8); inkPath(ctx, 1.6);
  ctx.beginPath(); ctx.moveTo(f.x - 2, f.y - 9); ctx.lineTo(f.x + 2, f.y - 9); ctx.moveTo(f.x, f.y - 6); ctx.lineTo(f.x, f.y - 9); inkPath(ctx, 1.4);
}

function drawFixture(ctx: CanvasRenderingContext2D, f: Fixture, st: FxState) {
  switch (f.kind) {
    case 'lamp': drawLamp(ctx, f, st); break;
    case 'work': drawWork(ctx, f, st); break;
    case 'beacon': drawBeacon(ctx, f, st, BEACON_COLOR, 'beacon', true); break;
    case 'alarm': drawBeacon(ctx, f, st, ALARM_COLOR, 'red', st.alarm); break;
    case 'exit': drawExit(ctx, f); break;
    case 'tube': drawTube(ctx, f, st); break;
    case 'window': drawWindow(ctx, f, st); break;
    case 'uplight': drawUplight(ctx, f, st); break;
    case 'fan': drawFan(ctx, f, st); break;
    case 'steam': drawSteam(ctx, f, st); break;
    case 'flood': drawFlood(ctx, f, st); break;
    case 'scoreboard': drawScoreboard(ctx, f, st); break;
    case 'boothlamp': drawBooth(ctx, f, st); break;
    case 'lanepost': drawPost(ctx, f, st); break;
    case 'lantern': drawLantern(ctx, f, st); break;
  }
}

const inView = (v: View, x: number, y: number, pad: number) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;

function drawMounts(ctx: CanvasRenderingContext2D, mounts: readonly Mount[], v: View) {
  const pipes = mounts.filter((m): m is Extract<Mount, { k: 'pipe' }> => m.k === 'pipe' && inView(v, (m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, Math.hypot(m.x1 - m.x0, m.y1 - m.y0) / 2 + 20));
  if (pipes.length) {
    ctx.lineCap = 'butt';
    for (const [w, c] of [[7, INK], [3.8, STEEL], [1.2, 'rgba(255, 255, 255, 0.3)']] as const) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath();
      for (const p of pipes) {
        const o = w === 1.2 ? -1.2 : 0;
        if (p.y0 === p.y1) { ctx.moveTo(p.x0, p.y0 + o); ctx.lineTo(p.x1, p.y1 + o); } else { ctx.moveTo(p.x0 + o, p.y0); ctx.lineTo(p.x1 + o, p.y1); }
      }
      ctx.stroke();
    }
    // Flanges every 70 px: ink-edged collars across the pipe.
    ctx.fillStyle = GUNMETAL;
    ctx.beginPath();
    for (const p of pipes) {
      if (p.y0 === p.y1) for (let x = p.x0 + 24; x < p.x1 - 10; x += 70) ctx.rect(x - 2.5, p.y0 - 5.5, 5, 11);
      else for (let y = p.y0 + 24; y < p.y1 - 10; y += 70) ctx.rect(p.x0 - 5.5, y - 2.5, 11, 5);
    }
    ctx.fill();
    inkPath(ctx, 1.4);
  }
  for (const m of mounts) {
    if (m.k !== 'plate' || !inView(v, m.x, m.y, 30)) continue;
    const h = Math.min(12, m.face - 3), y = m.y + 1.5;
    ctx.font = `800 ${h - 3}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const w = Math.max(30, Math.ceil(ctx.measureText(m.text).width) + 10), x = m.x - w / 2;
    plate(ctx, x, y, w, h, GUNMETAL_DARK);
    ctx.fillStyle = BONE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.text, m.x, y + h / 2 + 0.5);
  }
}

let meshTile: HTMLCanvasElement | null = null;
function mesh(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (!meshTile) {
    meshTile = document.createElement('canvas');
    meshTile.width = meshTile.height = 12;
    const g = meshTile.getContext('2d')!;
    g.strokeStyle = 'rgba(190, 196, 204, 0.55)';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(12, 12); g.moveTo(12, 0); g.lineTo(0, 12); g.stroke();
  }
  return ctx.createPattern(meshTile, 'repeat')!;
}

const POST_GAP = 150;
const FENCE_H = 28;

/**
 * Chain-link along the outer boundary: posts every 150 px, a top and a bottom rail, and diamond mesh between, with the odd
 * bay left open. North and south runs show their mesh; east and west runs, seen edge-on, show posts and rails only.
 */
function drawFence(ctx: CanvasRenderingContext2D, size: number, v: View) {
  const near = 90;
  const north = v.y0 < near, south = v.y1 > size - near, west = v.x0 < near, east = v.x1 > size - near;
  if (!north && !south && !west && !east) return;
  const pattern = mesh(ctx);
  const open = (i: number, s: number) => ((i * 2654435761 + s * 97) >>> 0) % 11 === 0;
  const run = (horizontal: boolean, at: number, s: number) => {
    const a = horizontal ? v.x0 : v.y0, b = horizontal ? v.x1 : v.y1;
    const i0 = Math.max(0, Math.floor(a / POST_GAP) - 1), i1 = Math.min(Math.floor(size / POST_GAP), Math.ceil(b / POST_GAP) + 1);
    for (let i = i0; i < i1; i++) {
      const p0 = i * POST_GAP + 40, p1 = Math.min(size - 40, (i + 1) * POST_GAP + 40);
      if (p1 <= p0 || open(i, s)) continue;
      if (horizontal) {
        const x = p0, w = p1 - p0, top = at - FENCE_H;
        ctx.fillStyle = 'rgba(28, 31, 38, 0.3)'; ctx.fillRect(x, top, w, FENCE_H);
        ctx.fillStyle = pattern; ctx.fillRect(x, top, w, FENCE_H);
        ctx.fillStyle = GUNMETAL; ctx.fillRect(x, top - 1.5, w, 3); ctx.fillRect(x, at - 3, w, 3);
        ctx.beginPath(); ctx.rect(x, top - 1.5, w, 3); ctx.rect(x, at - 3, w, 3);
        inkPath(ctx, 1.2);
      } else {
        ctx.fillStyle = GUNMETAL; ctx.fillRect(at - 1.5, p0, 3, p1 - p0);
        ctx.beginPath(); ctx.rect(at - 1.5, p0, 3, p1 - p0);
        inkPath(ctx, 1.2);
      }
    }
    // Posts last, over the rails.
    for (let i = i0; i <= i1; i++) {
      const p = i * POST_GAP + 40;
      if (p > size - 40) break;
      if (horizontal) {
        ctx.fillStyle = STEEL; ctx.fillRect(p - 2.5, at - FENCE_H - 4, 5, FENCE_H + 6);
        ctx.beginPath(); ctx.rect(p - 2.5, at - FENCE_H - 4, 5, FENCE_H + 6); inkPath(ctx, 1.4);
      } else {
        ctx.fillStyle = STEEL; ctx.fillRect(at - 2.5, p - FENCE_H, 5, FENCE_H);
        ctx.beginPath(); ctx.rect(at - 2.5, p - FENCE_H, 5, FENCE_H); inkPath(ctx, 1.4);
      }
    }
  };
  if (north) run(true, 6, 1);
  if (south) run(true, size - 4, 2);
  if (west) run(false, 6, 3);
  if (east) run(false, size - 6, 4);
}

type PuddleLight = { x: number; y: number; r: number; lx: number; ly: number; d: number };
const puddleCache = new WeakMap<DecorPlan, PuddleLight[]>();

/** Puddles take the glint of the nearest lamp within 320 px: a short bright streak toward it, brighter in the dark. */
function puddleLights(plan: DecorPlan): PuddleLight[] {
  let list = puddleCache.get(plan);
  if (list) return list;
  list = [];
  const lamps = plan.fixtures.filter((f) => ['lamp', 'work', 'window', 'tube', 'boothlamp', 'lanepost', 'uplight', 'exit'].includes(f.kind));
  for (const m of plan.marks) {
    if (m.k !== 'puddle') continue;
    let best: Fixture | null = null, bd = 320;
    for (const f of lamps) { const d = Math.hypot(f.lx - m.x, f.ly - m.y); if (d < bd) { bd = d; best = f; } }
    if (best) list.push({ x: m.x, y: m.y, r: m.r, lx: best.lx, ly: best.ly, d: bd });
  }
  puddleCache.set(plan, list);
  return list;
}

function drawGlints(ctx: CanvasRenderingContext2D, plan: DecorPlan, v: View, st: FxState) {
  const list = puddleLights(plan);
  if (!list.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255, 214, 150, 1)';
  for (const p of list) {
    if (!inView(v, p.x, p.y, 40)) continue;
    const a = Math.atan2(p.ly - p.y, p.lx - p.x), k = 1 - p.d / 320;
    ctx.globalAlpha = (0.12 + 0.3 * k) * (0.6 + 0.4 * st.dark);
    ctx.beginPath();
    ctx.ellipse(p.x + Math.cos(a) * p.r * 0.35, p.y + Math.sin(a) * p.r * 0.3, p.r * 0.46, p.r * 0.16, a * 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Draws the plan's fixtures, mounts, fence and puddle glints that touch `view`. Call after the walls and before the bodies. */
export function drawFixtures(ctx: CanvasRenderingContext2D, plan: DecorPlan, view: View, st: FxState): void {
  ctx.save();
  drawGlints(ctx, plan, view, st);
  drawFence(ctx, plan.size, view);
  for (const lm of plan.landmarks) if (lm.x < view.x1 && lm.x + lm.w > view.x0 && lm.y < view.y1 && lm.y + lm.h > view.y0) ctx.drawImage(landmarkSprite(lm), lm.x, lm.y);
  drawMounts(ctx, plan.mounts, view);
  drawVignettes(ctx, plan.vignettes, view, { now: st.now, dark: st.dark, reduced: st.reduced });
  for (const f of plan.fixtures) {
    // Floor kinds first so wall kinds draw over them is not needed: none overlap (decor.ts keeps 90 px between fixtures).
    if (!inView(view, f.x, f.y, f.kind === 'scoreboard' ? 140 : 110)) continue;
    drawFixture(ctx, f, st);
  }
  // Moths round the lamps nearest the view's middle, at night.
  if (st.dark > 0.4 && !st.reduced) {
    const cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2;
    const lamps = plan.fixtures.filter((f) => f.kind === 'lamp' && inView(view, f.x, f.y, 0)).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, 6);
    drawMoths(ctx, lamps, { now: st.now, dark: st.dark, reduced: st.reduced });
  }
  ctx.restore();
}

/** The 2D night path's lights (ambience.ts) for the same fixtures, so the lamps still pool when the shader pass is off. */
export function decorNightLights(plan: DecorPlan, view: View, st: FxState): Light[] {
  return pickDecorLights(plan, view, st, 12, 0).map(({ spec }) => ({
    x: spec.x, y: spec.y, r: spec.radius * 0.8, warm: spec.color === LAMP_COLOR || spec.color === WINDOW_COLOR, ...(spec.cone && { angle: spec.cone.angle }),
  }));
}
