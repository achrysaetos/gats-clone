import type { Team, ZoneView } from '../shared/protocol.ts';
import { zoneRate } from '../shared/zonerate.ts';
import { mixHex } from './blastdraw.ts';
import { addLight, setLight } from './lighting.ts';
import { INK, NIGHT, PALETTE, TEAM_COLORS } from './palette.ts';

/**
 * Domination zones in the world, drawn so a glance from across the screen says who holds a point, who is taking it and how
 * fast (docs/art/STYLE.md, "readable at a glance"):
 *
 * - a flag pole at the centre whose flag climbs as a capture fills and comes down as an owned point is turned neutral, in the
 *   colour of whoever it belongs to (pale when nobody does), flying at the top of a held point and waving until the point is
 *   contested, when it hangs still;
 * - a disc of the capturing team's colour that grows from the centre with the capture and shrinks as it drains, inside a ring
 *   in the owner's colour;
 * - chevrons running round the ring, one per soldier on the point (up to four), faster the more of them there are;
 * - hazard stripes of both colours flashing round the ring while both teams stand on it;
 * - a ring pulse, confetti and a puff of smoke when a point changes hands.
 *
 * The floor half (`drawZoneFloor`) goes under the night and the lighting pass, lit by the point's own lamp; the standing half
 * (`drawZoneOverlay`) goes over it, so the flag, the leading edge of the capture and the chevrons stay readable in the dark.
 */

const TAU = Math.PI * 2;
/** How tall the flag pole stands, up-screen, and the flag's size, in world px. */
const POLE = 132;
const CLOTH = { w: 74, h: 48 } as const;
/** Pale cloth for a point nobody holds: a surrender white, not a team. */
const NEUTRAL_CLOTH = '#e9e4d6';
const RING_INSET = 14;
const BURST_MS = 1100;
/** Chevrons on the ring for the soldiers on the point; past four the rate is capped, so the count is too. */
const MAX_CHEVRONS = 4;

export const zoneLetter = (index: number): string => String.fromCharCode(65 + index);

/** Whose flag flies and how high (0 at the foot, 1 at the top): an owned point's comes down as it is neutralised, a free point's goes up as it is taken. */
export function flagOf(z: Pick<ZoneView, 'owner' | 'capturing' | 'progress'>): { team: Team; height: number } {
  const p = Math.max(0, Math.min(1, z.progress));
  if (z.owner) return { team: z.owner, height: z.capturing && z.capturing !== z.owner ? 1 - p : 1 };
  return z.capturing ? { team: z.capturing, height: p } : { team: null, height: 0 };
}

/** Which way a point is moving: +1 filling (taking or neutralising), -1 draining, 0 still. `rate` is how many times the lone rate. */
export function motionOf(z: Pick<ZoneView, 'owner' | 'capturing' | 'progress' | 'crew' | 'contested'>, prevProgress: number | null): { dir: -1 | 0 | 1; rate: number } {
  if (z.contested || !z.capturing) return { dir: 0, rate: 0 };
  const rate = zoneRate(z.crew ?? 0);
  if (prevProgress !== null && Math.abs(z.progress - prevProgress) > 1e-6) return { dir: z.progress > prevProgress ? 1 : -1, rate };
  return { dir: z.crew ? 1 : z.progress > 0 ? -1 : 0, rate };
}

type Bit = { x: number; y: number; vx: number; vy: number; spin: number; color: string; size: number };
type Fx = {
  x: number; y: number;
  /** What the last snapshot said, to see a change of hands and which way the capture moves. */
  owner: Team; capturing: Team; progress: number;
  /** The drawn disc and flag, eased toward the snapshot so the 20 Hz steps read as a smooth climb. */
  disc: number; discTeam: Team; flag: number; flagTeam: Team;
  dir: -1 | 0 | 1;
  /** The chevrons' phase round the ring, advanced by the rate so more soldiers visibly spin them faster. */
  spin: number;
  wave: number;
  burst: { at: number; team: Team; taken: boolean; bits: Bit[] } | null;
  at: number;
};
const fxs = new Map<number, Fx>();

const ease = (from: number, to: number, dt: number, ms: number) => to + (from - to) * Math.exp(-dt / ms);

function burstBits(x: number, y: number, team: Team, n: number): Bit[] {
  const color = team ? TEAM_COLORS[team] : NEUTRAL_CLOTH;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + Math.sin(i * 7.31) * 0.4, v = 140 + 120 * Math.abs(Math.sin(i * 3.7));
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, spin: Math.sin(i * 1.9) * 9, color: i % 3 === 2 ? '#fff4d6' : color, size: 5 + (i % 4) };
  });
}

/** Steps this zone's drawn state to `now`; called once a frame from the floor pass, which the overlay then reads. */
function step(z: ZoneView, now: number, reduced: boolean): Fx {
  let f = fxs.get(z.id);
  const flag = flagOf(z);
  if (!f || f.x !== z.x || f.y !== z.y || now < f.at) {
    // A new map (or the first sight of this one): no burst for what already stood.
    f = { x: z.x, y: z.y, owner: z.owner, capturing: z.capturing, progress: z.progress, disc: z.capturing ? z.progress : 0, discTeam: z.capturing, flag: flag.height, flagTeam: flag.team, dir: 0, spin: 0, wave: 0, burst: null, at: now };
    fxs.set(z.id, f);
  }
  const dt = Math.min(100, now - f.at);
  f.at = now;
  const changed = z.owner !== f.owner;
  if (changed) {
    const taken = z.owner !== null;
    const team = taken ? z.owner : f.capturing ?? z.capturing;
    f.burst = { at: now, team, taken, bits: reduced ? [] : burstBits(z.x, z.y - POLE, team, taken ? 34 : 16) };
    // The disc starts over from nothing, and the flag changes colour where it stands (top for a capture, foot for a neutralise).
    f.disc = 0;
    f.flag = flag.height;
    if (taken) addLight({ x: z.x, y: z.y, radius: z.r * 2.2, color: TEAM_COLORS[z.owner!], intensity: 1.2, life: 650, size: 30, shadows: false });
  }
  if (z.progress !== f.progress || z.capturing !== f.capturing || changed) f.dir = motionOf(z, changed ? null : f.progress).dir;
  if (z.contested) f.dir = 0;
  f.owner = z.owner;
  f.capturing = z.capturing;
  f.progress = z.progress;
  if (z.capturing) f.discTeam = z.capturing;
  f.disc = ease(f.disc, z.capturing ? Math.max(0, Math.min(1, z.progress)) : 0, dt, 90);
  if (f.flagTeam !== flag.team && !changed) f.flag = flag.team === null ? 0 : f.flag;
  f.flagTeam = flag.team;
  f.flag = ease(f.flag, flag.height, dt, 110);
  const rate = z.contested ? 0 : z.crew ? zoneRate(z.crew) : z.capturing ? 1 : 0;
  if (!reduced) {
    f.spin += (dt / 1000) * rate * 1.1 * (f.dir || 1);
    if (!z.contested) f.wave += (dt / 1000) * (5 + 2.5 * rate);
  }
  if (f.burst && now - f.burst.at > BURST_MS) f.burst = null;
  return f;
}

const other = (t: Exclude<Team, null>): Exclude<Team, null> => (t === 'red' ? 'blue' : 'red');
const clothColor = (team: Team) => (team ? TEAM_COLORS[team] : NEUTRAL_CLOTH);

/** The zone's floor: its owner's tint, the capture disc, the ring and the plinth, all lit (and darkened) with the world. Feeds the point's lamp. */
export function drawZoneFloor(ctx: CanvasRenderingContext2D, z: ZoneView, now: number, dark: number, reduced: boolean) {
  const f = step(z, now, reduced);
  const owner = z.owner ? TEAM_COLORS[z.owner] : PALETTE.neutral;
  ctx.save();
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.fillStyle = owner;
  ctx.globalAlpha = z.owner ? 0.16 : 0.08;
  ctx.fill();
  // The capture disc, grown by area so 50% looks like half the ground.
  if (f.disc > 0.004 && f.discTeam) {
    const rr = (z.r - RING_INSET) * Math.sqrt(f.disc);
    ctx.beginPath();
    ctx.arc(z.x, z.y, rr, 0, TAU);
    ctx.fillStyle = TEAM_COLORS[f.discTeam];
    ctx.globalAlpha = 0.36;
    ctx.fill();
  }
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 6;
  ctx.strokeStyle = owner;
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([3, 18]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r - RING_INSET, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // The plinth the pole stands in.
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(z.x + 6, z.y + 4, 26, 14, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a4d55';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(z.x - 20, z.y - 12, 40, 22, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // The point's lamp: its holder's colour (or the taker's while it moves), so the ground round a flag reads at night.
  const lampTeam = z.capturing && f.disc > 0.05 ? z.capturing : z.owner;
  const pulse = z.contested ? 0.5 + 0.5 * Math.sin(now / 90) : z.capturing ? 0.5 + 0.5 * Math.sin(now / 260) : 0.5;
  setLight(`zone:${z.id}`, {
    x: z.x, y: z.y - 40, radius: z.r * 1.45, color: lampTeam ? mixHex(TEAM_COLORS[lampTeam], '#ffffff', 0.35) : '#dfe6f2',
    intensity: (0.38 + 0.12 * pulse + (lampTeam ? 0.12 : 0)) * (0.4 + 0.6 * dark), size: 16, inside: 40, flicker: 0.03, priority: 8,
  });
}

/** Chevrons pointing along the ring the way the capture runs. */
function chevrons(ctx: CanvasRenderingContext2D, z: ZoneView, f: Fx, color: string, n: number) {
  const rr = z.r - RING_INSET;
  for (let i = 0; i < n; i++) {
    const a = f.spin + (i / n) * TAU;
    const x = z.x + Math.cos(a) * rr, y = z.y + Math.sin(a) * rr;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (f.dir < 0 ? -Math.PI / 2 : Math.PI / 2));
    // A bold double chevron (»), filled bright over an ink rim so it carries on a dark floor.
    ctx.beginPath();
    for (const dx of [-9, 7]) {
      ctx.moveTo(dx - 9, -14);
      ctx.lineTo(dx + 9, 0);
      ctx.lineTo(dx - 9, 14);
      ctx.lineTo(dx - 3, 0);
      ctx.closePath();
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
}

function hazardRing(ctx: CanvasRenderingContext2D, z: ZoneView, now: number, reduced: boolean) {
  const n = 24, seg = TAU / n, turn = reduced ? 0 : now / 2400;
  const flash = reduced ? 1 : 0.65 + 0.35 * Math.sign(Math.sin(now / 160));
  ctx.lineCap = 'butt';
  ctx.lineWidth = 14;
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.globalAlpha = flash;
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = i % 2 ? TEAM_COLORS.red : TEAM_COLORS.blue;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, turn + i * seg, turn + (i + 0.82) * seg);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The flag: a pole with a ball finial, the cloth at its height with the zone's letter, waving unless the point is contested. */
function drawFlag(ctx: CanvasRenderingContext2D, z: ZoneView, f: Fx, index: number, dark: number, reduced: boolean) {
  const top = z.y - POLE, foot = z.y - 4;
  const team = f.flagTeam;
  // The cloth's top edge rides from just over the plinth up to the finial.
  const lowest = foot - CLOTH.h - 6, highest = top + 8;
  const cy = lowest + (highest - lowest) * Math.max(0, Math.min(1, f.flag));
  const face = mixHex(clothColor(team), NIGHT.shade, 0.18 * dark);
  ctx.save();
  // The pole's shadow on the floor, then the pole.
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(z.x + 2, z.y);
  ctx.lineTo(z.x + 30, z.y + 26);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(z.x, foot);
  ctx.lineTo(z.x, top);
  ctx.stroke();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#c9ccd3';
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.moveTo(z.x - 1, foot - 2);
  ctx.lineTo(z.x - 1, top + 2);
  ctx.stroke();
  // The cloth: a waving sheet built from a few strips, its far edge rippling most.
  const still = z.contested || reduced;
  const strips = 8, w = CLOTH.w, h = CLOTH.h;
  const wob = (t: number) => (still ? t * t * 6 : Math.sin(f.wave - t * 3.2) * 7 * t);
  const sag = (t: number) => (still ? t * 10 : Math.cos(f.wave * 0.8 - t * 2.4) * 2.5 * t);
  ctx.beginPath();
  ctx.moveTo(z.x + 2, cy);
  for (let i = 1; i <= strips; i++) { const t = i / strips; ctx.lineTo(z.x + 2 + t * w, cy + wob(t) + sag(t)); }
  for (let i = strips; i >= 0; i--) { const t = i / strips; ctx.lineTo(z.x + 2 + t * w, cy + h + wob(t) + sag(t) * 0.4); }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = face;
  ctx.fill();
  // A lit top band and a shaded lower one give the cloth body.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillRect(z.x, cy - 12, w + 6, h * 0.28 + 12);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(z.x, cy + h * 0.72, w + 6, h * 0.5 + 16);
  ctx.restore();
  ctx.font = '900 34px "Barlow Condensed", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lx = z.x + 2 + w * 0.46, ly = cy + h / 2 + wob(0.46) + sag(0.46) * 0.7 + 1;
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.strokeText(zoneLetter(index), lx, ly);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(zoneLetter(index), lx, ly);
  // The finial.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(z.x, top - 3, 8.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd46a';
  ctx.beginPath();
  ctx.arc(z.x, top - 3, 5.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** The rate badge beside the finial (×1.5, ×2, ×2.5) once more than one soldier works the point. */
function rateBadge(ctx: CanvasRenderingContext2D, z: ZoneView, team: Exclude<Team, null>, rate: number) {
  const label = `×${rate % 1 ? rate.toFixed(1) : rate}`;
  ctx.font = '900 26px "Barlow Condensed", system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  const x = z.x - 16 - tw / 2 - 10, y = z.y - POLE + 6;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - 9, y - 16, tw + 18, 32, 9);
  ctx.fill();
  ctx.fillStyle = TEAM_COLORS[team];
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - 6, y - 13, tw + 12, 26, 7);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

function drawBurst(ctx: CanvasRenderingContext2D, z: ZoneView, f: Fx, now: number) {
  const b = f.burst;
  if (!b) return;
  const t = (now - b.at) / BURST_MS;
  if (t < 0 || t >= 1) return;
  const color = b.team ? TEAM_COLORS[b.team] : NEUTRAL_CLOTH;
  ctx.save();
  // The ring pulse: a fat band thrown out from the ring, a second thinner one just behind.
  for (const [lag, width] of [[0, 18], [0.14, 8]] as const) {
    const k = Math.max(0, Math.min(1, (t - lag) / 0.6));
    if (k <= 0 || k >= 1) continue;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.lineWidth = width * (1 - k * 0.6);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r * (1 + 0.45 * Math.sqrt(k)), 0, TAU);
    ctx.stroke();
  }
  // A puff of smoke round the plinth.
  if (t < 0.8) {
    ctx.fillStyle = '#c9c4b8';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, d = 20 + 70 * t;
      ctx.globalAlpha = 0.32 * (1 - t / 0.8);
      ctx.beginPath();
      ctx.arc(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d * 0.6 - 8, 16 + 20 * t, 0, TAU);
      ctx.fill();
    }
  }
  // Confetti from the finial, falling under gravity and tumbling.
  const s = (now - b.at) / 1000;
  for (const bit of b.bits) {
    const x = bit.x + bit.vx * s, y = bit.y + bit.vy * s + 0.5 * 520 * s * s;
    ctx.globalAlpha = Math.min(1, 2.2 * (1 - t));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bit.spin * s);
    ctx.fillStyle = INK;
    ctx.fillRect(-bit.size / 2 - 1.5, -bit.size / 4 - 1.5, bit.size + 3, bit.size / 2 + 3);
    ctx.fillStyle = bit.color;
    ctx.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2);
    ctx.restore();
  }
  ctx.restore();
}

/** The standing half, over the night: the capture's bright leading edge, the chevrons, the contested stripes, the flag, the burst. */
export function drawZoneOverlay(ctx: CanvasRenderingContext2D, z: ZoneView, index: number, now: number, dark: number, reduced: boolean) {
  const f = fxs.get(z.id);
  if (!f) return;
  ctx.save();
  // The owner's ring again, thin and bright, so a held point's colour carries in the dark.
  ctx.globalAlpha = 0.35 + 0.4 * dark;
  ctx.lineWidth = 3;
  ctx.strokeStyle = z.owner ? mixHex(TEAM_COLORS[z.owner], '#ffffff', 0.25) : '#c7ccd6';
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.stroke();
  // The capture's leading edge: where the disc has reached, in the taker's colour over an ink line.
  if (f.disc > 0.004 && f.discTeam) {
    const rr = (z.r - RING_INSET) * Math.sqrt(f.disc);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(z.x, z.y, rr, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = mixHex(TEAM_COLORS[f.discTeam], '#ffffff', 0.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (z.contested) hazardRing(ctx, z, now, reduced);
  else if (z.capturing && f.dir !== 0) {
    // Taking or neutralising: the takers' chevrons, one per soldier; a drain is the defenders' (or, on an empty point, one pale one) running back.
    const crewTeam: Team = z.crew ? (f.dir > 0 ? z.capturing : other(z.capturing)) : null;
    chevrons(ctx, z, f, crewTeam ? mixHex(TEAM_COLORS[crewTeam], '#ffffff', 0.3) : '#c7ccd6', z.crew ? Math.min(MAX_CHEVRONS, z.crew) : 1);
  }
  drawFlag(ctx, z, f, index, dark, reduced);
  if (!z.contested && z.crew && z.crew > 1 && z.capturing) {
    rateBadge(ctx, z, f.dir < 0 ? other(z.capturing) : z.capturing, zoneRate(z.crew));
  }
  drawBurst(ctx, z, f, now);
  ctx.restore();
}

let forced: Partial<ZoneView>[] | null = null;
/** Dev-only (`?dev`, via `skirmishDev.forceZones`): overlay states on the snapshot's zones (matched by `id`, or by order) so each look can be captured on demand. */
export const forceZones = (zs: Partial<ZoneView>[] | null): void => { forced = zs; };
/** The zones to draw: the snapshot's, with any forced states laid over them. */
export function zonesOf(zs: readonly ZoneView[]): ZoneView[] {
  if (!forced) return zs as ZoneView[];
  return zs.map((z, i) => {
    const f = forced!.find((o) => o.id === z.id) ?? (forced!.every((o) => o.id === undefined) ? forced![i] : undefined);
    if (!f) return z;
    const { crew, contested, ...rest } = { ...z, ...f };
    return { ...rest, ...(crew ? { crew } : {}), ...(contested ? { contested: true as const } : {}) };
  });
}

/** Tests: forget every zone's drawn state. */
export const __test = { reset: () => fxs.clear(), fx: (id: number) => fxs.get(id) };
