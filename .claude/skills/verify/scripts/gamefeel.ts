/// <reference types="node" />
// Usage: node gamefeel.ts <run-dir> [seconds]   Plays FFA as a real user and screenshots each game-feel cue the moment it happens.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { GUN_IDS, GUNS, WORLD } from '../../../../src/shared/defs.ts';
import { segmentEntersRectAt, type Rect } from '../../../../src/shared/sim/movement.ts';
import type { GameEvent, Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { killOnExit } from '../../../../scripts/kill-on-exit.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node gamefeel.ts <run-dir> [seconds]'); process.exit(2); }
const SECONDS = Number(process.argv[3] ?? 240);
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 800);
const COLOR = process.env.COLOR ?? 'red';
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'gamefeel.log');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (line: string) => { const l = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`; console.log(l); appendFileSync(LOG, l + '\n'); };
let failures = 0;
const expect = (name: string, ok: boolean, detail = '') => { if (!ok) failures++; log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });
const debugPort = await freePort();
const chrome = killOnExit(spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-gamefeel-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' }));
let target = '';
for (let i = 0; i < 50 && !target; i++) {
  try { target = ((await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[]).find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''; } catch {}
  if (!target) await sleep(200);
}
const page = new WebSocket(target);
await new Promise((r) => page.once('open', r));

const st = { id: -1, walls: [] as Rect[], last: null as Snapshot | null, fresh: [] as GameEvent[], respawnsSent: 0 };
let nextId = 1, socketId = '';
const pending = new Map<number, (v: any) => void>();
page.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
  if (m.method === 'Network.webSocketCreated') { socketId = m.params.requestId; st.last = null; }
  else if (m.method === 'Network.webSocketFrameReceived' && m.params.requestId === socketId) {
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') { st.id = msg.id; st.walls = msg.walls; }
    if (msg.t === 'walls') st.walls = msg.walls;
    if (msg.t === 'snap') {
      st.last = fillSnapshot(msg, st.last) ?? st.last;
      st.fresh.push(...msg.events);
    }
  } else if (m.method === 'Network.webSocketFrameSent' && m.params.requestId === socketId && m.params.response.payloadData.includes('"t":"respawn"')) {
    st.respawnsSent++;
  } else if (m.method === 'Runtime.exceptionThrown') expect('no page exception', false, m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') expect('no console.error', false, JSON.stringify(m.params.args.map((a: { value?: unknown }) => a.value)));
});
const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name: string) => {
  const file = join(EV, `${name}.png`);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(data, 'base64'));
  log(`     screenshot ${file}`);
  return file;
};
const captured = new Set<string>();
/** Screenshots a cue once, `delayMs` after the frame that triggered it, so the cue is mid-animation. */
async function capture(tag: string, delayMs = 0, note = '') {
  if (captured.has(tag)) return;
  captured.add(tag);
  if (delayMs) await sleep(delayMs);
  log(`cue ${tag}${note ? `: ${note}` : ''}`);
  await shot(tag);
}
const until = async (fn: () => boolean | Promise<boolean>, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(30); } return false; };
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
const click = async (x: number, y: number) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
const key = (type: 'keyDown' | 'keyUp', code: string, k: string) => cdp('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
const tap = async (d: number) => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, code: `Digit${d}`, key: String(d), windowsVirtualKeyCode: 48 + d }); };
const me = () => st.last?.players.find((p) => p.id === st.id);
const visible = (ax: number, ay: number, bx: number, by: number) => !st.walls.some((w) => segmentEntersRectAt(ax, ay, bx - ax, by - ay, w) !== null);
const GUN_NAMES = new Map<string, number>(GUN_IDS.map((id) => [GUNS[id].name, GUNS[id].stage]));

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
log(`gamefeel ${W}x${H} ${SECONDS}s at ${BASE}`);
await cdp('Page.navigate', { url: `${BASE}/?dev` });
await sleep(800);
await js(`localStorage.setItem('skirmish.loadout', JSON.stringify({ weapon: 'smg', armor: 'medium', color: '${COLOR}' }))`);
await cdp('Page.reload');
await until(async () => (await js(`document.querySelectorAll('#servers .server').length`)) === 3, 6000);
await js(`document.querySelectorAll('#servers .server')[0].click(); document.getElementById('name').value = 'Feel'; document.getElementById('play').click()`);
expect('joined FFA', await until(() => !!me(), 6000));
if (st.last?.match.winner) log('note joined during a round end, so the objective waits for the next round');
else expect('objective banner introduces the round on join', await until(async () => js(`!document.getElementById('objective').hidden`), 1500));
await js(`window.deathShownAt = Infinity; new MutationObserver(() => { if (!document.getElementById('death').hidden && window.deathShownAt === Infinity) window.deathShownAt = performance.now(); if (document.getElementById('death').hidden) window.deathShownAt = Infinity; }).observe(document.getElementById('death'), { attributes: true, attributeFilter: ['hidden'] })`);
await mouse('mouseMoved', W / 2 + 120, H / 2);
await sleep(300);
expect('the canvas hides the OS cursor while playing', (await js(`getComputedStyle(document.getElementById('game')).cursor`)) === 'none');

const held = new Set<string>();
async function setKeys(want: string[]) {
  for (const k of [...held]) if (!want.includes(k)) { await key('keyUp', `Key${k.toUpperCase()}`, k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await key('keyDown', `Key${k.toUpperCase()}`, k); held.add(k); }
}

async function onEvents() {
  for (const e of st.fresh.splice(0)) {
    if (e.e === 'dmg' && e.victim === st.id && e.kind === 'player' && e.attacker !== st.id) await capture('hurt-arc', 70, `attacker ${e.attacker}`);
    if (e.e === 'dmg' && e.attacker === st.id && e.kind === 'player' && !captured.has('numbers-stack')) {
      const live: { victim: number; amount: number; height: number }[] = await js(`window.skirmishDev.liveNumbers()`) ?? [];
      const stacked = live.filter((n) => n.victim === e.victim).sort((a, b) => a.height - b.height);
      if (stacked.length > 1) {
        const closest = Math.min(...stacked.slice(1).map((n, i) => n.height - stacked[i]!.height));
        expect('numbers floating over one victim keep apart', closest >= 20, `closest gap ${closest.toFixed(0)}`);
        await capture('numbers-stack', 0, `victim ${e.victim} numbers ${stacked.map((n) => `${Math.round(n.amount)} at ${n.height.toFixed(0)}`).join(', ')}`);
      }
    }
    if (e.e === 'kill' && e.killerId === st.id) {
      log(`KILL ${e.victim} with ${e.weapon}${e.bounty ? ' (bounty)' : ''}`);
      await capture(e.bounty ? 'bounty-callout' : 'kill-popup', 120);
    }
    if (e.e === 'kill' && e.assisters.includes(st.id)) await capture('assist', 120, `${e.killer} killed ${e.victim}`);
    if (e.e === 'kill' && (GUN_NAMES.get(e.weapon) ?? 0) > 0) await capture('feed-evolved', 60, `${e.killer} ${e.weapon} ${e.victim}`);
  }
}

let earlyChecked = false, respawnChecked = false;
const pressedWeapon = async () => Number(await js(`[...document.querySelectorAll('#loadout-death .weapon')].findIndex((b) => b.ariaPressed === 'true')`));
const weaponTile = async (i: number) => js(`(() => { const r = document.querySelectorAll('#loadout-death .weapon')[${i}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

async function onDeath() {
  await until(async () => js(`!document.getElementById('death').hidden`), 2000);
  const openMs = Number(await js(`performance.now() - window.deathShownAt`));
  if (!earlyChecked && openMs < 400) {
    const before = await pressedWeapon();
    const other = before === 0 ? 1 : 0;
    const tile = await weaponTile(other);
    await click(tile.x, tile.y);
    const clickMs = Number(await js(`performance.now() - window.deathShownAt`));
    const early = await pressedWeapon();
    if (clickMs < 650) {
      earlyChecked = true;
      expect('a click on the death screen right after it opens leaves the loadout alone', early === before, `clicked ${Math.round(clickMs)}ms after it opened, pressed ${before} -> ${early}`);
      await sleep(Math.max(0, 800 - clickMs));
      await click(tile.x, tile.y);
      const late = await pressedWeapon();
      expect('after the delay the death screen takes clicks again', late === other, `pressed ${before} -> ${late}`);
    } else log(`note the early click landed ${Math.round(clickMs)}ms after the death screen opened, too late to judge; retrying on the next death`);
    const back = await weaponTile(before);
    await click(back.x, back.y);
    expect('the loadout is restored for the rest of the run', (await pressedWeapon()) === before);
  }
  await capture('death-screen', 0, `${Math.round(openMs)}ms after the death screen opened`);
  log(`death screen: ${await js(`['death-title', 'death-cause', 'death-lost'].map((id) => document.getElementById(id).hidden ? '' : document.getElementById(id).textContent).join(' | ')`)}`);
  await until(async () => js(`!document.getElementById('respawn').disabled`), 8000);
  const button = await js(`(() => { const b = document.getElementById('respawn').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  const sentBefore = st.respawnsSent;
  await click(button.x, button.y);
  const back = await until(() => !!me()?.alive, 3000);
  if (!back) {
    const why = await js(`JSON.stringify({ disabled: document.getElementById('respawn').disabled, hidden: document.getElementById('death').hidden, inert: document.getElementById('death').inert, at: document.elementFromPoint(${button.x}, ${button.y})?.id })`);
    expect('pressing Respawn brings the player back', false, `${why}, respawn frames sent ${st.respawnsSent - sentBefore}, snapshot alive ${st.last?.self.alive} respawnIn ${st.last?.self.respawnIn}`);
  }
  if (back) {
    const reshown = await until(async () => js(`!document.getElementById('objective').hidden`), 1200);
    if (!respawnChecked) {
      respawnChecked = true;
      expect('the objective banner stays hidden after respawning into the same round', !reshown);
      await shot('respawned');
    }
  }
}

let huntedAt = 0;
async function onPick() {
  const p = st.last!.self.pending!;
  await setKeys([]);
  await sleep(150);
  if (p.k === 'perk' && p.tier === 1) {
    const tile = await js(`(() => { const r = document.querySelectorAll('#perk-panel .perk')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await mouse('mouseMoved', tile.x, tile.y);
    await sleep(150);
    const desc = String(await js(`document.querySelector('#perk-panel .perk-desc').textContent`));
    expect('hovering a tier 1 perk describes it inside the dock', /·/.test(desc), desc);
    await capture('perk-dock-hover', 0);
  }
  const gun = me()?.gun;
  await tap(p.k === 'evolve' && p.level > 2 ? 2 : 1);
  if (p.k === 'evolve' && await until(() => !!me() && me()!.gun !== gun, 1500)) {
    const stage = GUNS[me()!.gun].stage;
    log(`evolved to ${me()!.gun} (stage ${stage})`);
    await capture(`evolve-stage${stage}`, 140);
    if (stage === 2) huntedAt = Date.now();
  } else await sleep(250);
}

async function onSelf(self: NonNullable<ReturnType<typeof me>>, snap: Snapshot) {
  if (self.hunted && huntedAt && Date.now() - huntedAt > 2800) await capture('hunted-badge', 0);
  if (snap.self.reloading) await capture('reticle-reload', 0);
  const view = { w: snap.self.viewRadius, h: snap.self.viewRadius / Math.min(16 / 9, W / H) };
  if (snap.minimap.some((m) => m.pingAge !== null && (Math.abs(m.x - self.x) > view.w || Math.abs(m.y - self.y) > view.h))) await capture('hunted-chevron', 0);
  if (snap.minimap.some((m) => m.pingAge !== null && m.pingAge < 250)) await capture('ping-ring', 0);
  if (!captured.has('hud-fade') && await underPanel()) {
    await sleep(220);
    const still = await underPanel();
    if (still) await capture('hud-fade', 0, still);
  }
  const rival = snap.players.find((p) => p.id !== st.id && p.alive && p.color === self.color && Math.abs(p.x - self.x) < view.w * 0.8 && Math.abs(p.y - self.y) < view.h * 0.8);
  if (rival) await capture('rival-ring', 0, `${rival.name} wears ${rival.color}`);
}

async function underPanel(): Promise<string> {
  const others: { id: number; screen: { x: number; y: number } }[] = await js(`window.skirmishDev.drawnOthers()`) ?? [];
  if (others.some((o) => o.screen.x > W - 222 && o.screen.x < W - 12 && o.screen.y > 12 && o.screen.y < 240)) return 'player under the leaderboard';
  if (others.some((o) => o.screen.x > W - 194 && o.screen.x < W - 12 && o.screen.y > H - 194 && o.screen.y < H - 12)) return 'player under the minimap';
  return '';
}

let strafe = 1, roundOver = false, checkedNextRound = false;
const end = Date.now() + SECONDS * 1000;
const wanted = ['hurt-arc', 'numbers-stack', 'kill-popup', 'bounty-callout', 'assist', 'feed-evolved', 'death-screen', 'perk-dock-hover', 'evolve-stage1', 'evolve-stage2', 'hunted-badge', 'reticle-reload', 'reticle-spread', 'hunted-chevron', 'ping-ring', 'hud-fade', 'rival-ring', 'round-banner'];
const done = () => wanted.every((t) => captured.has(t)) && earlyChecked && respawnChecked;
while (Date.now() < end && !done()) {
  await onEvents();
  const snap = st.last, self = me();
  if (snap?.match.winner) { await setKeys([]); await capture('round-banner', 600, `${snap.match.winner} wins`); roundOver = true; await sleep(300); continue; }
  if (roundOver && self?.alive && !checkedNextRound) {
    checkedNextRound = true;
    expect('the next round introduces itself with the objective banner', await until(async () => js(`!document.getElementById('objective').hidden`), 1500));
  }
  if (snap && !snap.match.winner) roundOver = false;
  if (!snap || !self?.alive) {
    await setKeys([]);
    if (await js(`!document.getElementById('death').hidden`)) await onDeath();
    else await sleep(60);
    continue;
  }
  if (snap.self.pending) { await onPick(); continue; }
  await onSelf(self, snap);
  const sight = { w: snap.self.viewRadius, h: snap.self.viewRadius / Math.min(16 / 9, W / H) };
  const enemies = snap.players.filter((p) => p.id !== st.id && p.alive);
  const near = (a: { x: number; y: number }) => Math.hypot(a.x - self.x, a.y - self.y);
  const seen = enemies.filter((p) => Math.abs(p.x - self.x) < sight.w && Math.abs(p.y - self.y) < sight.h && visible(self.x, self.y, p.x, p.y)).sort((a, b) => near(a) - near(b));
  const crates = snap.crates.map((c) => ({ x: c.x + c.size / 2, y: c.y + c.size / 2 })).filter((c) => visible(self.x, self.y, c.x, c.y)).sort((a, b) => near(a) - near(b));
  const aimAt = seen[0] ?? (crates[0] && near(crates[0]) < 500 ? crates[0] : undefined);
  const goal = seen[0] ?? enemies.sort((a, b) => near(a) - near(b))[0] ?? { x: WORLD.size / 2, y: WORLD.size / 2 };
  if (Math.random() < 0.05) strafe = -strafe;
  const dir = Math.atan2(goal.y - self.y, goal.x - self.x) + (near(goal) > 380 ? 0 : (Math.PI / 2) * strafe);
  await setKeys([...(Math.cos(dir) > 0.38 ? ['d'] : Math.cos(dir) < -0.38 ? ['a'] : []), ...(Math.sin(dir) > 0.38 ? ['s'] : Math.sin(dir) < -0.38 ? ['w'] : [])]);
  if (aimAt) {
    const ang = Math.atan2(aimAt.y - self.y, aimAt.x - self.x), dist = Math.min(320, near(aimAt));
    const ax = W / 2 + Math.cos(ang) * dist, ay = H / 2 + Math.sin(ang) * dist;
    await mouse('mouseMoved', ax, ay);
    await mouse('mousePressed', ax, ay);
    if (seen[0]) await capture('reticle-spread', 120, `firing ${self.gun} while moving`);
    await sleep(160);
    await mouse('mouseReleased', ax, ay);
  } else await sleep(120);
  await sleep(30);
}
await setKeys([]);
const missing = [...wanted.filter((t) => !captured.has(t)), ...(earlyChecked ? [] : ['early death-screen click']), ...(respawnChecked ? [] : ['respawn'])];
log(`missing: ${missing.join(', ') || 'none'}`);
if (missing.length) failures++;
log(failures ? `RESULT FAIL (${failures})` : 'RESULT PASS');
page.close();
chrome.kill();
process.exit(failures ? 1 : 0);
