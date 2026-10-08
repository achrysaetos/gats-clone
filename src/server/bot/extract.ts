import type { ExtView, PlayerView, Snapshot } from '../../shared/protocol.ts';
import type { BotDecision, BotMemory } from '../bots.ts';
import { openSpot, type BotArena } from './arena.ts';
import { perceive } from './awareness.ts';
import { bandFor, nextIntent, PERSONALITIES, startIntent, type Intent, type IntentCtx } from './intent.ts';
import { act } from './motor.ts';
import { dist, type Point } from './nav.ts';

/**
 * What an extraction bot is doing for the objective. `walk` heads for a point, shooting on the way but never turning aside;
 * `hold` stands somewhere inside a circle, so a hacker keeps hacking and a guard keeps the hack contested; `fight` is the
 * ordinary fight, called back to `anchor` whenever it would take the bot past `leash`.
 */
type Errand =
  | { k: 'walk'; to: Point }
  | { k: 'hold'; at: Point; r: number }
  | { k: 'fight'; anchor: Point; leash: number };

/** A quarter of the attackers skirmish round the objective instead of standing on it, and two thirds of the defenders guard it from round about. */
const escorts = (id: number) => id % 4 === 0;
const sentries = (id: number) => id % 3 === 0;
const HOLD_SHARE = 0.6;
const GUARD_LEASH = 450;
const ESCORT_LEASH = 260;
const HUNT_LEASH = 300;
const WALK_SLACK = 40;

const short = (from: Point, to: Point, by: number): Point => {
  const d = dist(from, to);
  return d <= by ? from : { x: to.x + ((from.x - to.x) / d) * by, y: to.y + ((from.y - to.y) / d) * by };
};

function errandFor(ext: ExtView, me: PlayerView): Errand {
  const t = ext.terminal, c = ext.case;
  const hold: Errand = { k: 'hold', at: t, r: t.r * HOLD_SHARE };
  const skirmish = (anchor: Point, leash: number): Errand => ({ k: 'fight', anchor, leash });
  if (me.team === ext.attackers) {
    switch (c.k) {
      case 'hacking': return escorts(me.id) ? skirmish(t, GUARD_LEASH) : hold;
      case 'ready': case 'dropped': return escorts(me.id) ? skirmish(c, GUARD_LEASH) : { k: 'walk', to: c };
      case 'carried': return c.by === me.id ? { k: 'walk', to: { x: ext.pad.x + ext.pad.w / 2, y: ext.pad.y + ext.pad.h / 2 } } : skirmish(short(me, c, ESCORT_LEASH / 2), ESCORT_LEASH);
    }
  }
  switch (c.k) {
    case 'hacking': case 'ready': return sentries(me.id) ? hold : skirmish(t, GUARD_LEASH);
    case 'dropped': return sentries(me.id) ? hold : { k: 'walk', to: c };
    case 'carried': return skirmish(c, HUNT_LEASH);
  }
}

const goalOf = (i: Intent): Point | null => {
  switch (i.k) {
    case 'patrol': return i.goal;
    case 'takePosition': case 'peekAndHide': case 'reloadInCover': case 'retreatAndHeal': return i.spot;
    case 'search': return i.at;
    case 'flank': return i.via;
    case 'engage': return null;
  }
};

export function extractThink(snap: Snapshot, ext: ExtView, me: PlayerView, arena: BotArena, mem: BotMemory, rand: () => number): Omit<BotDecision, 'pick'> {
  const { awareness, view } = perceive(snap, arena, me, mem.awareness);
  const persona = PERSONALITIES[mem.persona];
  const ctx: IntentCtx = { tick: snap.tick, persona, role: null, band: bandFor(view.me.gun, persona), arena, rand };
  const prev = mem.intent ?? startIntent({ k: 'patrol', goal: me }, ctx);
  const walkTo = (goal: Point) => (prev.k === 'patrol' && dist(prev.goal, goal) < WALK_SLACK ? prev : startIntent({ k: 'patrol', goal }, ctx));
  const errand = errandFor(ext, me);
  let intent: Intent;
  switch (errand.k) {
    case 'walk': intent = walkTo(errand.to); break;
    case 'hold': {
      if (view.threats.length && dist(me, errand.at) > errand.r) {
        const fought = nextIntent(prev, view, ctx);
        intent = dist(goalOf(fought) ?? me, errand.at) > GUARD_LEASH ? walkTo(errand.at) : fought;
        break;
      }
      const stays = prev.k === 'takePosition' && dist(prev.spot, errand.at) <= errand.r * Math.SQRT2;
      intent = stays ? prev : startIntent({ k: 'takePosition', spot: openSpot(arena, rand, { at: errand.at, r: errand.r }), facing: view.lead ?? me }, ctx);
      break;
    }
    case 'fight': {
      intent = nextIntent(prev, view, ctx);
      const goal = goalOf(intent);
      const strays = intent.k === 'engage' ? dist(me, errand.anchor) > errand.leash * 2 : dist(goal ?? me, errand.anchor) > errand.leash;
      if (strays) intent = walkTo(errand.anchor);
      break;
    }
  }
  const { input, motor } = act(intent, view, ctx, mem.motor, snap);
  return { input, mem: { ...mem, intent, awareness, motor } };
}
