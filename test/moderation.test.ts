/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeModerator } from '../src/server/moderation.ts';

const mod = makeModerator(['grief']);

test('chat masks blocked words, including lookalike spellings, and keeps the rest', () => {
  assert.equal(mod.mask('nice shot you sh1t'), 'nice shot you ****');
  assert.equal(mod.mask('F.U.C.K this'), '******* this');
  assert.equal(mod.mask('stop griefing'), 'stop ********', 'operator words from blocklist.txt apply');
  assert.equal(mod.mask('good game everyone'), 'good game everyone', 'clean chat is untouched');
});

test('names hiding a blocked word, even across spaces, are rejected; ordinary names pass', () => {
  assert.equal(mod.isClean('Kestrel'), true);
  assert.equal(mod.isClean('Scunthorpe'), false, 'substring matching errs toward blocking');
  assert.equal(mod.isClean('b i t c h'), false);
  assert.equal(mod.isClean('a$$hole'), false);
  assert.equal(mod.isClean('Assassin'), true);
});

test('the server renames a blocked name and masks chat before anyone else sees it', { timeout: 10_000 }, async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: WebSocket } = await import('ws');
  const { startServer } = await import('../src/server/main.ts');
  const dataDir = await mkdtemp(join(tmpdir(), 'skirmish-mod-'));
  await writeFile(join(dataDir, 'blocklist.txt'), 'grief\n');
  const server = await startServer({ port: 0, dataDir });
  const connect = () => new Promise<InstanceType<typeof WebSocket>>((resolve) => { const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=ffa`); ws.once('open', () => resolve(ws)); });
  const next = (ws: InstanceType<typeof WebSocket>, t: string) => new Promise<any>((resolve) => ws.on('message', (m) => { const msg = JSON.parse(String(m)); if (msg.t === t) resolve(msg); }));
  const join_ = (ws: InstanceType<typeof WebSocket>, name: string) => ws.send(JSON.stringify({ t: 'join', name, loadout: { weapon: 'pistol', armor: 'none', color: 'red' } }));
  try {
    const rude = await connect(), listener = await connect();
    join_(rude, 'griefer'); join_(listener, 'Calm');
    await Promise.all([next(rude, 'welcome'), next(listener, 'welcome')]);
    const snap = await next(listener, 'snap');
    const names = (snap.leaderboard as { name: string }[]).map((r) => r.name);
    assert.ok(names.includes('Player') && !names.some((n) => /grief/i.test(n)), `blocked name replaced: ${names.join(', ')}`);
    const heard = next(listener, 'chat');
    rude.send(JSON.stringify({ t: 'chat', text: 'you are sh1t' }));
    assert.equal((await heard).text, 'you are ****');
    rude.close(); listener.close();
  } finally {
    await server.close();
  }
});
