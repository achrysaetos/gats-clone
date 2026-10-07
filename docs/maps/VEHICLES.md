# Vehicle art kit: planes, helicopters, trucks, trains, boats, wrecks

Status: implemented. Code: `src/client/vehicleart.ts` (API, cache, bake queue, live props and lamps), `src/client/vehiclemesh.ts`
(the toy renderer), `src/client/vehiclemodels.ts` (kind registry), the models in `src/client/vehicleair.ts`, `vehicleland.ts`,
`vehiclerail.ts`, `vehiclesea.ts`, weathering in `src/client/vehiclepaint.ts`, the bake worker `src/client/vehicleworker.ts`
(built to `public/vehicles.js` by `npm run build`).

**Use this for every large vehicle or set piece.** Do not hand-draw planes, trucks, boats or trains out of `drawExtruded`
polygons: call `drawVehicle` at the same transform you passed to `place()` and the art lines up with the collision.

## What it is

Each vehicle is a small 3D toy model (lofted fuselages and hulls, bevelled slabs for wings and boxes, wheels, glass) rendered
once by a tiny cel renderer: the key light from the top left (`LIGHT` in `tilt.ts`), the hard cel steps (lit 24% toward white,
shade 30% toward black, the darker front face), a 2.2 px ink outline round the silhouette and along every break between parts,
one specular glint on glass, domes and lamps, and a crisp contact shadow. Paint (stripes, windows, panel lines, rust, vines,
scorch, snow) is procedural per surface point; text and roundels are decals projected from above or from the side.

The bake runs in a pool of web workers (up to 3), 2x supersampled; a quick low-res preview comes first so nothing is missing for
long, and the vehicles on screen get their full bake first. The result is cached as one canvas per (kind, livery, variant,
rotation to 0.5 degrees, scale, lod), so **a vehicle costs one `drawImage` per frame** plus a few ellipses for props and rotors.

Projection: the model's roof (`Model.top`) sits on the collision footprint, the same rule as walls, and its sides hang below it
as the front face (`TILT` = 0.36 m of screen per metre of height). Taller things (a fin, a funnel, a mast) rise up the screen.

## API

```ts
import { drawVehicle, drawVehicleOver, vehicleLights, prewarmVehicle, vehicleSprite, VEHICLE_KINDS, type VehicleKind } from '../vehicleart.ts';

// Under the players (a theme's drawSetPiece / drawPoly / under hook), world px. Returns false until the first bake lands,
// so keep your old art as the fallback: `if (drawVehicle(...)) return true;`
drawVehicle(ctx, 'c130', { x, y, rot, scale: 1, livery: 'olive', variant: 'rampDown', t: clock(now), polys: group });

// Above the players (a theme's `over` hook): the helicopter's main rotor.
drawVehicleOver(ctx, 'heli', { x, y, rot, t: clock(now) });

// Practical lights (beacons, light bars, lamps) in world px, for setLight(). Blinking ones are listed only while lit.
for (const l of vehicleLights('crashTender', { x, y, rot, t, id: 'crash' })) setLight(l.key, { ...l, shadows: false });

// Ask for sprites before they are seen (all the set pieces of a map, at load).
prewarmVehicle('c130', { x, y, rot, livery: 'grey' });
```

- `x, y, rot, scale` are exactly the `Transform` you gave `place(shape, at, ...)`: the shape's origin, nose toward +x.
- `livery`, `variant`: optional strings from the table below; unknown ones fall back to the default.
- `t`: clock in ms for props, rotors and blinking lamps (pass your theme's reduced-motion-aware clock).
- `lod` < 1 bakes a smaller sprite (overviews). `polys`: the map polygons the vehicle stands on; geoart then skips its generic
  drop shadow for them (the model casts its own).
- A theme that paints into its own cached sprite once can force a synchronous bake with `vehicleSprite(kind, opts, true)`.

## Kinds

Sizes in metres at `PX_PER_M = 64`, nose toward +x, centred on the origin.

| kind | footprint / collision | liveries | variants |
|---|---|---|---|
| `c130` | `cargoPlane` | `olive` (KILROY on the fin), `grey` (test fleet, orange) | `rampDown` (default), `closed` |
| `fighter` | `fighterJet` | `grey`, `navy` | `jacks` (on stands, panels off, ladder; default), `parked` |
| `heli` | `helicopter` (+ 7.2 m rotor drawn over) | `olive`, `grey` | `doorsOpen` (default), `closed` |
| `bowser` | `truck` | `olive`, `sand` | |
| `crashTender` | `truck` | `red`, `yellow` | |
| `tug` | 3 x 1.6 | `yellow`, `orange` | |
| `bagCart` | 2.3 x 1.4 | `olive`, `grey` | `loaded` (default), `empty` |
| `sedan` | 4.6 x 1.9 | `blue`, `rust`, `cream`, `red`, `green`, `black`, `white`, `olive`, `silver`, `yellow` | `wreck`, `rust`, `vines`, `burnt`, `snowed` |
| `pickup` | 5.2 x 2.0 | as `sedan` | as `sedan` |
| `suv` | 5.16 x 2.19 (Embassy) | as `sedan` (default `black`) | as `sedan` |
| `limo` | 7.66 x 2.12 (Embassy) | as `sedan` (default `black`) | as `sedan` |
| `van` | 5.16 x 2.19 | `white` (GALA CATERING), `yellow` (SHUTTLE) | as `sedan` |
| `reefer` | 7.66 x 2.12 | `white` | |
| `boxTruck` | 7.6 x 2.56 | as `sedan` (default `white`) | as `sedan` |
| `schoolBus` | 11.5 x 2.5 | `yellow`, `white` | `vines`, `wreck`, `burnt` |
| `airlinerFront` | 13 x 4.1, torn end at -x | `white`, `teal` | `solid`, `hollow` (cut open at 2.95 m, floor and seats, Wasteland's breach in the south wall), `burnt` |
| `airlinerTail` | 12 x 4.1 (7.6 across the tailplanes), torn end at +x | `white`, `teal` | `solid`, `hollow` (breach in the north wall), `burnt` |
| `snowcat` | 5.3 x 2.75 + blade to 3.2 (Summit groomer) | `red`, `orange` | |
| `gondola` | 5.3 x 2.75 | `white`, `red` | |
| `snowmobile` | 3 x 1.1 | `red`, `orange`, `blue` | |
| `loco` | 10 x 2.2 steam engine + tender (Rail Yard) | `green`, `mail` | |
| `carriage` | 8.44 x 2.19 (Rail Yard) | `green` (cream and maroon), `mail` | `solid`, `hollow` (no roof, seats, door gaps 1.25-2.81 m and 5.63-7.19 m from the west end) |
| `dieselLoco` | `locomotive` | `freight`, `green`, `rust` | |
| `boxcar` | `trainCar` | `rust`, `green`, `grey` | `rust` |
| `tugboat` | `boat` (12 x 4), cut at the waterline | `black`, `red` | |
| `trawler` | 18 x 5.4 | `blue`, `white` | |
| `patrolBoat` | 15 x 4 | `grey` (PB-17), `green` (PB-22) | |
| `containerShip` | 32 x 9.6 | `blue` (KESTREL), `green` (HALCYON) | |
| `submarine` | 30 x 4.4, cut at the waterline | `black`, `grey` | |

## Where it is used

- Airbase: every aircraft and vehicle (`themes/airbasepieces.ts` `FLEET`), the heli rotor in `themes/airbase.ts`.
- Embassy: the motorcade and the caterers (`themes/embassygeo.ts` `vehicle`).
- Wasteland: the wrecks (`car` as `sedan`/`pickup`, `bus`, `truck`) and the airliner halves (twins of `spanA`/`spanB`), in
  `themes/wastelandpoly.ts` `kitPoly`; the hand art remains the fallback.
- Rail Yard: the five carriages (car 3 hollow) and both engines (`themes/railyardgeo.ts` `kitTrain`).
- Summit: the lot's pickups (`snowed`), the sleds, the groomer and their twins (`themes/summitpolys.ts` `kitVehicle`).
- Not wired yet: Harbour's ships are walkable decks drawn by `harborships.ts`; `tugboat`, `trawler`, `patrolBoat` and
  `containerShip` match them in look and can stand in the water as scenery. Sub Pen's boats are grid walls; `submarine` is ready.

## Adding a model

Write a function `(livery?, variant?) => Model` in one of the model files and add it to `BUILDERS` in `vehiclemodels.ts`. Build
in metres with the `Model` helpers: `loft` (a tube from cross-sections: half width, half height, superellipse `n`; `jag` tears the
last ring), `tube`, `blob`, `slab` (an extruded, bevelled polygon; pass `xf` to stand it up as a fin), `box`, `wheel`.
`part(paint, { clip, clipLow, cut, inner })` gives each piece its own paint and outline group, and can cut it open (a hollow
shell, a hull at its waterline, a doorway). Paint functions get the surface point and normal in model space; build materials
with `mat()` outside them, never inside. Set `m.top` to the roof height that sits on the collision. Props and rotors are
`m.spinners`, lamps `m.lights`. Check it in a gallery next to a soldier before wiring it in.

## Requests

Theme authors: add a line here if you need a kind, livery or variant that is missing.
- Rail Yard: steam `loco` with tender, `carriage` (`green` / `mail`, `hollow`): done and wired.
- Wasteland: airliner halves (`hollow`, with the breaches) and the wrecks: done and wired.
- Summit: the sled capsules (`sled-1..3` in `maps/summitgeo.ts`) are 2.5 m long along y but only 1.4 m apart, so their
  collisions (and so their art) overlap; space them further apart, or turn them, if they should stand side by side.
- Sub Pen (subpen): `submarine` hull numbers. The old hand-drawn boats were stencilled `77` (west slip) and `41` (east slip); the kit stencils `S-07` (black) and `S-12` (grey). Please accept a `number` on `VehicleOpts` (or a `variant`) so the map can ask for `77` and `41`. Sub Pen draws the grey livery at `scale` 0.9375 (hull polygon 1800 px) from `drawSubmarines` in `src/client/themes/subpengeo.ts`.
