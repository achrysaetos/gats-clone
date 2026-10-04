/// <reference types="node" />
// Usage: node combat.ts <run-dir> [room ...]   Rooms: tdm dom ffa (default: tdm dom).
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { PERK_INFO } from '../../../../src/shared/defs.ts';
import { segmentEntersRectAt, type Rect } from '../../../../src/shared/sim/movement.ts';
import type { Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { killOnExit } from '../../../../scripts/kill-on-exit.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node combat.ts <run-dir> [room ...]'); process.exit(2); }
const ROOMS = process.argv.length > 3 ? process.argv.slice(3) : ['tdm', 'dom'];
const ROOM_INDEX: Record<string, number> = { ffa: 0, tdm: 1, dom: 2 };
const PORT = readFileSync(join(RUN, 'port'), 'utf8').trim();
const BASE = `http://localhost:${PORT}`;
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'combat.log');
mkdirSync(EV, { recursive: true });
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1280, H = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];

const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });
const debugPort = await freePort();
const chrome = killOnExit(spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-combat-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' }));

let target = '';
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    target = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
  } catch {}
  if (!target) await sleep(200);
}
const page = new WebSocket(target);
await new Promise((r) => page.once('open', r));

type Player = { id: number; name: string; x: number; y: number; team: 'red' | 'blue' | null; alive: boolean };
type Dmg = { e: 'dmg'; attacker: number | null; victim: number; amount: number; kind: 'player' | 'crate' };
type Snap = {
  t: 'snap'; self: { id: number; viewRadius: number; perks: Record<string, string> }; players: Player[];
  crates: { id: number; x: number; y: number; size: number }[]; match: { mode: string }; events: { e: string }[];
};
const frames = { welcome: null as null | { id: number; mode: string; walls: Rect[] }, last: null as null | Snap, dmg: [] as (Dmg & { at: number })[] };
let nextId = 1;
let socketId = '';
let full: Snapshot | null = null;
const pending = new Map<number, (v: any) => void>();
page.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
  // A page left by navigation can linger in the back/forward cache with its socket open; only the newest socket counts.
  if (m.method === 'Network.webSocketCreated') { socketId = m.params.requestId; full = null; frames.last = null; }
  else if (m.method === 'Network.webSocketFrameReceived' && m.params.requestId === socketId) {
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') frames.welcome = msg;
    if (msg.t === 'snap') {
      full = fillSnapshot(msg, full) ?? full;
      frames.last = full;
      for (const e of msg.events) if (e.e === 'dmg') frames.dmg.push({ ...e, at: Date.now() });
    }
  } else if (m.method === 'Runtime.exceptionThrown') problems.push(`page exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`console.error: ${JSON.stringify(m.params.args.map((a: { value?: unknown }) => a.value))}`);
});
const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name: string) => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64')); return join(EV, `${name}.png`); };
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); };
const until = async (fn: () => boolean | Promise<boolean>, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return false; };
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
const myId = () => frames.welcome?.id;
const me = () => frames.last?.players.find((p) => p.id === myId());
const welcomeMode = () => frames.welcome?.mode;

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
log(`combat ${new Date().toISOString()} base=${BASE} rooms=${ROOMS.join(',')}`);

function nearestTarget(self: Player, snap: Snap): { x: number; y: number; what: string } | null {
  const enemies = snap.players.filter((p) => p.id !== self.id && p.alive && (self.team === null || p.team !== self.team));
  const crates = snap.crates.map((c) => ({ x: c.x + c.size / 2, y: c.y + c.size / 2 }));
  const d = (p: { x: number; y: number }) => Math.hypot(p.x - self.x, p.y - self.y);
  const clear = (p: { x: number; y: number }) => !(frames.welcome?.walls ?? []).some((w) => segmentEntersRectAt(self.x, self.y, p.x - self.x, p.y - self.y, w) !== null);
  const enemy = enemies.filter(clear).sort((a, b) => d(a) - d(b))[0];
  if (enemy && d(enemy) < 650) return { x: enemy.x, y: enemy.y, what: `bot ${enemy.name}` };
  const crate = crates.filter(clear).sort((a, b) => d(a) - d(b))[0];
  return crate ? { ...crate, what: 'crate' } : null;
}

async function joinRoom(room: string) {
  frames.welcome = null; frames.last = null; frames.dmg = [];
  await cdp('Page.navigate', { url: BASE });
  await until(async () => (await js(`document.querySelectorAll('#servers .server').length`)) === 3, 6000);
  const name = `Combat${Math.floor(Math.random() * 1e4)}`;
  await js(`document.querySelectorAll('#servers .server')[${ROOM_INDEX[room]}].click(); document.getElementById('name').value = '${name}'; document.getElementById('play').click()`);
  expect(`${room}: joined (welcome frame on the page socket)`, await until(() => frames.welcome !== null && !!me(), 6000), `mode ${welcomeMode()}`);
}

async function objective(room: string) {
  const shown = await until(async () => js(`!!document.getElementById('objective') && !document.getElementById('objective').hidden`), 2000);
  const text = shown ? String(await js(`document.getElementById('objective').textContent`)) : '';
  const team = me()?.team;
  const wanted = room === 'ffa' ? /Free for all/ : room === 'tdm' ? /Team Deathmatch/ : /Domination/;
  expect(`${room}: objective banner shows on join`, shown && wanted.test(text), text);
  if (team) expect(`${room}: banner names the player's team from the snapshot (${team})`, text.toUpperCase().includes(team.toUpperCase()));
  const path = await shot(`objective-${room}`);
  log(`     screenshot ${path}`);
  const gone = await until(async () => js(`document.getElementById('objective').hidden`), 6000);
  expect(`${room}: objective banner hides after about 4s`, gone);
}

type Watch = { room: string; shots: number; hurtShot: string; mateShot: string };

async function shootOnce(w: Watch): Promise<{ mine: Dmg[]; what: string } | null> {
  const snap = frames.last, self = me();
  if (!snap || !self?.alive) {
    const clicked = await js(`(() => { const b = document.getElementById('respawn'); if (document.getElementById('death').hidden || b.disabled) return false; b.click(); return true; })()`);
    if (clicked && await until(() => !!me()?.alive, 3000)) {
      const reshown = await until(async () => js(`!document.getElementById('objective').hidden`), 1000);
      expect(`${w.room}: objective banner stays hidden after respawning into the same round`, !reshown);
    }
    await sleep(200);
    return null;
  }
  const mate = self.team && snap.players.find((p) => p.id !== self.id && p.alive && p.team === self.team && Math.hypot(p.x - self.x, p.y - self.y) < 500);
  if (mate && !w.mateShot) {
    w.mateShot = await shot(`teammate-${w.room}`);
    log(`     screenshot ${w.mateShot} (teammate ${mate.name} in view; bodies should both be ${self.team}, the teammate marked)`);
  }
  const t = nearestTarget(self, snap);
  if (!t) {
    // Crates are culled to the view, so with no bot near and no crate on screen the driver must go find one.
    const toCenter = [...(self.x < 1500 ? [['KeyD', 'd']] : [['KeyA', 'a']]), ...(self.y < 1500 ? [['KeyS', 's']] : [['KeyW', 'w']])];
    for (const [code, key] of toCenter) await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
    await sleep(400);
    for (const [code, key] of toCenter) await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
    return null;
  }
  const scale = Math.max(W, H) / (2 * (snap.self.viewRadius || 900));
  const sx = W / 2 + (t.x - self.x) * scale, sy = H / 2 + (t.y - self.y) * scale;
  const before = frames.dmg.length;
  const dist = Math.hypot(t.x - self.x, t.y - self.y);
  const walk = dist < 260 ? [] : [
    ...(t.x - self.x > 80 ? [['KeyD', 'd']] : t.x - self.x < -80 ? [['KeyA', 'a']] : []),
    ...(t.y - self.y > 80 ? [['KeyS', 's']] : t.y - self.y < -80 ? [['KeyW', 'w']] : []),
  ];
  for (const [code, key] of walk) await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
  await mouse('mouseMoved', sx, sy);
  await mouse('mousePressed', sx, sy);
  if (w.shots === 0) log(`     screenshot ${await shot(`muzzle-${w.room}`)} (first shot, toward ${t.what})`);
  await sleep(60);
  await mouse('mouseReleased', sx, sy);
  w.shots++;
  if (!w.hurtShot && frames.dmg.some((e) => e.victim === myId() && Date.now() - e.at < 150)) {
    w.hurtShot = await shot(`hurt-${w.room}`);
    log(`     screenshot ${w.hurtShot} (driven player just took damage)`);
  }
  await until(() => frames.dmg.slice(before).some((e) => e.attacker === myId()), 450);
  for (const [code, key] of walk) await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
  return { mine: frames.dmg.slice(before).filter((e) => e.attacker === myId()), what: t.what };
}

async function hitSomething(w: Watch) {
  const start = Date.now();
  let sawCrate = false, sawPlayer = false;
  while (!sawPlayer && Date.now() - start < 25_000 && !(sawCrate && Date.now() - start > 10_000)) {
    const r = await shootOnce(w);
    if (!r?.mine.length) continue;
    const kind = r.mine.some((e) => e.kind === 'player') ? 'player' : 'crate';
    if (kind === 'player' || !sawCrate) {
      log(`     screenshot ${await shot(`hit-${kind}-${w.room}`)} (target ${r.what}, ${r.mine.map((e) => `${e.kind}#${e.victim} -${e.amount}`).join(', ')})`);
    }
    if (kind === 'player') sawPlayer = true; else sawCrate = true;
  }
  const mine = frames.dmg.filter((e) => e.attacker === myId());
  expect(`${w.room}: a dmg event from the driven player arrives on the page socket`, mine.length > 0,
    `${mine.length} dmg events after ${w.shots} clicks; kinds ${[...new Set(mine.map((e) => e.kind))].join('+') || 'none'}`);
  expect(`${w.room}: every dmg event names a victim other than the shooter and a positive amount`, mine.every((e) => e.amount > 0 && e.victim !== myId()));
  if (!sawPlayer) log(`     note: no bot came into range, so the hitmarker was not exercised in ${w.room}`);
}

async function perkDock(w: Watch) {
  const start = Date.now();
  const open = () => js(`!document.getElementById('perk-panel').hidden`);
  while (!(await open()) && Date.now() - start < 90_000) await shootOnce(w);
  expect(`${w.room}: perk dock opens at 100 points`, await open(), `after ${((Date.now() - start) / 1000).toFixed(0)}s`);
  if (!(await open())) return;
  const rect = await js(`(() => { const r = document.getElementById('perk-panel').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
  const tiles = await js(`document.querySelectorAll('#perk-panel .perk').length`);
  const center = { l: W * 0.25, t: H * 0.2, r: W * 0.75, b: H * 0.75 };
  const clear = rect.t >= center.b || rect.b <= center.t || rect.l >= center.r || rect.r <= center.l;
  expect(`${w.room}: perk dock keeps clear of the screen center`, clear && tiles === 10,
    `${tiles} tiles, dock ${Math.round(rect.r - rect.l)}x${Math.round(rect.b - rect.t)} at (${Math.round(rect.l)},${Math.round(rect.t)})`);
  const tile = await js(`(() => { const r = document.querySelectorAll('#perk-panel .perk')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse('mouseMoved', tile.x, tile.y);
  await sleep(150);
  const described = String(await js(`document.querySelector('#perk-panel .perk-desc').textContent`));
  expect(`${w.room}: hovering a tile shows its description in the dock`, described.startsWith(PERK_INFO.optics.name) && described.includes(PERK_INFO.optics.desc), described);
  log(`     screenshot ${await shot(`perk-dock-${w.room}`)}`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50 });
  expect(`${w.room}: pressing 2 picks the second tier 1 perk on the server`, await until(() => frames.last?.self.perks[1] === 'optics'), `perks ${JSON.stringify(frames.last?.self.perks)}`);
  expect(`${w.room}: the dock closes after the pick`, await until(async () => !(await open())));
}

for (const [i, room] of ROOMS.entries()) {
  try {
    await joinRoom(room);
    await objective(room);
    const w: Watch = { room, shots: 0, hurtShot: '', mateShot: '' };
    await hitSomething(w);
    if (i === 0) await perkDock(w);
  } catch (e) { expect(`${room} ran without throwing`, false, String(e)); }
}
for (const p of problems.filter((p) => p.startsWith('page') || p.startsWith('console'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
page.close(); chrome.kill();
process.exit(problems.length ? 1 : 0);
