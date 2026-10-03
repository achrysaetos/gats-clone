import { PERK_TIERS, WORLD } from '../shared/defs.ts';
import { cleanName, type ClientMsg, type Loadout, type ServerMsg, type Snapshot } from '../shared/protocol.ts';
import { fetchServers, loadLoadout, loadName, saveLoadout, saveName, type ServerInfo } from './api.ts';
import { makeCamera, worldToScreen, type Camera } from './camera.ts';
import { createAudio } from './audio.ts';
import { isDead, killerOf } from './derive.ts';
import { drawHud, drawSticks } from './hud.ts';
import { actionForKey, assembleInput, perkSlotForKey, type Action } from './input.ts';
import { NO_STICKS, dragStick, pressStick, releaseStick, touchAim, touchMoves, type Sticks } from './touch.ts';
import { EMPTY_PAIR, interpolateSnap, pushSnap } from './interp.ts';
import { $, mountAccount, mountLoadoutPicker, renderControls, renderServers } from './menu.ts';
import { createOverlays } from './overlays.ts';
import { drawWorld, PALETTE, TRAIL_MS } from './render.ts';
import { soundsFor, type SoundCue } from './sfx.ts';
import { addTrauma, decay, offset, traumaFor } from './shake.ts';
import { EFFECT_LIFE_MS, type ClientState, type Session } from './state.ts';

const INPUT_HZ = 30;
const SERVER_POLL_MS = 5000;
const SERVER_MSG_TYPES: ReadonlySet<string> = new Set<ServerMsg['t']>(['welcome', 'walls', 'snap', 'chat', 'error']);

const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const menuEl = $('menu');
const hudEl = $('hud');
const statusEl = $('menu-status');
const playBtn = $<HTMLButtonElement>('play');
const nameInput = $<HTMLInputElement>('name');
const serversEl = $('servers');

let state: ClientState = { phase: 'menu', status: { kind: 'idle' } };
let loadout: Loadout = loadLoadout();
let servers: ServerInfo[] | null = [];
let selectedRoom: string | null = null;
let view = { w: 0, h: 0, dpr: 1 };
let camera: Camera | null = null;
const held = new Set<Action>();
let firing = false;
const mouse = { x: 0, y: 0 };
let sticks: Sticks = NO_STICKS;
const audio = createAudio();
let trauma = 0;
let lastFrameAt = 0;

const sessionOf = (st: ClientState): Session | null => (st.phase === 'menu' ? null : st.s);

function send(ws: WebSocket, msg: ClientMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function setState(next: ClientState) {
  state = next;
  menuEl.hidden = next.phase !== 'menu';
  hudEl.hidden = next.phase === 'menu';
  if (next.phase === 'menu') {
    overlays.reset();
    held.clear();
    firing = false;
    const st = next.status;
    statusEl.textContent = st.kind === 'error' ? st.message : st.kind === 'connecting' ? 'Connecting…' : '';
    statusEl.classList.toggle('error', st.kind === 'error');
    refreshPlayButton();
    void pollServers();
  }
}

function refreshPlayButton() {
  const connecting = state.phase === 'menu' && state.status.kind === 'connecting';
  playBtn.disabled = connecting || selectedRoom === null;
  playBtn.textContent = connecting ? 'Connecting…' : 'Play';
}

function setLoadout(next: Loadout) {
  loadout = next;
  saveLoadout(next);
  for (const p of pickers) p.refresh();
}

function connect(room: string) {
  const name = cleanName(nameInput.value);
  saveName(nameInput.value);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}`);
  setState({ phase: 'menu', status: { kind: 'connecting', ws } });
  ws.onopen = () => send(ws, { t: 'join', name, loadout, token: account()?.token });
  ws.onmessage = (ev) => {
    const msg = parseServerMsg(ev.data);
    if (msg) onServerMsg(ws, msg);
  };
  ws.onclose = () => {
    const ours = sessionOf(state)?.ws === ws || (state.phase === 'menu' && state.status.kind === 'connecting' && state.status.ws === ws);
    if (ours) setState({ phase: 'menu', status: { kind: 'error', message: 'Disconnected from server.' } });
  };
}

function parseServerMsg(data: unknown): ServerMsg | null {
  if (typeof data !== 'string') return null;
  try {
    const v: unknown = JSON.parse(data);
    return typeof v === 'object' && v !== null && SERVER_MSG_TYPES.has((v as { t: string }).t) ? (v as ServerMsg) : null;
  } catch {
    return null;
  }
}

function onServerMsg(ws: WebSocket, msg: ServerMsg) {
  const now = performance.now();
  if (state.phase === 'menu') {
    if (state.status.kind !== 'connecting' || state.status.ws !== ws) return;
    if (msg.t === 'error') {
      ws.close();
      setState({ phase: 'menu', status: { kind: 'error', message: msg.message } });
    } else if (msg.t === 'welcome') {
      setState({
        phase: 'playing',
        s: {
          ws, myId: msg.id, worldSize: msg.worldSize, walls: msg.walls, snaps: EMPTY_PAIR, seq: 0,
          lastSelf: { x: msg.worldSize / 2, y: msg.worldSize / 2 },
          effects: [], feed: [], chat: [], trails: new Map(), reloadStartedAt: null, perkSentFor: null,
        },
      });
    }
    return;
  }
  const s = state.s;
  if (s.ws !== ws) return;
  switch (msg.t) {
    case 'snap': return onSnap(s, msg, now);
    case 'walls': s.walls = msg.walls; return;
    case 'chat': s.chat.push({ from: msg.from, text: msg.text, team: msg.team, at: now }); return;
    case 'error': s.chat.push({ from: '', text: msg.message, team: null, at: now }); return;
    case 'welcome': s.myId = msg.id; s.walls = msg.walls; s.worldSize = msg.worldSize; return;
  }
}

function playCues(s: Session, cues: readonly SoundCue[], viewRadius: number) {
  audio.play(cues, s.lastSelf, viewRadius);
  for (const cue of cues) trauma = addTrauma(trauma, traumaFor(cue, s.lastSelf, viewRadius));
}

const playClick = (s: Session) => playCues(s, [{ id: 'click', ...s.lastSelf, self: true, strength: 1 }], WORLD.viewRadius);

function onSnap(s: Session, snap: Snapshot, now: number) {
  const prev = s.snaps.next?.snap ?? null;
  s.snaps = pushSnap(s.snaps, snap, now);
  playCues(s, soundsFor(prev, snap), snap.self.viewRadius || WORLD.viewRadius);
  s.effects = s.effects.filter((fx) => now - fx.born < EFFECT_LIFE_MS[fx.kind]);
  for (const ev of snap.events) {
    switch (ev.e) {
      case 'hit': s.effects.push({ kind: 'hit', x: ev.x, y: ev.y, born: now }); break;
      case 'boom': s.effects.push({ kind: 'boom', x: ev.x, y: ev.y, r: ev.r, born: now }); break;
      case 'shot': s.effects.push({ kind: 'flash', x: ev.x, y: ev.y, born: now }); break;
      case 'kill': s.feed = [...s.feed.slice(-9), { ...ev, at: now }]; break;
    }
  }
  if (!snap.self.reloading) s.reloadStartedAt = null;
  else s.reloadStartedAt ??= now;
  if (snap.self.pendingTier !== s.perkSentFor) s.perkSentFor = null;

  const dead = isDead(snap);
  if (dead && state.phase === 'playing') setState({ phase: 'dead', s, killer: killerOf(snap.events, s.myId) });
  else if (dead && state.phase === 'dead' && !state.killer) state.killer = killerOf(snap.events, s.myId);
  else if (!dead && state.phase === 'dead') setState({ phase: 'playing', s });
}

function aimOffset(s: Session): { dx: number; dy: number } {
  const touch = touchAim(sticks);
  if (touch) return touch;
  if (!camera) return { dx: 1, dy: 0 };
  const self = worldToScreen(camera, s.lastSelf);
  return { dx: (mouse.x - self.x) / camera.scale, dy: (mouse.y - self.y) / camera.scale };
}

setInterval(() => {
  const s = sessionOf(state);
  if (!s) return;
  const active = state.phase === 'playing' && !overlays.typing;
  s.seq++;
  const actions = active ? new Set([...held, ...touchMoves(sticks)]) : new Set<Action>();
  const shooting = active && (firing || touchAim(sticks) !== null);
  send(s.ws, { t: 'input', seq: s.seq, input: assembleInput(actions, shooting, aimOffset(s)) });
}, 1000 / INPUT_HZ);

function pickPerk(slot: number) {
  const s = sessionOf(state);
  const tier = s?.snaps.next?.snap.self.pendingTier;
  if (!s || !tier || s.perkSentFor === tier) return;
  const perk = PERK_TIERS[tier][slot];
  if (!perk) return;
  send(s.ws, { t: 'perk', tier, perk });
  s.perkSentFor = tier;
  playClick(s);
}

function respawn() {
  if (state.phase === 'dead') send(state.s.ws, { t: 'respawn', loadout });
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  view = { w: window.innerWidth, h: window.innerHeight, dpr };
  canvas.width = Math.round(view.w * dpr);
  canvas.height = Math.round(view.h * dpr);
}

function drawBackdrop(now: number) {
  const { w, h, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.floor;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1.5;
  const off = (now / 60) % 60;
  ctx.beginPath();
  for (let x = -off; x < w; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = -off; y < h; y += 60) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function updateTrails(s: Session, snap: Snapshot, now: number) {
  for (const p of snap.players) {
    if (!p.dashing || !p.alive) continue;
    const trail = s.trails.get(p.id) ?? [];
    trail.push({ x: p.x, y: p.y, at: now });
    s.trails.set(p.id, trail);
  }
  for (const [id, trail] of s.trails) {
    const live = trail.filter((pt) => now - pt.at < TRAIL_MS);
    if (live.length) s.trails.set(id, live);
    else s.trails.delete(id);
  }
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const s = sessionOf(state);
  const latest = s?.snaps.next?.snap;
  const snap = s && interpolateSnap(s.snaps, now);
  if (!s || !snap || !latest) {
    drawBackdrop(now);
    return;
  }
  const me = snap.players.find((p) => p.id === s.myId);
  if (me?.alive) s.lastSelf = { x: me.x, y: me.y };
  camera = makeCamera(s.lastSelf, view.w, view.h, snap.self.viewRadius || WORLD.viewRadius);
  trauma = decay(trauma, now - lastFrameAt);
  lastFrameAt = now;
  const shake = offset(trauma, now);
  // Aim reads the unshaken `camera`, so shake never jitters where bullets go.
  const cam = { ...camera, x: camera.x + shake.x / camera.scale, y: camera.y + shake.y / camera.scale };
  updateTrails(s, snap, now);
  const aim = aimOffset(s);
  const selfAngle = state.phase === 'playing' ? Math.atan2(aim.dy, aim.dx) : null;
  drawWorld(ctx, { snap, s, cam, dpr: view.dpr, now, selfAngle });
  drawHud(ctx, view.dpr, view.w, view.h, snap, s, now);
  if (state.phase === 'playing') drawSticks(ctx, sticks);
  overlays.update(state, s, latest, now);
}

function onKeyDown(e: KeyboardEvent) {
  const s = sessionOf(state);
  if (!s) return;
  if (overlays.typing) {
    if (e.key === 'Enter') {
      const text = overlays.closeChat();
      if (text) send(s.ws, { t: 'chat', text });
    } else if (e.key === 'Escape') {
      overlays.closeChat();
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    held.clear();
    firing = false;
    overlays.openChat();
    return;
  }
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    s.chat.push({ from: '', text: muted ? 'Sound off (M to turn on)' : 'Sound on', team: null, at: performance.now() });
    if (!muted) playClick(s);
    return;
  }
  const slot = perkSlotForKey(e.code);
  if (slot !== null) {
    pickPerk(slot);
    return;
  }
  const action = actionForKey(e.code);
  if (action && state.phase === 'playing') {
    e.preventDefault();
    held.add(action);
  }
}

function onKeyUp(e: KeyboardEvent) {
  const action = actionForKey(e.code);
  if (action) held.delete(action);
}

for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, audio.unlock, { capture: true });
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', () => { held.clear(); firing = false; sticks = NO_STICKS; });
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  // Suppresses the emulated mousedown so a thumb on the move stick does not also fire.
  e.preventDefault();
  sticks = pressStick(sticks, e.pointerId, e.clientX, e.clientY, view.w);
});
window.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') sticks = dragStick(sticks, e.pointerId, e.clientX, e.clientY); });
for (const type of ['pointerup', 'pointercancel'] as const) {
  window.addEventListener(type, (e) => { if (e.pointerType === 'touch') sticks = releaseStick(sticks, e.pointerId); });
}
for (const [id, action] of [['touch-ability', 'ability'], ['touch-reload', 'reload']] as const) {
  const button = $(id);
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); held.add(action); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) button.addEventListener(type, () => held.delete(action));
}
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) firing = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('resize', resize);

async function pollServers() {
  if (state.phase !== 'menu') return;
  try {
    servers = await fetchServers();
  } catch {
    servers = null;
  }
  if (servers && !servers.some((sv) => sv.id === selectedRoom)) selectedRoom = servers[0]?.id ?? null;
  showServers();
}

function showServers() {
  renderServers(serversEl, servers, selectedRoom, (id) => { selectedRoom = id; showServers(); });
  refreshPlayButton();
}

const overlays = createOverlays(pickPerk, respawn);
const pickers = [
  mountLoadoutPicker($('loadout-menu'), () => loadout, setLoadout),
  mountLoadoutPicker($('loadout-death'), () => loadout, setLoadout),
];
const account = mountAccount($('account'), (a) => { if (a && !nameInput.value) nameInput.value = a.name; });
nameInput.value = loadName() || account()?.name || '';
renderControls($('controls'));
$('play-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (selectedRoom !== null && !(state.phase === 'menu' && state.status.kind === 'connecting')) connect(selectedRoom);
});
setInterval(() => void pollServers(), SERVER_POLL_MS);

resize();
setState(state);
requestAnimationFrame(frame);
