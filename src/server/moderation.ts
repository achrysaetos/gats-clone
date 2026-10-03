import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const BUILT_IN = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'pussy', 'whore', 'slut', 'bastard', 'retard', 'faggot', 'nazi', 'rape'];
const LOOKALIKES: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

const letters = (s: string) => [...s.toLowerCase()].map((ch) => LOOKALIKES[ch] ?? ch).filter((ch) => /\p{L}/u.test(ch)).join('');

export type Moderator = { isClean(text: string): boolean; mask(text: string): string };

export function makeModerator(extra: readonly string[] = []): Moderator {
  const blocked = [...new Set([...BUILT_IN, ...extra].map(letters).filter((w) => w.length >= 3))];
  const hit = (word: string) => { const l = letters(word); return blocked.some((b) => l.includes(b)); };
  return {
    isClean: (text) => !hit(text.replace(/\s+/g, '')) && !text.split(/\s+/).some(hit),
    mask: (text) => text.split(/(\s+)/).map((part) => (hit(part) ? '*'.repeat(part.length) : part)).join(''),
  };
}

/** Operators extend the built-in list with one word per line in <dataDir>/blocklist.txt. */
export async function loadModerator(dataDir: string): Promise<Moderator> {
  try {
    const words = (await readFile(join(dataDir, 'blocklist.txt'), 'utf8')).split('\n').map((w) => w.trim()).filter(Boolean);
    return makeModerator(words);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return makeModerator();
  }
}
