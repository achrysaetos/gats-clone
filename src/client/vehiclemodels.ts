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
} satisfies Record<string, (livery?: string, variant?: string, number?: string) => Model>;

export type VehicleKind = keyof typeof BUILDERS;
export const VEHICLE_KINDS = Object.keys(BUILDERS) as VehicleKind[];

const models = new Map<string, Model>();
export function modelOf(kind: VehicleKind, livery = '', variant = '', number = ''): Model {
  const key = `${kind}|${livery}|${variant}|${number}`;
  let m = models.get(key);
  if (!m) models.set(key, (m = (BUILDERS[kind] as (l?: string, v?: string, n?: string) => Model)(livery || undefined, variant || undefined, number || undefined)));
  return m;
}

/**
 * A fingerprint of the kit: the source of every model builder and of the renderer, so a cached sprite from an older kit is never
 * shown. Shared helpers inside the model files are not covered; bump `KIT_VERSION` when changing only those.
 */
const KIT_VERSION = 1;
let print: string | undefined;
export function kitFingerprint(extra: string): string {
  if (print === undefined) {
    let h = 2166136261 >>> 0;
    const src = `${KIT_VERSION}|${Object.values(BUILDERS).map((f) => f.toString()).join('|')}|${extra}`;
    for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    print = h.toString(36);
  }
  return print;
}
