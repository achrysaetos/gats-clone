import type { Pt } from '../../shared/geom.ts';
import type { MapDef } from '../../shared/maps.ts';
import { decideFx, watchdog } from '../fxparams.ts';
import { calm, clock, hexA, C, TAU } from './harborkit.ts';

/**
 * The harbour's water. One small WebGL canvas of its own is rendered each frame for the part of the world in view and stamped
 * into the 2D world under every wall and body, so it takes the night shade, the practical lights and the post pass like any other
 * floor. The shader is toon, not photographic: gentle scrolling ripples are turned into a normal and shaded in three cel steps
 * (three palettes by depth, so the shallows glow turquoise), foam is a crisp ink-bright line at every shore, quay and hull with a
 * second broken line behind it, caustics shimmer slowly in the shallows, practical lights lay stretched, shimmering streaks on the
 * water, and the moored hulls ride in slow concentric rings. All of it is driven by a distance field baked once from the map's own
 * water polygons, so the shader does no per-polygon work at all.
 *
 * With WebGL off (`?nofx`, a software renderer, a lost context, or a pass that proves slow) the same picture is drawn on the plain
 * canvas: cel-banded water with animated foam lines. Under reduced motion both hold still.
 */

export type WaterLight = { x: number; y: number; r: number; k: number; rgb: readonly [number, number, number] };
export type Hull = readonly Pt[];

const TEXEL = 6;
const MAXD = 96;
const SHORE_MAX = 640;
const HULL_MAX = 160;
const MAX_LIGHTS = 8;

export type WaterPrep = {
  size: number;
  /** Every water polygon, both halves. */
  polys: Pt[][];
  /** Quay edges whose land lies to the north: the stone face hangs south into the water. */
  faces: { a: Pt; b: Pt }[];
  hulls: readonly Hull[];
  mask: Uint8Array;
  cells: number;
};

const preps = new Map<string, WaterPrep>();

const distToSeg = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};

const inPoly = (p: Pt, pts: readonly Pt[]): boolean => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** The face of a quay: how far the stone wall hangs down into the water. */
export const FACE = 18;

/** Chamfer (3-4) distance, in texels, from every cell to the nearest cell whose value is `target`. */
function chamfer(mask: Uint8Array, n: number, target: 0 | 1): Float32Array {
  const INF = 1e6, d = new Float32Array(n * n);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === target ? 0 : INF;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    let v = d[i]!;
    if (x > 0) v = Math.min(v, d[i - 1]! + 3);
    if (y > 0) {
      v = Math.min(v, d[i - n]! + 3);
      if (x > 0) v = Math.min(v, d[i - n - 1]! + 4);
      if (x < n - 1) v = Math.min(v, d[i - n + 1]! + 4);
    }
    d[i] = v;
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const i = y * n + x;
    let v = d[i]!;
    if (x < n - 1) v = Math.min(v, d[i + 1]! + 3);
    if (y < n - 1) {
      v = Math.min(v, d[i + n]! + 3);
      if (x < n - 1) v = Math.min(v, d[i + n + 1]! + 4);
      if (x > 0) v = Math.min(v, d[i + n - 1]! + 4);
    }
    d[i] = v;
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! / 3;
  return d;
}

export function prepWater(map: MapDef, hulls: readonly Hull[]): WaterPrep {
  const hit = preps.get(map.name);
  if (hit) return hit;
  const size = map.size;
  const polys = (map.polys ?? []).filter((p) => p.material === 'water').map((p) => [...p.points]);
  const faces: { a: Pt; b: Pt }[] = [];
  for (const pts of polys) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 30 || Math.abs(b.x - a.x) < len * 0.3) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const water = (q: Pt) => polys.some((pp) => inPoly(q, pp));
      if (!water({ x: m.x, y: m.y + 5 }) || water({ x: m.x, y: m.y - 5 })) continue;
      if (hulls.some((h) => h.some((p, k) => distToSeg(m, p, h[(k + 1) % h.length]!) < 6))) continue;
      faces.push({ a, b });
    }
  }
  const cells = Math.ceil(size / TEXEL);
  const mask = new Uint8Array(cells * cells);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = cells;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#000'; g.fillRect(0, 0, cells, cells);
    g.setTransform(1 / TEXEL, 0, 0, 1 / TEXEL, 0, 0);
    g.fillStyle = '#fff';
    for (const pts of polys) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); }
    // The stone face of a quay stands in the water's way: the waterline starts below it.
    g.fillStyle = '#000';
    for (const f of faces) { g.beginPath(); g.moveTo(f.a.x, f.a.y); g.lineTo(f.b.x, f.b.y); g.lineTo(f.b.x, f.b.y + FACE); g.lineTo(f.a.x, f.a.y + FACE); g.closePath(); g.fill(); }
    const px = g.getImageData(0, 0, cells, cells).data;
    for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4]! > 127 ? 1 : 0;
  }
  const prep: WaterPrep = { size, polys, faces, hulls, mask, cells };
  preps.set(map.name, prep);
  return prep;
}

/** The distance field as RGBA: signed fine distance to the shore, coarse distance to land, distance to the nearest hull. */
function field(prep: WaterPrep): Uint8Array {
  const { cells: n, mask } = prep;
  const inside = chamfer(mask, n, 0), outside = chamfer(mask, n, 1);
  // Hull footprint mask (for the rings the moored boats make).
  const hull = new Uint8Array(n * n);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    g.setTransform(1 / TEXEL, 0, 0, 1 / TEXEL, 0, 0);
    g.fillStyle = '#fff';
    for (const h of prep.hulls) { g.beginPath(); h.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); }
    const px = g.getImageData(0, 0, n, n).data;
    for (let i = 0; i < hull.length; i++) hull[i] = px[i * 4]! > 127 ? 1 : 0;
  }
  const hd = chamfer(hull, n, 1);
  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const wet = mask[i] === 1;
    // Texel centres sit half a texel from the edge: take that off so the zero crossing lands on the polygon's edge.
    const sd = wet ? Math.max(0, inside[i]! - 0.5) * TEXEL : -Math.max(0, outside[i]! - 0.5) * TEXEL;
    out[i * 4] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + sd / (2 * MAXD))));
    out[i * 4 + 1] = wet ? Math.round(255 * Math.min(1, (inside[i]! * TEXEL) / SHORE_MAX)) : 0;
    out[i * 4 + 2] = Math.round(255 * Math.min(1, (hd[i]! * TEXEL) / HULL_MAX));
    out[i * 4 + 3] = 255;
  }
  return out;
}

/* -- WebGL ------------------------------------------------------------------------------------------------------ */

const VERT = `attribute vec2 a; varying vec2 vW; uniform vec4 uView;
void main(){ vec2 v = a * 0.5 + 0.5; vW = vec2(uView.x + v.x * uView.z, uView.y + (1.0 - v.y) * uView.w); gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vW;
uniform sampler2D uMask;
uniform float uSize, uT, uPx, uN;
uniform vec4 uL[${MAX_LIGHTS}];
uniform vec3 uLc[${MAX_LIGHTS}];
const float MAXD = ${MAXD.toFixed(1)};
const float SHORE = ${SHORE_MAX.toFixed(1)};
const float HULLR = ${HULL_MAX.toFixed(1)};

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float hgt(vec2 p){
  float t = uT;
  float h = sin(p.x * 0.018 + t * 0.5 + sin(p.y * 0.012 + t * 0.27) * 1.6) * 0.5;
  h += sin((p.x * 0.55 + p.y * 0.83) * 0.03 - t * 0.41) * 0.35;
  h += (vnoise(p * 0.02 + vec2(t * 0.07, -t * 0.045)) - 0.5) * 0.9;
  h += (vnoise(p * 0.055 - vec2(t * 0.11, t * 0.09)) - 0.5) * 0.4;
  return h;
}

void main(){
  vec4 m = texture2D(uMask, vW / uSize);
  float sd = (m.r - 0.5) * 2.0 * MAXD;
  if (sd < -1.0) { gl_FragColor = vec4(0.0); return; }
  float shore = m.g * SHORE;
  float hullD = m.b * HULLR;
  vec2 p = vW;
  float e = 5.0;
  float h0 = hgt(p);
  vec2 g = vec2(hgt(p + vec2(e, 0.0)) - h0, hgt(p + vec2(0.0, e)) - h0) / e;
  vec3 n = normalize(vec3(-g * 14.0, 1.0));
  float d = dot(n, normalize(vec3(-0.62, -0.78, 0.9)));
  float lvl = step(0.67, d) + step(0.8, d);

  // Three cel tones for each of three depths: the shallows are turquoise, the deep is ink-blue.
  vec3 c;
  if (shore < 130.0)      c = lvl < 0.5 ? vec3(0.227, 0.561, 0.596) : (lvl < 1.5 ? vec3(0.290, 0.655, 0.667) : vec3(0.400, 0.753, 0.733));
  else if (shore < 330.0) c = lvl < 0.5 ? vec3(0.165, 0.392, 0.463) : (lvl < 1.5 ? vec3(0.204, 0.478, 0.537) : vec3(0.263, 0.569, 0.616));
  else                    c = lvl < 0.5 ? vec3(0.106, 0.255, 0.322) : (lvl < 1.5 ? vec3(0.137, 0.329, 0.408) : vec3(0.180, 0.416, 0.494));

  // Caustics: a slow network of bright lines over the shallows.
  float cs = sin(p.x * 0.05 + sin(p.y * 0.04 + uT * 0.4) * 2.0) + sin(p.y * 0.047 - uT * 0.33 + sin(p.x * 0.035) * 2.1);
  float caus = (1.0 - smoothstep(0.05, 0.1, abs(cs))) * (1.0 - smoothstep(70.0, 360.0, shore));
  c = mix(c, vec3(0.56, 0.84, 0.80), step(0.5, caus) * 0.3);

  // The rings a moored hull makes: thin concentric lines that fade with distance and drift outward.
  float ring = abs(fract(hullD * 0.045 - uT * 0.12) - 0.5);
  float wake = (1.0 - smoothstep(0.0, 70.0, hullD)) * smoothstep(12.0, 18.0, hullD) * (1.0 - smoothstep(0.045, 0.045 + uPx * 0.05, ring)) * step(0.45, vnoise(p * 0.02 + 3.0));
  c = mix(c, vec3(0.80, 0.90, 0.88), wake * 0.55);

  // Practical lights lay stretched streaks on the water, broken into slices that shimmer sideways.
  vec3 glow = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (float(i) >= uN) break;
    vec4 L = uL[i];
    float dy = p.y - L.y, dx = p.x - L.x;
    if (dy > 4.0 && dy < L.z && abs(dx) < 90.0) {
      float xo = (vnoise(vec2(p.y * 0.05, uT * 0.55 + float(i) * 7.0)) - 0.5) * 22.0 + sin(p.y * 0.21 + uT * 1.6) * 3.0;
      float w = 9.0 + dy * 0.045;
      float strip = 1.0 - smoothstep(w - 1.5, w + 1.5, abs(dx + xo));
      float cut = step(0.3 + (dy / L.z) * 0.5, fract(p.y / 16.0 + vnoise(vec2(float(i), p.x * 0.02)) * 3.0));
      float k = strip * cut * (1.0 - dy / L.z) * L.w;
      glow += uLc[i] * (step(0.12, k) * 0.28 + step(0.45, k) * 0.2);
    }
  }
  c = min(vec3(1.0), c + glow * 0.9);

  // Foam: a solid line at the shore with a wobble, then a second broken line behind it.
  float wob = sin(p.y * 0.05 + uT * 0.8 + p.x * 0.03) * 1.6 + (vnoise(p * 0.06 + uT * 0.15) - 0.5) * 5.0;
  float fd = sd + wob;
  float foamA = 1.0 - smoothstep(6.0 - uPx, 6.0 + uPx, fd);
  float rdist = abs(fd - (17.0 + 3.0 * sin(uT * 0.7 + p.x * 0.01)));
  float foamB = (1.0 - smoothstep(1.5 - uPx, 1.5 + uPx, rdist)) * step(0.4, vnoise(p * 0.045 + vec2(uT * 0.1, 0.0)));
  vec3 foam = vec3(0.894, 0.922, 0.878);
  c = mix(c, foam * 0.78, foamB * 0.9);
  c = mix(c, foam, foamA);
  float a = smoothstep(-0.9, 0.9, sd);
  gl_FragColor = vec4(c * a, a);
}`;

type GlState = { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null>; tex: WebGLTexture; cells: number; scale: number };
let gl: GlState | null = null;
let glFailed = false;
let glMap = '';
const slow = watchdog(5, 90);
let tier = 0;
const TIER_SCALE = [0.75, 0.5, 0.34] as const;

export type WaterMode = 'gl' | '2d';
export const waterStats = { mode: '2d' as WaterMode, ms: 0, scale: 0, frames: 0, reason: '' };

function compile(g: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = g.createShader(type)!;
  g.shaderSource(s, src);
  g.compileShader(s);
  if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'shader');
  return s;
}

function initGL(prep: WaterPrep): GlState | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const g = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
    if (!g) return null;
    const info = g.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(g.getParameter(info.UNMASKED_RENDERER_WEBGL)) : undefined;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    const decision = decideFx({ search: location.search, reducedMotion: false, saveData: !!nav.connection?.saveData, deviceMemory: nav.deviceMemory, renderer, glOk: true });
    waterStats.reason = decision.reason;
    if (decision.mode === 'off') return null;
    const prog = g.createProgram()!;
    g.attachShader(prog, compile(g, g.VERTEX_SHADER, VERT));
    g.attachShader(prog, compile(g, g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog) ?? 'link');
    g.useProgram(prog);
    const buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(prog, 'a');
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, prep.cells, prep.cells, 0, g.RGBA, g.UNSIGNED_BYTE, field(prep));
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const names = ['uView', 'uMask', 'uSize', 'uT', 'uPx', 'uN', 'uL', 'uLc'];
    const u = Object.fromEntries(names.map((n) => [n, g.getUniformLocation(prog, n)]));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glFailed = true; gl = null; });
    return { canvas, gl: g, prog, u, tex, cells: prep.cells, scale: 0 };
  } catch {
    return null;
  }
}

function drawGL(ctx: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }, prep: WaterPrep, lights: readonly WaterLight[]): boolean {
  if (glFailed) return false;
  if (!gl || glMap !== prep.size + ':' + prep.polys.length) {
    gl = initGL(prep);
    glMap = prep.size + ':' + prep.polys.length;
    if (!gl) { glFailed = true; return false; }
  }
  const st = gl;
  const x0 = Math.max(0, view.x0), y0 = Math.max(0, view.y0), x1 = Math.min(prep.size, view.x1), y1 = Math.min(prep.size, view.y1);
  const ww = x1 - x0, wh = y1 - y0;
  if (ww <= 0 || wh <= 0) return true;
  const dev = ctx.getTransform().a || 1;
  let s = Math.min(dev, TIER_SCALE[tier]!);
  s = Math.min(s, Math.sqrt(900_000 / (ww * wh)));
  s = Math.max(0.12, s);
  const W = Math.max(8, Math.round(ww * s)), H = Math.max(8, Math.round(wh * s));
  const g = st.gl;
  if (st.canvas.width !== W || st.canvas.height !== H) { st.canvas.width = W; st.canvas.height = H; }
  g.viewport(0, 0, W, H);
  g.useProgram(st.prog);
  g.uniform4f(st.u.uView!, x0, y0, ww, wh);
  g.uniform1i(st.u.uMask!, 0);
  g.uniform1f(st.u.uSize!, prep.size);
  g.uniform1f(st.u.uT!, clock(now) * 0.001);
  g.uniform1f(st.u.uPx!, 1 / s);
  const near = lights.filter((l) => l.x > x0 - 60 && l.x < x1 + 60 && l.y > y0 - l.r && l.y < y1 + 60).slice(0, MAX_LIGHTS);
  const L = new Float32Array(MAX_LIGHTS * 4), Lc = new Float32Array(MAX_LIGHTS * 3);
  near.forEach((l, i) => { L.set([l.x, l.y, l.r, l.k], i * 4); Lc.set(l.rgb, i * 3); });
  g.uniform1f(st.u.uN!, near.length);
  g.uniform4fv(st.u.uL!, L);
  g.uniform3fv(st.u.uLc!, Lc);
  g.clearColor(0, 0, 0, 0);
  g.clear(g.COLOR_BUFFER_BIT);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  ctx.drawImage(st.canvas, 0, 0, W, H, x0, y0, ww, wh);
  return true;
}

/* -- the plain canvas ------------------------------------------------------------------------------------------- */

function drawPlain(g: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }, prep: WaterPrep, lights: readonly WaterLight[]): void {
  const t = clock(now) * 0.001;
  for (const pts of prep.polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (x1 < view.x0 || x0 > view.x1 || y1 < view.y0 || y0 > view.y1) continue;
    g.save();
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fillStyle = C.far;
    g.fill();
    g.clip();
    g.lineJoin = 'round';
    // Cel steps by depth: the water lightens in two bands toward the shore.
    g.strokeStyle = C.deep; g.lineWidth = 2 * 330; g.stroke();
    g.strokeStyle = C.mid; g.lineWidth = 2 * 130; g.stroke();
    g.strokeStyle = C.shallow; g.lineWidth = 2 * 55; g.stroke();
    // Ripples: slow, sparse little arcs of the lighter tone.
    const vx0 = Math.max(view.x0, x0), vx1 = Math.min(view.x1, x1), vy0 = Math.max(view.y0, y0), vy1 = Math.min(view.y1, y1);
    g.strokeStyle = hexA(C.light, 0.42);
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    for (let y = Math.floor(vy0 / 64) * 64; y < vy1; y += 64) {
      const ph = (y * 0.37 + t * 0.7) % TAU;
      for (let x = Math.floor(vx0 / 96) * 96 - 96; x < vx1 + 96; x += 96) {
        const k = Math.sin(x * 0.013 + y * 0.71);
        if (k < 0.45) continue;
        const xx = x + Math.sin(y * 0.3) * 30, yy = y + Math.sin(x * 0.02 + ph) * 3;
        g.moveTo(xx, yy); g.quadraticCurveTo(xx + 10, yy - 3, xx + 20 + k * 8, yy + Math.sin(x * 0.02 + ph + 0.6) * 1.5);
      }
    }
    g.stroke();
    // Practical lights lay a shimmering streak straight down the water.
    for (const l of lights) {
      if (l.x < vx0 - 80 || l.x > vx1 + 80 || l.y > vy1 || l.y + l.r < vy0) continue;
      g.fillStyle = `rgba(${l.rgb[0] * 255 | 0}, ${l.rgb[1] * 255 | 0}, ${l.rgb[2] * 255 | 0}, ${(0.28 * l.k).toFixed(3)})`;
      for (let y = l.y + 8; y < l.y + l.r; y += 13) {
        const f = 1 - (y - l.y) / l.r;
        if (((y / 13) | 0) % 3 === 2) continue;
        const sway = Math.sin(y * 0.2 + t * 1.6) * 5 + Math.sin(y * 0.05 + t) * 6;
        g.fillRect(l.x + sway - 9 * f - 3, y, 18 * f + 6, 4);
      }
    }
    // Foam: a bright line at the shore and a broken one behind it.
    g.strokeStyle = hexA(C.foamLo, 0.8); g.lineWidth = 2 * 16;
    g.setLineDash([26, 40]); g.lineDashOffset = -t * 4;
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = C.shallow; g.lineWidth = 2 * 14; g.stroke();
    g.strokeStyle = C.foam; g.lineWidth = 2 * 6; g.stroke();
    g.restore();
  }
}

/** Paints the harbour's water for the part of the world in `view`. */
export function drawWater(ctx: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }, map: MapDef, hulls: readonly Hull[], lights: readonly WaterLight[]): void {
  const prep = prepWater(map, hulls);
  const t0 = performance.now();
  let ok = false;
  if (!glFailed) {
    try { ok = drawGL(ctx, now, view, prep, lights); } catch { glFailed = true; ok = false; }
  }
  if (!ok) drawPlain(ctx, now, view, prep, lights);
  const ms = performance.now() - t0;
  waterStats.mode = ok ? 'gl' : '2d';
  waterStats.ms = waterStats.ms * 0.95 + ms * 0.05;
  waterStats.frames++;
  (globalThis as { __water?: unknown }).__water = waterStats;
  waterStats.scale = ok && gl ? gl.canvas.width / Math.max(1, view.x1 - view.x0) : 0;
  const forced = typeof location !== 'undefined' && /[?&]fx\b/.test(location.search);
  if (ok && !forced && slow(ms)) { if (tier < TIER_SCALE.length - 1) tier++; else glFailed = true; }
}

/** For tests and the frame-time probe: resets the module's GL state. */
export function resetWater(): void { gl = null; glFailed = false; glMap = ''; tier = 0; preps.clear(); }
export { calm };
