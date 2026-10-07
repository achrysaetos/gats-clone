/// <reference types="node" />
/**
 * Offline render of the reload foley through the real sound engine and bus (compressor + limiter), for checking levels and
 * listening: `node scripts/render-reload-sfx.ts <outDir>` writes one 16-bit stereo WAV per gun class (and a few evolved guns) at
 * the gun's own reload time and with the quick-reload perk, plus the same class's shot for scale.
 * Needs the `node-web-audio-api` package (a native Web Audio implementation); point SKIRMISH_WAA at a folder that has it in
 * node_modules if it is not installed here. The reload test renders through the same function and skips without the package.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GUNS, type GunId } from '../src/shared/defs.ts';
import { createBus, createEngine, createNoise } from '../src/client/audio.ts';
import { reloadCues, type FoleyCue } from '../src/client/reloadsfx.ts';
import type { SoundCue } from '../src/client/sfx.ts';
import type { Surface } from '../src/client/foley.ts';

export const SAMPLE_RATE = 44100;
type Waa = { OfflineAudioContext: new (channels: number, length: number, rate: number) => OfflineAudioContext };

/** The Web Audio implementation, or null when none is installed. */
export function loadWaa(): Waa | null {
  const req = createRequire(import.meta.url);
  for (const paths of [undefined, process.env.SKIRMISH_WAA ? [process.env.SKIRMISH_WAA] : []]) {
    try { return req(req.resolve('node-web-audio-api', paths ? { paths } : undefined)) as Waa; } catch { /* try the next place */ }
  }
  return null;
}

/** A fresh context's bus (its compressor) takes a few ms to settle, so every render starts this long before its first cue and drops it from the result. */
export const LEAD_MS = 200;

export type Rendered = { left: Float32Array; right: Float32Array; seconds: number };

/** A small seeded random, so a render is the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Plays `cues` (each at its `delayMs`) through the engine and the master bus into `seconds` of stereo audio. */
export async function renderCues(waa: Waa, cues: readonly SoundCue[], seconds: number, listener = { x: 0, y: 0 }): Promise<Rendered> {
  const realRandom = Math.random;
  Math.random = seeded(1234);
  try {
    const lead = Math.round((LEAD_MS / 1000) * SAMPLE_RATE);
    const ctx = new waa.OfflineAudioContext(2, lead + Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
    const master = createBus(ctx, ctx.destination);
    const noise = createNoise(ctx);
    // One engine per cue: the engine's voice cap counts voices still alive, and an offline render schedules them all up front.
    for (const cue of cues) createEngine(ctx, master, noise).play([{ ...cue, delayMs: (cue.delayMs ?? 0) + LEAD_MS }], listener, 900);
    const buf = await ctx.startRendering();
    return { left: buf.getChannelData(0).slice(lead), right: buf.getChannelData(1).slice(lead), seconds };
  } finally { Math.random = realRandom; }
}

export const asCue = (c: FoleyCue & { delayMs: number }, x: number, y: number, self: boolean): SoundCue =>
  ({ id: c.id, x, y, self, gain: c.gain, pitch: c.pitch, delayMs: c.delayMs, ...(c.pan === undefined ? {} : { pan: c.pan }) });

/** A whole reload of `gun` at `reloadMs`, heard as your own (centred) or from `distance` px away. */
export function renderReload(waa: Waa, gun: GunId, reloadMs: number, o: { self?: boolean; surface?: Surface; distance?: number; tailMs?: number } = {}) {
  const self = o.self ?? true, x = self ? 0 : (o.distance ?? 300);
  const cues = reloadCues(gun, reloadMs, { self, surface: o.surface }).map((c) => asCue(c, x, 0, self));
  return renderCues(waa, cues, (reloadMs + (o.tailMs ?? 900)) / 1000);
}

export const peakOf = (r: Rendered): number => { let p = 0; for (const ch of [r.left, r.right]) for (const v of ch) p = Math.max(p, Math.abs(v)); return p; };
export const rmsOf = (r: Rendered): number => { let s = 0; for (const ch of [r.left, r.right]) for (const v of ch) s += v * v; return Math.sqrt(s / (r.left.length * 2)); };

/** Index (ms) of the last sample louder than `floor`: where the sound really ends. */
export function lastSoundMs(r: Rendered, floor = 0.002): number {
  for (let i = r.left.length - 1; i >= 0; i--) if (Math.abs(r.left[i]!) > floor || Math.abs(r.right[i]!) > floor) return (i / SAMPLE_RATE) * 1000;
  return 0;
}

export function wavOf(r: Rendered): Buffer {
  const n = r.left.length, data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SAMPLE_RATE, 24); data.writeUInt32LE(SAMPLE_RATE * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r.left[i]!)) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r.right[i]!)) * 32767), 46 + i * 4);
  }
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const out = process.argv[2];
  const waa = loadWaa();
  if (!out || !waa) { console.error(out ? 'node-web-audio-api is not installed (set SKIRMISH_WAA to a folder whose node_modules has it)' : 'usage: node scripts/render-reload-sfx.ts <outDir>'); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const guns: GunId[] = ['pistol', 'akimbo', 'smg', 'assault', 'lmg', 'shotgun', 'sniper', 'handCannon', 'bulldog', 'longshot', 'ghost'];
  for (const gun of guns) {
    for (const [tag, ms] of [['', GUNS[gun].reloadMs], ['-quick', Math.round(GUNS[gun].reloadMs * 0.65)]] as const) {
      const r = await renderReload(waa, gun, ms, { surface: 'concrete' });
      writeFileSync(path.join(out, `${gun}${tag}.wav`), wavOf(r));
      console.log(gun + tag, `peak ${peakOf(r).toFixed(3)} rms ${rmsOf(r).toFixed(4)} ends ${Math.round(lastSoundMs(r))}ms of ${ms}ms`);
    }
  }
}
