/// <reference types="node" />
// Usage: node duel.ts <run-dir>   Two real browsers join FFA and walk the map's paths to each other; A shoots B once it has a clear line, until each side's own socket proves the hit.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD } from '../../../../src/shared/defs.ts';
import type { GameEvent, Snapshot, WallView } from '../../../../src/shared/protocol.ts';
import type { Rect } from '../../../../src/shared/sim/movement.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { clearShot, withSolids, type Point } from '../../../../src/server/bot/nav.ts';
import { hold, joinFromMenu, navGridFor, openPage, pathStep, respawnIfDead, sleep, type Page } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node duel.ts <run-dir>'); process.exit(2); }
const BASE = existsSync(join(RUN, 'url'))
  ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '')
  : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'duel.log');
const VIEW = { w: 1280, h: 800 };
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); };

type Dmg = Extract<GameEvent, { e: 'dmg' }>;
type Player = Page & {
  label: string; name: string;
  id: () => number | null; snap: () => Snapshot | null; dmg: Dmg[];
  map: () => { worldSize: number; walls: WallView[] } | null;
};

async function openPlayer(label: string, name: string): Promise<Player> {
  let welcomeId: number | null = null;
  let full: Snapshot | null = null;
  let map: { worldSize: number; walls: WallView[] } | null = null;
  const dmg: Dmg[] = [];
  const page = await openPage({
    profile: 'skirmish-duel-',
    viewport: { width: VIEW.w, height: VIEW.h },
    onProblem: (kind, detail) => { if (kind === 'page exception') problems.push(`${label} page exception: ${detail}`); },
    onEvent: (method, params) => {
      if (method !== 'Network.webSocketFrameReceived') return;
      const msg = JSON.parse(params.response.payloadData);
      if (msg.t === 'welcome') welcomeId = msg.id;
      if (msg.t === 'welcome' || msg.t === 'walls') map = { worldSize: msg.worldSize, walls: msg.walls };
      if (msg.t === 'snap') {
        full = fillSnapshot(msg, full) ?? full;
        for (const e of msg.events as GameEvent[]) if (e.e === 'dmg') dmg.push(e);
      }
    },
  });
  await page.cdp('Page.navigate', { url: BASE });
  await joinFromMenu(page, { name, press: true });
  return { ...page, label, name, id: () => welcomeId, snap: () => full, dmg, map: () => map };
}

const selfOf = (p: Player) => p.snap()?.players.find((v) => v.id === p.id());
const crates = (p: Player): Rect[] => (p.snap()?.crates ?? []).map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size }));
const solids = (p: Player): Rect[] => [...(p.map()?.walls ?? []), ...crates(p)];
async function walkToward(p: Player, from: Point, to: Point) {
  const m = p.map();
  await hold(p, pathStep(withSolids(navGridFor(m?.worldSize ?? 0, m?.walls ?? []), crates(p), WORLD.playerRadius), from, to), 350);
}
async function respawnIfDeadOnServer(p: Player) {
  if (selfOf(p)?.alive !== false) return;
  await respawnIfDead(p, 8000);
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

const deadline = Date.now() + 180_000;
let sawEachOther = false, hitSeenByA: Dmg | undefined, hitSeenByB: Dmg | undefined, shots = 0;
while (Date.now() < deadline && !(hitSeenByA && hitSeenByB)) {
  await respawnIfDeadOnServer(a); await respawnIfDeadOnServer(b);
  const pa = selfOf(a), pb = selfOf(b);
  if (!pa?.alive || !pb?.alive) { await sleep(200); continue; }
  const dx = pb.x - pa.x, dy = pb.y - pa.y, dist = Math.hypot(dx, dy);
  const aSeesB = !!a.snap()?.players.some((v) => v.id === b.id());
  const bSeesA = !!b.snap()?.players.some((v) => v.id === a.id());
  if (aSeesB && bSeesA) sawEachOther = true;
  if (dist > 420 || !aSeesB || !clearShot(solids(a), pa, pb)) {
    await Promise.all([walkToward(a, pa, pb), walkToward(b, pb, pa)]);
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
}
await shot(a, 'duel-hunter-view');
await shot(b, 'duel-target-view');
expect('each browser had the other in its own snapshots', sawEachOther);
expect("hunter's socket shows a dmg event naming the target", !!hitSeenByA, hitSeenByA ? `-${hitSeenByA.amount} after ${shots} shots` : `${shots} shots`);
expect("target's socket shows the same hit from the hunter", !!hitSeenByB, hitSeenByB ? `-${hitSeenByB.amount}` : '');
for (const p of problems.filter((x) => x.includes('exception'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
a.close(); b.close();
process.exit(problems.length ? 1 : 0);
