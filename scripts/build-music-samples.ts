/// <reference types="node" />
/**
 * `node scripts/build-music-samples.ts [cacheDir]` writes the sampled instruments the scores use (src/client/musicsamples.ts) into public/music/:
 * for each instrument, the listed notes cut from the Fluid R3 General MIDI soundfont (Frank Wen, MIT licence) as rendered to MP3 by
 * gleitz/midi-js-soundfonts, trimmed, faded, peak-levelled and re-encoded as small mono MP3s. Needs curl and ffmpeg (with libmp3lame).
 * Re-run it after changing SAMPLES; the notes already written are kept. The licence note lives beside them in public/music/LICENSE.txt.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SAMPLES, sampleFile } from '../src/client/musicsamples.ts';
import type { Inst } from '../src/client/musictheory.ts';

const SOURCE = 'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM';
const PUBLIC = path.resolve(import.meta.dirname, '../public');
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
/** Each note's loudest peak, dBFS: notes are levelled to it so a voice's level holds across its range. */
const PEAK_DB = -3;

const cache = process.argv[2] ?? path.join(tmpdir(), 'skirmish-fluidr3');
mkdirSync(cache, { recursive: true });
mkdirSync(path.join(PUBLIC, 'music'), { recursive: true });

function fontOf(gm: string): Map<string, Buffer> {
  const file = path.join(cache, `${gm}-mp3.js`);
  if (!existsSync(file)) execFileSync('curl', ['-sSfL', '--retry', '3', '-o', file, `${SOURCE}/${gm}-mp3.js`]);
  const text = readFileSync(file, 'utf8');
  const notes = new Map<string, Buffer>();
  for (const m of text.matchAll(/"([A-G]b?-?\d)":\s*"data:audio\/mp3;base64,([^"]+)"/g)) notes.set(m[1]!, Buffer.from(m[2]!, 'base64'));
  return notes;
}

let total = 0, files = 0;
for (const [inst, spec] of Object.entries(SAMPLES) as [Inst, NonNullable<(typeof SAMPLES)[Inst]>][]) {
  const font = fontOf(spec.gm);
  for (const n of spec.notes) {
    const out = path.join(PUBLIC, sampleFile(inst, n));
    if (!existsSync(out)) {
      const raw = font.get(noteName(n));
      if (!raw) throw new Error(`${spec.gm} has no ${noteName(n)}`);
      const src = path.join(cache, `${spec.gm}-${n}.mp3`);
      writeFileSync(src, raw);
      // ffmpeg reports the peak on stderr; the shell folds it into what we read.
      const report = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i '${src}' -t ${spec.len} -af volumedetect -f null - 2>&1`], { encoding: 'utf8' });
      const peak = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(report)?.[1] ?? 0);
      const fade = Math.min(0.15, spec.len / 4);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af',
        `atrim=0:${spec.len},afade=t=out:st=${spec.len - fade}:d=${fade},volume=${(PEAK_DB - peak).toFixed(2)}dB`,
        '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', out]);
    }
    total += statSync(out).size; files++;
  }
  console.log(`${inst.padEnd(10)} ${spec.gm.padEnd(24)} ${spec.notes.length} notes`);
}
// Notes no longer listed are removed, so the folder holds exactly what the scores use.
const wanted = new Set(Object.entries(SAMPLES).flatMap(([inst, spec]) => spec!.notes.map((n) => path.basename(sampleFile(inst as Inst, n)))));
for (const f of readdirSync(path.join(PUBLIC, 'music'))) if (f.endsWith('.mp3') && !wanted.has(f)) { rmSync(path.join(PUBLIC, 'music', f)); console.log('removed', f); }
console.log(`${files} files, ${(total / 1024 / 1024).toFixed(2)} MB in public/music`);
