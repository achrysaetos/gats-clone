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
  // Few enough bots that both humans make the ten-row leaderboard.
  const server = await startServer({ port: 0, dataDir, limits: { minPlayers: 4 } });
  const { fillSnapshot } = await import('../src/shared/wire.ts');
  const full = new Map<unknown, any>();
  const connect = () => new Promise<InstanceType<typeof WebSocket>>((resolve) => {
    const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=ffa`);
    // Track the rebuilt snapshot from the first frame: welcome and the first full snapshot can arrive in one chunk, and later ones omit an unchanged leaderboard.
    ws.on('message', (m) => { const msg = JSON.parse(String(m)); if (msg.t === 'snap') full.set(ws, fillSnapshot(msg, full.get(ws) ?? null) ?? full.get(ws)); });
    ws.once('open', () => resolve(ws));
  });
  const leaderboardOf = async (ws: InstanceType<typeof WebSocket>, ready: (names: string[]) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const names = ((full.get(ws)?.leaderboard ?? []) as { name: string }[]).map((r) => r.name);
      if (ready(names)) return names;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error('leaderboard never listed both players');
  };
  const next = (ws: InstanceType<typeof WebSocket>, t: string) => new Promise<any>((resolve) => ws.on('message', (m) => { const msg = JSON.parse(String(m)); if (msg.t === t) resolve(msg); }));
  const join_ = (ws: InstanceType<typeof WebSocket>, name: string) => ws.send(JSON.stringify({ t: 'join', name, loadout: { weapon: 'pistol', armor: 'none', color: 'red' } }));
  try {
    const rude = await connect(), listener = await connect();
    join_(rude, 'griefer'); join_(listener, 'Calm');
    await Promise.all([next(rude, 'welcome'), next(listener, 'welcome')]);
    const names = await leaderboardOf(listener, (n) => n.includes('Calm') && n.length >= 2);
    assert.ok(names.includes('Player') && !names.some((n) => /grief/i.test(n)), `blocked name replaced: ${names.join(', ')}`);
    const heard = next(listener, 'chat');
    rude.send(JSON.stringify({ t: 'chat', text: 'you are sh1t' }));
    assert.equal((await heard).text, 'you are ****');
    rude.close(); listener.close();
  } finally {
    await server.close();
  }
});
