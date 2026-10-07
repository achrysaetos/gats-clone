/**
 * GLSL for the lighting pass (lightgl.ts). WebGL1-safe: no extensions, RGBA8 targets, constant loop bounds.
 *
 * The pipeline per frame, all at half resolution except the last:
 *  1. MASK   the standing solids rasterised into a texture: R = inside a solid, G = on a solid's front face.
 *  2. LIGHT  each light drawn additively over its bounding box. A pixel on open floor marches toward the light through
 *            the mask (one ray, or three spread across the source's width for a soft penumbra); a pixel on a wall's
 *            top is lit unshadowed (it stands above the light); a pixel on a front face is lit only by lights south of it.
 *  3. SHAFT  a cheap radial smear of the light buffer toward the brightest lights, for crepuscular rays at night.
 *  4. SCENE  the 2D world (base) lit by the buffer, floor darkened beside walls, the HUD-less overlay (players, rounds,
 *            effects) laid over it unlit, and a shock ring's refraction applied to all of it. Full resolution.
 */

export const FULL_VERT = `attribute vec2 a; varying vec2 v; void main(){ v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

export const MASK_VERT = `attribute vec3 a; varying float f; void main(){ f = a.z; gl_Position = vec4(a.xy, 0.0, 1.0); }`;
export const MASK_FRAG = `precision mediump float; varying float f; void main(){ gl_FragColor = vec4(1.0, f, 0.0, 1.0); }`;

const HIGHP = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

export const LIGHT_FRAG = `${HIGHP}
uniform sampler2D mask;
uniform vec2 size;
uniform vec4 L;      // x, y (buffer px, GL origin), radius px, level
uniform vec3 col;
uniform vec4 cone;   // dir x, dir y, cos(half), soft; soft 0 means omni
uniform vec4 prm;    // source size px, ignore radius px, casts shadows 0/1, max steps
uniform float rays;
void main(){
  vec2 p = gl_FragCoord.xy;
  vec2 d = L.xy - p;
  float dist = length(d);
  if (dist >= L.z) discard;
  float t = dist / L.z;
  float att = 1.0 - t * t; att *= att;
  float hot = 1.0 - t; hot *= hot; hot *= hot;
  att *= (1.0 + 1.2 * hot) / 2.2;
  if (cone.w > 0.0) {
    float c = dot(-d / max(dist, 1.0), cone.xy);
    float cf = smoothstep(cone.z - cone.w, cone.z + cone.w, c);
    att *= mix(1.0, cf, smoothstep(0.02, 0.2, t));
  }
  vec2 uv = p / size;
  vec4 m = texture2D(mask, uv);
  float vis = 1.0;
  if (m.r > 0.5) {
    // A solid. Its top stands above the light, so it takes the light plainly; its front face only from lights to the south.
    vis = m.g > 0.5 ? 0.62 * smoothstep(-4.0, 8.0, p.y - L.y) : 0.9;
  } else if (prm.z > 0.5) {
    vec2 dir = d / max(dist, 1.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float j = fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    float n = clamp(dist / 4.0, 4.0, prm.w);
    float lit = 0.0, cnt = 0.0;
    for (int r = 0; r < 3; r++) {
      if (float(r) >= rays) break;
      float off = rays > 1.5 ? float(r) - 1.0 : 0.0;
      float occ = 0.0;
      for (int i = 0; i < 24; i++) {
        if (float(i) >= n) break;
        float s = (float(i) + j) / n;
        float travelled = s * dist;
        if (travelled < 3.0) continue;
        if (dist - travelled < prm.y) break;
        vec2 q = p + d * s + nrm * (off * prm.x * s);
        occ = max(occ, texture2D(mask, q / size).r);
      }
      lit += 1.0 - clamp(occ * 1.1, 0.0, 1.0);
      cnt += 1.0;
    }
    vis = lit / cnt;
  }
  gl_FragColor = vec4(col * (L.w * att * vis * 0.5), 1.0);
}`;

export const SHAFT_FRAG = `${HIGHP}
varying vec2 v;
uniform sampler2D light;
uniform vec2 lc;       // the light's centre in uv
uniform vec3 col;
uniform float k, reach, aspect, time;
void main(){
  vec2 d = lc - v;
  vec2 da = vec2(d.x * aspect, d.y);
  float dist = length(da);
  float fade = 1.0 - clamp(dist / reach, 0.0, 1.0);
  if (fade <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float acc = 0.0;
  for (int i = 0; i < 14; i++) {
    float s = (float(i) + 0.5) / 14.0;
    vec3 c = texture2D(light, v + d * s).rgb;
    acc += dot(c, vec3(0.3, 0.59, 0.11)) * (1.0 - 0.5 * s);
  }
  float ang = atan(da.y, da.x);
  float beams = 0.72 + 0.28 * sin(ang * 17.0 + time * 0.0004) * sin(ang * 5.0 - time * 0.0002);
  gl_FragColor = vec4(col * (acc / 14.0 * fade * fade * k * beams), 1.0);
}`;

export const SCENE_FRAG = `${HIGHP}
varying vec2 v;
uniform sampler2D base, over, light, mask, shaft;
uniform vec2 ltexel;      // one light-buffer texel in uv
uniform vec3 amb;
uniform float gain, ao, shafts;
uniform float aspect, time;
uniform int nshock;
uniform vec4 sk[4];       // centre uv x, y, ring radius (screen heights), progress 0..1
uniform vec4 sp[4];       // strength, 0, 0, 0

vec3 lightAt(vec2 uv){
  vec2 o = ltexel * 0.5;
  return (texture2D(light, uv + vec2(-o.x, -o.y)).rgb + texture2D(light, uv + vec2(o.x, -o.y)).rgb
        + texture2D(light, uv + vec2(-o.x, o.y)).rgb + texture2D(light, uv + vec2(o.x, o.y)).rgb) * 0.25;
}

void main(){
  vec2 uv = v;
  for (int i = 0; i < 4; i++) {
    if (i >= nshock) break;
    vec2 c = sk[i].xy, r = (v - c) * vec2(aspect, 1.0);
    float dist = length(r), k = sk[i].w, R = sk[i].z;
    float edge = R * (1.0 - (1.0 - k) * (1.0 - k));
    float width = 0.018 + 0.03 * k;
    float rw = (dist - edge) / width;
    float ring = exp(-rw * rw);
    float life = (1.0 - k) * (1.0 - k);
    vec2 dir = r / max(dist, 1e-4);
    float shimmer = sin(v.y * 140.0 + time * 0.012) * sin(v.x * 90.0 - time * 0.009);
    float heat = (1.0 - smoothstep(R * 0.2, R, dist)) * (1.0 - k) * (1.0 - k) * 0.0016 * shimmer;
    vec2 off = dir * ring * life * 0.016 * sp[i].x;
    uv -= vec2(off.x / aspect, off.y) + vec2(heat, heat * 0.6) * sp[i].x;
  }
  vec3 b = texture2D(base, uv).rgb;
  vec4 o = texture2D(over, uv);
  // Lights add up, so they are tone-mapped: overlapping lamps saturate toward 1 instead of burning the floor white.
  vec3 raw = lightAt(uv) * 2.0 + texture2D(shaft, uv).rgb * shafts;
  vec3 L = (1.0 - exp(-1.25 * raw)) * 0.74 * gain;
  float occ = 0.0;
  vec4 m = texture2D(mask, uv);
  if (ao > 0.0 && m.r < 0.5) {
    vec2 t1 = ltexel * 3.0, t2 = ltexel * 7.0;
    occ = texture2D(mask, uv + vec2(t1.x, 0.0)).r + texture2D(mask, uv - vec2(t1.x, 0.0)).r
        + texture2D(mask, uv + vec2(0.0, t1.y)).r + texture2D(mask, uv - vec2(0.0, t1.y)).r
        + 0.7 * (texture2D(mask, uv + vec2(t2.x, 0.0)).r + texture2D(mask, uv - vec2(t2.x, 0.0)).r
        + texture2D(mask, uv + vec2(0.0, t2.y)).r + texture2D(mask, uv - vec2(0.0, t2.y)).r);
    occ = occ / 6.8;
  }
  float a = 1.0 - ao * occ;
  // Under a strong light the cool ambient gives way to the light's own colour, so a lamp's pool reads amber, not grey.
  float strength = clamp(dot(L, vec3(0.3, 0.59, 0.11)) * 1.5, 0.0, 1.0);
  vec3 lit = b * (amb * a * (1.0 - 0.8 * strength) + L) + L * 0.07;
  gl_FragColor = vec4(lit * (1.0 - o.a) + o.rgb, 1.0);
}`;
