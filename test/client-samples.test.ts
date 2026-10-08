/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSampleLoader } from '../src/client/samples.ts';
import { SAMPLE_IDS, voiceFor } from '../src/client/sfx.ts';

const settle = () => new Promise((r) => setTimeout(r, 0));

function fakeIo(missing: string[] = []) {
  const asked: string[] = [];
  let manifests = 0;
  const pending: (() => void)[] = [];
  const io = {
    manifest: async () => { manifests++; return Object.fromEntries(SAMPLE_IDS.filter((id) => !missing.includes(id)).map((id) => [id, `${id}.mp3`])); },
    bytes: (file: string) => { asked.push(file); return new Promise<ArrayBuffer>((resolve) => pending.push(() => resolve(new ArrayBuffer(8)))); },
    decode: async () => 'buffer',
  };
  return { io, asked, manifests: () => manifests, finishAll: async () => { while (pending.length) { pending.shift()!(); await settle(); } } };
}

test('nothing is downloaded until a sound is wanted, and then only that sound', async () => {
  const f = fakeIo();
  const loader = createSampleLoader(f.io);
  await settle();
  assert.equal(f.manifests(), 0);
  assert.deepEqual(f.asked, []);
  loader.want(['hit']);
  await settle();
  assert.deepEqual(f.asked, ['hit.mp3']);
  loader.want(['hit']);
  await f.finishAll();
  assert.deepEqual(f.asked, ['hit.mp3'], 'a wanted sound is fetched once');
  assert.equal(f.manifests(), 1);
});

test('a cue keeps its synth recipe until its recording decodes, then plays the recording', async () => {
  const f = fakeIo();
  const loader = createSampleLoader(f.io);
  const voice = () => voiceFor('hit', (id) => loader.buffer(id) !== undefined, () => 0.5).kind;
  assert.equal(voice(), 'synth');
  loader.want(['hit']);
  await settle();
  assert.equal(voice(), 'synth', 'still downloading');
  await f.finishAll();
  assert.equal(voice(), 'sample');
  assert.deepEqual(loader.decoded(), ['hit']);
});

test('a few download at once, and the latest want jumps the queue', async () => {
  const f = fakeIo();
  const loader = createSampleLoader(f.io);
  loader.want(['click', 'hurt', 'kill', 'magIn', 'pistol', 'smg']);
  await settle();
  assert.deepEqual(f.asked, ['click.mp3', 'hurt.mp3', 'kill.mp3'], 'three at a time, in the order asked');
  loader.want(['boom']);
  await f.finishAll();
  assert.equal(f.asked[3], 'boom.mp3', `boom goes next: ${f.asked.join(' ')}`);
  assert.equal(f.asked.length, 7);
});

test('a sound the manifest lacks is never asked for, and stays on its synth recipe', async () => {
  const f = fakeIo(['horn']);
  const loader = createSampleLoader(f.io);
  loader.want(['horn']);
  await f.finishAll();
  loader.want(['horn']);
  await f.finishAll();
  assert.deepEqual(f.asked, []);
  assert.equal(loader.buffer('horn'), undefined);
});
