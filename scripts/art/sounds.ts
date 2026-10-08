/// <reference types="node" />
// Usage: node scripts/art/sounds.ts
// Builds public/assets/sfx from art/sounds.json: downloads each CC0 source once into art/build/sfx-cache,
// trims, peak-normalises and encodes each cue to mono 48 kHz MP3, and names it by content hash.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const MANIFEST = join(ROOT, 'art/sounds.json');
const CACHE = join(ROOT, 'art/build/sfx-cache');
const OUT = join(ROOT, 'public/assets/sfx');
const OUT_MANIFEST = join(OUT, 'manifest.json');
/** Safari decodes neither Ogg nor WebM Opus in every version we support; MP3 decodes everywhere. */
const ENCODE = ['-ac', '1', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0'];
const PEAK_DB = -1;
const FADE_IN_S = 0.003;
const MAX_FADE_OUT_S = 0.08;
const OUTPUT_NAME = /^([A-Za-z]+)\.([0-9a-f]{10})\.mp3$/;
const CREDITS = join(ROOT, 'public/assets/CREDITS.md');
const CREDITS_START = '<!-- sounds:start (written by scripts/art/sounds.ts) -->';
const CREDITS_END = '<!-- sounds:end -->';

type Source = { title: string; url: string; page: string; author: string; licence: string; licenceSeen: string };
/** `lowpassHz` and `highpassHz` carve one layer out of a full recording, such as the low body of a shot or its first crack. */
type Sound = { source: string; member?: string; start: number; length: number; gainDb: number; lowpassHz?: number; highpassHz?: number; note?: string };
type Manifest = { sources: Record<string, Source>; sounds: Record<string, Sound> };

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function parseManifest(raw: unknown): Manifest {
  const m = raw as Manifest;
  if (typeof m !== 'object' || m === null || typeof m.sources !== 'object' || typeof m.sounds !== 'object') throw new Error(`${MANIFEST}: expected { sources, sounds }`);
  for (const [id, s] of Object.entries(m.sources)) {
    if (!/^https:\/\//.test(s.url) || !/^https:\/\//.test(s.page)) throw new Error(`source ${id}: url and page must be https`);
    if (s.licence !== 'CC0-1.0') throw new Error(`source ${id}: licence must be CC0-1.0, got ${s.licence}`);
  }
  for (const [cue, s] of Object.entries(m.sounds)) {
    if (!/^[A-Za-z]+$/.test(cue)) throw new Error(`sound ${cue}: names are letters only`);
    if (!m.sources[s.source]) throw new Error(`sound ${cue}: unknown source ${s.source}`);
    if (!(s.start >= 0 && s.length > 0 && Number.isFinite(s.gainDb))) throw new Error(`sound ${cue}: bad trim or gain`);
    for (const hz of [s.lowpassHz, s.highpassHz]) if (hz !== undefined && !(hz > 0)) throw new Error(`sound ${cue}: filter cutoffs are positive Hz`);
  }
  return m;
}

function download(source: Source): string {
  const dir = join(CACHE, 'src', sha256(source.url).slice(0, 16));
  const file = join(dir, decodeURIComponent(basename(new URL(source.url).pathname)));
  if (existsSync(file)) return file;
  mkdirSync(dir, { recursive: true });
  execFileSync('curl', ['-sSLf', '--retry', '3', '-o', `${file}.part`, source.url], { stdio: 'inherit' });
  renameSync(`${file}.part`, file);
  return file;
}

/** The file to read a sound from: the download itself, or one member unzipped beside it. */
function input(source: Source, member: string | undefined): string {
  const file = download(source);
  if (member === undefined) return file;
  const out = join(dirname(file), 'members', member);
  if (existsSync(out)) return out;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, execFileSync('unzip', ['-p', file, member], { maxBuffer: 1 << 28 }));
  return out;
}

function ffmpeg(args: string[]): { out: Buffer; err: string } {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'info', ...args], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed:\n${r.stderr.toString().slice(-2000)}`);
  return { out: r.stdout, err: r.stderr.toString() };
}

function encode(sound: Sound, file: string): Buffer {
  const trim = ['-ss', String(sound.start), '-t', String(sound.length), '-i', file];
  const carve = [
    ...(sound.highpassHz === undefined ? [] : [`highpass=f=${sound.highpassHz}:poles=2`]),
    ...(sound.lowpassHz === undefined ? [] : [`lowpass=f=${sound.lowpassHz}:poles=2`]),
  ];
  const probe = ffmpeg([...trim, '-ac', '1', '-af', [...carve, 'volumedetect'].join(','), '-f', 'null', '-']).err;
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(probe)?.[1]);
  if (!Number.isFinite(peak)) throw new Error(`${file}: volumedetect found no peak in ${sound.start}s+${sound.length}s`);
  const fadeOut = Math.min(MAX_FADE_OUT_S, sound.length * 0.3);
  const filters = [
    ...carve,
    `volume=${(PEAK_DB - peak + sound.gainDb).toFixed(2)}dB`,
    `afade=t=in:d=${FADE_IN_S}`,
    `afade=t=out:st=${(sound.length - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    'alimiter=limit=0.95:attack=1:release=20:level=false',
  ].join(',');
  return ffmpeg([...trim, '-af', filters, ...ENCODE, '-f', 'mp3', 'pipe:1']).out;
}

/** Encoded bytes for one cue, reused from the cache while its manifest entry, source bytes and encoder settings are unchanged. */
function encoded(cue: string, sound: Sound, source: Source): Buffer {
  const file = input(source, sound.member);
  const key = sha256(JSON.stringify([sound, sha256(readFileSync(file)), ENCODE, PEAK_DB, FADE_IN_S, MAX_FADE_OUT_S]));
  const cached = join(CACHE, 'enc', `${cue}.${key.slice(0, 16)}.mp3`);
  if (existsSync(cached)) return readFileSync(cached);
  const out = encode(sound, file);
  mkdirSync(join(CACHE, 'enc'), { recursive: true });
  writeFileSync(cached, out);
  return out;
}

function writeIfChanged(file: string, data: Buffer | string): boolean {
  if (existsSync(file) && readFileSync(file).equals(Buffer.from(data))) return false;
  writeFileSync(file, data);
  return true;
}

/** Rewrites only the sounds section of the credits file, so other art pipelines can own their own sections. */
function creditsWith(existing: string, m: Manifest): string {
  const bySource = new Map<string, string[]>();
  for (const [cue, s] of Object.entries(m.sounds)) bySource.set(s.source, [...(bySource.get(s.source) ?? []), cue]);
  const rows = [...bySource].sort(([a], [b]) => a.localeCompare(b)).map(([id, cues]) => {
    const s = m.sources[id]!;
    return `| ${cues.sort().join(', ')} | ${s.author} | [${s.title}](${s.page}) | ${s.licence} |`;
  });
  const section = [CREDITS_START, '## Sounds', '', 'Every sound is CC0 1.0 (public domain dedication). Credit is given as thanks, not as a licence condition.', '',
    '| Sample | Author | Source | Licence |', '| --- | --- | --- | --- |', ...rows, CREDITS_END].join('\n');
  const start = existing.indexOf(CREDITS_START), end = existing.indexOf(CREDITS_END);
  if (start >= 0 && end > start) return existing.slice(0, start) + section + existing.slice(end + CREDITS_END.length);
  return `${existing || '# Asset credits\n'}\n${section}\n`;
}

export async function buildSounds(): Promise<void> {
  const manifest = parseManifest(JSON.parse(readFileSync(MANIFEST, 'utf8')));
  mkdirSync(OUT, { recursive: true });
  const files: Record<string, string> = {};
  let wrote = 0, bytes = 0;
  for (const [cue, sound] of Object.entries(manifest.sounds).sort(([a], [b]) => a.localeCompare(b))) {
    const data = encoded(cue, sound, manifest.sources[sound.source]!);
    const name = `${cue}.${sha256(data).slice(0, 10)}.mp3`;
    if (writeIfChanged(join(OUT, name), data)) wrote++;
    files[cue] = name;
    bytes += data.length;
  }
  const keep = new Set(Object.values(files));
  const stale = readdirSync(OUT).filter((f) => OUTPUT_NAME.test(f) && !keep.has(f));
  for (const f of stale) rmSync(join(OUT, f));
  const manifestChanged = writeIfChanged(OUT_MANIFEST, `${JSON.stringify(files, null, 2)}\n`);
  writeIfChanged(CREDITS, creditsWith(existsSync(CREDITS) ? readFileSync(CREDITS, 'utf8') : '', manifest));
  console.log(`sounds: ${Object.keys(files).length} cues, ${(bytes / 1024).toFixed(0)} KB; wrote ${wrote}, removed ${stale.length}${manifestChanged ? ', manifest updated' : ''}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSounds();
