import { KIT, PIECE_IDS, placed, type PieceId, type Placement } from '../../shared/kit.ts';
import { lintMap, type Problem } from '../../shared/maplint.ts';
import { expandMap, MAP_FILES, MAP_IDS, parseMapFile, serializeMapFile, type Center, type MapDef, type MapFile, type MapId } from '../../shared/maps.ts';
import type { WallView } from '../../shared/protocol.ts';
import type { Camera } from '../camera.ts';
import { createPool } from '../particles.ts';
import { QUALITY } from '../quality.ts';
import { blockLook } from '../world/blocks.ts';
import { mapLayoutKey } from '../world/layout.ts';
import { looksOf, pieceKey, pieceLook } from '../world/pieces.ts';
import type { Scene } from '../world/scene.ts';
import { createWorld, type World } from '../world/stage.ts';
import {
  addPiece, addRegion, anchorOf, commit, dragTo, geomOf, handlesOf, historyOf, nextTurn, pick, placementAt, redo, remove, resizable,
  resizeTo, rotatePiece, sameTarget, snap, undo, type Addable, type Handle, type History, type Target,
} from './model.ts';
import { CORNER_PX, drawOverlay, toMap, toScreen, type EditorCam } from './overlay.ts';

/**
 * The map editor, opened with `?dev&editor=<map>`. It draws the map with the game's own stage and kit, edits the map file
 * through `model.ts`, runs the same lint as `scripts/map-lint.ts` after each edit, and saves the file in the stored format.
 */

const GRID = 25;
const LINT_DELAY_MS = 250;
const ZOOM = { min: 0.03, max: 4 } as const;

type Mode =
  | { k: 'idle' }
  | { k: 'place'; p: PieceId; r: Placement['r'] }
  | { k: 'add'; what: Addable }
  | { k: 'drag'; h: Handle; grab: Center; from: MapFile }
  | { k: 'resize'; h: Handle; from: MapFile };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export async function startEditor(requested: string) {
  for (const id of ['menu', 'hud']) $(id).hidden = true;
  const id = (MAP_IDS as readonly string[]).includes(requested) ? requested as MapId : 'warehouse';
  const { file: loaded, from } = await loadFile(id);
  const baked = mapLayoutKey(wallViews(expandMap(loaded)));

  let hist: History = historyOf(loaded);
  let saved = loaded;
  let preview: MapFile | null = null;
  let mode: Mode = { k: 'idle' };
  let selected: Target | null = null;
  let hovered: Handle | null = null;
  let cursor: Center = { x: 0, y: 0 };
  let free = false;
  let panning: Center | null = null;
  let showLight = true;
  let showGrid = true;
  /** Off fades roofs, gantries and pipes as the game does over a player, and lets clicks through to what is under them. */
  let showOverhead = true;
  let problems: Problem[] = [];
  let lintMs = 0;
  let focus: number | null = null;
  let lintTimer: ReturnType<typeof setTimeout> | undefined;
  let linted: MapFile | null = null;
  let lastDef: { file: MapFile; def: MapDef } = { file: loaded, def: expandMap(loaded) };
  let defError: string | null = null;

  const shown = () => preview ?? hist.now;
  const cam: EditorCam = { x: loaded.size / 2, y: loaded.size / 2, scale: 0.2, w: innerWidth, h: innerHeight };

  const canvas = $<HTMLCanvasElement>('game');
  const ctx = canvas.getContext('2d')!;
  const ui = mountPanel();
  canvas.style.cursor = 'default';
  let world: World | null = null;
  createWorld($<HTMLCanvasElement>('world'), () => QUALITY.high).then((w) => { world = w; resize(); }, (err: unknown) => status(`The world could not start: ${String(err)}`));

  /** The expanded map, kept from the last file that expanded; a file `expandMap` rejects shows why and draws the last good one. */
  function defOf(f: MapFile): MapDef {
    if (lastDef.file === f) return lastDef.def;
    try {
      lastDef = { file: f, def: expandMap(f) };
      defError = null;
    } catch (err) {
      defError = (err as Error).message;
    }
    return lastDef.def;
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cam.w = innerWidth;
    cam.h = innerHeight;
    canvas.width = Math.round(cam.w * dpr);
    canvas.height = Math.round(cam.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    world?.resize(cam.w, cam.h, dpr);
  }

  function fit() {
    const f = shown();
    cam.scale = Math.min((cam.w - 640) / f.size, cam.h / f.size) * 0.92;
    cam.x = f.size / 2 - 40 / cam.scale;
    cam.y = f.size / 2;
  }

  const ghost = (): Placement | null => (mode.k === 'place' ? placementAt(mode.p, cursor, GRID, free, mode.r) : null);

  function edit(next: MapFile, select: Target | null = selected) {
    hist = commit(hist, next);
    selected = select && geomOf(hist.now, select) ? select : null;
    afterEdit();
  }

  function afterEdit() {
    hovered = null;
    clearTimeout(lintTimer);
    lintTimer = setTimeout(runLint, LINT_DELAY_MS);
    refreshPanel();
  }

  function runLint() {
    const f = hist.now;
    if (linted === f) return;
    const start = performance.now();
    const def = defOf(f);
    problems = defError ? [{ text: defError, at: null }] : lintMap(def);
    lintMs = performance.now() - start;
    linted = f;
    focus = null;
    refreshPanel();
  }

  function sceneOf(f: MapFile): { scene: Scene; walls: WallView[] } {
    const g = ghost();
    const def = defOf(g ? addPiece(f, g).file : f);
    const walls = wallViews(def);
    const tl = toMap(cam, { x: 0, y: 0 }), br = toMap(cam, { x: cam.w, y: cam.h });
    const view = { x0: tl.x - 120, y0: tl.y - 120, x1: br.x + 120, y1: br.y + 120 };
    const inView = (r: { x: number; y: number; w: number; h: number; height: number }) => r.x + r.w >= view.x0 && r.x <= view.x1 && r.y + r.h + r.height >= view.y0 && r.y <= view.y1;
    const looks = looksOf(def.pieces);
    const flat = def.pieces.filter((at) => KIT[at.p].height === 0 && !KIT[at.p].breaks).map(pieceLook);
    const crates = def.breakables.map((at, i) => ({ id: i, key: pieceKey(at), piece: at.p, ...placed(at).foot, height: KIT[at.p].height, tier: undefined, wear: 0 }));
    const scene: Scene = {
      view, size: f.size, layout: showLight ? baked : `editor:${mapLayoutKey(walls)}`, dark: 0, zones: [], mines: [], thrown: [], dangers: [], gas: [], trails: [],
      crates: crates.filter(inView), pieces: [...flat, ...looks.standing].filter(inView),
      overheads: looks.overhead.filter(inView).map((p) => ({ ...p, under: !showOverhead })), train: null, fires: [],
      engineerWalls: [], siege: [], core: null, tracers: [], zombies: [], downed: [], bodies: [], tags: [], cracks: [], ring: null, loot: [], drops: [],
      ghost: null, killer: null, numbers: [], effects: [], particles: NO_PARTICLES,
    };
    return { scene, walls };
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    const f = shown();
    if (world) {
      const { scene, walls } = sceneOf(f);
      const camera: Camera = { x: cam.x, y: cam.y, scale: cam.scale, w: cam.w, h: cam.h, viewHalfW: cam.w / cam.scale / 2, viewHalfH: cam.h / cam.scale / 2 };
      world.draw(scene, camera, now, walls);
    }
    ctx.clearRect(0, 0, cam.w, cam.h);
    const g = ghost();
    drawOverlay(ctx, { cam, size: f.size, grid: GRID, showGrid, handles: handlesOf(f), selected, hovered, ghost: g && placed(g).foot, problems: preview ? [] : problems, focus });
  }

  function refreshPanel() {
    const f = hist.now;
    ui.title.textContent = `${f.name} · ${id}.json`;
    ui.dirty.textContent = f === saved ? 'saved' : 'unsaved changes';
    ui.dirty.classList.toggle('warn', f !== saved);
    ui.undo.disabled = !hist.past.length;
    ui.redo.disabled = !hist.future.length;
    ui.light.checked = showLight;
    ui.grid.checked = showGrid;
    ui.overhead.checked = showOverhead;
    ui.lightNote.hidden = !(showLight && f !== loaded);
    ui.mode.textContent = mode.k === 'place' ? `Placing ${KIT[mode.p].name}: click to place, R turns it, Esc stops` : mode.k === 'add' ? 'Click the map to add it' : '';
    for (const b of ui.palette.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', mode.k === 'place' && b.dataset.piece === mode.p);
    for (const b of ui.addRow.querySelectorAll<HTMLElement>('[data-ext]')) b.hidden = !f.extract;
    const sel = selected && handlesOf(f).find((h) => !h.twin && sameTarget(h.target, selected!));
    ui.selection.textContent = sel ? describe(f, sel) : 'Nothing selected.';
    ui.problemsHead.textContent = linted === f ? `Lint: ${problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'clean'} (${lintMs.toFixed(0)} ms)` : 'Lint: checking…';
    ui.problemsHead.classList.toggle('warn', problems.length > 0);
    ui.problems.replaceChildren(...problems.map((p, i) => {
      const li = document.createElement('li');
      li.textContent = `${i + 1}. ${p.text}`;
      if (p.at) li.onclick = () => { cam.x = p.at!.x; cam.y = p.at!.y; cam.scale = Math.max(cam.scale, 0.5); focus = i; };
      else li.classList.add('nowhere');
      return li;
    }));
  }

  function status(text: string) {
    ui.status.textContent = text;
  }

  const setMode = (next: Mode) => { mode = next; refreshPanel(); };
  const pickable = (t: Target) => showOverhead || t.k !== 'piece' || !KIT[hist.now.pieces[t.i]!.p].overhead;

  // Input. Left drag moves what it grabs (or pans empty floor), right or middle drag pans, the wheel zooms about the cursor.
  const pointAt = (e: MouseEvent): Center => toMap(cam, { x: e.clientX, y: e.clientY });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    free = e.shiftKey;
    cursor = pointAt(e);
    if (e.button !== 0) {
      if (e.button === 2 && mode.k !== 'idle') setMode({ k: 'idle' });
      panning = { x: e.clientX, y: e.clientY };
      return;
    }
    const f = hist.now;
    if (mode.k === 'place') {
      const added = addPiece(f, ghost()!);
      edit(added.file, added.target);
      return;
    }
    if (mode.k === 'add') {
      const added = addRegion(f, mode.what, cursor, GRID);
      mode = { k: 'idle' };
      edit(added.file, added.target);
      return;
    }
    const handles = handlesOf(f);
    const own = selected && handles.find((h) => !h.twin && sameTarget(h.target, selected!));
    if (own && own.geom.kind === 'rect' && resizable(own.target)) {
      const corner = toScreen(cam, { x: own.geom.rect.x + own.geom.rect.w, y: own.geom.rect.y + own.geom.rect.h });
      if (Math.hypot(corner.x - e.clientX, corner.y - e.clientY) <= CORNER_PX) { mode = { k: 'resize', h: own, from: f }; return; }
    }
    const h = pick(handles, cursor, 14 / cam.scale, pickable);
    selected = h?.target ?? null;
    focus = null;
    refreshPanel();
    if (!h) { panning = { x: e.clientX, y: e.clientY }; return; }
    const a = anchorOf(h.geom);
    mode = { k: 'drag', h, grab: { x: cursor.x - a.x, y: cursor.y - a.y }, from: f };
  });
  canvas.addEventListener('pointermove', (e) => {
    free = e.shiftKey;
    cursor = pointAt(e);
    if (panning) {
      cam.x -= (e.clientX - panning.x) / cam.scale;
      cam.y -= (e.clientY - panning.y) / cam.scale;
      panning = { x: e.clientX, y: e.clientY };
      return;
    }
    if (mode.k === 'drag') {
      const to = { x: snap(cursor.x - mode.grab.x, GRID, free), y: snap(cursor.y - mode.grab.y, GRID, free) };
      preview = dragTo(mode.from, mode.h, to);
      return;
    }
    if (mode.k === 'resize') {
      preview = resizeTo(mode.from, mode.h, { x: snap(cursor.x, GRID, free), y: snap(cursor.y, GRID, free) }, GRID);
      return;
    }
    hovered = mode.k === 'idle' ? pick(handlesOf(hist.now), cursor, 14 / cam.scale, pickable) : null;
  });
  const release = () => {
    panning = null;
    if (mode.k === 'drag' || mode.k === 'resize') {
      const next = preview;
      preview = null;
      mode = { k: 'idle' };
      if (next) edit(next);
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = toMap(cam, { x: e.clientX, y: e.clientY });
    cam.scale = Math.min(ZOOM.max, Math.max(ZOOM.min, cam.scale * Math.exp(-e.deltaY * 0.0015)));
    const after = toMap(cam, { x: e.clientX, y: e.clientY });
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    free = e.shiftKey;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); hist = e.shiftKey ? redo(hist) : undo(hist); keepSelection(); return; }
    if (mod && key === 'y') { e.preventDefault(); hist = redo(hist); keepSelection(); return; }
    if (mod && key === 's') { e.preventDefault(); void saveToRepo(); return; }
    if (mod && key === 'd' && selected?.k === 'piece') {
      e.preventDefault();
      const at = hist.now.pieces[selected.i]!;
      const copy = addPiece(hist.now, { ...at, x: at.x + GRID * 2, y: at.y + GRID * 2 });
      edit(copy.file, copy.target);
      return;
    }
    if (mod) return;
    if (key === 'escape') { selected = null; setMode({ k: 'idle' }); return; }
    if (key === 'r' && mode.k === 'place') { setMode({ ...mode, r: nextTurn(mode.p, mode.r) }); return; }
    if (key === 'r' && selected?.k === 'piece') { edit(rotatePiece(hist.now, selected.i, GRID, free)); return; }
    if ((key === 'delete' || key === 'backspace') && selected) { edit(remove(hist.now, selected), null); return; }
    if (key === 'l') { showLight = !showLight; refreshPanel(); return; }
    if (key === 'g') { showGrid = !showGrid; refreshPanel(); return; }
    if (key === 'o') { showOverhead = !showOverhead; refreshPanel(); return; }
    if (key === 'f') { fit(); return; }
    const nudge = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
    if (nudge && selected) {
      e.preventDefault();
      const h = handlesOf(hist.now).find((x) => !x.twin && sameTarget(x.target, selected!));
      const step = e.shiftKey ? 1 : GRID;
      if (h) { const a = anchorOf(h.geom); edit(dragTo(hist.now, h, { x: a.x + nudge[0]! * step, y: a.y + nudge[1]! * step })); }
    }
  });
  addEventListener('keyup', (e) => { free = e.shiftKey; });
  addEventListener('resize', resize);
  addEventListener('beforeunload', (e) => { if (hist.now !== saved) e.preventDefault(); });

  function keepSelection() {
    if (selected && !geomOf(hist.now, selected)) selected = null;
    afterEdit();
  }

  function download() {
    const blob = new Blob([serializeMapFile(hist.now)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status(`Downloaded ${id}.json. Put it at src/shared/maps/${id}.json.`);
  }

  async function saveToRepo() {
    const f = hist.now;
    const res = await fetch(`/api/dev/maps/${id}`, { method: 'PUT', body: JSON.stringify(f) }).catch(() => null);
    if (res?.ok) {
      const body = (await res.json()) as { saved: string };
      saved = f;
      status(`Wrote ${body.saved}. Run npm run art to rebake its light layer.`);
    } else if (res?.status === 404) status('This server cannot write maps: start it with SKIRMISH_DEV_MAPS=1, or use Download.');
    else status(`Save failed: ${res ? ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status : 'no server'}`);
    refreshPanel();
  }

  function mountPanel() {
    const style = document.createElement('style');
    style.textContent = EDITOR_CSS;
    document.head.append(style);
    const root = document.createElement('div');
    root.id = 'editor';
    root.innerHTML = `
      <aside class="ed-left">
        <header><b id="ed-title"></b><span id="ed-dirty"></span></header>
        <div class="ed-row"><select id="ed-map">${MAP_IDS.map((m) => `<option${m === id ? ' selected' : ''}>${m}</option>`).join('')}</select>
          <button id="ed-undo" title="Ctrl+Z">Undo</button><button id="ed-redo" title="Ctrl+Shift+Z">Redo</button></div>
        <div class="ed-row"><button id="ed-save" class="primary" title="Ctrl+S">Save to repo</button><button id="ed-download">Download</button></div>
        <label class="ed-check"><input type="checkbox" id="ed-light"> Baked light layer (L)</label>
        <p id="ed-light-note" class="ed-note">The light layer is baked from the map as loaded; it shows your edits after <code>npm run art</code>.</p>
        <label class="ed-check"><input type="checkbox" id="ed-overhead"> Overhead pieces (O; off fades them and clicks reach under)</label>
        <label class="ed-check"><input type="checkbox" id="ed-grid"> Grid, snapping to ${GRID} (G; hold Shift to place free)</label>
        <div class="ed-row" id="ed-add">
          <button data-add="spawn:red">+ Red spawn</button><button data-add="spawn:ffa">+ FFA spawn</button><button data-add="zone">+ Zone</button>
          <button data-add="extract:attack" data-ext>+ Attack spawn</button><button data-add="extract:defend" data-ext>+ Defend spawn</button>
        </div>
        <input id="ed-filter" placeholder="Filter pieces" spellcheck="false">
        <div id="ed-palette"></div>
      </aside>
      <aside class="ed-right">
        <p id="ed-mode" class="ed-mode"></p>
        <p id="ed-selection"></p>
        <p class="ed-note">Drag to move. R turns, Delete removes, arrows nudge, Ctrl+D copies a piece. Right-drag or drag empty floor to pan; the wheel zooms; F fits.</p>
        <h3 id="ed-problems-head"></h3>
        <ol id="ed-problems"></ol>
        <p id="ed-status" class="ed-note" role="status"></p>
      </aside>`;
    document.body.append(root);
    const palette = $('ed-palette');
    palette.replaceChildren(...PIECE_IDS.map((p) => {
      const b = document.createElement('button');
      b.dataset.piece = p;
      const def = KIT[p];
      b.innerHTML = `<i style="background:#${blockLook(p).top.toString(16).padStart(6, '0')}"></i><span>${def.name}</span><small>${def.w}×${def.h}${def.breaks ? ' · breaks' : ''}${def.overhead ? ' · overhead' : ''}</small>`;
      b.onclick = () => setMode(mode.k === 'place' && mode.p === p ? { k: 'idle' } : { k: 'place', p, r: 0 });
      return b;
    }));
    $<HTMLInputElement>('ed-filter').oninput = (e) => {
      const q = (e.target as HTMLInputElement).value.toLowerCase();
      for (const b of palette.querySelectorAll<HTMLButtonElement>('button')) b.hidden = !!q && !`${b.dataset.piece} ${KIT[b.dataset.piece as PieceId].name}`.toLowerCase().includes(q);
    };
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-add]')) {
      const [k, side] = b.dataset.add!.split(':');
      b.onclick = () => setMode({ k: 'add', what: (k === 'zone' ? { k: 'zone' } : { k, side }) as Addable });
    }
    $<HTMLSelectElement>('ed-map').onchange = (e) => { location.search = `?dev&editor=${(e.target as HTMLSelectElement).value}`; };
    $('ed-undo').onclick = () => { hist = undo(hist); keepSelection(); };
    $('ed-redo').onclick = () => { hist = redo(hist); keepSelection(); };
    $('ed-save').onclick = () => void saveToRepo();
    $('ed-download').onclick = download;
    $<HTMLInputElement>('ed-light').onchange = (e) => { showLight = (e.target as HTMLInputElement).checked; refreshPanel(); };
    $<HTMLInputElement>('ed-grid').onchange = (e) => { showGrid = (e.target as HTMLInputElement).checked; refreshPanel(); };
    $<HTMLInputElement>('ed-overhead').onchange = (e) => { showOverhead = (e.target as HTMLInputElement).checked; refreshPanel(); };
    return {
      title: $('ed-title'), dirty: $('ed-dirty'), undo: $<HTMLButtonElement>('ed-undo'), redo: $<HTMLButtonElement>('ed-redo'),
      light: $<HTMLInputElement>('ed-light'), grid: $<HTMLInputElement>('ed-grid'), overhead: $<HTMLInputElement>('ed-overhead'), lightNote: $('ed-light-note'), mode: $('ed-mode'),
      palette, addRow: $('ed-add'), selection: $('ed-selection'), problemsHead: $('ed-problems-head'), problems: $('ed-problems'), status: $('ed-status'),
    };
  }

  resize();
  fit();
  refreshPanel();
  runLint();
  status(from === 'server' ? `Loaded src/shared/maps/${id}.json from the dev server.` : `Loaded the ${id} map bundled with this build. Save to repo needs a server started with SKIRMISH_DEV_MAPS=1.`);
  requestAnimationFrame(frame);
  Object.assign(window, {
    skirmishEditor: {
      file: () => hist.now, problems: () => problems, lintedAt: () => linted === hist.now, selected: () => selected, mode: () => mode.k,
      toScreen: (p: Center) => toScreen(cam, p), camera: () => ({ ...cam }), world: () => world?.probe() ?? null,
    },
  });
}

const NO_PARTICLES = createPool(1);
const wallViews = (def: MapDef): WallView[] => def.walls.map((w) => ({ ...w, built: false }));

/** The file from the dev server when it serves one, so a save shows on reload without a rebuild; else the bundled copy. */
async function loadFile(id: MapId): Promise<{ file: MapFile; from: 'server' | 'bundle' }> {
  const res = await fetch(`/api/dev/maps/${id}`).catch(() => null);
  if (res?.ok) return { file: parseMapFile(await res.json()), from: 'server' };
  return { file: parseMapFile(MAP_FILES[id]), from: 'bundle' };
}

function describe(f: MapFile, h: Handle): string {
  const g = h.geom;
  const where = g.kind === 'rect' ? `at ${g.rect.x}, ${g.rect.y}, ${g.rect.w}×${g.rect.h}` : `at ${g.at.x}, ${g.at.y}`;
  if (h.target.k !== 'piece') return `${h.label} ${where}`;
  const at = f.pieces[h.target.i]!;
  const def = KIT[at.p];
  const twin = f.symmetry === 'halfTurn' ? ' Its half-turn twin follows it.' : '';
  return `${def.name} (${at.p}) ${where}, turn ${at.r} of ${def.turns}, height ${def.height}${def.breaks ? `, breaks at ${def.breaks.hp} hp` : ''}.${twin}`;
}

const EDITOR_CSS = `
#editor { position: fixed; inset: 0; pointer-events: none; font: 13px/1.4 system-ui, sans-serif; color: #e8eaee; }
#editor aside { position: absolute; top: 12px; bottom: 12px; width: 280px; overflow: auto; pointer-events: auto; background: rgba(18,20,26,0.88);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; box-sizing: border-box; backdrop-filter: blur(6px); }
#editor .ed-left { left: 12px; }
#editor .ed-right { right: 12px; width: 320px; }
#editor header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
#editor #ed-dirty { color: #8b93a1; }
#editor .warn { color: #ffb020 !important; }
#editor .ed-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
#editor button, #editor select, #editor input:not([type]) { font: inherit; color: inherit; background: #2a2e37; border: 1px solid #3a3f4b; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
#editor input:not([type]) { width: 100%; box-sizing: border-box; cursor: text; margin: 6px 0; }
#editor button:disabled { opacity: 0.4; cursor: default; }
#editor button.primary { background: #ffd34d; color: #1b1d22; border-color: #ffd34d; font-weight: 600; }
#editor .ed-check { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
#editor .ed-check input { width: auto; margin: 0; flex: none; }
#editor .ed-note { color: #8b93a1; font-size: 12px; margin: 4px 0 8px; }
#editor .ed-mode { color: #7cf29a; min-height: 1em; }
#editor #ed-palette { display: grid; gap: 3px; }
#editor #ed-palette button { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 8px; text-align: left; }
#editor #ed-palette button.on { border-color: #7cf29a; background: #24382b; }
#editor #ed-palette i { width: 14px; height: 14px; border-radius: 3px; }
#editor #ed-palette small { color: #8b93a1; }
#editor h3 { font-size: 13px; margin: 12px 0 6px; color: #7cf29a; }
#editor ol { margin: 0; padding: 0; list-style: none; }
#editor li { padding: 4px 6px; border-radius: 5px; cursor: pointer; color: #ffd7d8; }
#editor li:hover { background: rgba(229,72,77,0.18); }
#editor li.nowhere { cursor: default; }
`;
