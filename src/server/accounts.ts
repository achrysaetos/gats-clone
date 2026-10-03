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

async function writeFileAtomic(file: string, data: string) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}
const SAVE_DELAY_MS = 2000;
const UNKNOWN_ACCOUNT_SALT = randomBytes(16);

export async function openAccounts(dataDir: string): Promise<Accounts> {
  await mkdir(dataDir, { recursive: true });
  const file = join(dataDir, 'accounts.json');
  const byKey = new Map<string, Account>();
  try {
    const saved = JSON.parse(await readFile(file, 'utf8')) as Record<string, Account>;
    for (const account of Object.values(saved)) byKey.set(key(account.name), account);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const tokens = new Map<string, string>();

  let saveQueue = Promise.resolve();
  const save = () => {
    saveQueue = saveQueue
      .then(() => writeFileAtomic(file, JSON.stringify(Object.fromEntries(byKey))))
      .catch((err: unknown) => console.error('accounts save failed', err));
    return saveQueue;
  };
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
      if (byKey.has(key(name))) return null;
      const salt = randomBytes(16);
      const hash = await scryptAsync(password, salt, 64);
      if (byKey.has(key(name))) return null;
      const account: Account = {
        name, salt: salt.toString('hex'), hash: hash.toString('hex'),
        stats: { kills: 0, deaths: 0, score: 0, games: 0, best: 0 },
      };
      byKey.set(key(name), account);
      await save();
      return issue(account);
    },
    async login(name, password) {
      const account = byKey.get(key(name));
      const hash = await scryptAsync(password, account ? Buffer.from(account.salt, 'hex') : UNKNOWN_ACCOUNT_SALT, 64);
      return account && timingSafeEqual(hash, Buffer.from(account.hash, 'hex')) ? issue(account) : null;
    },
    nameForToken(token) {
      const k = tokens.get(token);
      return k ? byKey.get(k)?.name ?? null : null;
    },
    stats(name) {
      const a = byKey.get(key(name));
      return a ? row(a) : null;
    },
    leaderboard(limit) {
      return [...byKey.values()].map(row).sort((a, b) => b.score - a.score).slice(0, limit);
    },
    credit(name, delta) {
      const a = byKey.get(key(name));
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
      return saveQueue;
    },
  };
}
