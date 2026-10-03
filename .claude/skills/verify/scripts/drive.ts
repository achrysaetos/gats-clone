/// <reference types="node" />
// Usage: node drive.ts <run-dir> [step ...]   Steps: menu account join move fire latency chat leave (default, in order), plus touch on request.
// LAG=<one-way ms> and JITTER=<ms> shape the page's own socket through the client's dev-only ?lag/?jitter params.
// Drives the real client in headless Chrome over CDP against the server launch.sh started, reads the page's own
// WebSocket frames as wire evidence, and cross-checks from an independent observer client in the same room.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { WEAPONS, type WeaponId } from '../../../../src/shared/defs.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node drive.ts <run-dir> [step ...]'); process.exit(2); }
const ALL = ['menu', 'account', 'join', 'move', 'fire', 'latency', 'chat', 'leave'];
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

type Snap = { t: 'snap'; self: { id: number; ammo: number; reloading: boolean }; players: { id: number; name: string; x: number; y: number; alive: boolean; weapon: WeaponId }[] };
const frames = { welcome: null as null | { id: number }, last: null as null | Snap, sent: 0, snapAt: [] as number[] };
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
page.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
  if (m.method === 'Network.webSocketFrameReceived') {
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') frames.welcome = msg;
    if (msg.t === 'snap') { frames.last = msg; frames.snapAt.push(m.params.timestamp * 1000); }
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
// Bots can kill the driven player between steps; respawn through the real death screen instead of failing on a dead player.
const ensureAlive = async () => {
  if (me()?.alive) return;
  log('note driven player is dead, respawning through the death screen');
  await until(async () => js(`!document.getElementById('respawn').disabled && !document.getElementById('death').hidden`), 8000);
  await js(`document.getElementById('respawn').click()`);
  await until(() => !!me()?.alive, 4000);
  await sleep(300);
};
const humansIn = async (room: string) => ((await (await fetch(`${BASE}/api/servers`)).json()) as { id: string; humans: number }[]).find((r) => r.id === room)?.humans;

let humansBefore = 0;
const observerChat: { from: string; text: string }[] = [];
let observerBoard: string[] = [];
const observer = new WebSocket(`ws://localhost:${PORT}/ws?room=ffa`);
observer.on('open', () => observer.send(JSON.stringify({ t: 'join', name: 'Observer', loadout: { weapon: 'pistol', armor: 'none', color: 'green' } })));
observer.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'chat') observerChat.push(m);
  if (m.t === 'snap' && m.leaderboard) observerBoard = m.leaderboard.map((r: { name: string }) => r.name);
});

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: `${BASE}/?dev&lag=${Number(process.env.LAG ?? 0)}&jitter=${Number(process.env.JITTER ?? 0)}` });
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
    await js(`document.querySelector('#servers .server').click(); document.getElementById('name').value = '${NAME}'`);
    // A real press, like a player's: the page's first user gesture unlocks audio, which a synthetic .click() never triggers.
    const [px, py] = await js(`(() => { const b = document.getElementById('play'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await mouse('mousePressed', px, py);
    await mouse('mouseReleased', px, py);
    expect('welcome frame received on the page socket', await until(() => frames.welcome !== null));
    expect('menu hidden and HUD shown', await until(async () => js(`document.getElementById('menu').hidden && !document.getElementById('hud').hidden`)));
    expect('own player present in snapshots', await until(() => !!me()));
    expect('server human count in ffa rises by one', await until(async () => (await humansIn('ffa')) === humansBefore + 1), `baseline ${humansBefore} incl. observer`);
    expect('observer leaderboard lists the player', await until(() => observerBoard.includes(NAME)));
    await shot('joined');
  },
  async move() {
    await ensureAlive();
    await until(() => !!me());
    const before = me()!;
    await key('KeyD', 'd', 700);
    await sleep(200);
    const after = me()!;
    expect('holding D moves the player right on the server', !!after && after.x > before.x + 50, `x ${before.x.toFixed(0)} -> ${after?.x.toFixed(0)}`);
    await shot('moved');
  },
  async fire() {
    await ensureAlive();
    const ammo = frames.last!.self.ammo;
    await mouse('mouseMoved', 900, 400);
    await mouse('mousePressed', 900, 400);
    await sleep(80);
    await mouse('mouseReleased', 900, 400);
    expect('click fires: server ammo decreases', await until(() => frames.last!.self.ammo < ammo), `ammo ${ammo} -> ${frames.last!.self.ammo}`);
    await shot('fired');

    const CLICKS = 6;
    let weapon = WEAPONS[me()!.weapon], before = 0, fired = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      await ensureAlive();
      weapon = WEAPONS[me()!.weapon];
      if (frames.last!.self.ammo < CLICKS) { await key('KeyR', 'r', 60); await until(() => !frames.last!.self.reloading && frames.last!.self.ammo >= CLICKS, weapon.reloadMs + 2000); }
      await sleep(weapon.fireMs);
      before = frames.last!.self.ammo;
      // 8ms taps always fall inside one 33ms input sample; spaced just past the fire cooldown so every press is allowed.
      for (let i = 0; i < CLICKS; i++) {
        await mouse('mousePressed', 900, 400);
        await sleep(8);
        await mouse('mouseReleased', 900, 400);
        await sleep(weapon.fireMs + 40);
      }
      await sleep(400);
      fired = before - frames.last!.self.ammo;
      if (me()?.alive) break;
      log(`info player died during the click burst; retrying`);
    }
    expect(`${CLICKS} quick clicks fire ${CLICKS} shots (server ammo)`, fired === CLICKS, `${weapon.name} ammo ${before} -> ${frames.last!.self.ammo}, fired ${fired}`);
  },
  async latency() {
    const samples: number[] = [];
    let misses = 0;
    await js(`window.maxCorrection = 0; (function watch() { maxCorrection = Math.max(maxCorrection, skirmishDev.drawnSelf().correction); requestAnimationFrame(watch); })(); 0`);
    for (let i = 0; i < 10; i++) {
      await ensureAlive();
      const [code, k] = i % 2 === 0 ? ['KeyA', 'a'] : ['KeyD', 'd'];
      await js(`window.probe = new Promise((res) => addEventListener('keydown', (e) => {
        const t0 = e.timeStamp, x0 = skirmishDev.drawnSelf().x;
        const poll = () => {
          const d = skirmishDev.drawnSelf();
          if (d.at >= t0 && Math.abs(d.x - x0) > 0.5) res(d.at - t0);
          else if (performance.now() - t0 > 2000) res(null);
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }, { once: true, capture: true })); 0`);
      await key(code, k, 250);
      const ms = await js('window.probe');
      if (typeof ms === 'number') samples.push(ms); else misses++;
      await sleep(500);
    }
    const inOrder = samples.map((s) => s.toFixed(0)).join(",");
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] ?? NaN;
    const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] ?? NaN;
    const gaps = frames.snapAt.slice(1).map((t, i) => t - frames.snapAt[i]!).sort((a, b) => a - b);
    log(`info snapshot arrival gaps at the page: median ${gaps[gaps.length >> 1]!.toFixed(0)}ms p95 ${gaps[Math.floor(gaps.length * 0.95)]!.toFixed(0)}ms max ${gaps[gaps.length - 1]!.toFixed(0)}ms over ${gaps.length}`);
    log(`info largest misprediction being smoothed while moving: ${Number(await js('maxCorrection')).toFixed(1)}px`);
    // Prediction draws own movement from the next input sample, so the bound holds at any LAG.
    expect('own movement drawn within 50ms of keydown (median)', median <= 50 && samples.length >= 5,
      `median ${median.toFixed(0)}ms p95 ${p95.toFixed(0)}ms n=${samples.length} misses=${misses} lag=${process.env.LAG ?? 0} jitter=${process.env.JITTER ?? 0} samples in order=${inOrder}`);
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
    await ensureAlive();
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
