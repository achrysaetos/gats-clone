/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { coverIndex, pickCover } from '../src/server/bot/cover.ts';
import { clearShot, navGrid } from '../src/server/bot/nav.ts';

const R = WORLD.playerRadius;
const pillar = { x: 1000, y: 900, w: 40, h: 200 };
const setup = (rects = [pillar]) => {
  const nav = navGrid(3000, rects, R);
  return { nav, index: coverIndex(nav, rects, R), rects };
};

test('cover against a threat to the east is the pillar\'s west face, hidden from the threat, with a peek that sees it', () => {
  const { nav, index, rects } = setup();
  const threat = { x: 1600, y: 1000 };
  const pick = pickCover(index, nav, rects, { x: 700, y: 1000 }, [threat], { reach: 500, range: 500, peek: true });
  assert.ok(pick && pick.peek, 'found cover with a peek');
  assert.ok(pick.spot.x < pillar.x, `stands west of the pillar: ${JSON.stringify(pick.spot)}`);
  assert.ok(!clearShot(rects, pick.spot, threat), 'the threat cannot shoot the spot');
  assert.ok(clearShot(rects, pick.peek, threat), 'the peek sees the threat');
});

test('the same pillar against a threat to the west puts the bot on its east face', () => {
  const { nav, index, rects } = setup();
  const threat = { x: 400, y: 1000 };
  const pick = pickCover(index, nav, rects, { x: 1300, y: 1000 }, [threat], { reach: 500, range: 500, peek: true });
  assert.ok(pick, 'found cover');
  assert.ok(pick.spot.x > pillar.x + pillar.w, `stands east of the pillar: ${JSON.stringify(pick.spot)}`);
  assert.ok(!clearShot(rects, pick.spot, threat));
});

test('a spot that hides from one threat but not a second is refused', () => {
  const { nav, index, rects } = setup();
  const pick = pickCover(index, nav, rects, { x: 700, y: 1000 }, [{ x: 1600, y: 1000 }, { x: 700, y: 400 }], { reach: 500, range: 500, peek: false });
  for (const t of [{ x: 1600, y: 1000 }, { x: 700, y: 400 }]) assert.ok(!pick || !clearShot(rects, pick.spot, t), `no spot in sight of (${t.x}, ${t.y})`);
});

test('no cover is offered beyond reach or in an open field', () => {
  const { nav, index, rects } = setup();
  assert.equal(pickCover(index, nav, rects, { x: 200, y: 200 }, [{ x: 1600, y: 1000 }], { reach: 300, range: 500, peek: true }), null);
  const open = setup([]);
  assert.equal(pickCover(open.index, open.nav, [], { x: 700, y: 1000 }, [{ x: 1600, y: 1000 }], { reach: 500, range: 500, peek: true }), null);
});

test('cover is judged against the live cover, so a spot behind a crate that broke is not offered', () => {
  const crate = { x: 1000, y: 978, w: 44, h: 44 };
  const { nav, index } = setup([crate]);
  const threat = { x: 1600, y: 1000 };
  assert.ok(pickCover(index, nav, [crate], { x: 800, y: 1000 }, [threat], { reach: 400, range: 500, peek: false }), 'the standing crate is cover');
  assert.equal(pickCover(index, nav, [], { x: 800, y: 1000 }, [threat], { reach: 400, range: 500, peek: false }), null, 'the broken crate is not');
});
