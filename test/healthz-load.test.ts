/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server/main.ts';
import { WORLD } from '../src/shared/defs.ts';

test('/healthz reports how the tick loop kept up: ticks a second, dropped ticks and the busy share', async () => {
  const server = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-healthz-')) });
  try {
    await new Promise((r) => setTimeout(r, 1300));
    const body = await (await fetch(`http://localhost:${server.port}/healthz`)).json() as Record<string, number>;
    assert.equal(body.ok, true);
    assert.ok(Math.abs(body.tickHz! - WORLD.tickHz) <= 3, `ticked at ${body.tickHz} Hz`);
    assert.ok(body.droppedTicks! >= 0 && body.busy! >= 0 && body.busy! < 1 && body.maxTickMs! >= 0, JSON.stringify(body));
  } finally {
    await server.close();
  }
});
