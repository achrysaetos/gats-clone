/// <reference types="node" />
import sharp from 'sharp';

export type Frame = { key: string; file: string };

/** Pixi's spritesheet frame format: where the trimmed pixels sit on the page and where they sat in the full frame. */
type SheetFrame = {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
};

export type Page = { image: Buffer; raw: { width: number; height: number; channels: 4 }; frames: Record<string, SheetFrame> };

const PAGE = 2048;
/** Clear pixels round each frame, so filtering and mipmaps never pull in a neighbour. */
const GAP = 2;

type Cut = { key: string; data: Buffer; w: number; h: number; trim: { x: number; y: number }; source: { w: number; h: number } };

/** A frame's opaque bounding box, so a sprite's empty margin costs no atlas space; a fully clear frame keeps one pixel. */
async function cut(f: Frame): Promise<Cut> {
  const { data, info } = await sharp(f.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3]! < 2) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) data.copy(out, y * w * 4, ((y + y0) * info.width + x0) * 4, ((y + y0) * info.width + x0 + w) * 4);
  return { key: f.key, data: out, w, h, trim: { x: x0, y: y0 }, source: { w: info.width, h: info.height } };
}

/** Shelf packing, tallest first: frames of one sprite share a height, so shelves fill evenly. */
export async function packFrames(frames: readonly Frame[]): Promise<Page[]> {
  const cuts = (await Promise.all(frames.map(cut))).sort((a, b) => b.h - a.h || b.w - a.w);
  const pages: { cuts: (Cut & { x: number; y: number })[] }[] = [];
  let page: (typeof pages)[number] | null = null;
  let x = 0, y = 0, shelf = 0;
  for (const c of cuts) {
    if (c.w + GAP * 2 > PAGE || c.h + GAP * 2 > PAGE) throw new Error(`${c.key} is ${c.w}x${c.h}, larger than an atlas page`);
    if (page && x + c.w + GAP * 2 > PAGE) { x = 0; y += shelf; shelf = 0; }
    if (!page || y + c.h + GAP * 2 > PAGE) { page = { cuts: [] }; pages.push(page); x = y = shelf = 0; }
    page.cuts.push({ ...c, x: x + GAP, y: y + GAP });
    x += c.w + GAP * 2;
    shelf = Math.max(shelf, c.h + GAP * 2);
  }
  return pages.map((p) => {
    const height = 2 ** Math.ceil(Math.log2(Math.max(...p.cuts.map((c) => c.y + c.h + GAP))));
    const image = Buffer.alloc(PAGE * height * 4);
    const out: Record<string, SheetFrame> = {};
    for (const c of p.cuts) {
      for (let row = 0; row < c.h; row++) c.data.copy(image, ((c.y + row) * PAGE + c.x) * 4, row * c.w * 4, (row + 1) * c.w * 4);
      out[c.key] = {
        frame: { x: c.x, y: c.y, w: c.w, h: c.h }, rotated: false, trimmed: c.w !== c.source.w || c.h !== c.source.h,
        spriteSourceSize: { x: c.trim.x, y: c.trim.y, w: c.w, h: c.h }, sourceSize: c.source,
      };
    }
    return { image, raw: { width: PAGE, height, channels: 4 }, frames: out };
  });
}
