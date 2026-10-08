/// <reference types="node" />
// Usage: node moments.ts <run-dir> [seconds] [weapon-index]
// Plays FFA through real input with the shotgun (or the loadout tile given) and screenshots the feel stage's moments the
// instant the server says they happened: a hit reaction, a death and the body it leaves, a reload, a close blast, and
// knockback and suppression, with the measured value beside each shot in moments.log.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameEvent, PlayerView, Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { dirKey, key, openPage, serversListed, sleep, type Dir } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node moments.ts <run-dir> [seconds] [weapon-index]'); process.exit(2); }
const SECONDS = Number(process.argv[3] ?? 90);
const WEAPON = Number(process.argv[4] ?? 2);
const VIEW = { w: 1600, h: 900 };
const BASE = existsSync(join(RUN, 'url'))
  ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '')
  : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'moments.log');
writeFileSync(LOG, '');
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
let failed = false;
const check = (ok: boolean, line: string) => { log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failed = true; };

let myId: number | null = null;
let full: Snapshot | null = null;
/** Every snapshot's players by id, newest last, so a hit can be measured against where the victim stood before it. */
const history: { at: number; players: Map<number, PlayerView>; self: Snapshot['self'] }[] = [];
const hits: { at: number; ev: Extract<GameEvent, { e: 'dmg' }> }[] = [];
const kills: { at: number; ev: Extract<GameEvent, { e: 'kill' }> }[] = [];
let whizzes = 0;
const page = await openPage({
  profile: 'skirmish-moments-',
  viewport: { width: VIEW.w, height: VIEW.h },
  onEvent: (method, params) => {
    if (method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(params.response.payloadData);
    if (msg.t === 'welcome') myId = msg.id;
    if (msg.t !== 'snap') return;
    full = fillSnapshot(msg, full) ?? full;
    if (!full) return;
    const at = Date.now();
    history.push({ at, players: new Map(full.players.map((p) => [p.id, p])), self: full.self });
    if (history.length > 400) history.shift();
    for (const ev of full.events) {
      if (ev.e === 'dmg' && ev.attacker === myId && ev.kind === 'player' && ev.victim !== myId) hits.push({ at, ev });
      if (ev.e === 'kill' && ev.killerId === myId && ev.victimId !== myId) kills.push({ at, ev });
      if (ev.e === 'whizz' && ev.victim === myId) whizzes++;
    }
  },
});
const { cdp, js, exceptions, close } = page;
await cdp('Page.navigate', { url: `${BASE}/?dev&quality=high` });
await js(`localStorage.setItem('skirmish.muted', '1')`);
await serversListed(page);
await js(`document.querySelectorAll('#loadout-menu .weapon')[${WEAPON}].click(); document.getElementById('name').value = 'Moments'`);
await js(`document.querySelector('#servers .server').click(); document.getElementById('play').click()`);
for (let i = 0; i < 80 && !full; i++) await sleep(100);
const me = () => full?.players.find((p) => p.id === myId);
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });

/** A screenshot of the whole view and a 2x crop around a world point, named for the moment. */
async function shoot(name: string, focus?: { x: number; y: number }) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EV, `moment-${name}.png`), Buffer.from(data, 'base64'));
  if (!focus) return;
  const at = await js(`skirmishDev.toScreen(${focus.x}, ${focus.y})`);
  if (!at) return;
  const cx = at.x as number, cy = at.y as number;
  const clip = { x: Math.max(0, cx - 200), y: Math.max(0, cy - 130), width: 400, height: 260, scale: 2 };
  const crop = await cdp('Page.captureScreenshot', { format: 'png', clip });
  writeFileSync(join(EV, `moment-${name}-crop.png`), Buffer.from(crop.data, 'base64'));
}

const shots = new Set<string>();
const once = async (name: string, focus?: { x: number; y: number }) => { if (shots.has(name)) return; shots.add(name); await shoot(name, focus); };
const knock: number[] = [];
let suppression = 0;
let seenHits = 0, seenKills = 0;
const KEYS: Dir[] = ['right', 'down', 'left', 'up'];
let step = 0;
const end = Date.now() + SECONDS * 1000;
while (Date.now() < end) {
  const self = me();
  if (!self?.alive) {
    await js(`document.getElementById('respawn').disabled || document.getElementById('respawn').click()`);
    await sleep(250);
    continue;
  }
  suppression = Math.max(suppression, (full!.self as { suppression?: number }).suppression ?? 0);
  if (suppression > 0.5) await once('suppressed', self);
  const foe = full!.players.filter((p) => p.id !== myId && p.alive).sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0];
  const near = foe ? Math.hypot(foe.x - self.x, foe.y - self.y) : Infinity;
  const aim = foe && await js(`skirmishDev.toScreen(${foe.x}, ${foe.y})`);
  const [mx, my] = aim ? [aim.x as number, aim.y as number] : [VIEW.w / 2 + 300, VIEW.h / 2];
  await mouse('mouseMoved', mx, my);
  if (near < 420) {
    await mouse('mousePressed', mx, my);
    if (near < 130) { await sleep(25); await once('close-blast', self); }
    await sleep(60);
    await mouse('mouseReleased', mx, my);
  } else {
    await dirKey(page, 'keyDown', foe ? (Math.abs(foe.x - self.x) > Math.abs(foe.y - self.y) ? (foe.x > self.x ? 'right' : 'left') : (foe.y > self.y ? 'down' : 'up')) : KEYS[step++ % 4]!);
    await sleep(300);
    for (const d of KEYS) await dirKey(page, 'keyUp', d);
  }
  for (; seenHits < hits.length; seenHits++) {
    const h = hits[seenHits]!;
    await once('hit-reaction', h.ev.hit ?? h.ev);
    const before = [...history].reverse().find((s) => s.at < h.at)?.players.get(h.ev.victim);
    const after = history.find((s) => s.at > h.at + 90)?.players.get(h.ev.victim);
    if (before && after && h.ev.hit) knock.push(Math.cos(h.ev.hit.dir) * (after.x - before.x) + Math.sin(h.ev.hit.dir) * (after.y - before.y));
  }
  for (; seenKills < kills.length; seenKills++) {
    const k = kills[seenKills]!;
    const at = [...history].reverse().find((s) => s.at <= k.at)?.players.get(k.ev.victimId) ?? foe;
    await sleep(Math.max(0, 260 - (Date.now() - k.at)));
    await once('death-falling', at);
    await sleep(2500);
    await once('death-body', at);
  }
  if (!shots.has('reload') && (seenKills > 0 || Date.now() > end - SECONDS * 500) && full!.self.ammo < full!.self.mag) {
    await key(page, 'keyDown', 'KeyR', 'r');
    await key(page, 'keyUp', 'KeyR', 'r');
    for (let i = 0; i < 40 && !full!.self.reloading; i++) await sleep(20);
    for (let i = 0; i < 100 && full!.self.reloading && full!.self.reloadFrac < 0.3; i++) await sleep(15);
    await once('reload', me());
  }
}
close();

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
log(`moments FFA weapon tile ${WEAPON} ${SECONDS}s at ${new Date().toISOString()}`);
check(shots.has('hit-reaction'), `a hit reaction was caught: ${hits.length} hits by me`);
check(shots.has('death-body'), `a death and its body were caught: ${kills.length} kills by me`);
check(shots.has('reload'), 'a reload was caught');
log(`${shots.has('close-blast') ? 'ok  ' : 'note'} close blast ${shots.has('close-blast') ? 'caught' : 'not reached (no foe within 130)'}`);
log(`note knockback along the round, victim moved ${knock.length ? `median ${median(knock).toFixed(1)}, max ${Math.max(...knock).toFixed(1)}` : 'n/a'} units in the 90 ms after ${knock.length} hits`);
log(`note suppression peak ${suppression.toFixed(2)}, ${whizzes} near misses on me`);
for (const e of exceptions) check(false, `page exception: ${e}`);
log(failed ? 'RESULT FAIL' : 'RESULT PASS');
process.exit(failed ? 1 : 0);
