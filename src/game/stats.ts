import { DEG } from '../core/math';
import { OUTFITS } from '../data/outfits';
import type { OutfitDef, ShipDef } from '../data/types';

export interface ShipStats {
  maxShield: number;
  shieldRegen: number;
  maxArmor: number;
  armorRegen: number;
  maxSpeed: number;
  accel: number;
  /** Radians per second. */
  turn: number;
  maxFuel: number;
  cargo: number;
  afterburner: number;
  ramscoop: number;
  escapePod: boolean;
}

export type Loadout = Record<string, number>;

export function computeStats(def: ShipDef, outfits: Loadout): ShipStats {
  let maxShield = def.shield;
  let shieldRegen = def.shieldRegen;
  let maxArmor = def.armor;
  let armorRegen = 0;
  let cargo = def.cargo;
  let maxFuel = def.fuel;
  let speedMul = 1;
  let accelMul = 1;
  let turnMul = 1;
  let afterburner = 0;
  let ramscoop = 0;
  let escapePod = false;
  for (const [id, n] of Object.entries(outfits)) {
    const o = OUTFITS[id];
    if (!o || n <= 0 || o.cat === 'Ammunition') continue;
    maxShield += (o.shield ?? 0) * n;
    shieldRegen += (o.shieldRegen ?? 0) * n;
    maxArmor += (o.armor ?? 0) * n;
    armorRegen += (o.armorRegen ?? 0) * n;
    cargo += (o.cargo ?? 0) * n;
    maxFuel += (o.fuel ?? 0) * n;
    speedMul += (o.speed ?? 0) * n;
    accelMul += (o.accel ?? 0) * n;
    turnMul += (o.turn ?? 0) * n;
    afterburner = Math.max(afterburner, o.afterburner ?? 0);
    ramscoop += (o.ramscoop ?? 0) * n;
    if (o.escapePod) escapePod = true;
  }
  return {
    maxShield,
    shieldRegen,
    maxArmor,
    armorRegen,
    maxSpeed: def.speed * speedMul,
    accel: def.accel * accelMul,
    turn: def.turn * turnMul * DEG,
    maxFuel,
    cargo,
    afterburner,
    ramscoop,
    escapePod,
  };
}

export function usedMass(outfits: Loadout): number {
  let m = 0;
  for (const [id, n] of Object.entries(outfits)) {
    const o = OUTFITS[id];
    if (o && o.cat !== 'Ammunition') m += o.mass * n;
  }
  return m;
}

export function slotsUsed(outfits: Loadout) {
  let guns = 0;
  let turrets = 0;
  for (const [id, n] of Object.entries(outfits)) {
    const w = OUTFITS[id]?.weapon;
    if (!w) continue;
    if (w.turret) turrets += n;
    else guns += n;
  }
  return { guns, turrets };
}

export function ammoCapacity(outfits: Loadout, ammoId: string): number {
  let cap = 0;
  for (const [id, n] of Object.entries(outfits)) {
    const o = OUTFITS[id];
    if (o?.weapon?.ammo === ammoId) cap += (o.ammoCap ?? 0) * n;
  }
  return cap;
}

/** Why an outfit cannot be installed, or null if it fits. */
export function installBlocker(def: ShipDef, outfits: Loadout, o: OutfitDef, ammo: Record<string, number>): string | null {
  if (o.cat === 'Ammunition') {
    const cap = ammoCapacity(outfits, o.id);
    if (cap === 0) return 'You have no launcher for this ammunition.';
    if ((ammo[o.id] ?? 0) >= cap) return 'Your launchers are full.';
    return null;
  }
  if (o.cat === 'Maps') return null;
  const have = outfits[o.id] ?? 0;
  if (o.max !== undefined && have >= o.max) return `You can't install more than ${o.max}.`;
  if (def.mass - usedMass(outfits) < o.mass) return 'Not enough free space on your ship.';
  if (o.weapon) {
    const slots = slotsUsed(outfits);
    if (o.weapon.turret && slots.turrets >= def.turrets) return 'No free turret mounts.';
    if (!o.weapon.turret && slots.guns >= def.guns) return 'No free gun mounts.';
  }
  return null;
}

/** Trade-in value of a ship plus its installed outfits. */
export function shipValue(def: ShipDef, outfits: Loadout): number {
  let v = def.price * 0.45;
  for (const [id, n] of Object.entries(outfits)) {
    const o = OUTFITS[id];
    if (o && o.cat !== 'Maps') v += o.price * n * 0.5;
  }
  return Math.round(v);
}

export function defaultLoadout(def: ShipDef) {
  const outfits: Loadout = {};
  const ammo: Record<string, number> = {};
  for (const [id, n] of def.outfits) {
    const o = OUTFITS[id];
    if (!o) continue;
    if (o.cat === 'Ammunition') ammo[id] = (ammo[id] ?? 0) + n;
    else outfits[id] = (outfits[id] ?? 0) + n;
  }
  return { outfits, ammo };
}
