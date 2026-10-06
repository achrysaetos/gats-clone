/// <reference types="node" />
// Usage: node zombies.ts <run-dir> [seconds]   Opens a squad on the run's server and plays it over ws as one human, no browser.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { BUILDINGS, ZOM } from '../../../../src/shared/defs.ts';
import type { ServerMsg, Snapshot, SnapshotWire } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node zombies.ts <run-dir> [seconds]'); process.exit(2); }
const SECONDS = Number(process.argv[3] ?? 150);
const PORT = readFileSync(join(RUN, 'port'), 'utf8').trim();
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'zombies.log');
mkdirSync(EV, { recursive: true });
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];
const check = (ok: boolean, line: string) => { log(`${ok ? 'ok' : 'FAIL'} ${line}`); if (!ok) problems.push(line); };

const created = await fetch(`http://localhost:${PORT}/api/squads`, { method: 'POST' });
const { room } = (await created.json()) as { room: string };
check(created.status === 200 && /^z-[a-z2-7]{6}$/.test(room), `POST /api/squads opened squad ${room}`);
const listed = (await (await fetch(`http://localhost:${PORT}/api/servers`)).json()) as { id: string }[];
check(!listed.some((s) => s.id === room), 'the squad stays off /api/servers');

const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${room}`);
await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); });
const got = { welcome: null as Extract<ServerMsg, { t: 'welcome' }> | null, snap: null as Snapshot | null };
/** The newest full snapshot. */
const now = () => got.snap!;
const seen = { zkills: 0, downed: 0, revived: 0, bledOut: 0, nights: new Set<number>(), maxZombies: 0 };
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw)) as ServerMsg;
  if (m.t === 'welcome') got.welcome = m;
  if (m.t !== 'snap') return;
  const snap = fillSnapshot(m as SnapshotWire, got.snap) ?? got.snap;
  got.snap = snap;
  if (!snap?.run) return;
  seen.nights.add(snap.run.night);
  seen.maxZombies = Math.max(seen.maxZombies, snap.run.aliveZombies);
  for (const e of snap.events) {
    if (e.e === 'zkill') seen.zkills++;
    if (e.e === 'life') seen[e.k]++;
  }
});
ws.send(JSON.stringify({ t: 'join', name: 'Driver', loadout: { weapon: 'lmg', armor: 'medium', color: 'blue' }, aspect: 16 / 9 }));
for (let i = 0; i < 100 && !(got.welcome && got.snap); i++) await sleep(50);
const first = got.snap;
const welcome = got.welcome;
check(welcome?.mode === 'ZOM', `welcome says mode ${welcome?.mode}`);
check(first?.run?.phase === 'day' && first.run.night === 1, `the run opens on day 1 (${first?.run?.phase} ${first?.run?.night})`);
check(first?.players.filter((p) => p.kind === 'bot').length === ZOM.squadSize - 1, `${first?.players.filter((p) => p.kind === 'bot').length} bots fill the squad beside one human`);

const me = () => now().players.find((p) => p.id === welcome!.id)!;
const scrapBefore = now().run!.scrap;
const core = now().run!.core;
const out = Math.abs(me().x - core.x) > Math.abs(me().y - core.y) ? [Math.sign(me().x - core.x) * 2, 0] : [0, Math.sign(me().y - core.y) * 2];
const cell = { cx: Math.floor(me().x / ZOM.cell) + out[0]!, cy: Math.floor(me().y / ZOM.cell) + out[1]! };
ws.send(JSON.stringify({ t: 'build', kind: 'wall', ...cell }));
await sleep(300);
const afterBuild = now();
check(!!afterBuild.buildings?.some((b) => b.cx === cell.cx && b.cy === cell.cy), `a build message put a wall on cell ${cell.cx},${cell.cy}`);
check(scrapBefore - afterBuild.run!.scrap === BUILDINGS.wall.cost, `the wall cost ${scrapBefore - afterBuild.run!.scrap} scrap`);

// Stand at the core aiming at the nearest zombie with the trigger held, so the human fights the night with the bots.
let seq = 0;
const started = Date.now();
while (Date.now() - started < SECONDS * 1000 && !(seen.nights.has(2) && now().run!.phase === 'day')) {
  const s = now();
  const self = me();
  const target = (s.zombies ?? []).map(([, , x, y]) => ({ x, y, d: Math.hypot(x - self.x, y - self.y) })).sort((a, b) => a.d - b.d)[0];
  const angle = target ? Math.atan2(target.y - self.y, target.x - self.x) : 0;
  ws.send(JSON.stringify({ t: 'input', seq: ++seq, viewAt: null, input: { up: false, down: false, left: false, right: false, angle, aimDist: target?.d ?? 0, fire: !!target && target.d < 700, shots: 0, reload: false, ability: false, use: false } }));
  await sleep(100);
}
const end = now();
log(`night 1 over after ${((Date.now() - started) / 1000).toFixed(0)}s: ${seen.zkills} zombie kills, peak ${seen.maxZombies} alive, ${seen.downed} downs, ${seen.revived} revives, ${seen.bledOut} bled out, core ${end.run!.core.hp}/${end.run!.core.maxHp}`);
check(seen.nights.has(2) && end.run!.phase === 'day', `dawn of night 2 arrived (phase ${end.run!.phase}, night ${end.run!.night})`);
check(seen.zkills > 0, `zombies died on the real server (${seen.zkills})`);
ws.close();
log(problems.length === 0 ? 'RESULT PASS' : `RESULT FAIL: ${problems.join('; ')}`);
process.exit(problems.length === 0 ? 0 : 1);
