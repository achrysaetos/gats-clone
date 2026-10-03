/// <reference types="node" />
// Usage: node drive.ts <run-dir> [step ...]   Steps: menu account join move fire chat touch leave (default: all, in order).
// Drives the real client in headless Chrome over CDP against the server launch.sh started, reads the page's own
// WebSocket frames as wire evidence, and cross-checks from an independent observer client in the same room.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node drive.ts <run-dir> [step ...]'); process.exit(2); }
const ALL = ['menu', 'account', 'join', 'move', 'fire', 'chat', 'touch', 'leave'];
const steps = process.argv.length > 3 ? process.argv.slice(3) : ALL;
const PORT = readFileSync(join(RUN, 'port'), 'utf8').trim();
const BASE = `http://localhost:${PORT}`;
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'drive.log');
mkdirSync(EV, { recursive: true });
const NAME = `Verifier${Math.floor(Math.random() * 1e4)}`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];

const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });
const debugPort = await freePort();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-verify-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

let target = '';
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    target = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
  } catch { /* chrome still starting */ }
  if (!target) await sleep(200);
}
const page = new WebSocket(target);
await new Promise((r) => page.once('open', r));

type Snap = { t: 'snap'; self: { id: number; ammo: number }; players: { id: number; name: string; x: number; y: number }[] };
const frames = { welcome: null as null | { id: number }, last: null as null | Snap, sent: 0 };
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
page.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
  if (m.method === 'Network.webSocketFrameReceived') {
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') frames.welcome = msg;
    if (msg.t === 'snap') frames.last = msg;
  } else if (m.method === 'Network.webSocketFrameSent') frames.sent++;
  else if (m.method === 'Runtime.exceptionThrown') problems.push(`page exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`console.error: ${JSON.stringify(m.params.args.map((a: { value?: unknown }) => a.value))}`);
});
const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name: string) => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64')); };
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); };
const until = async (fn: () => boolean | Promise<boolean>, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };
const key = async (code: string, k: string, holdMs: number) => {
  const vk = k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk });
  await sleep(holdMs);
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk });
};
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
const me = () => frames.last?.players.find((p) => p.id === frames.welcome?.id);
const humansIn = async (room: string) => ((await (await fetch(`${BASE}/api/servers`)).json()) as { id: string; humans: number }[]).find((r) => r.id === room)?.humans;

let humansBefore = 0;
const observerChat: { from: string; text: string }[] = [];
let observerBoard: string[] = [];
const observer = new WebSocket(`ws://localhost:${PORT}/ws?room=ffa`);
observer.on('open', () => observer.send(JSON.stringify({ t: 'join', name: 'Observer', loadout: { weapon: 'pistol', armor: 'none', color: 'green' } })));
observer.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'chat') observerChat.push(m);
  if (m.t === 'snap') observerBoard = m.leaderboard.map((r: { name: string }) => r.name);
});

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: BASE });
await until(async () => (await js(`document.querySelectorAll('#servers .server').length`)) === 3);
log(`drive ${new Date().toISOString()} base=${BASE} name=${NAME} steps=${steps.join(',')}`);

const STEPS: Record<string, () => Promise<void>> = {
  async menu() {
    expect('menu lists three rooms', (await js(`[...document.querySelectorAll('#servers .server')].map(b => b.textContent).join('|')`)).match(/FFA|TDM|DOM/g)?.length === 3);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    expect('menu has no horizontal scroll at 375px', await js(`document.documentElement.scrollWidth <= innerWidth`));
    await shot('menu-phone');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await shot('menu-desktop');
  },
  async account() {
    await js(`(() => { const [n, p] = document.querySelectorAll('#account input'); n.value = '${NAME}'; p.value = 'verify-pass'; [...document.querySelectorAll('#account button')].find(b => b.textContent === 'Register').click(); })()`);
    expect('UI shows signed-in name', await until(async () => (await js(`document.getElementById('account').textContent`)).includes(`Signed in as ${NAME}`)));
    expect('token stored in localStorage', !!(await js(`localStorage.getItem('skirmish.token')`)));
    const stats = await fetch(`${BASE}/api/stats/${NAME}`);
    expect('account exists server-side (GET /api/stats)', stats.ok, `status ${stats.status}`);
    await shot('account-signed-in');
  },
  async join() {
    await until(() => observerBoard.includes('Observer'));
    humansBefore = (await humansIn('ffa')) ?? 0;
    await js(`document.querySelector('#servers .server').click(); document.getElementById('name').value = '${NAME}'; document.getElementById('play').click()`);
    expect('welcome frame received on the page socket', await until(() => frames.welcome !== null));
    expect('menu hidden and HUD shown', await until(async () => js(`document.getElementById('menu').hidden && !document.getElementById('hud').hidden`)));
    expect('own player present in snapshots', await until(() => !!me()));
    expect('server human count in ffa rises by one', await until(async () => (await humansIn('ffa')) === humansBefore + 1), `baseline ${humansBefore} incl. observer`);
    expect('observer leaderboard lists the player', await until(() => observerBoard.includes(NAME)));
    await shot('joined');
  },
  async move() {
    await until(() => !!me());
    const before = me()!;
    await key('KeyD', 'd', 700);
    await sleep(200);
    const after = me()!;
    expect('holding D moves the player right on the server', !!after && after.x > before.x + 50, `x ${before.x.toFixed(0)} -> ${after?.x.toFixed(0)}`);
    await shot('moved');
  },
  async fire() {
    const ammo = frames.last!.self.ammo;
    await mouse('mouseMoved', 900, 400);
    await mouse('mousePressed', 900, 400);
    await sleep(80);
    await mouse('mouseReleased', 900, 400);
    expect('click fires: server ammo decreases', await until(() => frames.last!.self.ammo < ammo), `ammo ${ammo} -> ${frames.last!.self.ammo}`);
    await shot('fired');
  },
  async chat() {
    const text = `hello ${Date.now()}`;
    await key('Enter', 'Enter', 30);
    await cdp('Input.insertText', { text });
    await key('Enter', 'Enter', 30);
    expect('own chat log shows the message', await until(async () => (await js(`document.getElementById('chat-log').textContent`)).includes(text)));
    expect('observer in the same room receives it', await until(() => observerChat.some((c) => c.from === NAME && c.text === text)));
    await shot('chat');
  },
  async touch() {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });
    await sleep(300);
    expect('touch buttons visible on a coarse pointer', await js(`getComputedStyle(document.querySelector('.touch-buttons')).display !== 'none'`));
    const touch = (type: string, points: { x: number; y: number; id: number }[]) => cdp('Input.dispatchTouchEvent', { type, touchPoints: points });
    const before = me()!;
    await touch('touchStart', [{ x: 90, y: 600, id: 1 }]);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: 90 + i * 12, y: 600, id: 1 }]); await sleep(30); }
    await sleep(600);
    await shot('touch-move');
    await touch('touchEnd', []);
    const after = me()!;
    expect('left thumb drag moves the player right on the server', !!after && after.x > before.x + 50, `x ${before.x.toFixed(0)} -> ${after?.x.toFixed(0)}`);
    const ammo = frames.last!.self.ammo;
    await touch('touchStart', [{ x: 300, y: 500, id: 2 }]);
    for (let i = 1; i <= 4; i++) { await touch('touchMove', [{ x: 300, y: 500 - i * 15, id: 2 }]); await sleep(30); }
    const fired = await until(() => frames.last!.self.ammo < ammo);
    await touch('touchEnd', []);
    expect('right thumb push fires: server ammo decreases', fired, `ammo ${ammo} -> ${frames.last!.self.ammo}`);
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp('Emulation.setEmulatedMedia', { features: [] });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  },
  async leave() {
    await cdp('Page.reload', { ignoreCache: true });
    expect('server human count returns to baseline after the page unloads (reload)', await until(async () => (await humansIn('ffa')) === humansBefore, 6000), `baseline ${humansBefore}`);
  },
};

for (const s of steps) {
  if (!STEPS[s]) { expect(`known step "${s}"`, false); continue; }
  try { await STEPS[s](); } catch (e) { expect(`step ${s} ran without throwing`, false, String(e)); }
}
for (const p of problems.filter((p) => p.startsWith('page') || p.startsWith('console'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
observer.close(); page.close(); chrome.kill();
process.exit(problems.length ? 1 : 0);
