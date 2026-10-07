/**
 * The vehicle kit's front door (docs/maps/VEHICLES.md). Every large vehicle in the game is a toy model (vehicle*.ts) rendered
 * once by vehiclemesh.ts into a cached canvas per kind, livery, variant, rotation and scale, then drawn with one drawImage a
 * frame. Props and rotors are the only live parts: a blurred disc, its tip ring and a few blade flicks, all slow; beacons
 * blink no faster than once a second.
 */
import { bake, bakeRaw, PX_PER_M, TILT, toCanvas, type Baked, type Model, type Spinner } from './vehiclemesh.ts';
import { modelOf, VEHICLE_KINDS, type VehicleKind } from './vehiclemodels.ts';
import type { BakeJob } from './vehicleworker.ts';
import type { MapPoly } from '../shared/geom.ts';
import { claimShadows } from './vehicleshadow.ts';

export { VEHICLE_KINDS, type VehicleKind };
export type VehicleOpts = {
  x: number; y: number; rot?: number; scale?: number; livery?: string; variant?: string; t?: number; lod?: number;
  /** The map polygons this vehicle stands on: their generic drop shadow is skipped, since the model casts its own. */
  polys?: readonly MapPoly[];
};

/** Under prefers-reduced-motion props and rotors hold still and beacons stay lit. */
const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();

/** Sprite px per world px: crisp on a high-density screen, smaller for the very big pieces so a bake stays a few MB. */
function resFor(m: Model, scale: number, lod: number): number {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  let r = Math.min(1.5, Math.max(1, dpr * 0.9)) * lod;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < m.pos.length; i += 3) { x0 = Math.min(x0, m.pos[i]!); x1 = Math.max(x1, m.pos[i]!); y0 = Math.min(y0, m.pos[i + 1]!); y1 = Math.max(y1, m.pos[i + 1]!); }
  const span = Math.max(x1 - x0, y1 - y0) * PX_PER_M * scale * 1.2;
  const area = span * span;
  if (area * r * r > 4.5e6) r = Math.sqrt(4.5e6 / area);
  return Math.max(0.25, r);
}

/* -- the bake queue: a worker when the page has one, the main thread otherwise ------------------------------------------ */

type Slot = { full?: Baked; preview?: Baked; asked: boolean; seen: number };
const sprites = new Map<string, Slot>();
type Job = BakeJob & { key: string; preview: boolean };
const queue: Job[] = [];
const inflight = new Map<number, Job>();
type Lane = { w: Worker; busy: boolean };
let lanes: Lane[] | null | undefined;
let nextId = 1;

/** Up to three bake workers (one fewer than the cores), or none: then the page bakes on its own thread. */
function lanesOf(): Lane[] | null {
  if (lanes !== undefined) return lanes;
  try {
    const n = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
    lanes = Array.from({ length: n }, () => {
      const lane: Lane = { w: new Worker(new URL('./vehicles.js', import.meta.url), { type: 'module' }), busy: false };
      lane.w.onmessage = (e: MessageEvent<{ id: number; w: number; h: number; ox: number; oy: number; res: number; ms: number; px: Uint8ClampedArray; error?: string }>) => {
        const d = e.data, job = inflight.get(d.id);
        inflight.delete(d.id);
        lane.busy = false;
        if (job) settle(job, d.error ? bake(modelOf(job.kind, job.livery, job.variant), job) : toCanvas(d));
        pump();
      };
      lane.w.onerror = () => { lanes = null; for (const j of inflight.values()) queue.unshift(j); inflight.clear(); pump(); };
      return lane;
    });
  } catch { lanes = null; }
  return lanes;
}

function settle(job: Job, b: Baked) {
  const slot = sprites.get(job.key);
  if (!slot) return;
  if (job.preview) slot.preview = b; else slot.full = b;
}

function pump() {
  const ls = lanesOf();
  while (queue.length) {
    const lane = ls?.find((l) => !l.busy);
    if (ls && !lane) return;
    // Previews first, so every vehicle shows up soon; then the full bakes, the one most recently on screen first.
    let i = queue.findIndex((j) => j.preview);
    if (i < 0) { i = 0; for (let k = 1; k < queue.length; k++) if ((sprites.get(queue[k]!.key)?.seen ?? 0) > (sprites.get(queue[i]!.key)?.seen ?? 0)) i = k; }
    const job = queue.splice(i, 1)[0]!;
    if (lane) { lane.busy = true; inflight.set(job.id, job); lane.w.postMessage(job satisfies BakeJob); continue; }
    settle(job, toCanvas(bakeRaw(modelOf(job.kind, job.livery, job.variant), job)));
  }
}

const keyOf = (kind: VehicleKind, o: VehicleOpts) => {
  const q = Math.round((((o.rot ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * (180 / Math.PI) * 2) / 2;
  return { q, key: `${kind}|${o.livery ?? ''}|${o.variant ?? ''}|${q}|${o.scale ?? 1}|${o.lod ?? 1}` };
};

/** Asks for a vehicle's sprite (several can be asked for at once, before they are seen). */
export function prewarmVehicle(kind: VehicleKind, o: VehicleOpts): void { void vehicleSprite(kind, o); }

/** The vehicle's sprite if it is baked (or its quick preview while the full bake runs); null until the first arrives. */
export function vehicleSprite(kind: VehicleKind, o: VehicleOpts, sync = false): Baked | null {
  const { q, key } = keyOf(kind, o);
  let slot = sprites.get(key);
  if (!slot) sprites.set(key, (slot = { asked: false, seen: 0 }));
  if (sync && !slot.full) {
    const m = modelOf(kind, o.livery, o.variant);
    slot.full = bake(m, { rot: (q * Math.PI) / 180, scale: o.scale ?? 1, res: resFor(m, o.scale ?? 1, o.lod ?? 1) });
    slot.asked = true;
  }
  if (!slot.asked) {
    slot.asked = true;
    const m = modelOf(kind, o.livery, o.variant);
    const res = resFor(m, o.scale ?? 1, o.lod ?? 1);
    const base = { kind, livery: o.livery ?? '', variant: o.variant ?? '', rot: (q * Math.PI) / 180, scale: o.scale ?? 1, key };
    if (lanesOf()) queue.push({ ...base, id: nextId++, res: Math.min(res, 0.4), ss: 1, preview: true });
    queue.push({ ...base, id: nextId++, res, ss: 2, preview: false });
    pump();
  }
  return slot.full ?? slot.preview ?? null;
}

/** Projects a model point (metres) to world px for a vehicle at `o`. */
function vehiclePoint(m: Model, o: VehicleOpts, p: readonly [number, number, number]): { x: number; y: number } {
  const rot = o.rot ?? 0, s = (o.scale ?? 1) * PX_PER_M;
  const c = Math.cos(rot), sn = Math.sin(rot);
  return { x: o.x + (p[0] * c - p[1] * sn) * s, y: o.y + (p[0] * sn + p[1] * c - (p[2] - m.top) * TILT) * s };
}

/** The vehicle body, under the players: one cached sprite, then its spinning props and its lamps. */
export function drawVehicle(ctx: CanvasRenderingContext2D, kind: VehicleKind, o: VehicleOpts): boolean {
  const b = vehicleSprite(kind, o);
  if (b && o.polys) claimShadows(o.polys);
  const slot = sprites.get(keyOf(kind, o).key);
  if (slot) slot.seen = performance.now();
  if (!b) return false;
  const c = b.canvas as CanvasImageSource & { width: number; height: number };
  ctx.drawImage(c, o.x + b.ox, o.y + b.oy, c.width / b.res, c.height / b.res);
  const m = modelOf(kind, o.livery, o.variant);
  for (const s of m.spinners) if (!s.over) spinner(ctx, m, o, s);
  lamps(ctx, m, o);
  return true;
}

/** What hangs over the players: the helicopter's main rotor. */
export function drawVehicleOver(ctx: CanvasRenderingContext2D, kind: VehicleKind, o: VehicleOpts): void {
  const m = modelOf(kind, o.livery, o.variant);
  for (const s of m.spinners) if (s.over) spinner(ctx, m, o, s);
}

/** Practical lights in world px, for the lighting pass. */
export function vehicleLights(kind: VehicleKind, o: VehicleOpts & { id?: string }): { key: string; x: number; y: number; color: string; radius: number; intensity: number; size: number }[] {
  const m = modelOf(kind, o.livery, o.variant);
  const t = o.t ?? 0;
  return m.lights.filter((l) => !l.blinkMs || lampOn(l.blinkMs, l.phase ?? 0, t)).map((l) => {
    const p = vehiclePoint(m, o, l.at);
    return { key: `veh:${o.id ?? `${kind}@${Math.round(o.x)},${Math.round(o.y)}`}:${l.key}`, x: p.x, y: p.y, color: l.color, radius: l.radius * (o.scale ?? 1), intensity: l.intensity, size: l.size ?? 4 };
  });
}

const lampOn = (period: number, phase: number, t: number) => calm || ((t / period + phase) % 1 + 1) % 1 < 0.18;

function lamps(ctx: CanvasRenderingContext2D, m: Model, o: VehicleOpts) {
  const t = o.t ?? 0;
  for (const l of m.lights) {
    if (!l.blinkMs) continue;
    if (!lampOn(l.blinkMs, l.phase ?? 0, t)) continue;
    const p = vehiclePoint(m, o, l.at);
    const r = 22 * (o.scale ?? 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
    g.addColorStop(0, 'rgba(255,240,230,0.9)'); g.addColorStop(0.25, hexA(l.color, 0.55)); g.addColorStop(1, hexA(l.color, 0));
    ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    ctx.restore();
  }
}

const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

/**
 * A prop or rotor: the disc it sweeps (a translucent ellipse: the projection of a circle in the plane across its axis), the
 * painted tip ring, and two or three blade flicks that turn slowly (the eye reads speed from the blur, not the flicks).
 */
function spinner(ctx: CanvasRenderingContext2D, m: Model, o: VehicleOpts, s: Spinner) {
  const t = calm ? 0.3 : (o.t ?? 0) / 1000;
  const rot = o.rot ?? 0, sc = (o.scale ?? 1) * PX_PER_M;
  const c = Math.cos(rot), sn = Math.sin(rot);
  // Two unit vectors spanning the disc's plane, in model space, then projected to world px.
  const [ax, ay, az] = s.axis;
  const u0: [number, number, number] = Math.abs(az) > 0.9 ? [1, 0, 0] : [-ay, ax, 0];
  const ul = Math.hypot(...u0); const u: [number, number, number] = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: [number, number, number] = [ay * u[2] - az * u[1], az * u[0] - ax * u[2], ax * u[1] - ay * u[0]];
  const proj = (p: [number, number, number]) => ({ x: (p[0] * c - p[1] * sn) * sc, y: (p[0] * sn + p[1] * c - p[2] * TILT) * sc });
  const U = proj(u), V0 = proj(v), Ax = proj([ax, ay, az]);
  // A disc seen edge-on is cheated open a little along its axis, so a prop still reads as a spinning disc from above.
  const V = { x: V0.x + Ax.x * 0.22, y: V0.y + Ax.y * 0.22 };
  const h = vehiclePoint(m, o, s.at);
  ctx.save();
  ctx.transform(U.x, U.y, V.x, V.y, h.x, h.y);
  const r = s.r, px = 1 / sc;
  // The blurred disc, faint, and the painted tip path as a thin ring.
  ctx.fillStyle = s.over ? 'rgba(24,28,36,0.08)' : 'rgba(24,28,36,0.16)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5 * px;
  ctx.strokeStyle = s.over ? 'rgba(217,178,74,0.38)' : 'rgba(217,178,74,0.5)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, Math.PI * 2); ctx.stroke();
  // The blades: a soft smear trailing each one, then the blade itself, slow enough to read (pattern well under 4 Hz).
  const turn = (t * Math.min(s.rps, 3.5 / s.blades)) * Math.PI * 2;
  const chord = Math.max(0.12, r * 0.045);
  for (let i = 0; i < s.blades; i++) {
    const a = turn + (i / s.blades) * Math.PI * 2;
    ctx.fillStyle = s.over ? 'rgba(28,31,38,0.1)' : 'rgba(28,31,38,0.16)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a - 0.55, a); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = s.over ? 'rgba(30,34,42,0.42)' : 'rgba(30,34,42,0.55)';
    ctx.beginPath(); ctx.moveTo(r * 0.06, -chord * 0.7); ctx.lineTo(r, -chord * 0.5); ctx.lineTo(r, chord * 0.5); ctx.lineTo(r * 0.06, chord * 0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = s.over ? 'rgba(217,178,74,0.55)' : 'rgba(217,178,74,0.7)';
    ctx.fillRect(r * 0.9, -chord * 0.5, r * 0.1, chord);
    ctx.restore();
  }
  ctx.restore();
}
