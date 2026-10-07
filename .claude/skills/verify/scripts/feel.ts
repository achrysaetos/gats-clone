/// <reference types="node" />
// Usage: node feel.ts <run-dir> [seconds]   Plays FFA through real input and proves the feel cues from the page's ?dev hook.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameEvent, Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { dirKey, openPage, serversListed, sleep, type Dir } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node feel.ts <run-dir> [seconds]'); process.exit(2); }
const SECONDS = Number(process.argv[3] ?? 45);
const VIEW = { w: 1600, h: 900 };
const BASE = existsSync(join(RUN, 'url'))
  ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '')
  : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'feel.log');
writeFileSync(LOG, '');
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
let failed = false;
const check = (ok: boolean, line: string) => { log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failed = true; };

let myId: number | null = null;
let full: Snapshot | null = null;
const myHits: GameEvent[] = [];
const myKills: GameEvent[] = [];
const page = await openPage({
  profile: 'skirmish-feel-',
  viewport: { width: VIEW.w, height: VIEW.h },
  onEvent: (method, params) => {
    if (method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(params.response.payloadData);
    if (msg.t === 'welcome') myId = msg.id;
    if (msg.t !== 'snap') return;
    full = fillSnapshot(msg, full) ?? full;
    for (const ev of full?.events ?? []) {
      if (ev.e === 'dmg' && ev.attacker === myId && ev.victim !== myId && (ev.kind === 'player' || ev.kind === 'zombie')) myHits.push(ev);
      if (ev.e === 'kill' && ev.killerId === myId && ev.victimId !== myId) myKills.push(ev);
    }
  },
});
const { cdp, js, exceptions, close } = page;
await cdp('Page.navigate', { url: `${BASE}/?dev` });
await serversListed(page);
await js(`document.querySelectorAll('#loadout-menu .weapon')[3].click(); document.getElementById('name').value = 'Feel'`);
await js(`document.querySelector('#servers .server').click(); document.getElementById('play').click()`);
for (let i = 0; i < 50 && !full; i++) await sleep(100);
const me = () => full?.players.find((p) => p.id === myId);
const KEYS: Dir[] = ['right', 'down', 'left', 'up'];
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });

const juice: { cue: string; at: number; px?: number; owner?: number }[] = [];
const end = Date.now() + SECONDS * 1000;
let step = 0;
await js('skirmishDev.juice()');
while (Date.now() < end) {
  const self = me();
  if (!self?.alive) {
    await js(`document.getElementById('respawn').disabled || document.getElementById('respawn').click()`);
    await sleep(250);
    continue;
  }
  const foe = full!.players.filter((p) => p.id !== myId && p.alive).sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0];
  const [mx, my] = foe ? [VIEW.w / 2 + (foe.x - self.x) * 0.55, VIEW.h / 2 + (foe.y - self.y) * 0.55] : [VIEW.w / 2 + 300, VIEW.h / 2];
  await mouse('mouseMoved', mx, my);
  await mouse('mousePressed', mx, my);
  const k = KEYS[step++ % KEYS.length]!;
  if (!foe || Math.hypot(foe.x - self.x, foe.y - self.y) > 420) await dirKey(page, 'keyDown', foe ? (foe.x > self.x ? 'right' : 'left') : k);
  await sleep(350);
  for (const d of KEYS) await dirKey(page, 'keyUp', d);
  await mouse('mouseReleased', mx, my);
  juice.push(...(await js('skirmishDev.juice()')));
}
const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(EV, 'feel-view.png'), Buffer.from(data, 'base64'));
close();

const kicks = juice.filter((j) => j.cue === 'kick').map((j) => j.px!);
const stops = juice.filter((j) => j.cue === 'hit' || j.cue === 'kill');
const sounds = juice.filter((j) => j.cue === 'remoteSound').map((j) => j.at);
const flashes = juice.filter((j) => j.cue === 'remoteFlash').map((j) => j.at);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
log(`feel FFA assault ${SECONDS}s at ${new Date().toISOString()}`);
check(kicks.length > 5 && Math.min(...kicks) >= 2, `own shots kick the camera: ${kicks.length} kicks, smallest ${Math.min(...kicks).toFixed(1)}px, median ${median(kicks).toFixed(1)}px, largest ${Math.max(...kicks).toFixed(1)}px`);
check(myHits.length > 0 && stops.length > 0, `own hits stop the drawn world: ${myHits.length} hit events from the server, ${stops.filter((s) => s.cue === 'hit').length} hit stops, ${stops.filter((s) => s.cue === 'kill').length} kill stops for ${myKills.length} kills`);
const gaps = flashes.map((f) => Math.min(...sounds.map((s) => Math.abs(s - f))));
const together = gaps.filter((g) => g < 1).length;
check(flashes.length > 0 && together / flashes.length > 0.95, `other players' shot sounds play with their drawn muzzle flashes: ${together} of ${flashes.length} in the same frame, median gap ${median(gaps).toFixed(2)}ms`);
for (const e of exceptions) check(false, `page exception: ${e}`);
log(failed ? 'RESULT FAIL' : 'RESULT PASS');
process.exit(failed ? 1 : 0);
