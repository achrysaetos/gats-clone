import { SAMPLE_IDS, type SampleId } from './sfx.ts';

/** Recordings fetched once the first gesture unlocks audio, before anything asks: what nearly every game plays in its first seconds. */
export const COMMON_SAMPLES: readonly SampleId[] = ['click', 'hit', 'hurt', 'kill', 'thump', 'crack', 'sub', 'stepL', 'stepR', 'magOut', 'magIn', 'casing', 'pistol', 'smg', 'assault', 'shotgun', 'sniper', 'boom'];
const PARALLEL = 3;

export type SampleIo<B> = {
  manifest(): Promise<Record<string, unknown> | null>;
  bytes(file: string): Promise<ArrayBuffer | null>;
  decode(bytes: ArrayBuffer): Promise<B>;
};

type Slot<B> = { state: 'queued' } | { state: 'loading' } | { state: 'ready'; buffer: B } | { state: 'failed' };

const isSampleId = (k: string): k is SampleId => (SAMPLE_IDS as readonly string[]).includes(k);

/**
 * Fetches and decodes each recording the first time it is wanted, a few at a time, newest want first.
 * A cue whose recording is not ready plays its synth recipe meanwhile; a missing or undecodable file is never asked for again.
 */
export function createSampleLoader<B>(io: SampleIo<B>) {
  const slots = new Map<SampleId, Slot<B>>();
  const queue: SampleId[] = [];
  let files: Promise<Map<SampleId, string>> | null = null;
  let active = 0;
  let fetched = 0;

  const manifest = () => (files ??= io.manifest().catch(() => null).then((m) => {
    const out = new Map<SampleId, string>();
    for (const [id, file] of Object.entries(m ?? {})) if (isSampleId(id) && typeof file === 'string') out.set(id, file);
    return out;
  }));

  async function load(id: SampleId) {
    const file = (await manifest()).get(id);
    const bytes = file === undefined ? null : await io.bytes(file).catch(() => null);
    if (bytes) fetched++;
    const buffer = bytes && (await io.decode(bytes).catch(() => null));
    slots.set(id, buffer ? { state: 'ready', buffer } : { state: 'failed' });
  }

  function pump() {
    while (active < PARALLEL && queue.length) {
      const id = queue.shift()!;
      slots.set(id, { state: 'loading' });
      active++;
      void load(id).finally(() => { active--; pump(); });
    }
  }

  /** Asks for `ids`, ahead of anything still queued. */
  function want(ids: readonly SampleId[]) {
    for (const id of [...ids].reverse()) {
      const slot = slots.get(id);
      if (slot && slot.state !== 'queued') continue;
      if (slot) queue.splice(queue.indexOf(id), 1);
      slots.set(id, { state: 'queued' });
      queue.unshift(id);
    }
    pump();
  }

  const buffer = (id: SampleId): B | undefined => { const s = slots.get(id); return s?.state === 'ready' ? s.buffer : undefined; };
  const decoded = () => [...slots].filter(([, s]) => s.state === 'ready').map(([id]) => id);
  return { want, buffer, decoded, fetched: () => fetched };
}
