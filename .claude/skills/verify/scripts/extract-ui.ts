/// <reference types="node" />
// Usage: node extract-ui.ts <run-dir> [minutes]
// Joins the ext room through the menu in muted headless Chrome and plays the objective with real input: it walks the nav grid to the
// terminal, the case, the carrier or the pad as its side needs, and shoots the nearest enemy in view. It screenshots the HUD while the
// hack runs, while the case is carried and when a round is won, each paired with what the page's own snapshots said at that moment,
// and checks the sides swap and the player respawns on its new side after a round.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD } from '../../../../src/shared/defs.ts';
import { MAPS } from '../../../../src/shared/maps.ts';
import type { ExtView, Snapshot, WallView } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { withSolids } from '../../../../src/server/bot/nav.ts';
import { dirKey, joinFromMenu, navGridFor, openPage, pathStep, respawnIfDead, sleep, type Dir } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node extract-ui.ts <run-dir> [minutes]'); process.exit(2); }
const MINUTES = Number(process.argv[3] ?? 9);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'extract-ui.log');
const W = 1600, H = 900;
mkdirSync(EV, { recursive: true });
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); return ok; };

const frames = { welcome: null as null | { id: number; mode: string }, snap: null as Snapshot | null, map: null as null | { worldSize: number; walls: WallView[] } };
const page = await openPage({
  profile: 'skirmish-extract-',
  viewport: { width: W, height: H },
  onEvent: (method, params) => {
    if (method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(params.response.payloadData);
    if (msg.t === 'welcome') { frames.welcome = msg; frames.snap = null; }
    if (msg.t === 'welcome' || msg.t === 'walls') frames.map = { worldSize: msg.worldSize, walls: msg.walls };
    if (msg.t === 'snap') frames.snap = fillSnapshot(msg, frames.snap) ?? frames.snap;
  },
  onProblem: (kind, detail) => problems.push(`${kind}: ${detail}`),
});
const { cdp, js } = page;
const shot = async (name: string, what: string) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64'));
  log(`shot ${name}.png  (${what})`);
};
const until = async (fn: () => unknown, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };
const me = () => frames.snap?.players.find((p) => p.id === frames.welcome?.id);
const ext = () => frames.snap?.ext;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });

let held: Dir[] = [];
const steer = async (dirs: Dir[]) => {
  for (const d of held) if (!dirs.includes(d)) await dirKey(page, 'keyUp', d);
  for (const d of dirs) if (!held.includes(d)) await dirKey(page, 'keyDown', d);
  held = dirs;
};

/** Where this side wants the player now: in the circle to hack, outside it to let a hack show, on the case, beside the carrier, or on the pad. */
function goalFor(x: ExtView, myId: number, team: string | null): { x: number; y: number } {
  const c = x.case, t = x.terminal;
  const attacking = team === x.attackers;
  switch (c.k) {
    case 'hacking': return attacking ? { x: t.x + t.r * 0.5, y: t.y } : { x: t.x - t.r - 120, y: t.y };
    case 'ready': return attacking ? c : { x: t.x - t.r - 120, y: t.y };
    case 'dropped': return c;
    case 'carried': return c.by === myId ? { x: x.pad.x + x.pad.w / 2, y: x.pad.y + x.pad.h / 2 } : c;
  }
}

async function shootNearest() {
  const p = me(), snap = frames.snap;
  if (!p?.alive || !snap) return;
  const foe = snap.players.filter((o) => o.alive && o.team !== p.team && dist(o, p) < 650).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (!foe) return;
  const at = await js(`skirmishDev.toScreen(${foe.x}, ${foe.y})`) as { x: number; y: number } | null;
  if (!at) return;
  await mouse('mouseMoved', at.x, at.y);
  await mouse('mousePressed', at.x, at.y);
  await sleep(40);
  await mouse('mouseReleased', at.x, at.y);
}

await cdp('Page.navigate', { url: `${BASE}/?dev` });
await sleep(800);
const room = await until(async () => (await js(`[...document.querySelectorAll('#servers .server')].some((b) => b.textContent.includes('Extraction'))`)) as boolean, 8000);
expect('the menu lists the Extraction room', room);
const index = await js(`[...document.querySelectorAll('#servers .server')].findIndex((b) => b.textContent.includes('Extraction'))`) as number;
await joinFromMenu(page, { room: index, name: 'Runner', press: true });
expect('the menu joins the Extraction room', await until(() => frames.welcome?.mode === 'EXT' && me() && ext(), 8000), `mode ${frames.welcome?.mode}`);
await until(async () => /Extraction/.test(await js(`document.getElementById('objective')?.textContent ?? ''`) as string), 4000);
const banner = await js(`document.getElementById('objective')?.textContent ?? ''`) as string;
expect('the objective banner explains the mode', /Extraction/.test(banner), banner);
const def = MAPS.vault.extract!;
const startSide = ext()!.attackers === me()?.team ? 'attack' : 'defend';
expect('the player starts in its side\'s spawn', (startSide === 'attack' ? def.attack : def.defend).some((r) => { const p = me()!; return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }), `${me()?.team} ${startSide}s round 1`);

const taken = { hack: false, carry: false, win: false, swap: false };
let roundSeen = ext()!.round;
let carriedSince: number | null = null;
const shotNames = new Set<string>();
const end = Date.now() + MINUTES * 60_000;
while (Date.now() < end && !(taken.hack && taken.carry && taken.win && taken.swap)) {
  await respawnIfDead(page);
  const x = ext(), p = me(), m = frames.map;
  if (!x || !p || !m) { await sleep(100); continue; }
  if (x.round !== roundSeen && !x.between && p.alive) {
    roundSeen = x.round;
    const side = x.attackers === p.team ? 'attack' : 'defend';
    const inSide = (side === 'attack' ? def.attack : def.defend).some((r) => p.x >= r.x - WORLD.playerRadius && p.x <= r.x + r.w + WORLD.playerRadius && p.y >= r.y - WORLD.playerRadius && p.y <= r.y + r.h + WORLD.playerRadius);
    if (!taken.swap) taken.swap = expect(`round ${x.round}: sides swap and the player starts on its new side`, inSide, `${p.team} ${side}s now, at ${Math.round(p.x)},${Math.round(p.y)}`);
  }
  const c = x.case;
  carriedSince = c.k === 'carried' ? carriedSince ?? Date.now() : null;
  if (!taken.hack && p.alive && c.k === 'hacking' && c.progress >= 0.25 && dist(p, x.terminal) < 600) {
    taken.hack = true;
    await shot('ext-hack', `hack ${Math.round(c.progress * 100)}%${c.contested ? ' contested' : ''}, ${p.team} ${x.attackers === p.team ? 'attacking' : 'defending'}, ${Math.round(dist(p, x.terminal))}px from the terminal`);
  }
  if (!taken.carry && p.alive && c.k === 'carried' && (dist(p, c) < 600 || Date.now() - carriedSince! > 4000) && !x.between) {
    taken.carry = true;
    await sleep(300);
    const now = ext()?.case;
    await shot('ext-carry', `case carried by ${now?.k === 'carried' ? (now.by === p.id ? 'the player' : `player ${now.by}`) : now?.k}, ${Math.round(dist(p, c))}px away, speed told ${frames.snap?.self.speed.toFixed(0)}`);
  }
  if (!taken.win && x.between) {
    await sleep(500);
    const b = ext()?.between;
    const name = b?.why === 'extracted' ? 'ext-win' : `ext-round-${ext()!.round}-time`;
    if (b && !shotNames.has(name)) {
      shotNames.add(name);
      taken.win = b.why === 'extracted';
      await shot(name, `round ${ext()!.round} to ${b.winner} (${b.why}), wins red ${ext()!.wins.red} blue ${ext()!.wins.blue}`);
    }
  }
  if (!p.alive || x.between) { await steer([]); await sleep(150); continue; }
  const goal = goalFor(x, p.id, p.team);
  const crates = (frames.snap?.crates ?? []).map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h }));
  await steer(dist(p, goal) < 30 ? [] : pathStep(withSolids(navGridFor(m.worldSize, m.walls), crates, WORLD.playerRadius), p, goal));
  await shootNearest();
  await sleep(60);
}
await steer([]);
expect('the HUD was caught mid-hack', taken.hack);
expect('the HUD was caught with the case carried', taken.carry);
expect('a round was won by extraction', taken.win);
expect('sides swapped after a round', taken.swap);

for (const p of problems.filter((p) => p.startsWith('page') || p.startsWith('console'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
page.close();
process.exit(problems.length ? 1 : 0);
