import { NAME_MAX } from '../shared/protocol.ts';

export function uniqueName(base: string, taken: Iterable<string>, reserved: (name: string) => boolean): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const free = (n: string) => !used.has(n.toLowerCase()) && !reserved(n);
  if (free(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, NAME_MAX - suffix.length) + suffix;
    if (free(candidate)) return candidate;
  }
}
