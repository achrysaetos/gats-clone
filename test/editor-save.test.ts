import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startServer, type RunningServer } from '../src/server/main.ts';
import { serializeMapFile, type MapFile } from '../src/shared/maps.ts';

let root: string;
let dev: RunningServer;
let plain: RunningServer;
const url = (s: RunningServer, id: string) => `http://localhost:${s.port}/api/dev/maps/${id}`;
const put = (s: RunningServer, id: string, body: unknown) => fetch(url(s, id), { method: 'PUT', body: JSON.stringify(body) });

const MAP: MapFile = {
  name: 'Saved', size: 1000, symmetry: 'none', light: 'day',
  pieces: [{ p: 'crate', x: 100, y: 100, r: 0 }], marks: [],
  spawns: { red: [{ x: 50, y: 50, w: 100, h: 100 }], blue: [], ffa: [] }, zones: [],
};

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'skirmish-editor-'));
  await mkdir(join(root, 'data'));
  await mkdir(join(root, 'maps'));
  dev = await startServer({ port: 0, dataDir: join(root, 'data'), devMapsDir: join(root, 'maps') });
  plain = await startServer({ port: 0, dataDir: join(root, 'data') });
});

after(async () => {
  await dev.close();
  await plain.close();
  await rm(root, { recursive: true, force: true });
});

test('a dev server writes a saved map into its maps folder in the stored format', async () => {
  const shuffled = { zones: [], spawns: MAP.spawns, marks: [], pieces: [{ r: 0, y: 100, x: 100, p: 'crate' }], light: 'day', symmetry: 'none', size: 1000, name: 'Saved' };
  const res = await put(dev, 'saved', shuffled);
  assert.equal(res.status, 200);
  assert.equal(await readFile(join(root, 'maps', 'saved.json'), 'utf8'), serializeMapFile(MAP));
  assert.deepEqual(await (await fetch(url(dev, 'saved'))).json(), JSON.parse(serializeMapFile(MAP)));
});

test('a broken map or a bad id is refused and nothing is written', async () => {
  const before = await readdir(join(root, 'maps'));
  const broken = await put(dev, 'broken', { ...MAP, pieces: [{ p: 'not-a-piece', x: 0, y: 0 }] });
  assert.equal(broken.status, 400);
  assert.match((await broken.json()).error, /piece 0 names no kit piece/);
  for (const id of ['..%2Fdata%2Fx', 'UPPER', '']) assert.equal((await put(dev, id, MAP)).status, 400, id);
  assert.deepEqual(await readdir(join(root, 'maps')), before);
  assert.ok(!(await readdir(join(root, 'data'))).includes('x.json'));
});

test('a server started without the dev flag has no editor routes', async () => {
  assert.equal((await put(plain, 'saved', MAP)).status, 404);
  assert.equal((await fetch(url(plain, 'saved'))).status, 404);
});

test('a dev maps folder inside the data folder is refused at start', async () => {
  await writeFile(join(root, 'data', 'keep'), '');
  await assert.rejects(startServer({ port: 0, dataDir: join(root, 'data'), devMapsDir: join(root, 'data', 'maps') }), /never saves into the data folder/);
  await assert.rejects(startServer({ port: 0, dataDir: join(root, 'data'), devMapsDir: join(root, 'data') }), /never saves into the data folder/);
});
