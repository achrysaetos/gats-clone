import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { openAccounts } from '../src/server/accounts.ts';
import { LIMITS } from '../src/server/limits.ts';

/** The fastest of `times` runs: load on the machine only ever adds time, so the minimum is the cost of the work itself. */
async function fastestMs(times: number, fn: () => Promise<unknown>): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < times; i++) {
    const start = performance.now();
    await fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

test('login takes as long for an unknown name as for a wrong password, so timing does not reveal accounts', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skirmish-timing-'));
  try {
    const accounts = await openAccounts(dataDir, LIMITS.sessionMs);
    await accounts.register('Known', 'right-pass');
    const wrongPassword = await fastestMs(7, () => accounts.login('Known', 'wrong-pass'));
    const unknownName = await fastestMs(7, () => accounts.login('Stranger', 'wrong-pass'));
    assert.equal(await accounts.login('Stranger', 'wrong-pass'), null);
    assert.ok(unknownName > wrongPassword * 0.5, `unknown ${unknownName.toFixed(1)}ms vs wrong password ${wrongPassword.toFixed(1)}ms`);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

/** A fresh store in its own directory, removed when the test ends. */
async function freshStore(t: TestContext, sessionMs = LIMITS.sessionMs) {
  const dataDir = await mkdtemp(join(tmpdir(), 'skirmish-accounts-unit-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return { dataDir, accounts: await openAccounts(dataDir, sessionMs) };
}

test('a name is registered once in any letter case, and only its own password logs in', async (t) => {
  const { accounts } = await freshStore(t);
  const session = await accounts.register('Kestrel', 'right-pass');
  assert.equal(session?.name, 'Kestrel');
  assert.equal(await accounts.register('kestrel', 'other-pass'), null, 'taken, whatever the case');
  assert.equal(await accounts.login('Kestrel', 'other-pass'), null, 'the second register did not replace the password');
  assert.equal(await accounts.login('Kestrel', 'wrong-pass'), null);
  assert.equal((await accounts.login('KESTREL', 'right-pass'))?.name, 'Kestrel', 'a login in another case signs in as the registered name');
});

test('a token names its account until it expires; a tampered, truncated or foreign one names nobody', async (t) => {
  const { accounts } = await freshStore(t, 60_000);
  const { token } = (await accounts.register('Wren', 'wren-pass'))!;
  assert.equal(accounts.nameForToken(token), 'Wren');
  const [name, issued, expires, mac] = token.split('.') as [string, string, string, string];
  const forged = [Buffer.from('other').toString('base64url'), issued, expires, mac].join('.');
  assert.equal(accounts.nameForToken(forged), null, 'another name under the same signature');
  assert.equal(accounts.nameForToken([name, issued, (parseInt(expires, 36) + 1e6).toString(36), mac].join('.')), null, 'a pushed-back expiry breaks the signature');
  assert.equal(accounts.nameForToken(token.slice(0, -4)), null, 'a cut-short signature');
  assert.equal(accounts.nameForToken(`${token}.x`), null, 'an extra part');
  const { accounts: other } = await freshStore(t);
  await other.register('Wren', 'wren-pass');
  assert.equal(other.nameForToken(token), null, 'a token signed with another store\'s secret');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 61_000 });
  assert.equal(accounts.nameForToken(token), null, 'expired');
});

test('credits add up, best keeps the best single credit, and the leaderboard ranks by score', async (t) => {
  const { accounts } = await freshStore(t);
  for (const name of ['Ann', 'Bo', 'Cy']) await accounts.register(name, `${name}-pass`);
  accounts.credit('ann', { kills: 3, deaths: 1, score: 400, games: 1 });
  accounts.credit('Ann', { kills: 1, deaths: 2, score: 100, games: 1 });
  accounts.credit('Bo', { kills: 9, deaths: 0, score: 900, games: 1 });
  accounts.credit('Nobody', { kills: 1, deaths: 1, score: 1, games: 1 });
  assert.deepEqual(accounts.stats('ANN'), { name: 'Ann', kills: 4, deaths: 3, score: 500, games: 2, best: 400 });
  assert.equal(accounts.stats('Nobody'), null, 'credit to an unknown name makes no account');
  assert.deepEqual(accounts.leaderboard(3).map((r) => [r.name, r.score]), [['Bo', 900], ['Ann', 500], ['Cy', 0]]);
  assert.deepEqual(accounts.leaderboard(1).map((r) => r.name), ['Bo']);
  await accounts.flush();
});

test('flush writes pending credits at once, and a reopened store reads accounts, stats and passwords back', async (t) => {
  const { dataDir, accounts } = await freshStore(t);
  await accounts.register('Dee', 'dee-pass');
  accounts.credit('Dee', { kills: 2, deaths: 1, score: 50, games: 1 });
  await accounts.flush();
  const onDisk = JSON.parse(await readFile(join(dataDir, 'accounts.json'), 'utf8')) as Record<string, { stats: unknown }>;
  assert.deepEqual(onDisk.dee?.stats, { kills: 2, deaths: 1, score: 50, games: 1, best: 50 });
  const reopened = await openAccounts(dataDir, LIMITS.sessionMs);
  assert.deepEqual(reopened.stats('dee'), { name: 'Dee', kills: 2, deaths: 1, score: 50, games: 1, best: 50 });
  assert.equal((await reopened.login('Dee', 'dee-pass'))?.name, 'Dee');
  assert.equal(await reopened.register('DEE', 'x-pass'), null, 'still taken after the reopen');
});
