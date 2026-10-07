/// <reference types="node" />
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { WORLD } from '../../../../../src/shared/defs.ts';
import type { Loadout } from '../../../../../src/shared/protocol.ts';
import type { Rect } from '../../../../../src/shared/sim/movement.ts';
import { findPath, navGrid, type NavGrid, type Point } from '../../../../../src/server/bot/nav.ts';
import { killOnExit } from '../../../../../scripts/kill-on-exit.ts';

export type Cdp = (method: string, params?: object) => Promise<any>;
export type Page = { cdp: Cdp; js: (expr: string) => Promise<any>; exceptions: string[]; close: () => void };
export type PageProblem = 'page exception' | 'console.error';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });

export async function openPage(opts: {
  profile: string;
  debugPort?: number;
  args?: readonly string[];
  viewport?: { width: number; height: number; dpr?: number };
  onEvent?: (method: string, params: any) => void;
  onProblem?: (kind: PageProblem, detail: string) => void;
  onClose?: () => void;
}): Promise<Page> {
  const port = opts.debugPort ?? await freePort();
  const chrome = killOnExit(spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), opts.profile))}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', ...(opts.args ?? []), 'about:blank',
  ], { stdio: 'ignore' }));
  let target = '';
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      target = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
    } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('chrome did not expose a page target');
  const ws = new WebSocket(target);
  await new Promise((r) => ws.once('open', r));
  if (opts.onClose) ws.on('close', opts.onClose);
  let nextId = 1;
  const pending = new Map<number, (v: any) => void>();
  const exceptions: string[] = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const text = m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text;
      exceptions.push(text);
      opts.onProblem?.('page exception', text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      opts.onProblem?.('console.error', JSON.stringify(m.params.args.map((a: { value?: unknown }) => a.value)));
    }
    opts.onEvent?.(m.method, m.params);
  });
  const cdp: Cdp = (method, params = {}) => new Promise((r) => { const id = nextId++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  if (opts.viewport) await cdp('Emulation.setDeviceMetricsOverride', { width: opts.viewport.width, height: opts.viewport.height, deviceScaleFactor: opts.viewport.dpr ?? 1, mobile: false });
  const close = () => { ws.removeAllListeners('close'); ws.close(); chrome.kill(); };
  return { cdp, js, exceptions, close };
}

export async function serversListed(page: Page, ms = 6000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await page.js(`document.querySelectorAll('#servers .server').length`)) === 4) return true;
    await sleep(100);
  }
  return false;
}

/** `press` clicks Play with a real mouse press: the page's first user gesture unlocks audio, which a synthetic .click() never triggers. */
export async function joinFromMenu(page: Page, opts: { room?: number; name?: string; loadout?: Loadout; press?: boolean } = {}) {
  await serversListed(page);
  if (opts.loadout) {
    await page.js(`localStorage.setItem('skirmish.loadout', '${JSON.stringify(opts.loadout)}'); location.reload()`);
    await sleep(500);
    await serversListed(page);
  }
  await page.js(`document.querySelectorAll('#servers .server')[${opts.room ?? 0}].click()${opts.name === undefined ? '' : `; document.getElementById('name').value = '${opts.name}'`}`);
  if (!opts.press) { await page.js(`document.getElementById('play').click()`); return; }
  const [x, y] = await page.js(`(() => { const b = document.getElementById('play'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await page.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

export async function respawnIfDead(page: Page, waitMs = 0): Promise<boolean> {
  const end = Date.now() + waitMs;
  while (!(await page.js(`!document.getElementById('death').hidden && !document.getElementById('respawn').disabled`))) {
    if (Date.now() >= end) return false;
    await sleep(100);
  }
  await page.js(`document.getElementById('respawn').click()`);
  return true;
}

export const DIRS = { right: ['KeyD', 'd', 68], left: ['KeyA', 'a', 65], up: ['KeyW', 'w', 87], down: ['KeyS', 's', 83] } as const;
export type Dir = keyof typeof DIRS;

export const key = (page: Page, type: 'keyDown' | 'keyUp', code: string, k: string, vk = k.toUpperCase().charCodeAt(0)) =>
  page.cdp('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk });
export const dirKey = (page: Page, type: 'keyDown' | 'keyUp', d: Dir) => { const [code, k, vk] = DIRS[d]; return key(page, type, code, k, vk); };

export async function hold(page: Page, dirs: readonly Dir[], ms: number) {
  for (const d of dirs) await dirKey(page, 'keyDown', d);
  await sleep(ms);
  for (const d of dirs) await dirKey(page, 'keyUp', d);
}

const grids = new WeakMap<readonly Rect[], NavGrid>();
export function navGridFor(worldSize: number, walls: readonly Rect[]): NavGrid {
  let grid = grids.get(walls);
  if (!grid) grids.set(walls, grid = navGrid(worldSize, walls, WORLD.playerRadius));
  return grid;
}

const WAYPOINT_MIN_PX = 30;
const AXIS_MIN_PX = 20;
const AXIS_MIN_SHARE = 0.38;

export function pathStep(grid: NavGrid, from: Point, to: Point): Dir[] {
  const next = findPath(grid, from, to, 20_000)?.find((q) => Math.hypot(q.x - from.x, q.y - from.y) > WAYPOINT_MIN_PX) ?? to;
  const dx = next.x - from.x, dy = next.y - from.y, len = Math.hypot(dx, dy);
  const dirs: Dir[] = [];
  if (Math.abs(dx) > Math.max(AXIS_MIN_PX, len * AXIS_MIN_SHARE)) dirs.push(dx > 0 ? 'right' : 'left');
  if (Math.abs(dy) > Math.max(AXIS_MIN_PX, len * AXIS_MIN_SHARE)) dirs.push(dy > 0 ? 'down' : 'up');
  return dirs;
}
