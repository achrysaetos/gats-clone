/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { World } from '../src/shared/sim/world.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { freshAwareness, perceive, type Awareness } from '../src/server/bot/awareness.ts';
import { bandFor, nextIntent, PERSONALITIES, startIntent, type Intent, type IntentCtx, type Personality, type Plan } from '../src/server/bot/intent.ts';
import { emptyWorld, setWalls, spawnAt } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

function decide(w: World, id: number, cur: Plan | Intent, opts: { persona?: Personality; tick?: number; aware?: Awareness } = {}): Intent {
  const persona = opts.persona ?? PERSONALITIES.cautious;
  const snap = snapshotFor(w, id);
  snap.tick = opts.tick ?? snap.tick;
  const me = snap.players.find((p) => p.id === id)!;
  const { view } = perceive(snap, arenaFor(w), me, opts.aware ?? freshAwareness());
  const ctx: IntentCtx = { tick: snap.tick, persona, role: null, band: bandFor(view.weapon, persona), arena: arenaFor(w), rand: seeded(3) };
  const intent = 'since' in cur ? cur : startIntent(cur, { ...ctx, tick: snap.tick });
  return nextIntent(intent, view, ctx);
}

const pillarWest = { x: 700, y: 900, w: 40, h: 200 };

test('an enemy walking into view turns a patrol into a fight at once, commitment or not', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const patrol = decide(w, bot.id, { k: 'patrol', goal: { x: 2000, y: 2000 } });
  assert.equal(patrol.k, 'patrol', 'nothing in view: keeps patrolling');
  const enemy = spawnAt(w, 1400, 1000);
  const next = decide(w, bot.id, { ...patrol, holdUntil: Infinity });
  assert.equal(next.k, 'engage');
  assert.equal(next.k === 'engage' && next.target, enemy.id);
});

test('a hurt bot in a fight with cover in reach breaks off to heal behind it, and comes back only once healed past its line', () => {
  const w = emptyWorld();
  setWalls(w, [pillarWest]);
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1500, 1000);
  const p = PERSONALITIES.cautious;
  if (bot.life.k !== 'alive') throw new Error('alive');
  bot.life.hp = 100 * (p.retreatHp - 0.1);
  const retreat = decide(w, bot.id, { k: 'engage', target: 0 }, { persona: p });
  assert.equal(retreat.k, 'retreatAndHeal');
  assert.ok(retreat.k === 'retreatAndHeal' && retreat.spot && retreat.spot.x < pillarWest.x, `hides west of the pillar: ${JSON.stringify(retreat)}`);

  bot.x = 640; bot.y = 1000;
  bot.life.hp = 100 * ((p.retreatHp + p.healedHp) / 2);
  const healing = decide(w, bot.id, { ...retreat, holdUntil: 0 }, { persona: p });
  assert.equal(healing.k, 'retreatAndHeal', 'between the lines it keeps healing');
  bot.life.hp = 100 * (p.healedHp + 0.02);
  assert.notEqual(decide(w, bot.id, { ...retreat, holdUntil: 0 }, { persona: p }).k, 'retreatAndHeal', 'healed past its line it goes back out');
});

test('a hurt bot with an enemy on top of it fights rather than turning its back', () => {
  const w = emptyWorld();
  setWalls(w, [pillarWest]);
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1150, 1000);
  if (bot.life.k === 'alive') bot.life.hp = 10;
  assert.equal(decide(w, bot.id, { k: 'engage', target: 0 }).k, 'engage');
  const fleeing = startIntent({ k: 'retreatAndHeal', spot: { x: 640, y: 1000 }, threat: { x: 1150, y: 1000 } }, { tick: 0, persona: PERSONALITIES.cautious } as IntentCtx);
  assert.equal(decide(w, bot.id, fleeing).k, 'engage', 'a retreat caught up with turns to fight');
});

test('a bot in a fight with its magazine nearly dry reloads in cover, and fights again once it is full', () => {
  const w = emptyWorld();
  setWalls(w, [pillarWest]);
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1500, 1000);
  if (bot.life.k !== 'alive') throw new Error('alive');
  bot.life.ammo = 3;
  const reload = decide(w, bot.id, { k: 'engage', target: 0 });
  assert.equal(reload.k, 'reloadInCover');
  bot.life.ammo = 30;
  assert.equal(decide(w, bot.id, { ...reload, holdUntil: 0 }).k, 'engage');
});

test('a fight holds for its commitment, then a cautious bot with cover in reach moves to peek from it', () => {
  const w = emptyWorld();
  setWalls(w, [{ x: 1100, y: 900, w: 40, h: 200 }]);
  const bot = spawnAt(w, 1000, 1150, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1650, 1000);
  const persona = { ...PERSONALITIES.cautious, peekOdds: 1 };
  const engaged = startIntent({ k: 'engage', target: 0 }, { tick: 100, persona } as IntentCtx);
  assert.equal(decide(w, bot.id, engaged, { persona, tick: 101 }).k, 'engage', 'still committed');
  const peek = decide(w, bot.id, engaged, { persona, tick: engaged.holdUntil });
  assert.equal(peek.k, 'peekAndHide');
});

test('a peek takes turns hiding and looking out without leaving the intent', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1500, 1000);
  const peek = startIntent({ k: 'peekAndHide', target: 0, spot: { x: 1000, y: 1000 }, peek: { x: 1000, y: 1060 }, phase: 'hide', phaseUntil: 10 }, { tick: 0, persona: PERSONALITIES.cautious } as IntentCtx);
  const out = decide(w, bot.id, peek, { tick: 10 });
  assert.ok(out.k === 'peekAndHide' && out.phase === 'peek' && out.phaseUntil > 10, `steps out: ${JSON.stringify(out)}`);
  assert.equal(out.since, peek.since, 'the same intent, not a new one');
  const back = decide(w, bot.id, out, { tick: out.k === 'peekAndHide' ? out.phaseUntil : 0 });
  assert.ok(back.k === 'peekAndHide' && back.phase === 'hide', 'tucks back in');
});

test('a target lost behind cover is flanked, pushed or waited out by the personality\'s odds', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const aware: Awareness = { ...freshAwareness(), contacts: [{ id: 99, x: 1500, y: 1000, seenTick: 0, gun: 'assault' }] };
  const lost = startIntent({ k: 'engage', target: 99 }, { tick: 0, persona: PERSONALITIES.cautious } as IntentCtx);
  const as = (overrides: Partial<Personality>) => decide(w, bot.id, lost, { persona: { ...PERSONALITIES.cautious, ...overrides }, tick: 60, aware }).k;
  assert.equal(as({ flankOdds: 1 }), 'flank');
  assert.equal(as({ flankOdds: 0, pushOdds: 1 }), 'search');
  assert.equal(as({ flankOdds: 0, pushOdds: 0 }), 'takePosition');
});

test('a flank that reaches its side point goes to search where the target was last seen', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const flank = startIntent({ k: 'flank', target: 99, via: { x: 1010, y: 1000 }, lastKnown: { x: 1500, y: 1400 } }, { tick: 0, persona: PERSONALITIES.cautious } as IntentCtx);
  const next = decide(w, bot.id, flank, { tick: flank.holdUntil });
  assert.ok(next.k === 'search' && next.at.x === 1500 && next.at.y === 1400, JSON.stringify(next));
});

test('a peek duel that drags on is broken by a flank when the personality goes round', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const enemy = spawnAt(w, 1500, 1000);
  const peek = startIntent({ k: 'peekAndHide', target: enemy.id, spot: { x: 1000, y: 1000 }, peek: { x: 1000, y: 1060 }, phase: 'hide', phaseUntil: 1e9 }, { tick: 0, persona: PERSONALITIES.cautious } as IntentCtx);
  const at = (tick: number, flankOdds: number) => decide(w, bot.id, peek, { persona: { ...PERSONALITIES.cautious, flankOdds }, tick }).k;
  assert.equal(at(90, 1), 'peekAndHide', 'three seconds in it keeps peeking');
  assert.equal(at(180, 1), 'flank', 'six seconds in it goes round');
  assert.equal(at(180, 0), 'peekAndHide', 'a bot that never flanks keeps peeking');
});

test('a bot hears gunfire it cannot see, a silenced shot only up close, and remembers it for a few seconds', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const heardAt = (shot: { x: number; y: number; silenced: boolean }, aware = freshAwareness()) => {
    const snap = snapshotFor(w, bot.id);
    snap.events = [{ e: 'shot', x: shot.x, y: shot.y, angle: 0, silenced: shot.silenced, owner: 777, gun: 'assault' }];
    const me = snap.players.find((p) => p.id === bot.id)!;
    return perceive(snap, arenaFor(w), me, aware);
  };
  const loud = heardAt({ x: 1800, y: 1300, silenced: false }).view.lead;
  assert.ok(loud && loud.x === 1800 && loud.y === 1300, 'an unsilenced shot 850px off is heard where it was fired');
  assert.equal(heardAt({ x: 1800, y: 1300, silenced: true }).view.lead, null, 'a silenced one that far is not');
  assert.ok(heardAt({ x: 1200, y: 1100, silenced: true }).view.lead, 'a silenced one 220px off is');
  const remembered = heardAt({ x: 1800, y: 1300, silenced: false }).awareness;
  const later = snapshotFor(w, bot.id);
  later.tick += 60;
  assert.ok(perceive(later, arenaFor(w), later.players.find((p) => p.id === bot.id)!, remembered).view.lead, 'still a lead two seconds on');
  later.tick += 120;
  assert.equal(perceive(later, arenaFor(w), later.players.find((p) => p.id === bot.id)!, remembered).view.lead, null, 'forgotten after six');
  const patrol = decide(w, bot.id, { k: 'patrol', goal: { x: 200, y: 200 } }, { aware: remembered });
  assert.ok(patrol.k === 'search' && patrol.at.x === 1800, `goes to look: ${JSON.stringify(patrol)}`);
});

test('a hurt bot leaves the hiding spot a teammate is already in', () => {
  const w = emptyWorld('TDM');
  setWalls(w, [pillarWest]);
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' }, team: 'red' });
  spawnAt(w, 1500, 1000, { team: 'blue' });
  if (bot.life.k === 'alive') bot.life.hp = 20;
  const alone = decide(w, bot.id, { k: 'engage', target: 0 });
  assert.ok(alone.k === 'retreatAndHeal' && alone.spot, 'retreats to cover');
  const spot = alone.k === 'retreatAndHeal' ? alone.spot! : { x: 0, y: 0 };
  spawnAt(w, spot.x, spot.y, { team: 'red' });
  const shared = decide(w, bot.id, { k: 'engage', target: 0 });
  assert.ok(shared.k === 'retreatAndHeal' && shared.spot && Math.hypot(shared.spot.x - spot.x, shared.spot.y - spot.y) >= 60, `picks another spot: ${JSON.stringify(shared)}`);
});

test('a hurt bot keeps fighting a lone enemy who is worse off, but leaves when outnumbered with nobody beside it', () => {
  const w = emptyWorld('TDM');
  setWalls(w, [pillarWest]);
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' }, team: 'red' });
  const foe = spawnAt(w, 1500, 1000, { team: 'blue' });
  const hp = (p: typeof bot, v: number) => { if (p.life.k === 'alive') p.life.hp = v; };
  hp(bot, 30);
  hp(foe, 10);
  assert.equal(decide(w, bot.id, { k: 'engage', target: foe.id }).k, 'engage', 'finishes a weaker lone enemy');
  hp(foe, 100);
  assert.equal(decide(w, bot.id, { k: 'engage', target: foe.id }).k, 'retreatAndHeal', 'leaves a stronger one');

  hp(bot, 60);
  spawnAt(w, 1500, 1150, { team: 'blue' });
  assert.equal(decide(w, bot.id, { k: 'engage', target: foe.id }).k, 'retreatAndHeal', 'two on one at 60% is a fight to leave');
  spawnAt(w, 1000, 1150, { team: 'red' });
  assert.equal(decide(w, bot.id, { k: 'engage', target: foe.id }).k, 'engage', 'with a teammate beside it, it stays');
});

test('a peek that nobody answers stays out, and one that draws fire tucks back in', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const enemy = spawnAt(w, 1500, 1000);
  const out = startIntent({ k: 'peekAndHide', target: enemy.id, spot: { x: 1000, y: 940 }, peek: { x: 1000, y: 1000 }, phase: 'peek', phaseUntil: 10 }, { tick: 0, persona: PERSONALITIES.cautious } as IntentCtx);
  const quiet = decide(w, bot.id, out, { tick: 10 });
  assert.ok(quiet.k === 'peekAndHide' && quiet.phase === 'peek', 'unanswered: keeps shooting');
  const shot = decide(w, bot.id, out, { tick: 10, aware: { ...freshAwareness(), hitTick: 10 } });
  assert.ok(shot.k === 'peekAndHide' && shot.phase === 'hide', 'shot at: ducks');
});

test('a bot holding a spot goes to gunfire it just heard, unless it is far off or where it is already watching', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const hold = startIntent({ k: 'takePosition', spot: { x: 1000, y: 1000 }, facing: { x: 1000, y: 200 } }, { tick: 0, persona: PERSONALITIES.cautious } as IntentCtx);
  const heard = (x: number, y: number, tick: number): Awareness => ({ ...freshAwareness(), heard: [{ x, y, tick, hunted: false }] });
  const after = (x: number, y: number, heardAt: number) => decide(w, bot.id, hold, { tick: 30, aware: heard(x, y, heardAt) });
  const go = after(1900, 1300, 30);
  assert.ok(go.k === 'search' && go.at.x === 1900, `goes to look: ${JSON.stringify(go)}`);
  assert.equal(after(1900, 1300, 20).k, 'takePosition', 'an older shot does not pull it off its spot');
  assert.equal(after(2900, 2900, 30).k, 'takePosition', 'gunfire across the map does not');
  assert.equal(after(1050, 300, 30).k, 'takePosition', 'gunfire where it is already watching does not');
});
