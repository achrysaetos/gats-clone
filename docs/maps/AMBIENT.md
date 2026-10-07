# Ambient life API: birds, critters and drifting things

Status: API stable (types and registry: `src/client/ambientreg.ts`; engine: `src/client/ambient.ts`, sprites `ambientart.ts`, configs for the existing maps `ambientmaps.ts`). A theme file only has to import `registerAmbient` from `../ambientreg.ts`; nothing else to wire. Client only: nothing here touches the sim, the server or the replay, and everything is deterministic per map (same map, same critters, same perches, every time).

Ambient life is the "somebody lives here" layer: pigeons on a wall top, a cat on a crate, tumbleweeds, leaves, bats, fish. It **reacts** to the fight (gunfire and blasts near a flock make it burst up and wheel away, then resettle elsewhere; rats and cats scurry from players; leaves and litter are pushed by shockwaves and by players running through). Restraint rules from `docs/art/STYLE.md` apply: modest density, readable first, nothing loops faster than 4 Hz, reduced motion keeps critters still.

## Registering a config

Put it next to the rest of your map's client code (a theme file is fine). Import only the tiny registry, never the engine:

```ts
import { registerAmbient } from '../ambientreg.ts';

registerAmbient('airbase', {
  wind: { x: 14, y: -4 },                        // px/s, optional; drifting things lean this way
  groups: [
    { kind: 'gull', count: 5, on: 'wall' },                                   // perch on auto-picked wall tops
    { kind: 'crow', count: 4, at: [{ x: 900, y: 700 }, { x: 5100, y: 5300 }] },    // explicit perches (a gantry, a wire)
    { kind: 'rat', count: 3, in: [{ x: 200, y: 200, w: 500, h: 300 }] },      // ground critters scatter inside regions
    { kind: 'tumbleweed', count: 3 },                                         // drifters need nothing else
    { kind: 'aircraft', count: 1, path: [{ x: -300, y: 1200 }, { x: 6300, y: 2600 }], periodMs: 90_000 },
    { kind: 'steam', at: [{ x: 3000, y: 3000 }] },                            // one puff source per anchor
  ],
});
```

`registerAmbient(key, config | (map: MapDef) => config)`. `key` is a **map id** (`'airbase'`) or a **theme id**. `ambientFor(mapIdOrThemeId, map?)` (exported from `ambientreg.ts`; the engine passes the map so a function config and the theme fallback work) resolves map id first, then the map's theme id, then the default yard. Registering twice replaces. A map with no config gets the default yard (a few sparrows and drifting litter), so you only write one if the map has a character.

Positions are world pixels (maps are 6000 px square, a soldier is 48 px wide). Anchors inside solids are skipped, so you cannot make a critter stand in a wall.

## `AmbientGroup`

| field | meaning |
|---|---|
| `kind` | one of the kinds below |
| `count` | how many (engine caps per kind and per view; default per kind) |
| `at` | explicit anchors. Meaning depends on kind: **perch spot** (birds), **home / burrow** (ground critters), **lamp** (moth, butterfly), **vent or funnel** (steam, horn), **pond centre** (duck) |
| `in` | rectangles to place anchors in, deterministically (seeded by map id). Default: the whole map minus a margin |
| `on` | where auto-placement looks: `'wall'` (top of a map wall, birds), `'ground'` (open floor in low-traffic margins), `'water'` (inside `in`), `'air'`. Default per kind |
| `materials` | with `on: 'wall'` / `'water'`: only walls of these `material`s (`water` defaults to `water` and `pond`) |
| `avoid` | extra rects to keep clear (auto-placement already keeps off spawn pads, DOM zones and 140 px of the main lanes between spawns) |
| `when` | `'day'`, `'night'` or `'any'` (default; bats default to night, fireflies glow at night) |
| `path`, `periodMs` | aircraft and ship only: the line crossed, and the time one crossing takes |
| `scale` | sprite scale, default 1 |
| `roam` | ground critters: wander radius from home, default 180 px |

### Kinds

Perching birds (burst up on nearby gunfire/blast, wheel, resettle elsewhere in the group): `pigeon`, `crow`, `gull`, `sparrow`, `duck`.
Ground critters (wander, nap, scurry from players, vanish into a burrow): `rat`, `mouse`, `cat`, `dog`, `fox`.
Night flyers: `bat` (roost at `at`, stream out when a blast goes off, return later), `moth`, `butterfly`, `firefly`.
Water: `fish` (shadows in `in` water rects, scatter from a shot splash; set `on: 'water'`).
Drifters (pushed by blast shockwaves and by players running through): `tumbleweed`, `leaf`, `paper`, `snow`, `dustdevil`.
Sources: `steam` (puffs at `at`), `horn` (ship's funnel smoke at `at`), `aircraft` (a nav-light flyer crossing `path` far overhead).

## What the engine guarantees

- Deterministic: placement uses a PRNG seeded by the map id; no `Math.random` in placement. Same config, same world.
- Cheap: pooled objects, zero allocation per frame, off-screen critters are not drawn (and flyers far off-screen are simulated coarsely), per-view caps.
- Layers: ground critters draw after the walls and before bodies (under players); flyers draw above walls and roofs and under the HUD. Birds on wall tops are ground-layer but lifted to the wall's top face.
- Reduced motion (`prefers-reduced-motion`): critters stay perched and still, drifters hold position, and a scare just fades the critter out and back in elsewhere. No wheeling, no scatter animation.
- Sound: a faint flutter on a scatter, a rare caw/gull cry, distance-attenuated and rate limited, through the existing sfx bus.
- Walls: ground critters use the map's solids (including polygon walls' bounds); flyers ignore walls.
- Events: the engine watches the client's own effect state (muzzle flashes, blasts) and the snapshot's players; nothing for a map to wire up.

## Critters per map today (`src/client/ambientmaps.ts`)

| map | life |
|---|---|
| plaza | 9 pigeons + 4 sparrows on wall tops, a stray cat, 3 rats (burrows at wall bases), blowing paper and leaves, moths at the streetlamp props |
| oldtown | pigeons, 3 crows, sparrows, a cat and a stray dog, rats, leaves, paper, lamp moths |
| quarry | 7 crows, 2 sparrows, rats, a dust devil that crosses now and then, 2 tumbleweeds, paper |
| subpen | 8 gulls on the hulls, fish shadows in the water, rats, a bat roost in the north-west corner |
| museum | pigeons and sparrows on the outside apron only, a mouse in each gift shop, a moth at each lamp, a bat roost |
| park | crows on trunks and stonework, sparrows on hedges and benches, butterflies, leaves, fish in the ponds, a cat, mice, lamp moths (its ducks and fireflies are `parkdecor.ts`'s) |
| market | pigeons, 2 cats, rats, blowing paper, lantern moths, a bat roost |
| range | sparrows, 2 crows, paper, leaves |
| outpost (Zombies) | 9 crows on the walls that lift off as the horde walks in, tumbleweeds, paper, rats |
| anything else | the default yard (`DEFAULT_AMBIENT`): sparrows, pigeons, paper, leaves |

## Reactions

| event | who reacts |
|---|---|
| a muzzle flash within 340 px | perched birds burst up (a ripple: nearer birds first), wheel 1.5 to 3 s, then land on a spare perch at least 380 px away; ground critters within 300 px run; fish within 420 px dart (and ring the water) |
| a blast (radius `r`) | birds within `620 + 2r`, ground critters and fish within about 1000 px; litter within `260 + 3r` is shoved and lifted; bats pour out of a roost within 1700 px (night, or a roost with `when: 'any'`; 28 s cool-down) |
| a player within `skit` px (rat 210, cat 190, fox 260, dog 120, pigeon 110) | the critter scatters; litter within about 50 px is kicked along the player's velocity |
| a zombie within 330 px (Zombies) | perched birds lift off |
| a bird that has just landed | ignores anything farther than 170 px for 6 s, so a busy firefight does not keep a flock airborne |

## Sound

`amb:flutter` (a scatter, at most every 2.2 s), `amb:caw` (a crow, at most every 9 s) and `amb:gull` (at most every 11 s) are in `sfx.ts`, priority 0 (dropped first from a busy mix), attenuated to nothing at 1200 px from the listener.

## Dev hooks (`?dev`)

`skirmishAmbient.critters()`, `.perches()`, `.shot(x, y)`, `.boom(x, y, r)`, `.seen()`, `.cost()`, `.bench(n)`; `?dev&noambient` turns the layer off for frame-time runs.
