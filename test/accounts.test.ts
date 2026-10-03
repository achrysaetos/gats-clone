import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openAccounts } from '../src/server/accounts.ts';

async function medianMs(times: number, fn: () => Promise<unknown>): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < times; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[Math.floor(times / 2)]!;
}

test('login takes as long for an unknown name as for a wrong password, so timing does not reveal accounts', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skirmish-timing-'));
  try {
    const accounts = await openAccounts(dataDir);
    await accounts.register('Known', 'right-pass');
    const wrongPassword = await medianMs(5, () => accounts.login('Known', 'wrong-pass'));
    const unknownName = await medianMs(5, () => accounts.login('Stranger', 'wrong-pass'));
    assert.equal(await accounts.login('Stranger', 'wrong-pass'), null);
    assert.ok(unknownName > wrongPassword * 0.5, `unknown ${unknownName.toFixed(1)}ms vs wrong password ${wrongPassword.toFixed(1)}ms`);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
