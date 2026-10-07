/**
 * The vehicle kit's sprite cache across visits: every full bake is kept in IndexedDB as a PNG with its placement, keyed by the
 * sprite (kind, livery, variant, number, turn, scale, resolution, which carries the screen's density) and the kit's fingerprint,
 * so only the first visit pays for the bake. Storage that is blocked, full or missing just means baking again: every call
 * resolves, never throws.
 */
import type { Baked } from './vehiclemesh.ts';

const DB = 'skirmish-vehicles', STORE = 'sprites';
type Entry = { blob: Blob; ox: number; oy: number; res: number };

let db: Promise<IDBDatabase | null> | undefined;
function open(prefix: string): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      req.onsuccess = () => {
        const d = req.result;
        resolve(d);
        // Sweep sprites from older kits once a session.
        try {
          const cur = d.transaction(STORE, 'readwrite').objectStore(STORE).openCursor();
          cur.onsuccess = () => { const c = cur.result; if (!c) return; if (!String(c.key).startsWith(prefix)) c.delete(); c.continue(); };
        } catch { /* nothing to sweep */ }
      };
    } catch { resolve(null); }
  });
  return db;
}

/** A cached sprite as a ready-to-draw bitmap, or null. */
export async function cachedSprite(key: string, prefix: string): Promise<Baked | null> {
  try {
    const d = await open(prefix);
    if (!d) return null;
    const e = await new Promise<Entry | undefined>((resolve) => {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as Entry | undefined);
      r.onerror = () => resolve(undefined);
    });
    if (!e || typeof createImageBitmap !== 'function') return null;
    const bmp = await createImageBitmap(e.blob);
    return { canvas: bmp, ox: e.ox, oy: e.oy, res: e.res, ms: 0 };
  } catch { return null; }
}

/** Keeps a finished bake for next time (in the background; failures are ignored). */
export function storeSprite(key: string, prefix: string, b: Baked): void {
  void (async () => {
    try {
      const d = await open(prefix);
      if (!d) return;
      const c = b.canvas;
      const blob = 'convertToBlob' in c ? await (c as OffscreenCanvas).convertToBlob({ type: 'image/png' })
        : 'toBlob' in c ? await new Promise<Blob | null>((r) => (c as HTMLCanvasElement).toBlob(r, 'image/png')) : null;
      if (!blob) return;
      d.transaction(STORE, 'readwrite').objectStore(STORE).put({ blob, ox: b.ox, oy: b.oy, res: b.res } satisfies Entry, key);
    } catch { /* storage full or blocked: bake again next visit */ }
  })();
}
