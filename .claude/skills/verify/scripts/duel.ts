/// <reference types="node" />
// Usage: node duel.ts <run-dir>   Two real browsers join FFA; A hunts B until each side's own socket proves the hit.
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { GameEvent, Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { killOnExit } from '../../../../scripts/kill-on-exit.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node duel.ts <run-dir>'); process.exit(2); }
const BASE = existsSync(join(RUN, 'url'))
  ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '')
  : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'duel.log');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { w: 1280, h: 800 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); };
const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });

type Dmg = Extract<GameEvent, { e: 'dmg' }>;
type Player = {
  label: string; name: string; chrome: ChildProcess;
  cdp: (method: string, params?: object) => Promise<any>;
  js: (expr: string) => Promise<any>;
  id: () => number | null; snap: () => Snapshot | null; dmg: Dmg[];
};

async function openPlayer(label: string, name: string): Promise<Player> {
  const port = await freePort();
  const chrome = killOnExit(spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-duel-'))}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' }));
  let target = '';
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      target = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
    } catch {}
    if (!target) await sleep(200);
  }
  const page = new WebSocket(target);
  await new Promise((r) => page.once('open', r));
  let nextId = 1;
  let welcomeId: number | null = null;
  let full: Snapshot | null = null;
  const dmg: Dmg[] = [];
  const pending = new Map<number, (v: any) => void>();
  page.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
    if (m.method === 'Network.webSocketFrameReceived') {
      const msg = JSON.parse(m.params.response.payloadData);
      if (msg.t === 'welcome') welcomeId = msg.id;
      if (msg.t === 'snap') {
        full = fillSnapshot(msg, full) ?? full;
        for (const e of msg.events as GameEvent[]) if (e.e === 'dmg') dmg.push(e);
      }
    } else if (m.method === 'Runtime.exceptionThrown') problems.push(`${label} page exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  });
  const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
  const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE });
  for (let i = 0; i < 50 && (await js(`document.querySelectorAll('#servers .server').length`)) !== 3; i++) await sleep(100);
  await js(`document.querySelector('#servers .server').click(); document.getElementById('name').value = '${name}'`);
  const [px, py] = await js(`(() => { const b = document.getElementById('play'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });
  return { label, name, chrome, cdp, js, id: () => welcomeId, snap: () => full, dmg };
}

const selfOf = (p: Player) => p.snap()?.players.find((v) => v.id === p.id());
const KEY = { right: ['KeyD', 'd', 68], left: ['KeyA', 'a', 65], down: ['KeyS', 's', 83], up: ['KeyW', 'w', 87] } as const;
async function hold(p: Player, dirs: (keyof typeof KEY)[], ms: number) {
  for (const d of dirs) await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: KEY[d][0], key: KEY[d][1], windowsVirtualKeyCode: KEY[d][2] });
  await sleep(ms);
  for (const d of dirs) await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: KEY[d][0], key: KEY[d][1], windowsVirtualKeyCode: KEY[d][2] });
}
async function respawnIfDead(p: Player) {
  if (selfOf(p)?.alive !== false) return;
  for (let i = 0; i < 80 && (await p.js(`document.getElementById('respawn').disabled || document.getElementById('death').hidden`)); i++) await sleep(100);
  await p.js(`document.getElementById('respawn').click()`);
  await sleep(500);
}
const shot = async (p: Player, name: string) => {
  const { data } = await p.cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64'));
};

const a = await openPlayer('A', `Hunter${Math.floor(Math.random() * 1e4)}`);
const b = await openPlayer('B', `Target${Math.floor(Math.random() * 1e4)}`);
for (let i = 0; i < 60 && (!selfOf(a) || !selfOf(b)); i++) await sleep(100);
expect('both browsers joined the same room', !!selfOf(a) && !!selfOf(b), `${a.name} #${a.id()}, ${b.name} #${b.id()}`);

const deadline = Date.now() + 90_000;
let sawEachOther = false, hitSeenByA: Dmg | undefined, hitSeenByB: Dmg | undefined, shots = 0;
while (Date.now() < deadline && !(hitSeenByA && hitSeenByB)) {
  await respawnIfDead(a); await respawnIfDead(b);
  const pa = selfOf(a), pb = selfOf(b);
  if (!pa?.alive || !pb?.alive) { await sleep(200); continue; }
  const dx = pb.x - pa.x, dy = pb.y - pa.y, dist = Math.hypot(dx, dy);
  const aSeesB = !!a.snap()?.players.some((v) => v.id === b.id());
  const bSeesA = !!b.snap()?.players.some((v) => v.id === a.id());
  if (aSeesB && bSeesA) sawEachOther = true;
  if (dist > 420 || !aSeesB) {
    const dirs: (keyof typeof KEY)[] = [];
    if (Math.abs(dx) > 60) dirs.push(dx > 0 ? 'right' : 'left');
    if (Math.abs(dy) > 60) dirs.push(dy > 0 ? 'down' : 'up');
    await hold(a, dirs.length ? dirs : ['right'], 350);
    continue;
  }
  const mx = VIEW.w / 2 + (dx / dist) * 220, my = VIEW.h / 2 + (dy / dist) * 220;
  await a.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'none' });
  await a.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 });
  await sleep(30);
  await a.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 });
  shots++;
  await sleep(260);
  hitSeenByA = a.dmg.find((e) => e.attacker === a.id() && e.victim === b.id());
  hitSeenByB = b.dmg.find((e) => e.attacker === a.id() && e.victim === b.id());
  if (shots % 8 === 0 && !hitSeenByA) await hold(a, [Math.abs(dx) > Math.abs(dy) ? 'down' : 'right'], 300);
}
await shot(a, 'duel-hunter-view');
await shot(b, 'duel-target-view');
expect('each browser had the other in its own snapshots', sawEachOther);
expect("hunter's socket shows a dmg event naming the target", !!hitSeenByA, hitSeenByA ? `-${hitSeenByA.amount} after ${shots} shots` : `${shots} shots`);
expect("target's socket shows the same hit from the hunter", !!hitSeenByB, hitSeenByB ? `-${hitSeenByB.amount}` : '');
for (const p of problems.filter((x) => x.includes('exception'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
a.chrome.kill(); b.chrome.kill();
process.exit(problems.length ? 1 : 0);
