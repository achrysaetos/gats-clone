/// <reference types="node" />
// Usage: node scripts/art/contact-sheet.ts <sprites-spec.json> <bakeDir> <outDir>
// Composites baked frames the way the painter will (shadow, base, tinted team, armor, additive glow) at game scale on
// concrete, beside crops of the reference, so a person can judge the bake by eye.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';

type Box = { x: number; y: number; w: number; h: number };
type Entry = { box: Box; dirs: number; frames: number; layers: string[]; scale?: number };
type Spec = { pxPerUnit: number; playerRadius: number; teamColors: Record<string, string>; sprites: Record<string, Entry> };
type Img = { w: number; h: number; d: Float32Array };

const [specPath, bakeDir, outDir] = process.argv.slice(2);
if (!specPath || !bakeDir || !outDir) { console.error('usage: node scripts/art/contact-sheet.ts <spec.json> <bakeDir> <outDir>'); process.exit(2); }
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Spec;
mkdirSync(outDir, { recursive: true });
const S = 2;
const CONCRETE: [number, number, number] = [0.6, 0.6, 0.585];

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

async function load(path: string): Promise<Img | null> {
  if (!existsSync(path)) return null;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = new Float32Array(info.width * info.height * 4);
  for (let i = 0; i < d.length; i++) d[i] = data[i]! / 255;
  return { w: info.width, h: info.height, d };
}

function canvas(w: number, h: number): Img {
  const d = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const n = ((x * 7919 + y * 104729) % 97) / 97 * 0.03 + ((Math.floor(x / 200) + Math.floor(y / 200)) % 2) * 0.02;
    d[i] = CONCRETE[0] - n; d[i + 1] = CONCRETE[1] - n; d[i + 2] = CONCRETE[2] - n; d[i + 3] = 1;
  }
  return { w, h, d };
}

function sample(img: Img, u: number, v: number): [number, number, number, number] {
  const x = u - 0.5, y = v - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]] as const) {
    const xx = x0 + dx, yy = y0 + dy;
    if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h || wt === 0) continue;
    const i = (yy * img.w + xx) * 4, a = img.d[i + 3]!;
    out[0] += img.d[i]! * a * wt; out[1] += img.d[i + 1]! * a * wt; out[2] += img.d[i + 2]! * a * wt; out[3] += a * wt;
  }
  return out;
}

type Blend = 'over' | 'add' | 'shadow';
type DrawOpts = { tint?: [number, number, number]; rot?: number; blend?: Blend; zoom?: number };

/** Draws one baked frame with its origin at canvas pixel (ox, oy). */
async function draw(c: Img, name: string, layer: string, d: number, f: number, ox: number, oy: number, o: DrawOpts = {}) {
  const e = spec.sprites[name];
  if (!e) return;
  const img = await load(join(bakeDir, name, layer, `${d}_${f}.png`));
  if (!img) return;
  const zoom = o.zoom ?? 1;
  const px = spec.pxPerUnit * (e.scale ?? 1);
  const cos = Math.cos(o.rot ?? 0), sin = Math.sin(o.rot ?? 0);
  const reach = Math.hypot(Math.max(-e.box.x, e.box.x + e.box.w), Math.max(-e.box.y, e.box.y + e.box.h)) * S * zoom;
  for (let y = Math.max(0, Math.floor(oy - reach)); y < Math.min(c.h, Math.ceil(oy + reach)); y++) {
    for (let x = Math.max(0, Math.floor(ox - reach)); x < Math.min(c.w, Math.ceil(ox + reach)); x++) {
      const gx = (x + 0.5 - ox) / (S * zoom), gy = (y + 0.5 - oy) / (S * zoom);
      const lx = gx * cos + gy * sin, ly = -gx * sin + gy * cos;
      const [r, g, b, a] = sample(img, (lx - e.box.x) * px, (ly - e.box.y) * px);
      if (a <= 0) continue;
      const i = (y * c.w + x) * 4;
      let cr = r / a, cg = g / a, cb = b / a;
      if (o.tint) { cr *= o.tint[0]; cg *= o.tint[1]; cb *= o.tint[2]; }
      if (o.blend === 'add') { c.d[i]! += cr * a; c.d[i + 1]! += cg * a; c.d[i + 2]! += cb * a; continue; }
      c.d[i] = c.d[i]! * (1 - a) + cr * a; c.d[i + 1] = c.d[i + 1]! * (1 - a) + cg * a; c.d[i + 2] = c.d[i + 2]! * (1 - a) + cb * a;
    }
  }
}

const FONT = 'font-family="sans-serif" font-size="13" fill="#111"';
async function save(c: Img, labels: [number, number, string][], ref: { left: number; top: number; width: number; height: number; zoom: number }[], file: string) {
  const buf = Buffer.alloc(c.w * c.h * 4);
  for (let i = 0; i < c.d.length; i++) buf[i] = Math.max(0, Math.min(255, Math.round(c.d[i]! * 255)));
  const svg = `<svg width="${c.w}" height="${c.h}" xmlns="http://www.w3.org/2000/svg">${labels.map(([x, y, t]) => `<text x="${x}" y="${y}" ${FONT}>${t}</text>`).join('')}</svg>`;
  const layers: OverlayOptions[] = [{ input: Buffer.from(svg), left: 0, top: 0 }];
  let rx = c.w - 10;
  for (const r of ref) {
    const w = Math.round(r.width * r.zoom), h = Math.round(r.height * r.zoom);
    rx -= w;
    layers.push({ input: await sharp('docs/art/gold-standard.webp').extract(r).resize(w, h).png().toBuffer(), left: rx, top: 24 });
    rx -= 10;
  }
  await sharp(buf, { raw: { width: c.w, height: c.h, channels: 4 } }).composite(layers).png().toFile(join(outDir, file));
  console.log(`wrote ${join(outDir, file)}`);
}

/** A soldier the way the painter stacks it: shadow, base, tinted team, armor tier, then the gun on top. */
async function soldierAt(c: Img, x: number, y: number, angle: number, team: string, armor: string | null, gun: string, zoom = 1) {
  const n = spec.sprites['soldier']!.dirs, ns = spec.sprites['soldier.shadow']!.dirs;
  const dir = ((Math.round(angle / (2 * Math.PI / n)) % n) + n) % n;
  const sdir = ((Math.round(angle / (2 * Math.PI / ns)) % ns) + ns) % ns;
  await draw(c, 'soldier.shadow', 'shadow', sdir, 0, x, y, { zoom });
  await draw(c, 'soldier', 'base', dir, 0, x, y, { zoom });
  await draw(c, 'soldier', 'team', dir, 0, x, y, { tint: hex(spec.teamColors[team]!), zoom });
  if (armor) await draw(c, 'soldier', armor, dir, 0, x, y, { zoom });
  await draw(c, `gun.${gun}`, 'base', 0, 0, x, y, { rot: angle, zoom });
}

async function characters() {
  const c = canvas(1500, 1000);
  const labels: [number, number, string][] = [];
  const armors = [null, 'armorLight', 'armorMedium', 'armorHeavy'];
  labels.push([10, 18, 'soldiers at game scale (2 px/unit), 8 of 32 facings, red and blue, assault rifle; then armor tiers']);
  for (let t = 0; t < 2; t++) for (let i = 0; i < 8; i++) {
    await soldierAt(c, 60 + i * 95, 90 + t * 120, (i / 8) * Math.PI * 2, t ? 'blue' : 'red', null, 'assault');
  }
  for (let a = 0; a < 4; a++) for (let t = 0; t < 2; t++) {
    await soldierAt(c, 60 + (a * 2 + t) * 95, 350, -0.5, t ? 'blue' : 'red', armors[a]!, ['pistol', 'smg', 'shotgun', 'lmg'][a]!);
  }
  labels.push([10, 430, 'zoomed x2.5: no armor, light, medium, heavy; downed (x2)']);
  for (let a = 0; a < 4; a++) await soldierAt(c, 110 + a * 200, 560, -0.6, a % 2 ? 'blue' : 'red', armors[a]!, 'assault', 2.5);
  await draw(c, 'soldier.downed', 'base', 0, 0, 1000, 560, { rot: 0.7, zoom: 2 });
  await draw(c, 'soldier.downed', 'team', 0, 0, 1000, 560, { rot: 0.7, zoom: 2, tint: hex(spec.teamColors['green']!) });
  labels.push([10, 720, 'zombies (walker, brute, runner, plated, bloater, colossus), 4 of 16 facings']);
  const kinds = ['walker', 'brute', 'runner', 'plated', 'bloater', 'colossus'];
  let x = 40;
  for (const k of kinds) {
    const e = spec.sprites[`zombie.${k}`];
    if (!e) continue;
    const r = -e.box.x / 1.9;
    for (let i = 0; i < 4; i++) { await draw(c, `zombie.${k}`, 'base', i * (e.dirs / 4), 0, x + r * S, 830, {}); x += r * S * 2 + 12; }
    x += 16;
  }
  await save(c, labels, [{ left: 440, top: 410, width: 140, height: 110, zoom: 2 }, { left: 1030, top: 820, width: 140, height: 110, zoom: 2 }], 'sheet-characters.png');
}

async function guns() {
  const names = Object.keys(spec.sprites).filter((n) => n.startsWith('gun.'));
  const c = canvas(1500, 60 + Math.ceil(names.length / 6) * 70);
  const labels: [number, number, string][] = [[10, 18, 'guns at 2x game scale; the red tick is the muzzle the game uses']];
  for (let i = 0; i < names.length; i++) {
    const x = 30 + (i % 6) * 245, y = 70 + Math.floor(i / 6) * 70;
    await draw(c, names[i]!, 'base', 0, 0, x, y, { zoom: 2 });
    const parts = (JSON.parse(readFileSync(specPath!, 'utf8')) as { guns: Record<string, { parts: { x: number; w: number }[] }> }).guns[names[i]!.slice(4)]!.parts;
    const mx = Math.round(x + Math.max(...parts.map((p) => p.x + p.w)) * spec.playerRadius * S * 2);
    for (let yy = y - 22; yy < y - 14; yy++) { const j = (yy * c.w + mx) * 4; c.d[j] = 1; c.d[j + 1] = 0; c.d[j + 2] = 0; }
    labels.push([x - 20, y + 30, names[i]!.slice(4)]);
  }
  await save(c, labels, [], 'sheet-guns.png');
}

/** Lays sprites left to right at a zoom, wrapping rows, each placed by its box so frames never overlap. */
function flow(c: Img, zoom: number, top: number) {
  let x = 20, y = top, rowH = 0;
  return (name: string) => {
    const e = spec.sprites[name];
    if (!e) return { x: 0, y: 0 };
    const w = e.box.w * S * zoom, h = e.box.h * S * zoom;
    if (x + w > c.w - 20) { x = 20; y += rowH + 16; rowH = 0; }
    const at = { x: x - e.box.x * S * zoom, y: y - e.box.y * S * zoom };
    x += w + 12;
    rowH = Math.max(rowH, h);
    return at;
  };
}

async function props() {
  const c = canvas(1500, 1500);
  const zoom = 1.5;
  const labels: [number, number, string][] = [[10, 18, 'crates by tier and damage stage, siege walls, pad, turrets, engineer walls, core, thrown (game scale x1.5)']];
  const place = flow(c, zoom, 270);
  const tiers = ['plain', 'loot', 'rich', 'cache', 'drop'];
  for (const t of tiers) for (let s = 0; s < 3; s++) { const at = place(`crate.${t}.${s}`); await draw(c, `crate.${t}.${s}`, 'base', 0, 0, at.x, at.y, { zoom }); }
  for (let s = 0; s < 3; s++) { const at = place(`siege.wall.${s}`); await draw(c, `siege.wall.${s}`, 'base', 0, 0, at.x, at.y, { zoom }); }
  for (const t of ['', 'sentry', 'cannon', 'scatter', 'mortar']) {
    const at = place('siege.pad');
    await draw(c, 'siege.pad', 'base', 0, 0, at.x, at.y, { zoom });
    if (!t) continue;
    await draw(c, `turret.${t}`, 'base', 0, 0, at.x + 25 * S * zoom, at.y + 25 * S * zoom, { zoom, rot: -0.6 });
    await draw(c, `turret.${t}`, 'glow', 0, 0, at.x + 25 * S * zoom, at.y + 25 * S * zoom, { zoom, rot: -0.6, blend: 'add' });
  }
  for (const n of ['engineer.wall.h', 'engineer.wall.v', 'core']) {
    const at = place(n);
    await draw(c, n, 'base', 0, 0, at.x, at.y, { zoom });
    await draw(c, n, 'glow', 0, 0, at.x, at.y, { zoom, blend: 'add' });
  }
  for (const t of ['grenade', 'fragGrenade', 'gasGrenade', 'landMine']) {
    const at = place(`thrown.${t}`);
    await draw(c, `thrown.${t}`, 'base', 0, 0, at.x, at.y, { zoom });
    await draw(c, `thrown.${t}`, 'glow', 0, 0, at.x, at.y, { zoom, blend: 'add' });
  }
  await save(c, labels, [{ left: 20, top: 130, width: 340, height: 220, zoom: 1 }, { left: 640, top: 520, width: 320, height: 280, zoom: 0.8 }], 'sheet-props.png');
}

async function effects() {
  const c = canvas(1500, 760);
  const labels: [number, number, string][] = [[10, 18, 'muzzle flash frames, explosion frames, smoke variants, decals (game scale)']];
  for (let f = 0; f < 4; f++) await draw(c, 'fx.muzzle', 'glow', 0, f, 40 + f * 130, 70, { blend: 'add', zoom: 1.5 });
  for (let f = 0; f < 16; f++) {
    const x = 120 + (f % 8) * 170, y = 230 + Math.floor(f / 8) * 200;
    await draw(c, 'fx.explosion', 'base', 0, f, x, y, { zoom: 0.75 });
    await draw(c, 'fx.explosion', 'glow', 0, f, x, y, { blend: 'add', zoom: 0.75 });
  }
  for (let f = 0; f < 4; f++) await draw(c, 'fx.smoke', 'base', 0, f, 700 + f * 90, 70);
  for (let f = 0; f < 2; f++) await draw(c, 'decal.scorch', 'base', 0, f, 120 + f * 300, 640);
  for (let f = 0; f < 4; f++) await draw(c, 'decal.blood', 'base', 0, f, 700 + f * 70, 640);
  for (let f = 0; f < 4; f++) await draw(c, 'decal.ichor', 'base', 0, f, 1000 + f * 70, 640);
  await save(c, labels, [{ left: 150, top: 160, width: 230, height: 220, zoom: 1 }], 'sheet-fx.png');
}

await characters();
await guns();
await props();
await effects();
