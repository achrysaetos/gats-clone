/** Quick emotes: a purely cosmetic message that never touches the simulation. */
export const EMOTE_IDS = ['salute', 'wave', 'laugh', 'gg', 'thumbs', 'nice', 'taunt', 'help'] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

/** Wheel order runs clockwise from the top; `key` is what the player sees in the wheel. */
export const EMOTES: Record<EmoteId, { label: string }> = {
  salute: { label: 'Salute' },
  wave: { label: 'Wave' },
  laugh: { label: 'Ha ha' },
  gg: { label: 'GG' },
  thumbs: { label: 'Thumbs up' },
  nice: { label: 'Nice shot!' },
  taunt: { label: 'Taunt' },
  help: { label: 'Help!' },
};

/** Minimum gap between one player's emotes; faster ones are dropped quietly. */
export const EMOTE_INTERVAL_MS = 900;
/** Players farther than this from the emoter (world px) do not see it, unless they share the emoter's team. */
export const EMOTE_RANGE = 1500;
export const isEmoteId = (v: unknown): v is EmoteId => typeof v === 'string' && (EMOTE_IDS as readonly string[]).includes(v);
