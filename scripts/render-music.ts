/// <reference types="node" />
/**
 * `node scripts/render-music.ts <outDir> [trackId...]` writes one stereo 16-bit WAV per track (see musicrender.ts) and a levels.json.
 * Set XFADE=1 for map-change crossfade renders too, LONG=<seconds> for a long render of the densest state (for repetition checks). Needs `node-web-audio-api` (SKIRMISH_WAA names a folder whose node_modules has it).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TRACK_IDS, type TrackId } from '../src/client/musictracks.ts';
import { loadWaa, peakOf, rmsOf, wavOf } from './render-reload-sfx.ts';
import { renderCrossfade, renderTour } from './musicrender.ts';

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const out = process.argv[2];
  const waa = loadWaa();
  if (!out || !waa) { console.error(out ? 'node-web-audio-api is not installed (set SKIRMISH_WAA to a folder whose node_modules has it)' : 'usage: node scripts/render-music.ts <outDir> [trackId...]'); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const ids = (process.argv.slice(3).length ? process.argv.slice(3) : [...TRACK_IDS]) as TrackId[];
  const report: Record<string, { peak: number; rms: number }> = {};
  // LONG=<seconds> renders the densest state (every layer on) for that long instead of the tour, to look for repetition.
  const long = Number(process.env.LONG ?? 0);
  for (const id of ids) {
    const variants: [string, Parameters<typeof renderTour>[2]][] = id === 'outpost' ? [['outpost-day', { day: true }], ['outpost-night', { night: true }]] : [[id, {}]];
    for (const [name, opts] of variants) {
      const fetchBytes = async (p: string) => { const b = readFileSync(path.resolve(import.meta.dirname, '../public', p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
      const r = await renderTour(waa, id, { ...(long ? { ...opts, tour: false, seconds: long } : opts), fetchBytes });
      writeFileSync(path.join(out, `${name}${long ? '-long' : ''}.wav`), wavOf(r));
      report[name] = { peak: peakOf(r), rms: rmsOf(r) };
      console.log(name, `peak ${peakOf(r).toFixed(3)} rms ${rmsOf(r).toFixed(4)}`);
    }
  }
  writeFileSync(path.join(out, 'levels.json'), JSON.stringify(report, null, 2));
  if (process.env.XFADE) {
    for (const [a, b] of [['march', 'harbor'], ['subpen', 'park'], ['airbase', 'range']] as const) {
      const r = await renderCrossfade(waa, a, b);
      writeFileSync(path.join(out, `xfade-${a}-${b}.wav`), wavOf(r));
      console.log(`xfade-${a}-${b}`, `peak ${peakOf(r).toFixed(3)}`);
    }
  }
}
