import { maskTriangles, type Ambient, type Occluder, type ResolvedLight, type Shock, type Tier, type ViewRect } from './lighting.ts';
import { BEAM_FRAG, FULL_VERT, LIGHT_FRAG, MASK_FRAG, MASK_VERT, SCENE_FRAG, SHAFT_FRAG } from './lightshaders.ts';

/**
 * The GL half of the lighting pass: builds the occluder mask, draws every light into a half-res buffer with soft shadows,
 * smears a few shafts, and composes the lit scene. Reuses its targets between frames and frees them on resize.
 * Everything it needs from the frame is in `LightFrame`; what to draw is lighting.ts's decision.
 */

export type LightFrame = {
  /** Canvas size in device px. */
  w: number;
  h: number;
  view: ViewRect;
  occluders: readonly Occluder[];
  /** Already culled and capped, strongest first. */
  lights: readonly ResolvedLight[];
  ambient: Ambient;
  tier: Tier;
  shocks: readonly (Shock & { k: number })[];
  now: number;
};

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };

function compile(g: WebGLRenderingContext, vert: string, frag: string, names: string[]): Prog {
  const sh = (type: number, src: string) => {
    const s = g.createShader(type)!;
    g.shaderSource(s, src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = g.createProgram()!;
  g.attachShader(p, sh(g.VERTEX_SHADER, vert));
  g.attachShader(p, sh(g.FRAGMENT_SHADER, frag));
  g.bindAttribLocation(p, 0, 'a');
  g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p) ?? 'link');
  const u: Prog['u'] = {};
  for (const n of names) u[n] = g.getUniformLocation(p, n);
  return { p, u };
}

function makeTarget(g: WebGLRenderingContext, w: number, h: number): Target {
  const tex = g.createTexture()!;
  g.bindTexture(g.TEXTURE_2D, tex);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
  const fbo = g.createFramebuffer()!;
  g.bindFramebuffer(g.FRAMEBUFFER, fbo);
  g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

export type LightGL = {
  /** Composes base + lights + overlay into a full-res scene texture; null if the frame cannot be lit. */
  render(f: LightFrame, base: WebGLTexture, over: WebGLTexture): WebGLTexture | null;
  /** Light-buffer size used last frame, for the dev probe. */
  stats(): { lights: number; shadowed: number; rects: number; w: number; h: number };
};

/** Compiles the lighting programs. Throws if anything fails, so the caller can fall back to the plain pass. */
export function createLightGL(g: WebGLRenderingContext): LightGL {
  const mask = compile(g, MASK_VERT, MASK_FRAG, []);
  const light = compile(g, FULL_VERT, LIGHT_FRAG, ['mask', 'size', 'L', 'col', 'cone', 'prm', 'rays']);
  const shaft = compile(g, FULL_VERT, SHAFT_FRAG, ['light', 'lc', 'col', 'k', 'reach', 'aspect', 'time']);
  const beam = compile(g, FULL_VERT, BEAM_FRAG, ['L', 'col', 'dirw', 'time', 'seed']);
  const scene = compile(g, FULL_VERT, SCENE_FRAG, ['base', 'over', 'light', 'mask', 'shaft', 'beam', 'ltexel', 'amb', 'gain', 'ao', 'shafts', 'aspect', 'time', 'nshock', 'sk', 'sp', 'vw', 'fogc', 'fogp', 'wx']);
  const tri = g.createBuffer()!;
  g.bindBuffer(g.ARRAY_BUFFER, tri);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
  const rects = g.createBuffer()!;
  let sized = '';
  let maskT: Target, lightT: Target, shaftT: Target, beamT: Target, sceneT: Target;
  let last = { lights: 0, shadowed: 0, rects: 0, w: 0, h: 0 };
  const sk = new Float32Array(16), sp = new Float32Array(16);

  const free = () => { for (const t of [maskT, lightT, shaftT, beamT, sceneT]) { g.deleteTexture(t.tex); g.deleteFramebuffer(t.fbo); } };
  const resize = (w: number, h: number) => {
    const key = `${w}x${h}`;
    if (key === sized) return;
    if (sized) free();
    sized = key;
    const hw = Math.max(8, w >> 1), hh = Math.max(8, h >> 1);
    maskT = makeTarget(g, hw, hh);
    lightT = makeTarget(g, hw, hh);
    shaftT = makeTarget(g, Math.max(4, w >> 2), Math.max(4, h >> 2));
    beamT = makeTarget(g, Math.max(4, w >> 2), Math.max(4, h >> 2));
    sceneT = makeTarget(g, w, h);
  };
  const bindTri = () => { g.bindBuffer(g.ARRAY_BUFFER, tri); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0); };
  const into = (t: Target) => { g.bindFramebuffer(g.FRAMEBUFFER, t.fbo); g.viewport(0, 0, t.w, t.h); };
  const tex = (unit: number, t: WebGLTexture, loc: WebGLUniformLocation | null) => { g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t); g.uniform1i(loc, unit); };

  return {
    stats: () => last,
    render(f, base, over) {
      resize(f.w, f.h);
      bindTri();
      const { view } = f;
      const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
      if (!(vw > 0 && vh > 0)) return null;
      const hw = maskT.w, hh = maskT.h;
      const sx = hw / vw, sy = hh / vh;

      // 1. The occluder mask.
      into(maskT);
      g.disable(g.BLEND);
      g.clearColor(0, 0, 0, 1);
      g.clear(g.COLOR_BUFFER_BIT);
      if (f.occluders.length) {
        const verts = maskTriangles(f.occluders, view);
        g.useProgram(mask.p);
        g.bindBuffer(g.ARRAY_BUFFER, rects);
        g.bufferData(g.ARRAY_BUFFER, verts, g.DYNAMIC_DRAW);
        g.vertexAttribPointer(0, 3, g.FLOAT, false, 0, 0);
        g.drawArrays(g.TRIANGLES, 0, verts.length / 3);
        bindTri();
      }

      // 2. The lights, additively, each inside its own box.
      into(lightT);
      g.clearColor(0, 0, 0, 1);
      g.clear(g.COLOR_BUFFER_BIT);
      g.useProgram(light.p);
      tex(0, maskT.tex, light.u.mask);
      g.uniform2f(light.u.size, hw, hh);
      g.uniform1f(light.u.rays, f.tier.rays);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE);
      g.enable(g.SCISSOR_TEST);
      let shadowed = 0;
      for (const l of f.lights) {
        const cx = (l.x - view.x0) * sx, cy = hh - (l.y - view.y0) * sy, r = l.radius * sx;
        const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r)), x1 = Math.min(hw, Math.ceil(cx + r)), y1 = Math.min(hh, Math.ceil(cy + r));
        if (x1 <= x0 || y1 <= y0) continue;
        g.scissor(x0, y0, x1 - x0, y1 - y0);
        g.uniform4f(light.u.L, cx, cy, r, l.level);
        g.uniform3f(light.u.col, l.rgb[0], l.rgb[1], l.rgb[2]);
        if (l.cone) g.uniform4f(light.u.cone, Math.cos(l.cone.angle), -Math.sin(l.cone.angle), Math.cos(l.cone.half), 0.12);
        else g.uniform4f(light.u.cone, 0, 0, 0, 0);
        const casts = l.shadows && f.occluders.length > 0;
        if (casts) shadowed++;
        g.uniform4f(light.u.prm, l.size * sx * 0.45, l.inside * sx, casts ? 1 : 0, f.tier.steps);
        g.drawArrays(g.TRIANGLES, 0, 3);
      }
      g.disable(g.SCISSOR_TEST);

      // 3. Shafts: a radial smear toward the strongest lights, a quarter the size.
      const shafts = f.ambient.shafts > 0.01 ? f.lights.slice(0, f.tier.shafts) : [];
      const aspect = f.w / f.h;
      if (shafts.length) {
        into(shaftT);
        g.disable(g.BLEND);
        g.clearColor(0, 0, 0, 1);
        g.clear(g.COLOR_BUFFER_BIT);
        g.enable(g.BLEND);
        g.useProgram(shaft.p);
        tex(0, lightT.tex, shaft.u.light);
        g.uniform1f(shaft.u.aspect, aspect);
        g.uniform1f(shaft.u.time, f.now);
        for (const l of shafts) {
          g.uniform2f(shaft.u.lc, (l.x - view.x0) / vw, 1 - (l.y - view.y0) / vh);
          g.uniform3f(shaft.u.col, l.rgb[0], l.rgb[1], l.rgb[2]);
          g.uniform1f(shaft.u.k, Math.min(1.3, l.level) * 0.9);
          g.uniform1f(shaft.u.reach, Math.min(0.9, (l.radius * 1.5) / vh));
          g.drawArrays(g.TRIANGLES, 0, 3);
        }
      } else {
        into(shaftT);
        g.disable(g.BLEND);
        g.clearColor(0, 0, 0, 1);
        g.clear(g.COLOR_BUFFER_BIT);
      }
      g.disable(g.BLEND);

      // 3b. Beams: the cones that are meant to be seen, drawn as shafts through the air.
      const beams = f.ambient.shafts > 0.01 ? f.lights.filter((l) => l.beam > 0 && l.cone).sort((a, b) => b.beam * b.level - a.beam * a.level).slice(0, f.tier.beams) : [];
      into(beamT);
      g.disable(g.BLEND);
      g.clearColor(0, 0, 0, 1);
      g.clear(g.COLOR_BUFFER_BIT);
      if (beams.length) {
        const bw = beamT.w / vw, bh = beamT.h / vh;
        g.useProgram(beam.p);
        g.enable(g.BLEND);
        g.blendFunc(g.ONE, g.ONE);
        g.enable(g.SCISSOR_TEST);
        g.uniform1f(beam.u.time, f.now);
        for (const l of beams) {
          const cx = (l.x - view.x0) * bw, cy = beamT.h - (l.y - view.y0) * bh, r = l.radius * bw;
          const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r)), x1 = Math.min(beamT.w, Math.ceil(cx + r)), y1 = Math.min(beamT.h, Math.ceil(cy + r));
          if (x1 <= x0 || y1 <= y0) continue;
          g.scissor(x0, y0, x1 - x0, y1 - y0);
          g.uniform4f(beam.u.L, cx, cy, r, l.level * l.beam * 0.55);
          g.uniform3f(beam.u.col, l.rgb[0], l.rgb[1], l.rgb[2]);
          g.uniform4f(beam.u.dirw, Math.cos(l.cone!.angle), -Math.sin(l.cone!.angle), Math.tan(Math.min(1.2, l.cone!.half)), Math.max(1.5, l.size * bw));
          g.uniform1f(beam.u.seed, l.x * 0.013 + l.y * 0.007);
          g.drawArrays(g.TRIANGLES, 0, 3);
        }
        g.disable(g.SCISSOR_TEST);
        g.disable(g.BLEND);
      }

      // 4. The lit scene.
      into(sceneT);
      g.useProgram(scene.p);
      tex(0, base, scene.u.base);
      tex(1, over, scene.u.over);
      tex(2, lightT.tex, scene.u.light);
      tex(3, maskT.tex, scene.u.mask);
      tex(4, shaftT.tex, scene.u.shaft);
      tex(5, beamT.tex, scene.u.beam);
      g.uniform2f(scene.u.ltexel, 1 / hw, 1 / hh);
      g.uniform3f(scene.u.amb, f.ambient.rgb[0], f.ambient.rgb[1], f.ambient.rgb[2]);
      g.uniform1f(scene.u.gain, f.ambient.gain);
      g.uniform1f(scene.u.ao, f.tier.ao ? f.ambient.ao : 0);
      g.uniform1f(scene.u.shafts, f.ambient.shafts);
      g.uniform1f(scene.u.aspect, aspect);
      g.uniform1f(scene.u.time, f.now);
      const wet = f.tier.weather ? f.ambient.wet : 0, rain = f.tier.weather ? f.ambient.rain : 0, fog = f.tier.weather ? f.ambient.fog : null;
      g.uniform4f(scene.u.vw, view.x0, view.y0, vw, vh);
      g.uniform4f(scene.u.fogc, fog?.rgb[0] ?? 0, fog?.rgb[1] ?? 0, fog?.rgb[2] ?? 0, fog ? fog.density : 0);
      g.uniform4f(scene.u.fogp, fog?.scale ?? 500, fog?.drift[0] ?? 0, fog?.drift[1] ?? 0, 0);
      g.uniform4f(scene.u.wx, wet, rain, beams.length ? 1 : 0, 0.1);
      const sh = f.tier.shocks ? f.shocks.slice(0, 4) : [];
      sh.forEach((s, i) => {
        sk.set([(s.x - view.x0) / vw, 1 - (s.y - view.y0) / vh, s.radius / vh, s.k], i * 4);
        sp.set([s.strength, 0, 0, 0], i * 4);
      });
      g.uniform1i(scene.u.nshock, sh.length);
      g.uniform4fv(scene.u.sk, sk);
      g.uniform4fv(scene.u.sp, sp);
      g.drawArrays(g.TRIANGLES, 0, 3);
      last = { lights: f.lights.length, shadowed, rects: f.occluders.length, w: hw, h: hh };
      return sceneT.tex;
    },
  };
}
