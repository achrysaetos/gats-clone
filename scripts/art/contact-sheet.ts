/// <reference types="node" />
// Usage: node scripts/art/contact-sheet.ts <sprites-spec.json> <bakeDir> <outDir> [characters|guns|props|effects|kit]
// Composites baked frames the way the painter will (shadow, base, tinted team, armor, additive glow) at game scale on
// concrete, beside crops of the reference, so a person can judge the bake by eye.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';

type Box = { x: number; y: number; w: number; h: number };
type Entry = { box: Box; dirs: number; frames: number; layers: string[]; still?: string[]; scale?: number };
type Spec = { pxPerUnit: number; playerRadius: number; teamColors: Record<string, string>; sprites: Record<string, Entry> };
type Img = { w: number; h: number; d: Float32Array };

const [specPath, bakeDir, outDir, only] = process.argv.slice(2);
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
  const img = await load(join(bakeDir, name, layer, `${d}_${e.still?.includes(layer) ? 0 : f}.png`));
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
async function save(c: Img, labels: [number, number, string][], ref: { left: number; top: number; width: number; height: number; zoom: number; src?: string }[], file: string) {
  const buf = Buffer.alloc(c.w * c.h * 4);
  for (let i = 0; i < c.d.length; i++) buf[i] = Math.max(0, Math.min(255, Math.round(c.d[i]! * 255)));
  const svg = `<svg width="${c.w}" height="${c.h}" xmlns="http://www.w3.org/2000/svg">${labels.map(([x, y, t]) => `<text x="${x}" y="${y}" ${FONT}>${t}</text>`).join('')}</svg>`;
  const layers: OverlayOptions[] = [{ input: Buffer.from(svg), left: 0, top: 0 }];
  let rx = c.w - 10;
  for (const r of ref) {
    const w = Math.round(r.width * r.zoom), h = Math.round(r.height * r.zoom);
    rx -= w;
    layers.push({ input: await sharp(r.src ?? 'docs/art/gold-standard.webp').extract({ left: r.left, top: r.top, width: r.width, height: r.height }).resize(w, h).png().toBuffer(), left: rx, top: 24 });
    rx -= 10;
  }
  await sharp(buf, { raw: { width: c.w, height: c.h, channels: 4 } }).composite(layers).png().toFile(join(outDir, file));
  console.log(`wrote ${join(outDir, file)}`);
}

const dirOf = (name: string, angle: number) => {
  const n = spec.sprites[name]!.dirs;
  return ((Math.round(angle / (2 * Math.PI / n)) % n) + n) % n;
};
/** The rest of the turn the painter applies after picking the nearest baked facing. */
const restOf = (name: string, angle: number) => angle - dirOf(name, angle) * (2 * Math.PI / spec.sprites[name]!.dirs);

type Pose = { move?: number; legs?: number; torso?: number; kick?: number };

/** A soldier the way the painter stacks it: shadow, legs (turned to the movement), torso (turned to the aim) with
 * tinted team and an armor tier, then the gun at the origin along the aim, pushed back by the kick. */
async function soldierAt(c: Img, x: number, y: number, angle: number, team: string, armor: string | null, gun: string, zoom = 1, pose: Pose = {}) {
  const move = pose.move ?? angle, tint = hex(spec.teamColors[team]!);
  await draw(c, 'soldier.shadow', 'shadow', dirOf('soldier.shadow', angle), 0, x, y, { zoom, rot: restOf('soldier.shadow', angle) });
  for (const layer of ['base', 'team']) await draw(c, 'soldier.legs', layer, dirOf('soldier.legs', move), pose.legs ?? 0, x, y, { zoom, rot: restOf('soldier.legs', move), tint: layer === 'team' ? tint : undefined });
  const d = dirOf('soldier', angle), rot = restOf('soldier', angle), f = pose.torso ?? 0;
  await draw(c, 'soldier', 'base', d, f, x, y, { zoom, rot });
  await draw(c, 'soldier', 'team', d, f, x, y, { tint, zoom, rot });
  if (armor) await draw(c, 'soldier', armor, d, f, x, y, { zoom, rot });
  const back = spec.playerRadius * 0.22 * (pose.kick ?? 0) * S * zoom;
  await draw(c, `gun.${gun}`, 'base', 0, 0, x - Math.cos(angle) * back, y - Math.sin(angle) * back, { rot: angle, zoom });
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

async function characters() {
  const c = canvas(1500, 2900);
  const labels: [number, number, string][] = [];
  const armors = [null, 'armorLight', 'armorMedium', 'armorHeavy'];
  const teams = ['red', 'blue'];
  labels.push([10, 18, 'standing soldiers at game scale (2 px/unit), 8 of 32 aim facings, red and blue, assault rifle']);
  for (let t = 0; t < 2; t++) for (let i = 0; i < 8; i++) await soldierAt(c, 60 + i * 95, 90 + t * 110, (i / 8) * Math.PI * 2, teams[t]!, null, 'assault');
  labels.push([10, 290, 'x1.75: no armor, light, medium, heavy, each red then blue']);
  for (let a = 0; a < 4; a++) for (let t = 0; t < 2; t++) await soldierAt(c, 95 + (a * 2 + t) * 180, 400, -0.6, teams[t]!, armors[a]!, ['assault', 'smg', 'shotgun', 'lmg'][a]!, 1.75);
  labels.push([10, 520, 'torso strip x1.75 (medium armor): aim, recoil 1-2 (gun kicked 1, 0.5), reload 3-8']);
  const kicks = [0, 1, 0.5];
  for (let f = 0; f < 9; f++) await soldierAt(c, 80 + f * 162, 640, 0, 'blue', 'armorMedium', 'assault', 1.75, { torso: f, kick: kicks[f] ?? 0 });
  labels.push([10, 760, 'legs x1.75: stand, run 1-8 moving east (aim east), then run moving north while aiming east, then the legs alone']);
  for (let f = 0; f < 9; f++) await soldierAt(c, 80 + f * 162, 870, 0, 'red', null, 'smg', 1.75, { legs: f });
  for (let f = 1; f < 9; f++) await soldierAt(c, 80 + (f - 1) * 162, 1010, 0, 'red', 'armorLight', 'smg', 1.75, { legs: f, move: -Math.PI / 2 });
  for (let f = 0; f < 9; f++) for (const layer of ['base', 'team']) await draw(c, 'soldier.legs', layer, 0, f, 80 + f * 162, 1130, { zoom: 1.75, tint: layer === 'team' ? hex(spec.teamColors['red']!) : undefined });
  labels.push([10, 1215, 'x2: downed, then death poses (red, blue, green), turned by the painter']);
  for (const [i, name, f, team] of [[0, 'soldier.downed', 0, 'yellow'], [1, 'soldier.dead', 0, 'red'], [2, 'soldier.dead', 1, 'blue'], [3, 'soldier.dead', 2, 'green']] as const) {
    for (const layer of ['base', 'team']) await draw(c, name, layer, 0, f, 150 + i * 260, 1345, { zoom: 2, rot: -0.5 + i * 0.6, tint: layer === 'team' ? hex(spec.teamColors[team]!) : undefined });
  }
  labels.push([10, 1475, 'dropped guns at x2, by class']);
  const drops = Object.keys(spec.sprites).filter((n) => n.startsWith('drop.'));
  for (let i = 0; i < drops.length; i++) {
    await draw(c, drops[i]!, 'base', 0, 0, 80 + i * 230, 1530, { zoom: 2, rot: -0.15 + i * 0.06 });
    labels.push([40 + i * 230, 1585, drops[i]!.slice(5)]);
  }
  labels.push([10, 1690, 'zombies at game scale x1 (walker, brute, runner, plated, bloater, colossus), 4 of 16 facings']);
  const place = flow(c, 1, 1710);
  for (const k of ['walker', 'brute', 'runner', 'plated', 'bloater', 'colossus']) {
    const e = spec.sprites[`zombie.${k}`];
    if (!e) continue;
    for (let i = 0; i < 4; i++) { const at = place(`zombie.${k}`); await draw(c, `zombie.${k}`, 'base', i * (e.dirs / 4), 0, at.x, at.y); }
  }
  await save(c, labels, [
    { left: 430, top: 440, width: 140, height: 110, zoom: 2, src: 'docs/art/gold/warehouse.webp' },
    { left: 1080, top: 420, width: 120, height: 110, zoom: 2, src: 'docs/art/gold/warehouse.webp' },
  ], 'sheet-characters.png');
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

/** Every kit piece at every baked turn and damage stage, then the train, base with glow added, labelled by catalog key. */
async function kit() {
  const names = Object.keys(spec.sprites).filter((n) => (n.startsWith('kit.') || n.startsWith('train.')) && existsSync(join(bakeDir!, n)));
  const zoom = 0.75, width = 2400;
  let x = 20, y = 40, rowH = 0;
  const spots: [string, number, number][] = [];
  for (const n of names) {
    const e = spec.sprites[n]!;
    const w = e.box.w * S * zoom, h = e.box.h * S * zoom + 18;
    if (x + w > width - 20) { x = 20; y += rowH + 12; rowH = 0; }
    spots.push([n, x, y]);
    x += Math.max(w, 110) + 14;
    rowH = Math.max(rowH, h);
  }
  const c = canvas(width, Math.ceil(y + rowH + 20));
  const labels: [number, number, string][] = [[10, 18, `kit pieces at every turn and stage, then the train (game scale x${zoom}); labels are kit.PIECE.TURN.STAGE without the kit prefix`]];
  for (const [n, sx, sy] of spots) {
    const e = spec.sprites[n]!;
    const ox = sx - e.box.x * S * zoom, oy = sy - e.box.y * S * zoom;
    await draw(c, n, 'base', 0, 0, ox, oy, { zoom });
    if (e.layers.includes('glow')) await draw(c, n, 'glow', 0, 0, ox, oy, { zoom, blend: 'add' });
    labels.push([sx, sy + e.box.h * S * zoom + 13, n.replace(/^kit\./, '')]);
  }
  await save(c, labels, [], 'sheet-kit.png');
}

for (const [name, sheet] of Object.entries({ characters, guns, props, effects, kit })) if (!only || only === name) await sheet();
