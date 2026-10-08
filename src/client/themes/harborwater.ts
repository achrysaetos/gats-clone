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
// Two swells running in different directions at different scales, then two layers of chop moving the other way.
float hgt(vec2 p){
  float t = uT;
  float h = sin(p.x * 0.018 + t * 0.5 + sin(p.y * 0.012 + t * 0.27) * 1.6) * 0.5;
  h += sin((p.x * 0.55 + p.y * 0.83) * 0.03 - t * 0.41) * 0.35;
  h += sin((p.x * -0.8 + p.y * 0.35) * 0.052 + t * 0.62) * 0.2;
  h += (vnoise(p * 0.02 + vec2(t * 0.07, -t * 0.045)) - 0.5) * 0.9;
  h += (vnoise(p * 0.055 - vec2(t * 0.11, t * 0.09)) - 0.5) * 0.4;
  return h;
}

void main(){
  vec4 m = texture2D(uMask, vW / uSize);
  float sd = (m.r - 0.5) * 2.0 * MAXD;
  if (sd < -1.0) { gl_FragColor = vec4(0.0); return; }
  float shore = m.g * SHORE;
  vec2 p = vW;
  // A hull rides the swell: its distance field breathes a pixel or two with it.
  float bob = sin(uT * 0.8 + p.y * 0.008) * 1.6 + sin(uT * 1.3 + p.x * 0.01) * 0.8;
  float hullD = max(0.0, m.b * HULLR + bob);
  float e = 5.0;
  float h0 = hgt(p);
  vec2 g = vec2(hgt(p + vec2(e, 0.0)) - h0, hgt(p + vec2(0.0, e)) - h0) / e;
  vec3 n = normalize(vec3(-g * 14.0, 1.0));
  float d = dot(n, normalize(vec3(-0.62, -0.78, 0.9)));
  float lvl = step(0.67, d) + step(0.8, d);

  // Depth steps follow the nearest shore or hull: four palettes, each in three cel tones, with a fine dark seam between steps.
  float dep = min(shore, hullD * 1.15 + 14.0);
  vec3 c;
  if (dep < 34.0)       c = lvl < 0.5 ? vec3(0.290, 0.655, 0.667) : (lvl < 1.5 ? vec3(0.349, 0.718, 0.690) : vec3(0.470, 0.800, 0.760));
  else if (dep < 130.0) c = lvl < 0.5 ? vec3(0.227, 0.561, 0.596) : (lvl < 1.5 ? vec3(0.290, 0.655, 0.667) : vec3(0.400, 0.753, 0.733));
  else if (dep < 250.0) c = lvl < 0.5 ? vec3(0.165, 0.392, 0.463) : (lvl < 1.5 ? vec3(0.204, 0.478, 0.537) : vec3(0.263, 0.569, 0.616));
  else if (dep < 400.0) c = lvl < 0.5 ? vec3(0.106, 0.255, 0.322) : (lvl < 1.5 ? vec3(0.137, 0.329, 0.408) : vec3(0.180, 0.416, 0.494));
  else                  c = lvl < 0.5 ? vec3(0.070, 0.180, 0.245) : (lvl < 1.5 ? vec3(0.095, 0.245, 0.320) : vec3(0.130, 0.320, 0.400));
  float seam = 0.0;
  seam = max(seam, 1.0 - smoothstep(0.8, 2.2, abs(dep - 34.0)));
  seam = max(seam, 1.0 - smoothstep(0.8, 2.2, abs(dep - 130.0)));
  seam = max(seam, 1.0 - smoothstep(0.8, 2.2, abs(dep - 250.0)));
  seam = max(seam, 1.0 - smoothstep(0.8, 2.2, abs(dep - 400.0)));
  c *= 1.0 - 0.16 * seam;
  // Colour depth: the far water sinks toward ink-blue, a gentle vignette on the open sea.
  c = mix(c, vec3(0.04, 0.12, 0.19), smoothstep(380.0, 640.0, shore) * 0.35);

  // Caustics: two slow networks of bright lines dancing over the shallows.
  float cs = sin(p.x * 0.05 + sin(p.y * 0.04 + uT * 0.4) * 2.0) + sin(p.y * 0.047 - uT * 0.33 + sin(p.x * 0.035) * 2.1);
  float cs2 = sin(p.x * 0.083 - uT * 0.5 + sin(p.y * 0.06) * 1.7) + sin(p.y * 0.071 + uT * 0.41 + sin(p.x * 0.05) * 1.9);
  float shal = 1.0 - smoothstep(70.0, 360.0, shore);
  float caus = (1.0 - smoothstep(0.11, 0.2, abs(cs))) * (0.55 + 0.45 * step(0.0, cs2)) * shal;
  c = mix(c, vec3(0.62, 0.90, 0.84), step(0.5, caus) * 0.26);

  // The rings a moored hull makes: crisp concentric lines that drift outward and fade, broken by noise.
  float ring = abs(fract(hullD * 0.045 - uT * 0.12) - 0.5);
  float wake = (1.0 - smoothstep(0.0, 78.0, hullD)) * smoothstep(12.0, 18.0, hullD) * (1.0 - smoothstep(0.045, 0.045 + uPx * 0.05, ring)) * step(0.4, vnoise(p * 0.02 + 3.0 + uT * 0.05));
  c = mix(c, vec3(0.82, 0.92, 0.90), wake * 0.6);

  // Reflections of every lamp: stretched, sliced streaks that shimmer sideways, in the lamp's colour.
  vec3 glow = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (float(i) >= uN) break;
    vec4 L = uL[i];
    float dy = p.y - L.y, dx = p.x - L.x;
    if (dy > 4.0 && dy < L.z && abs(dx) < 110.0) {
      float xo = (vnoise(vec2(p.y * 0.05, uT * 0.55 + float(i) * 7.0)) - 0.5) * 26.0 + sin(p.y * 0.21 + uT * 1.6) * 3.5;
      float w = 9.0 + dy * 0.05;
      float strip = 1.0 - smoothstep(w - 1.5, w + 1.5, abs(dx + xo));
      float cut = step(0.3 + (dy / L.z) * 0.5, fract(p.y / 16.0 + vnoise(vec2(float(i), p.x * 0.02)) * 3.0));
      float k = strip * cut * (1.0 - dy / L.z) * L.w;
      glow += uLc[i] * (step(0.12, k) * 0.3 + step(0.45, k) * 0.22);
    }
  }
  c = min(vec3(1.0), c + glow * 0.9);

  // Glints: a few tiny four-point sparkles that twinkle on the lit crests, never more than a handful on screen.
  vec2 gc = floor(p / 30.0);
  float gh = hash(gc);
  vec2 gp = (p - (gc + vec2(0.3 + 0.4 * hash(gc + 7.0), 0.3 + 0.4 * hash(gc + 13.0))) * 30.0);
  float tw = pow(max(0.0, sin(uT * 2.4 + gh * 60.0)), 6.0);
  float star = max(step(abs(gp.x), 1.1) * step(abs(gp.y), 4.5 * tw + 0.5), step(abs(gp.y), 1.1) * step(abs(gp.x), 4.5 * tw + 0.5));
  c = mix(c, vec3(0.92, 0.98, 0.95), step(0.986, gh) * star * step(0.5, lvl) * step(26.0, shore + sd) * tw);

  // Foam: a bright line on every edge that wobbles, thickens and thins as the tide swells, with a second line behind it that breaks.
  float swell = sin(uT * 0.33) * 2.2 + sin(uT * 0.21 + p.x * 0.004) * 1.2;
  float wob = sin(p.y * 0.05 + uT * 0.8 + p.x * 0.03) * 1.6 + (vnoise(p * 0.06 + uT * 0.15) - 0.5) * 5.0;
  float fd = sd + wob;
  float thick = 5.0 + 2.6 * vnoise(p * 0.035 + vec2(uT * 0.22, 0.0));
  float foamA = 1.0 - smoothstep(thick + swell - uPx, thick + swell + uPx, fd);
  float rdist = abs(fd - (17.0 + 3.0 * sin(uT * 0.7 + p.x * 0.01) + swell));
  float foamB = (1.0 - smoothstep(1.5 - uPx, 1.5 + uPx, rdist)) * step(0.42, vnoise(p * 0.045 + vec2(uT * 0.1, 0.0)));
  float hf = hullD - 3.0 - swell * 0.4;
  float foamH = 1.0 - smoothstep(4.0 - uPx, 4.0 + uPx, hf + wob * 0.4);
  float foamH2 = (1.0 - smoothstep(1.4 - uPx, 1.4 + uPx, abs(hullD - 13.0 - swell * 0.6 - wob * 0.3))) * step(0.4, vnoise(p * 0.05 + vec2(0.0, uT * 0.12)));
  vec3 foam = vec3(0.894, 0.922, 0.878);
  c = mix(c, foam * 0.78, max(foamB, foamH2) * 0.9);
  c = mix(c, foam, max(foamA, foamH));
  float a = smoothstep(-0.9, 0.9, sd);
  gl_FragColor = vec4(c * a, a);
}`;

type GlState = { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null>; tex: WebGLTexture; cells: number; scale: number };
let gl: GlState | null = null;
let glFailed = false;
let glMap = '';
const slow = watchdog(9, 60);
let tier = 0;
/** The graphics preset's say (quality.ts): GPU water or the plain 2D water, and the sharpest resolution tier it may use. */
let gpuWater = true;
export function setWaterPlan(p: { gl: boolean; tier: number }): void { gpuWater = p.gl; tier = Math.min(TIER_SCALE.length - 1, Math.max(0, p.tier)); }
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

/*
 * The fallback is the same toon picture drawn without a shader, and cached: the static part (cel depth bands that follow the
 * distance from every shore and hull, a crisp unbroken foam line along every edge with a second, mostly-continuous line behind it)
 * is baked per 512 px tile from the very distance field the shader uses, a couple of tiles per frame, and blitted from then on.
 * Over it each frame draws only a handful of short wavelet arcs that rise and fade, and the lights' streaks.
 */
const TILE = 512;
/** Each baked tile carries a 2 px skirt of its neighbours' pixels so a fractional camera scale never opens a seam between tiles. */
const SKIRT = 2;
const TILE_PX = TILE + 2 * SKIRT;
const BAND_EDGES = [34, 96, 170, 250, 340, 470] as const;
// Night-op tones: the plain water sits below the quay in brightness, so the shade and the lamps' pools do the lifting.
const BAND_COLORS = ['#356f72', '#2e6270', '#285366', '#1d3f52', '#193846', '#143040', '#102836'] as const;
const FOAM_RGB = [170, 184, 176] as const, FOAM_LO_RGB = [96, 128, 132] as const;
const rgbOfHex = (h: string): [number, number, number] => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const BAND_RGB = BAND_COLORS.map(rgbOfHex);

const fields = new WeakMap<WaterPrep, Uint8Array>();
const fieldOf = (prep: WaterPrep): Uint8Array => { let f = fields.get(prep); if (!f) { f = field(prep); fields.set(prep, f); } return f; };
const tiles = new Map<string, HTMLCanvasElement>();
let prepSeq = 0;
const prepIds = new WeakMap<WaterPrep, number>();
const prepId = (p: WaterPrep): number => { let i = prepIds.get(p); if (i === undefined) { i = ++prepSeq; prepIds.set(p, i); } return i; };
const TILE_LIMIT = 36;

/** Bilinear samples of the distance field at a world point: [signed shore distance, distance to land, distance to hull], all in world px. */
function sample(f: Uint8Array, n: number, wx: number, wy: number, out: number[]): void {
  const u = Math.min(n - 1.001, Math.max(0, wx / TEXEL - 0.5)), v = Math.min(n - 1.001, Math.max(0, wy / TEXEL - 0.5));
  const i0 = u | 0, j0 = v | 0, fx = u - i0, fy = v - j0;
  const a = (j0 * n + i0) * 4, b = a + 4, c = a + n * 4, d = c + 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  const ch = (k: number) => f[a + k]! * w00 + f[b + k]! * w10 + f[c + k]! * w01 + f[d + k]! * w11;
  out[0] = (ch(0) / 255 - 0.5) * 2 * MAXD; out[1] = (ch(1) / 255) * SHORE_MAX; out[2] = (ch(2) / 255) * HULL_MAX;
}

const hash2 = (x: number, y: number): number => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x: number, y: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

function bakeTile(prep: WaterPrep, tx: number, ty: number): HTMLCanvasElement {
  const f = fieldOf(prep), n = prep.cells;
  const c = document.createElement('canvas'); c.width = c.height = TILE_PX;
  const g = c.getContext('2d')!;
  const img = g.createImageData(TILE_PX, TILE_PX), px = img.data;
  const out = [0, 0, 0], x0 = tx * TILE - SKIRT, y0 = ty * TILE - SKIRT;
  for (let j = 0; j < TILE_PX; j++) for (let i = 0; i < TILE_PX; i++) {
    const wx = x0 + i + 0.5, wy = y0 + j + 0.5;
    sample(f, n, wx, wy, out);
    const sd = out[0]!;
    const o = (j * TILE_PX + i) * 4;
    if (sd < -1) continue;
    // Cel depth: distance from the nearest shore, or from a hull (which is a shore of its own).
    const wob = Math.sin(wy * 0.05 + wx * 0.03) * 1.4 + (vnoise(wx * 0.06, wy * 0.06) - 0.5) * 4;
    const d = Math.min(out[1]!, out[2]! * 1.15 + 14);
    let band = 0; while (band < BAND_EDGES.length && d > BAND_EDGES[band]!) band++;
    // Swell mottling in three cel tones (static here; the shader animates it).
    const sw = vnoise(wx * 0.02 + 40, wy * 0.02) * 0.6 + vnoise(wx * 0.055, wy * 0.055 + 9) * 0.4;
    const lk = sw > 0.64 ? 1.14 : sw > 0.52 ? 1.05 : 0.95;
    const bc = BAND_RGB[band]!;
    let col: readonly number[] = [Math.min(255, bc[0]! * lk), Math.min(255, bc[1]! * lk), Math.min(255, bc[2]! * lk)];
    // A fine darker seam where one band meets the next, so the steps read as cel steps.
    let seam = 0; for (const e of BAND_EDGES) { const k = Math.abs(d - e); if (k < 1.6) seam = Math.max(seam, 1 - k / 1.6); }
    if (seam > 0) col = [col[0]! * (1 - 0.18 * seam), col[1]! * (1 - 0.14 * seam), col[2]! * (1 - 0.1 * seam)];
    // Foam: one unbroken bright line on the water's edge, a second thinner one behind it with a few long gaps, both wobbling gently.
    const fd = sd + wob;
    const a1 = Math.min(1, Math.max(0, (6.5 - fd) / 1.4));
    const gap = vnoise(wx * 0.017, wy * 0.017) > 0.3 ? 1 : 0.0;
    const a2 = Math.min(1, Math.max(0, 1 - (Math.abs(fd - 18) - 1.4) / 1.2)) * gap;
    if (a2 > 0) col = [col[0]! + (FOAM_LO_RGB[0] - col[0]!) * a2 * 0.85, col[1]! + (FOAM_LO_RGB[1] - col[1]!) * a2 * 0.85, col[2]! + (FOAM_LO_RGB[2] - col[2]!) * a2 * 0.85];
    // The foam round a hull: a line close in and one further out.
    const hd = out[2]!;
    if (hd < 22) {
      const h1 = Math.min(1, Math.max(0, (5 - hd) / 1.4)), h2 = Math.min(1, Math.max(0, 1 - (Math.abs(hd - 15) - 1.2) / 1.2)) * (vnoise(wx * 0.03, wy * 0.03) > 0.38 ? 1 : 0);
      col = [col[0]! + (FOAM_LO_RGB[0] - col[0]!) * h2 * 0.8, col[1]! + (FOAM_LO_RGB[1] - col[1]!) * h2 * 0.8, col[2]! + (FOAM_LO_RGB[2] - col[2]!) * h2 * 0.8];
      col = [col[0]! + (FOAM_RGB[0] - col[0]!) * h1, col[1]! + (FOAM_RGB[1] - col[1]!) * h1, col[2]! + (FOAM_RGB[2] - col[2]!) * h1];
    }
    col = [col[0]! + (FOAM_RGB[0] - col[0]!) * a1, col[1]! + (FOAM_RGB[1] - col[1]!) * a1, col[2]! + (FOAM_RGB[2] - col[2]!) * a1];
    const al = Math.min(1, Math.max(0, (sd + 0.9) / 1.8));
    px[o] = col[0]!; px[o + 1] = col[1]!; px[o + 2] = col[2]!; px[o + 3] = al * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

let bakedThisFrame = 0;
function tileFor(prep: WaterPrep, tx: number, ty: number): HTMLCanvasElement | null {
  const key = `${prepId(prep)}:${tx},${ty}`;
  const hit = tiles.get(key);
  if (hit) { tiles.delete(key); tiles.set(key, hit); return hit; }
  if (bakedThisFrame >= 2) return null;
  bakedThisFrame++;
  const c = bakeTile(prep, tx, ty);
  tiles.set(key, c);
  if (tiles.size > TILE_LIMIT) tiles.delete(tiles.keys().next().value as string);
  return c;
}

/** Is this world point open water, a little way off the shore? */
function wet(prep: WaterPrep, x: number, y: number, margin: number): boolean {
  if (x < 0 || y < 0 || x >= prep.size || y >= prep.size) return false;
  const f = fieldOf(prep), i = Math.min(prep.cells - 1, (x / TEXEL) | 0), j = Math.min(prep.cells - 1, (y / TEXEL) | 0);
  const k = (j * prep.cells + i) * 4;
  return (f[k]! / 255 - 0.5) * 2 * MAXD > margin && (f[k + 2]! / 255) * HULL_MAX > margin;
}

function drawPlain(g: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }, prep: WaterPrep, lights: readonly WaterLight[]): void {
  const t = clock(now) * 0.001;
  bakedThisFrame = 0;
  const tx0 = Math.max(0, Math.floor(view.x0 / TILE)), tx1 = Math.min(Math.ceil(prep.size / TILE) - 1, Math.floor(view.x1 / TILE));
  const ty0 = Math.max(0, Math.floor(view.y0 / TILE)), ty1 = Math.min(Math.ceil(prep.size / TILE) - 1, Math.floor(view.y1 / TILE));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const c = tileFor(prep, tx, ty);
    if (c) { g.drawImage(c, tx * TILE - SKIRT, ty * TILE - SKIRT); continue; }
    // Not baked yet: the deep tone, so the picture only ever sharpens.
    g.save(); g.beginPath(); for (const pts of prep.polys) pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.clip();
    g.fillStyle = BAND_COLORS[4]!; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); g.restore();
  }
  // Wavelets: short arcs, a few to a screen, each rising, drifting and fading over about five seconds. Never near an edge.
  const CELL = 210;
  g.lineCap = 'round'; g.lineWidth = 3;
  const cx0 = Math.floor(view.x0 / CELL) - 1, cx1 = Math.floor(view.x1 / CELL) + 1, cy0 = Math.floor(view.y0 / CELL) - 1, cy1 = Math.floor(view.y1 / CELL) + 1;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    if (hash2(cx, cy) < 0.4) continue;
    const period = 4.6 + hash2(cx + 9, cy) * 2, u = calm ? 0.5 : ((t / period + hash2(cx, cy + 5)) % 1);
    const x = cx * CELL + 30 + hash2(cx + 3, cy + 1) * (CELL - 60) + (calm ? 0 : u * 14), y = cy * CELL + 30 + hash2(cx + 1, cy + 3) * (CELL - 60);
    if (x < view.x0 - 60 || x > view.x1 + 60 || y < view.y0 - 30 || y > view.y1 + 30) continue;
    if (!wet(prep, x, y, 40) || !wet(prep, x + 40, y, 40) || !wet(prep, x - 40, y, 40)) continue;
    const a = Math.sin(u * Math.PI), len = 30 + hash2(cx, cy + 7) * 28;
    g.strokeStyle = `rgba(120, 178, 182, ${(0.34 * a).toFixed(3)})`;
    g.beginPath(); g.moveTo(x - len / 2, y + 2); g.quadraticCurveTo(x, y - 7, x + len / 2, y + 2); g.stroke();
    g.strokeStyle = `rgba(120, 178, 182, ${(0.2 * a).toFixed(3)})`;
    g.beginPath(); g.moveTo(x - len * 0.28 + 8, y + 12); g.quadraticCurveTo(x + 8, y + 6, x + len * 0.28 + 8, y + 12); g.stroke();
  }
  // Practical lights lay a shimmering streak straight down the water, in short slices that slide a little; only over open water.
  for (const l of lights) {
    if (l.x < view.x0 - 100 || l.x > view.x1 + 100 || l.y > view.y1 || l.y + l.r < view.y0) continue;
    g.fillStyle = `rgba(${l.rgb[0] * 255 | 0}, ${l.rgb[1] * 255 | 0}, ${l.rgb[2] * 255 | 0}, ${(0.3 * l.k).toFixed(3)})`;
    for (let y = l.y + 10; y < l.y + l.r; y += 14) {
      const f = 1 - (y - l.y) / l.r;
      if (((y / 14) | 0) % 3 === 2) continue;
      const sway = Math.sin(y * 0.2 + t * 1.4) * 4 + Math.sin(y * 0.05 + t) * 6, w = 18 * f + 8;
      if (!wet(prep, l.x + sway, y, 6)) continue;
      g.fillRect(l.x + sway - w / 2, y, w, 4);
    }
  }
}

/** Paints the harbour's water for the part of the world in `view`. */
export function drawWater(ctx: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }, map: MapDef, hulls: readonly Hull[], lights: readonly WaterLight[]): void {
  const prep = prepWater(map, hulls);
  const t0 = performance.now();
  let ok = false;
  if (!glFailed && gpuWater) {
    try { ok = drawGL(ctx, now, view, prep, lights); } catch { glFailed = true; ok = false; }
  }
  if (!ok) drawPlain(ctx, now, view, prep, lights);
  const ms = performance.now() - t0;
  waterStats.mode = ok ? 'gl' : '2d';
  waterStats.ms = waterStats.ms * 0.95 + ms * 0.05;
  waterStats.frames++;
  (globalThis as { __water?: unknown }).__water = waterStats;
  waterStats.scale = ok && gl ? gl.canvas.width / Math.max(1, view.x1 - view.x0) : 0;
  // The governor only judges steady-state frames (never the shader compile and field upload of the first ones) and only steps the
  // resolution down; the 2D water is for software renderers, a lost context or ?nofx, never for a GPU that is merely busy.
  const forced = typeof location !== 'undefined' && /[?&]fx\b/.test(location.search);
  if (ok && waterStats.frames > 30 && !forced && slow(ms) && tier < TIER_SCALE.length - 1) tier++;
}

/** For tests and the frame-time probe: resets the module's GL state. */
export function resetWater(): void { tiles.clear(); gl = null; glFailed = false; glMap = ''; tier = 0; preps.clear(); }
export { calm };
