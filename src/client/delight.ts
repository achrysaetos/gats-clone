import { GUNS, MEDALS, WORLD } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { makeCamera, type Point } from './camera.ts';
import type { KillEvent } from './derive.ts';
import { HIGHLIGHT, NO_HIGHLIGHT, observeHighlight, stampsAt, type Best, type Highlight } from './highlight.ts';
import { renderTime, type SnapBuffer } from './interp.ts';
import { advanceHead, clipLongEnough, easeToward, framing, KILLCAM, killcamOver } from './killcam.ts';
import { medalArt, medalSvg } from './medals.ts';
import { clipOf, createReplayBuffer, frameAt, recordFrame, serverMs } from './replaybuf.ts';
import { advanceStage, createStage, drawStage, type Stage } from './replaystage.ts';
import { dilatedView, IDLE_WARP, intensityAt, requestSlowmo, slowmoTrigger, stepWarp, warping, type Warp } from './slowmo.ts';
import type { Session } from './state.ts';

/**
 * Moments worth reliving, all render-side: the slow-motion on a round's last kill or a big multi-kill, the killcam after you
 * die, and your best moment of the round replayed at its end. Nothing here touches the server or the shared sim; replays are
 * drawn by the normal world renderer from the snapshots the client already received (see replaybuf.ts, replaystage.ts).
 */

type Kc = {
  phase: 'beat' | 'play';
  diedAt: number; deathAt: number; killerId: number; killer: string; weapon: string;
  stage: Stage | null; head: number; lastReal: number; cam: { x: number; y: number; r: number } | null;
};

const REEL = { w: 340, h: 191, radius: 0.66, pullToMoment: 0.35, hideMs: 500, holdMs: 900, fps: 30 } as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export function createDelight() {
  const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!reducedQuery?.matches;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  const buf = createReplayBuffer();
  let owner: Session | null = null;
  let warp: Warp = IDLE_WARP;
  let lastReal = 0;
  let hl: Highlight = NO_HIGHLIGHT;
  let kc: Kc | null = null;
  let forceReel = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  // --- DOM: letterbox bars and plates, one layer above the page ---------------------------------------------------
  const root = el('div', 'dl-root');
  root.setAttribute('aria-hidden', 'true');
  el('i', 'dl-bar top', root);
  el('i', 'dl-bar bottom', root);
  const finalPlate = el('div', 'dl-final plate', root);
  const finalText = el('b', '', finalPlate);
  const kcLayer = el('div', 'dl-kc', root);
  kcLayer.hidden = true;
  const kcTag = el('div', 'dl-kc-tag plate', kcLayer, 'REPLAY');
  const kcPlate = el('div', 'dl-kc-plate plate', kcLayer);
  el('small', '', kcPlate, 'KILLED BY');
  const kcName = el('b', 'dl-kc-name', kcPlate);
  const kcGun = el('span', 'dl-kc-gun', kcPlate);
  const kcSkip = el('div', 'dl-kc-skip', kcLayer);
  el('kbd', '', kcSkip, touch ? 'TAP' : 'ANY KEY');
  kcSkip.append(' to skip');
  const kcBar = el('i', 'dl-kc-bar', kcLayer);
  void kcTag;
  document.body.append(root);

  const classes = (on: Record<string, boolean>) => { for (const [k, v] of Object.entries(on)) document.body.classList.toggle(k, v); };
  let bars = -1;
  const setBars = (v: number) => {
    if (Math.abs(v - bars) < 0.01) return;
    bars = v;
    root.style.setProperty('--dl-bars', v.toFixed(3));
  };

  // --- Slow motion -----------------------------------------------------------------------------------------------
  function paintSlowmo(realNow: number) {
    const t = warp.startedAt === null ? null : realNow - warp.startedAt;
    const i = intensityAt(t);
    setBars(kc?.phase === 'play' ? 1 : reduced() ? (i > 0 ? 1 : 0) : i);
    root.classList.toggle('final-on', warp.startedAt !== null && finalText.textContent !== '');
    classes({ 'dl-slowmo': warping(warp) || warp.pending !== null });
  }

  // --- Killcam ---------------------------------------------------------------------------------------------------
  const endKillcam = () => {
    if (!kc) return;
    kc = null;
    kcLayer.hidden = true;
    classes({ 'dl-hold': false, 'dl-play': false, 'dl-settle': true });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => classes({ 'dl-settle': false }), KILLCAM.settleMs);
  };

  const skip = (e: Event) => {
    if (!kc || (e instanceof KeyboardEvent && (e.repeat || e.key === 'F5' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta'))) return;
    if (performance.now() - kc.diedAt < KILLCAM.guardMs) return;
    endKillcam();
    // The click that skipped must not also land on the card that appears under it.
    if (e.type !== 'keydown') e.stopPropagation();
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);

  function startPlayback(s: Session, k: Kc, realNow: number): boolean {
    const clip = clipOf(buf, k.deathAt - KILLCAM.leadMs, k.deathAt + KILLCAM.tailMs + 100);
    if (clip.length < 6 || !clipLongEnough(serverMs(clip[0]!), k.deathAt)) return false;
    k.stage = createStage(s, clip);
    k.head = Math.max(serverMs(clip[0]!), k.deathAt - KILLCAM.leadMs);
    k.phase = 'play';
    k.lastReal = realNow;
    kcName.textContent = k.killer;
    kcGun.textContent = k.weapon;
    kcLayer.hidden = false;
    classes({ 'dl-play': true });
    return true;
  }

  function killerAt(clip: readonly Snapshot[], frame: Snapshot, id: number): Point | null {
    const here = frame.players.find((p) => p.id === id && p.alive);
    if (here) return here;
    const at = clip.indexOf(frame);
    for (let i = (at < 0 ? clip.length : at) - 1; i >= 0; i--) {
      const p = clip[i]!.players.find((q) => q.id === id && q.alive);
      if (p) return p;
    }
    return null;
  }

  // --- The highlight reel ----------------------------------------------------------------------------------------
  let reel: { box: HTMLElement; ctx: CanvasRenderingContext2D; stamps: HTMLElement; kills: HTMLElement; t0: number; cycle: number; stage: Stage | null; lastDraw: number; stampKey: string; best: Best } | null = null;
  const reelDpr = () => Math.min(window.devicePixelRatio || 1, 1.5);

  function buildReel(best: Best, realNow: number): NonNullable<typeof reel> {
    const box = el('div', 'dl-reel plate');
    box.setAttribute('aria-hidden', 'true');
    const head = el('div', 'dl-reel-head', box);
    el('b', '', head, 'YOUR HIGHLIGHT');
    el('span', '', head, 'REPLAY');
    const frame = el('div', 'dl-reel-frame', box);
    const canvas = el('canvas', 'dl-reel-canvas', frame);
    const dpr = reelDpr();
    canvas.width = Math.round(REEL.w * dpr);
    canvas.height = Math.round(REEL.h * dpr);
    const stamps = el('div', 'dl-reel-stamps', frame);
    const kills = el('div', 'dl-reel-kills', box);
    document.getElementById('hud')?.append(box);
    return { box, ctx: canvas.getContext('2d')!, stamps, kills, t0: realNow + REEL.hideMs, cycle: -1, stage: null, lastDraw: -Infinity, stampKey: '', best };
  }

  function dropReel() {
    reel?.box.remove();
    reel = null;
  }

  function paintStamps(r: NonNullable<typeof reel>, best: Best, head: number) {
    const stamps = stampsAt(best, head);
    const key = `${stamps.length}`;
    if (key === r.stampKey) return;
    r.stampKey = key;
    r.stamps.replaceChildren(...stamps.slice(-3).map((st, i, all) => {
      const chip = el('div', i === all.length - 1 ? 'dl-stamp fresh' : 'dl-stamp');
      const art = medalArt(st.medal);
      chip.className += ` tier-${art.tier}`;
      chip.innerHTML = medalSvg(art, 34, MEDALS[st.medal].name);
      el('b', '', chip, MEDALS[st.medal].name);
      return chip;
    }));
    r.kills.textContent = best.kills === 1 ? '1 kill' : `${best.kills} kills`;
  }

  function drawReel(s: Session, latest: Snapshot, realNow: number) {
    const best = hl.best;
    const show = !!best && (!!latest.match.winner || forceReel) && !latest.run && !kc && !warping(warp) && warp.pending === null;
    if (!show || !best) { if (reel) dropReel(); return; }
    if (!reel || reel.best !== best) { dropReel(); reel = buildReel(best, realNow); }
    const r = reel;
    const lo = Math.max(best.from, serverMs(best.clip[0]!)), hi = Math.min(best.to, serverMs(best.clip[best.clip.length - 1]!));
    const span = Math.max(1, hi - lo);
    const t = Math.max(0, realNow - r.t0), cycleLen = span + REEL.holdMs;
    const cycle = Math.floor(t / cycleLen);
    const head = lo + Math.min(t % cycleLen, span);
    if (cycle !== r.cycle) { r.cycle = cycle; r.stage = createStage(s, best.clip); r.stampKey = ''; }
    if (realNow - r.lastDraw < 1000 / REEL.fps || !r.stage) return;
    r.lastDraw = realNow;
    advanceStage(r.stage, head, realNow);
    const frame = frameAt(best.clip, head);
    if (!frame) return;
    const me = frame.players.find((p) => p.id === frame.self.id && p.alive) ?? frame.players.find((p) => p.id === frame.self.id);
    const focus = best.focus;
    const pull = reduced() ? 0 : REEL.pullToMoment;
    const center = me ? { x: me.x + ((focus?.x ?? me.x) - me.x) * pull, y: me.y + ((focus?.y ?? me.y) - me.y) * pull } : (focus ?? { x: 0, y: 0 });
    const cam = makeCamera(center, REEL.w, REEL.h, (frame.self.viewRadius || WORLD.viewRadius) * REEL.radius);
    drawStage(r.ctx, r.stage, frame, cam, reelDpr(), realNow, null);
    paintStamps(r, best, head);
  }

  // --- The page's hooks ------------------------------------------------------------------------------------------
  function reset() {
    owner = null;
    buf.frames.length = 0;
    buf.weight = 0;
    warp = IDLE_WARP;
    hl = NO_HIGHLIGHT;
    endKillcam();
    dropReel();
    finalText.textContent = '';
    setBars(0);
    classes({ 'dl-slowmo': false, 'dl-hold': false, 'dl-play': false, 'dl-settle': false });
  }

  // Dev hooks (`?dev`): stage each moment on demand, since a real quad kill or a round's last shot is rare.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev')) {
    (window as unknown as { skirmishDelight: unknown }).skirmishDelight = {
      slowmo: (focus: Point | null = null) => { warp = IDLE_WARP; warp = requestSlowmo(warp, performance.now(), -1e9, focus, true); finalText.textContent = 'FINAL KILL'; finalPlate.classList.add('mine'); },
      reel: () => {
        const clip = buf.frames.slice(-120);
        if (clip.length < 20) return false;
        const from = serverMs(clip[0]!), to = serverMs(clip[clip.length - 1]!);
        hl = { ...NO_HIGHLIGHT, best: { score: 500, clip, from, to, kills: 3, focus: null, stamps: [{ medal: 'doubleKill', at: from + (to - from) * 0.35 }, { medal: 'tripleKill', at: from + (to - from) * 0.6 }] } };
        forceReel = true;
        return true;
      },
      frames: () => buf.frames.length,
      weight: () => buf.weight,
    };
  }

  return {
    /** How far behind the newest snapshot the drawn time is (ms), for whatever must not run ahead of it, such as your predicted position. */
    get lag() { return warp.lag; },
    get replaying() { return kc?.phase === 'play'; },

    /** The server time to draw the world at: the usual interpolation clock, held back while the slow motion runs. */
    drawnTime(snaps: SnapBuffer, now: number, realNow: number): number {
      const base = renderTime(snaps, now);
      warp = stepWarp(warp, realNow, realNow - lastReal, base);
      lastReal = realNow;
      paintSlowmo(realNow);
      return base - warp.lag;
    },

    onSnap(s: Session, snap: Snapshot, prev: Snapshot | null, realNow: number, phase: string) {
      if (owner !== s) { reset(); owner = s; }
      if (!snap.run) recordFrame(buf, snap);
      const ended = !!snap.match.winner && !prev?.match.winner;
      if (prev?.match.winner && !snap.match.winner) { hl = NO_HIGHLIGHT; dropReel(); finalText.textContent = ''; }
      if (!snap.run && !snap.royale) hl = observeHighlight(hl, snap, buf, ended);
      if (phase !== 'playing' || kc) return;
      const trig = slowmoTrigger(prev, snap);
      if (!trig) return;
      const next = requestSlowmo(warp, realNow, trig.at, trig.focus, trig.why === 'final');
      if (next === warp) return;
      warp = next;
      const mine = snap.events.some((e) => e.e === 'kill' && e.killerId === snap.self.id);
      finalText.textContent = trig.why === 'final' ? 'FINAL KILL' : '';
      finalPlate.classList.toggle('mine', mine);
    },

    /** You just died to `kill`: hold the death card back and replay your last seconds once the beat is over. */
    onDeath(s: Session, snap: Snapshot, kill: KillEvent | null, realNow: number) {
      if (owner !== s || snap.run || snap.royale || !kill || kill.killerId === null || kill.killerId === s.myId) return;
      warp = { ...IDLE_WARP, lastAt: warp.lastAt };
      finalText.textContent = '';
      kc = { phase: 'beat', diedAt: realNow, deathAt: serverMs(snap), killerId: kill.killerId, killer: kill.killer, weapon: kill.weapon || (GUNS as Record<string, { name: string }>)[snap.players.find((p) => p.id === kill.killerId)?.gun ?? '']?.name || '', stage: null, head: 0, lastReal: realNow, cam: null };
      classes({ 'dl-hold': true });
    },

    /** The camera for the slow part (the page's own, or zoomed toward the kill). */
    look(center: Point, radius: number, realNow: number): { center: Point; radius: number } {
      if (warp.startedAt === null) return { center, radius };
      return dilatedView(center, warp.focus, radius, intensityAt(realNow - warp.startedAt), reduced());
    },

    /** Draws the killcam in place of the live world when one is due; true when it did (the page then skips its own drawing). */
    drawKillcam(ctx: CanvasRenderingContext2D, s: Session, dead: boolean, view: { w: number; h: number; dpr: number }, realNow: number): boolean {
      const k = kc;
      if (!k) return false;
      if (!dead || owner !== s) { endKillcam(); return false; }
      if (k.phase === 'beat') {
        if (realNow - k.diedAt < KILLCAM.beatMs) return false;
        if (!startPlayback(s, k, realNow)) { endKillcam(); return false; }
      }
      const stage = k.stage!;
      const dt = realNow - k.lastReal;
      k.lastReal = realNow;
      k.head = advanceHead(k.head, dt, k.deathAt);
      if (killcamOver(k.head, k.deathAt)) { endKillcam(); return false; }
      advanceStage(stage, k.head, realNow);
      const frame = frameAt(stage.clip, k.head);
      if (!frame) { endKillcam(); return false; }
      const me = frame.players.find((p) => p.id === s.myId) ?? stage.clip[0]!.players.find((p) => p.id === s.myId);
      const at = me ?? s.lastSelf;
      const killer = killerAt(stage.clip, frame, k.killerId);
      const want = framing(at, killer, frame.self.viewRadius || WORLD.viewRadius, view.w / view.h);
      k.cam = k.cam
        ? { x: easeToward(k.cam.x, want.center.x, dt), y: easeToward(k.cam.y, want.center.y, dt), r: easeToward(k.cam.r, want.radius, dt) }
        : { x: want.center.x, y: want.center.y, r: want.radius };
      const cam = makeCamera({ x: k.cam.x, y: k.cam.y }, view.w, view.h, k.cam.r);
      drawStage(ctx, stage, frame, cam, view.dpr, realNow, k.killerId);
      const first = serverMs(stage.clip[0]!);
      kcBar.style.transform = `scaleX(${Math.min(1, Math.max(0, (k.head - first) / (k.deathAt + KILLCAM.tailMs - first))).toFixed(3)})`;
      setBars(1);
      return true;
    },

    drawReel,
    reset,
  };
}

export type Delight = ReturnType<typeof createDelight>;
