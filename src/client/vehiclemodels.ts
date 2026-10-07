/**
 * Every vehicle model by kind (docs/maps/VEHICLES.md). Shared by the page (for the live parts: props, rotors, lamps) and the
 * baking worker (vehicleworker.ts), so both build the same model from the same kind, livery and variant.
 */
import type { Model } from './vehiclemesh.ts';
import { c130, fighter, heli } from './vehicleair.ts';
import { boxcar, carriage, dieselLoco, loco } from './vehiclerail.ts';
import { containerShip, patrolBoat, submarine, trawler, tugboat } from './vehiclesea.ts';
import { airlinerFront, airlinerTail, bagCart, bowser, boxTruck, gondola, reefer, van, crashTender, limo, pickup, schoolBus, sedan, snowcat, snowmobile, suv, tug } from './vehicleland.ts';

const BUILDERS = {
  c130,
  fighter,
  heli,
  bowser,
  crashTender,
  tug,
  bagCart,
  sedan,
  pickup,
  suv,
  limo,
  schoolBus,
  snowcat,
  snowmobile,
  gondola,
  loco,
  carriage,
  dieselLoco,
  boxcar,
  tugboat,
  trawler,
  patrolBoat,
  containerShip,
  submarine,
  airlinerFront,
  airlinerTail,
  boxTruck,
  van,
  reefer,
} satisfies Record<string, (livery?: string, variant?: string) => Model>;

export type VehicleKind = keyof typeof BUILDERS;
export const VEHICLE_KINDS = Object.keys(BUILDERS) as VehicleKind[];

const models = new Map<string, Model>();
export function modelOf(kind: VehicleKind, livery = '', variant = ''): Model {
  const key = `${kind}|${livery}|${variant}`;
  let m = models.get(key);
  if (!m) models.set(key, (m = BUILDERS[kind](livery || undefined, variant || undefined)));
  return m;
}
