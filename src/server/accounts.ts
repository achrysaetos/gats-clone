import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Stats = { kills: number; deaths: number; score: number; games: number; best: number };
export type StatsRow = Stats & { name: string };
type Account = { name: string; salt: string; hash: string; stats: Stats };
export type Session = { token: string; name: string };

export type Accounts = {
  register(name: string, password: string): Promise<Session | null>;
  login(name: string, password: string): Promise<Session | null>;
  nameForToken(token: string): string | null;
  stats(name: string): StatsRow | null;
  leaderboard(limit: number): StatsRow[];
  credit(name: string, delta: { kills: number; deaths: number; score: number; games: number }): void;
  flush(): Promise<void>;
};

const key = (name: string) => name.toLowerCase();
const SAVE_DELAY_MS = 2000;

export async function openAccounts(dataDir: string): Promise<Accounts> {
  await mkdir(dataDir, { recursive: true });
  const file = join(dataDir, 'accounts.json');
  let byKey: Record<string, Account> = {};
  try {
    byKey = JSON.parse(await readFile(file, 'utf8')) as Record<string, Account>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const tokens = new Map<string, string>();

  // Saves are chained so concurrent credits never interleave partial writes; rename keeps the file whole on crash.
  let saving = Promise.resolve();
  const save = () => {
    saving = saving.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(byKey));
      await rename(tmp, file);
    }).catch((err: unknown) => console.error('accounts save failed', err));
    return saving;
  };
  // Credits arrive on every death; batching them keeps a busy room from rewriting the whole file each time.
  let pending: ReturnType<typeof setTimeout> | null = null;
  const saveSoon = () => {
    pending ??= setTimeout(() => { pending = null; void save(); }, SAVE_DELAY_MS);
  };

  const issue = (account: Account): Session => {
    const token = randomBytes(24).toString('hex');
    tokens.set(token, key(account.name));
    return { token, name: account.name };
  };
  const row = (a: Account): StatsRow => ({ name: a.name, ...a.stats });

  return {
    async register(name, password) {
      if (byKey[key(name)]) return null;
      const salt = randomBytes(16);
      const hash = await scryptAsync(password, salt, 64);
      if (byKey[key(name)]) return null;
      const account: Account = {
        name, salt: salt.toString('hex'), hash: hash.toString('hex'),
        stats: { kills: 0, deaths: 0, score: 0, games: 0, best: 0 },
      };
      byKey[key(name)] = account;
      await save();
      return issue(account);
    },
    async login(name, password) {
      const account = byKey[key(name)];
      if (!account) return null;
      const hash = await scryptAsync(password, Buffer.from(account.salt, 'hex'), 64);
      return timingSafeEqual(hash, Buffer.from(account.hash, 'hex')) ? issue(account) : null;
    },
    nameForToken(token) {
      const k = tokens.get(token);
      return k ? byKey[k].name : null;
    },
    stats(name) {
      const a = byKey[key(name)];
      return a ? row(a) : null;
    },
    leaderboard(limit) {
      return Object.values(byKey).map(row).sort((a, b) => b.score - a.score).slice(0, limit);
    },
    credit(name, delta) {
      const a = byKey[key(name)];
      if (!a) return;
      a.stats.kills += delta.kills;
      a.stats.deaths += delta.deaths;
      a.stats.score += delta.score;
      a.stats.games += delta.games;
      a.stats.best = Math.max(a.stats.best, delta.score);
      saveSoon();
    },
    flush() {
      if (pending) { clearTimeout(pending); pending = null; void save(); }
      return saving;
    },
  };
}
