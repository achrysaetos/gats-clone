/// <reference types="node" />
// Usage: node scripts/offscreen-hits.ts <run dir from .claude/skills/verify/scripts/launch.sh> [seconds per viewport=120] [WxH ...=1280x800 1920x1080]
// The first viewport joins; later ones resize the same session.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD } from '../src/shared/defs.ts';
import type { GameEvent, Snapshot } from '../src/shared/protocol.ts';
import { fillSnapshot } from '../src/shared/wire.ts';
import { makeCamera } from '../src/client/camera.ts';
import { pct } from './lib/stats.ts';
import { joinFromMenu, openPage, respawnIfDead, sleep } from '../.claude/skills/verify/scripts/lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) throw new Error('usage: node scripts/offscreen-hits.ts <run dir> [seconds] [WxH ...]');
const SECONDS = Number(process.argv[3] ?? 120);
const VIEWPORTS = (process.argv.length > 4 ? process.argv.slice(4) : ['1280x800', '1920x1080']).map((s) => s.split('x').map(Number) as [number, number]);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
type Where = 'inside' | 'outside' | 'dead' | 'absent';
type Hit = { where: Where; dx: number; dy: number };
let viewport: [number, number] = VIEWPORTS[0];
let myId: number | null = null;
let socketId = '';
let full: Snapshot | null = null;
let hits: Hit[] = [];
let onScreen = new Set<number>();
let edgePopIns = 0, arrivals = 0;
let respawning = new Set<number>();
let lastMe: { x: number; y: number } | null = null;
const EDGE_BAND = 100;
let widestSent = { dx: 0, dy: 0 };

function classify(snap: Snapshot, e: Extract<GameEvent, { e: 'dmg' }>): Hit | null {
  if (e.kind !== 'player' || e.victim !== myId || e.attacker === null || e.attacker === myId) return null;
  const me = snap.players.find((p) => p.id === myId);
  const attacker = snap.players.find((p) => p.id === e.attacker);
  if (!me) return null;
  if (!attacker) return { where: respawning.has(e.attacker) ? 'dead' : 'absent', dx: NaN, dy: NaN };
  const [w, h] = viewport;
  const cam = makeCamera(me, w, h, snap.self.viewRadius || WORLD.viewRadius);
  const dx = attacker.x - me.x, dy = attacker.y - me.y;
  return { where: Math.abs(dx) <= cam.viewHalfW && Math.abs(dy) <= cam.viewHalfH ? 'inside' : 'outside', dx, dy };
}

function countEdgePopIns(snap: Snapshot) {
  const me = snap.players.find((p) => p.id === myId);
  if (!me) return;
  const cam = makeCamera(me, viewport[0], viewport[1], snap.self.viewRadius || WORLD.viewRadius);
  const now = new Set<number>();
  const teleported = !lastMe || Math.hypot(me.x - lastMe.x, me.y - lastMe.y) > 100;
  lastMe = { x: me.x, y: me.y };
  for (const p of snap.players) {
    if (p.id === myId) continue;
    const spawned = respawning.delete(p.id);
    const gapX = cam.viewHalfW + WORLD.playerRadius - Math.abs(p.x - me.x), gapY = cam.viewHalfH + WORLD.playerRadius - Math.abs(p.y - me.y);
    if (gapX < 0 || gapY < 0) continue;
    now.add(p.id);
    if (teleported || spawned || onScreen.has(p.id) || Math.min(gapX, gapY) > EDGE_BAND) continue;
    arrivals++;
    if (Math.min(gapX, gapY) > 2 * WORLD.playerRadius) edgePopIns++;
  }
  onScreen = now;
}

const page = await openPage({
  profile: 'skirmish-offscreen-',
  onEvent: (method, params) => {
    // A page left by navigation can linger in the back/forward cache with its socket open; only the newest socket counts.
    if (method === 'Network.webSocketCreated') { socketId = params.requestId; full = null; myId = null; }
    else if (method === 'Network.webSocketFrameReceived' && params.requestId === socketId) {
      const msg = JSON.parse(params.response.payloadData);
      if (msg.t === 'welcome') myId = msg.id;
      if (msg.t !== 'snap') return;
      full = fillSnapshot(msg, full) ?? full;
      if (!full) return;
      for (const e of full.events) if (e.e === 'kill') respawning.add(e.victimId);
      for (const e of full.events) if (e.e === 'dmg') { const hit = classify(full, e); if (hit) hits.push(hit); }
      countEdgePopIns(full);
      const me = full.players.find((p) => p.id === myId);
      for (const p of full.players) if (me && p.id !== myId) widestSent = { dx: Math.max(widestSent.dx, Math.abs(p.x - me.x)), dy: Math.max(widestSent.dy, Math.abs(p.y - me.y)) };
    }
  },
});
const { cdp, js } = page;
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };

for (const [i, vp] of VIEWPORTS.entries()) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 1, mobile: false });
  if (i === 0) {
    await cdp('Page.navigate', { url: BASE });
    await joinFromMenu(page, { name: 'Offscreen' });
    if (!(await until(() => myId !== null))) throw new Error(`${vp.join('x')}: never joined`);
  }
  await sleep(1000);
  viewport = vp;
  hits = []; onScreen = new Set(); respawning = new Set(); lastMe = null; edgePopIns = 0; arrivals = 0; widestSent = { dx: 0, dy: 0 };
  const end = Date.now() + SECONDS * 1000;
  let shotTaken = false;
  while (Date.now() < end) {
    if (!shotTaken && Date.now() > end - (SECONDS * 1000) / 2 && (await js(`document.getElementById('death').hidden`))) {
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
      mkdirSync(join(RUN, 'evidence'), { recursive: true });
      writeFileSync(join(RUN, 'evidence', `offscreen-${vp.join('x')}.png`), Buffer.from(data, 'base64'));
      shotTaken = true;
    }
    await respawnIfDead(page);
    await sleep(250);
  }
  const count = (w: Where) => hits.filter((h) => h.where === w).length;
  const outside = hits.filter((h) => h.where === 'outside');
  const worst = outside.length ? `; outside offsets up to |dx| ${Math.max(...outside.map((h) => Math.abs(h.dx))).toFixed(0)}, |dy| ${Math.max(...outside.map((h) => Math.abs(h.dy))).toFixed(0)}` : '';
  console.log(`${vp.join('x')}: ${hits.length} hits from players in ${SECONDS}s; attacker on screen ${count('inside')} (${pct(count('inside'), hits.length)}), in snapshot but off screen ${count('outside')} (${pct(count('outside'), hits.length)}), not in snapshot because the attacker died ${count('dead')}, for any other reason ${count('absent')} (${pct(count('absent'), hits.length)})${worst}`);
  const cam = makeCamera({ x: 0, y: 0 }, vp[0], vp[1], WORLD.viewRadius);
  console.log(`${vp.join('x')} (${i === 0 ? 'aspect sent in join' : 'aspect sent on resize'}): widest player sent |dx| ${widestSent.dx.toFixed(0)}, |dy| ${widestSent.dy.toFixed(0)}; screen shows |dx| ${cam.viewHalfW.toFixed(0)}, |dy| ${cam.viewHalfH.toFixed(0)}`);
  console.log(`${vp.join('x')}: ${arrivals} players slid in at a screen edge; ${edgePopIns} of them appeared already fully inside the screen (pop-in, respawns excluded)`);
}
page.close();
process.exit(0);
