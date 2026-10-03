/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { WORLD } from '../src/shared/defs.ts';
import { addPlayer, effectiveStats } from '../src/shared/sim.ts';
import { startServer } from '../src/server/main.ts';
import { PISTOL, emptyWorld, grantPerks } from './helpers.ts';

test('humans carry triple health and regen, bots keep the base', () => {
  const w = emptyWorld();
  const human = addPlayer(w, 'Hu', PISTOL, { kind: 'human', at: { x: 500, y: 500 } });
  const bot = addPlayer(w, 'Bo', PISTOL, { at: { x: 900, y: 500 } });
  assert.equal(effectiveStats(human).maxHp, WORLD.baseHp * 3);
  assert.equal(effectiveStats(bot).maxHp, WORLD.baseHp);
  assert.equal(effectiveStats(human).regenPerSec / effectiveStats(human).maxHp, effectiveStats(bot).regenPerSec / effectiveStats(bot).maxHp, 'healing to full takes the same time');
  grantPerks(w, human, ['optics', 'thickSkin']);
  assert.equal(effectiveStats(human).maxHp, (WORLD.baseHp + 30) * 3, 'thick skin is tripled too');
});

test('a player who joins through the server gets triple health while the room bots do not', { timeout: 10_000 }, async () => {
  const server = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-hp-')) });
  try {
    const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=ffa`);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ t: 'join', name: 'Hero', loadout: PISTOL }));
    const snap = await new Promise<any>((resolve) => {
      let me = 0;
      ws.on('message', (m) => {
        const msg = JSON.parse(String(m));
        if (msg.t === 'welcome') me = msg.id;
        if (msg.t === 'snap' && msg.players.some((p: { id: number }) => p.id === me)) resolve({ me, msg });
      });
    });
    const self = snap.msg.players.find((p: { id: number }) => p.id === snap.me);
    assert.equal(self.maxHp, WORLD.baseHp * 3);
    assert.equal(self.hp, WORLD.baseHp * 3, 'spawns at full tripled health');
    for (const other of snap.msg.players.filter((p: { id: number }) => p.id !== snap.me)) assert.equal(other.maxHp, WORLD.baseHp, `${other.name} is a bot at base health`);
    ws.close();
  } finally {
    await server.close();
  }
});
