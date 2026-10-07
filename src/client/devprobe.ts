import { WORLD, type GunId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import type { AudioStats } from './audio.ts';
import { worldToScreen, type Camera } from './camera.ts';
import { kicks } from './effects.ts';
import { NUMBER_MS, numberHeight } from './feedback.ts';
import { drawnBuildChips, drawnPanels, drawnReticleGap } from './hud.ts';
import { newestSnap, serverNow } from './interp.ts';
import { CALLOUT_MS } from './moments.ts';
import { spectateLines, trackerLabel } from './royale.ts';
import { drawnTags, shadowBakes } from './render.ts';
import type { SoundCue } from './sfx.ts';
import { CORE_ALERT_MS } from './siege.ts';
import { muzzleTip } from './sprites.ts';
import { EFFECT_LIFE_MS, type Session } from './state.ts';
import { useHint, type Ghost } from './zombies.ts';

const DEV = new URLSearchParams(location.search).has('dev');

type DrawnRound = { id: number; owner: number; own: boolean; gun: GunId | null; x: number; y: number; muzzle: { x: number; y: number } | null };
type FeelCue = 'round' | 'flash' | 'kick' | 'sound' | 'reject' | 'late';

const FRAME_COST_CAP = 4000;
const frameCosts: number[] = [];
let drawnSelf = { x: 0, y: 0, at: 0, correction: 0 };
let drawnOthers: { id: number; x: number; y: number; screen: { x: number; y: number } }[] = [];
const seenRounds = new Set<number>();
const firstRounds: DrawnRound[] = [];
const fireFeel: { cue: FeelCue; at: number }[] = [];
const feltFlashes = new Set<number>();
const feltKicks = new Set<number>();

const feel = (cue: FeelCue) => { if (DEV) fireFeel.push({ cue, at: performance.now() }); };
export const noteOwnShotSound = (cues: readonly SoundCue[]) => { if (cues.some((c) => c.self && c.id.startsWith('shot:'))) feel('sound'); };
export const noteLateShot = () => feel('late');
export const noteRejectedShot = () => feel('reject');

export function noteFrameCost(ms: number) {
  if (frameCosts.length < FRAME_COST_CAP) frameCosts.push(ms);
}

export function noteFrame(s: Session, snap: Snapshot, cam: Camera, selfAngle: number | null, now: number) {
  if (!DEV) return;
  drawnSelf = { ...s.lastSelf, at: now, correction: Math.hypot(s.predict.smoothingCorrection.x, s.predict.smoothingCorrection.y) };
  drawnOthers = snap.players.filter((p) => p.id !== s.myId).map((p) => ({ id: p.id, x: p.x, y: p.y, screen: worldToScreen(cam, p) }));
  noteFirstRounds(snap, s.myId, selfAngle);
  noteOwnFlashesAndKicks(s, now);
}

function noteFirstRounds(snap: Snapshot, myId: number, selfAngle: number | null) {
  if (seenRounds.size > 5000) seenRounds.clear();
  for (const b of snap.bullets) {
    if (seenRounds.has(b.id)) continue;
    seenRounds.add(b.id);
    const p = snap.players.find((q) => q.id === b.owner && q.alive);
    const angle = p && (p.id === myId && selfAngle !== null ? selfAngle : p.angle);
    if (b.owner === myId && b.gun !== null) feel('round');
    firstRounds.push({ id: b.id, owner: b.owner, own: b.owner === myId, gun: b.gun, x: b.x, y: b.y, muzzle: p && angle !== undefined ? muzzleTip(p.x, p.y, angle, p.gun, WORLD.playerRadius) : null });
  }
}

function noteOwnFlashesAndKicks(s: Session, now: number) {
  const kick = kicks(s.effects, now).get(s.myId);
  if (kick !== undefined && !feltKicks.has(kick)) {
    feltKicks.add(kick);
    feel('kick');
  }
  for (const fx of s.effects) {
    if (fx.kind !== 'flash' || fx.owner !== s.myId || feltFlashes.has(fx.born)) continue;
    if (now - fx.born >= EFFECT_LIFE_MS.flash) continue;
    feltFlashes.add(fx.born);
    feel('flash');
  }
}

type Page = {
  ctx: CanvasRenderingContext2D;
  drawFrame: (now: number) => void;
  session: () => Session | null;
  camera: () => Camera | null;
  ghost: () => Ghost | null;
  audio: () => AudioStats;
};

export function installDevProbe(page: Page) {
  if (!DEV) return;
  const liveNumbers = () => {
    const s = page.session();
    const now = performance.now();
    return s ? s.feedback.numbers.filter((n) => now - n.born < NUMBER_MS).map((n) => ({ victim: n.victim, amount: n.amount, height: numberHeight(n, now) })) : [];
  };
  const zombies = () => {
    const s = page.session();
    const now = performance.now();
    const snap = s && newestSnap(s.snaps);
    return s && {
      building: s.building, buildKind: s.buildKind, chips: drawnBuildChips(), use: snap && useHint(snap, s.lastSelf), ghost: page.ghost(), coreAlert: now - s.coreHitAt < CORE_ALERT_MS,
      callouts: s.moments.callouts.filter((c) => c.born <= now && now - c.born < CALLOUT_MS).map((c) => `${c.title} · ${c.line}`),
    };
  };
  const royale = () => {
    const s = page.session();
    const snap = s && newestSnap(s.snaps);
    const at = s && serverNow(s.snaps, performance.now());
    if (!snap?.royale || at === null || at === undefined) return null;
    return { spectate: spectateLines(snap, snap.royale, at), tracker: snap.royale.squads.map((sq) => ({ team: sq.team, label: trackerLabel(sq, at) })) };
  };
  const benchFrames = (n: number): number[] => {
    const now = performance.now();
    return Array.from({ length: n }, () => {
      const start = performance.now();
      page.drawFrame(now);
      // Reading a pixel makes the canvas finish rasterizing, so the cost covers the pixels, not just issuing commands.
      page.ctx.getImageData(0, 0, 1, 1);
      return performance.now() - start;
    });
  };
  const trigger = () => {
    const t = page.session()?.firing.trigger;
    return t && { gun: t.gun, spray: t.spray, spin: t.spin, reticleGap: drawnReticleGap() };
  };
  const toScreen = (x: number, y: number) => {
    const cam = page.camera();
    return cam && worldToScreen(cam, { x, y });
  };
  Object.assign(window, { skirmishDev: { drawnSelf: () => drawnSelf, drawnOthers: () => drawnOthers, liveNumbers, firstRounds: () => firstRounds.splice(0), fireFeel: () => fireFeel.splice(0), takeFrameCosts: () => frameCosts.splice(0), benchFrames, zombies, royale, panels: drawnPanels, tags: drawnTags, shadowBakes, toScreen, trigger, audio: page.audio } });
}
