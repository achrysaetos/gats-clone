import { GUNS, WORLD, type GunId } from '../shared/defs.ts';
import type { InputState, Snapshot } from '../shared/protocol.ts';
import { reloadMsFor } from '../shared/sim/stats.ts';
import { consumePresses, pullTrigger } from '../shared/sim/trigger.ts';

const TICK_MS = 1000 / WORLD.tickHz;
const CONFIRM_SLACK_TICKS = 4;

type Trigger = {
  gun: GunId; mag: number; reloadMs: number; alive: boolean; armed: boolean;
  ammo: number; reloadUntil: number | null; nextFireAt: number; burstLeft: number; pressUntil: number; spray: number; firedAt: number; spin: number; shotsSeen: number;
};
export type TriggerInput = Pick<InputState, 'fire' | 'shots' | 'reload'>;

const FRESH_LIFE = { reloadUntil: null, nextFireAt: -Infinity, burstLeft: 0, pressUntil: -Infinity, spray: 0, firedAt: -Infinity, spin: 0 } as const;
const UNARMED: Trigger = { gun: 'pistol', mag: 0, reloadMs: GUNS.pistol.reloadMs, alive: false, armed: false, ammo: 0, shotsSeen: 0, ...FRESH_LIFE };

/** One tick of `tickPlayer`'s trigger at time `now`: whether the server fires a shot on the input that carries `input`. */
export function stepTrigger(t: Trigger, input: TriggerInput, now: number): { t: Trigger; fired: boolean } {
  const g = { ...t };
  const pressed = consumePresses(g, input.shots);
  if (!g.alive) return { t: g, fired: false };
  const fired = pullTrigger(g, { def: GUNS[g.gun], mag: g.mag, reloadMs: g.reloadMs, armed: g.armed }, { pressed, fire: input.fire, reload: input.reload }, now, TICK_MS);
  return { t: g, fired };
}

export const nextSprayShot = (f: Firing): number => f.trigger.spray + 1;

/** A shot the page drew before the server fired it: the input that fires it and the rounds drawn for it. */
export type PredictedShot = { seq: number; rounds: readonly number[] };

export type Firing = {
  /** The trigger after the newest input sent, and after each input since the one the server last acknowledged. */
  trigger: Trigger;
  history: readonly { seq: number; trigger: Trigger }[];
  /** The newest input sent and the page time it went out, which places a coming shot between inputs. */
  sent: { seq: number; at: number };
  /** A shot drawn before the input that fires it went out. */
  ahead: PredictedShot | null;
  /** Shots drawn and sent that the server has not yet confirmed, oldest first. */
  unconfirmed: readonly PredictedShot[];
  /** How many inputs after the page the server fired its last confirmed shot. */
  lag: number;
};

export const NO_FIRING: Firing = { trigger: UNARMED, history: [], sent: { seq: 0, at: 0 }, ahead: null, unconfirmed: [], lag: 0 };

/**
 * The page time the next input's shot is due, or null when that input fires nothing or its shot is already drawn.
 * A press on a ready gun is due at once; a held trigger, a burst or a press waiting out the cooldown at the moment the gun is ready.
 */
export function dueAt(f: Firing, input: TriggerInput): number | null {
  if (f.ahead) return null;
  const seq = f.sent.seq + 1;
  if (!stepTrigger(f.trigger, input, seq * TICK_MS).fired) return null;
  return f.sent.at + Math.max(0, f.trigger.nextFireAt - f.sent.seq * TICK_MS);
}

/**
 * The input to send so the server fires every shot the page drew: the trigger stays held and a reload waits while a shot
 * is drawn ahead of this input, or while a sent one trailing by `lag` inputs is still owed and holding fires nothing new.
 */
export function committed<I extends TriggerInput>(f: Firing, input: I): I {
  const seq = f.sent.seq + 1;
  const owed = f.unconfirmed.some((p) => p.seq + f.lag + 1 >= seq) && !stepTrigger(f.trigger, { ...input, fire: true }, seq * TICK_MS).fired;
  return f.ahead || owed ? { ...input, fire: true, reload: false } : input;
}

/** Steps the trigger on the input just sent. A shot drawn ahead of it that the trigger refuses is returned to be taken back. */
export function sendInput(f: Firing, seq: number, input: TriggerInput, at: number): { firing: Firing; rejected: PredictedShot | null } {
  const { t, fired } = stepTrigger(f.trigger, input, seq * TICK_MS);
  const firing = { ...f, trigger: t, history: [...f.history, { seq, trigger: t }], sent: { seq, at }, ahead: null };
  if (!f.ahead) return { firing, rejected: null };
  return fired ? { firing: { ...firing, unconfirmed: [...f.unconfirmed, f.ahead] }, rejected: null } : { firing, rejected: f.ahead };
}

/** What the server says of your gun in a snapshot, as of the input it acknowledged. */
export type ServerGun = { gun: GunId; mag: number; reloadMs: number; ammo: number; reloading: boolean; reloadFrac: number; alive: boolean; armed: boolean };

export function serverGun(snap: Snapshot): ServerGun {
  const me = snap.players.find((p) => p.id === snap.self.id);
  const { ammo, mag, reloading, reloadFrac, alive, perks } = snap.self;
  const gun = me?.gun ?? 'pistol';
  return { gun, mag, reloadMs: reloadMsFor(gun, perks), ammo, reloading, reloadFrac, alive: alive && !!me, armed: snap.match.winner === null };
}

function rebase(base: Trigger, sv: ServerGun, late: number, now: number): Trigger {
  if (!sv.alive) return { ...base, alive: false, armed: sv.armed };
  const t: Trigger = { ...base, ...(base.alive ? {} : FRESH_LIFE), alive: true, armed: sv.armed, gun: sv.gun, mag: sv.mag, reloadMs: sv.reloadMs, ammo: Math.max(0, sv.ammo - late) };
  if (base.gun !== sv.gun) { t.burstLeft = 0; t.spray = 0; t.spin = 0; }
  if (sv.reloading !== (t.reloadUntil !== null)) t.reloadUntil = sv.reloading ? now + (1 - sv.reloadFrac) * sv.reloadMs : null;
  return t;
}

/**
 * Takes in a snapshot: its `shots` own shot events confirm the oldest predicted shots, any beyond them are `unmatched`
 * and still need drawing, and a prediction the server has gone `CONFIRM_SLACK_TICKS` ticks past without firing is `rejected`.
 * The trigger is then rebuilt from the server's ammo, reload and life at `ackSeq` and stepped again over the inputs since.
 */
export function settle(f: Firing, sv: ServerGun, ackSeq: number, shots: number, pending: readonly { seq: number; input: TriggerInput }[]):
  { firing: Firing; unmatched: number; rejected: PredictedShot[] } {
  const waiting = f.unconfirmed.slice(shots);
  const confirmed = f.unconfirmed.slice(0, shots).at(-1);
  const lag = confirmed ? Math.min(CONFIRM_SLACK_TICKS - 1, Math.max(0, ackSeq - confirmed.seq)) : f.lag;
  const unmatched = Math.max(0, shots - f.unconfirmed.length);
  const rejected = waiting.filter((p) => p.seq <= ackSeq - CONFIRM_SLACK_TICKS);
  const unconfirmed = waiting.filter((p) => p.seq > ackSeq - CONFIRM_SLACK_TICKS);
  const late = unconfirmed.filter((p) => p.seq <= ackSeq).length;
  const acked = f.history.filter((h) => h.seq <= ackSeq).at(-1);
  let trigger = rebase(acked?.trigger ?? { ...UNARMED, shotsSeen: f.trigger.shotsSeen }, sv, late, ackSeq * TICK_MS);
  const history = [{ seq: ackSeq, trigger }];
  for (const p of pending) {
    if (p.seq <= ackSeq) continue;
    trigger = stepTrigger(trigger, p.input, p.seq * TICK_MS).t;
    history.push({ seq: p.seq, trigger });
  }
  return { firing: { ...f, trigger, history, unconfirmed, lag }, unmatched, rejected };
}
