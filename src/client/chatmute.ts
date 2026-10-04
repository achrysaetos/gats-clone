import type { ChatLine } from './state.ts';

export type MutedNames = ReadonlySet<string>;
export type ChatEntry = { kind: 'said'; line: ChatLine } | { kind: 'muted'; from: string; at: number };

const MAX_MUTED = 200;

export function parseMuted(raw: string | null): MutedNames {
  let saved: unknown = null;
  try { saved = JSON.parse(raw ?? 'null'); } catch {}
  if (!Array.isArray(saved)) return new Set();
  return new Set(saved.filter((n): n is string => typeof n === 'string' && n !== '').slice(-MAX_MUTED));
}

export const serializeMuted = (muted: MutedNames) => JSON.stringify([...muted]);

export function toggleMute(muted: MutedNames, name: string): MutedNames {
  const next = new Set(muted);
  if (!next.delete(name)) next.add(name);
  return next;
}

/** Each muted sender collapses to one marker at their latest line, so muting a flood leaves a single row to click. */
export function chatEntries(lines: readonly ChatLine[], muted: MutedNames): ChatEntry[] {
  const marked = new Set<string>();
  const entries: ChatEntry[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.from || !muted.has(line.from)) entries.push({ kind: 'said', line });
    else if (!marked.has(line.from)) {
      marked.add(line.from);
      entries.push({ kind: 'muted', from: line.from, at: line.at });
    }
  }
  return entries.reverse();
}
