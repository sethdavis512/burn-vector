import { COMMODITY_BY_ID, priceAt } from '../data/commodities';
import { GOVS } from '../data/governments';
import { OUTFIT_LIST, OUTFITS } from '../data/outfits';
import { SHIP_LIST, shipDef } from '../data/ships';
import type { CommodityId, GovId, OutfitDef, PlanetDef, ShipDef } from '../data/types';
import { adjustRep, cargoUsed, commodityTons, freeCargo, missionTons, playerStats, revealRadius, revealRegion, type PlayerState } from './player';
import { ammoCapacity, computeStats, defaultLoadout, installBlocker, shipValue } from './stats';
import { chapter } from './story';

export interface Result {
  ok: boolean;
  msg?: string;
}

const fail = (msg: string): Result => ({ ok: false, msg });

// ── Commodities ──────────────────────────────────────────────────

export function buyCommodity(ps: PlayerState, planet: PlanetDef, id: CommodityId, want: number): Result {
  const price = priceAt(planet, id, ps.day);
  if (price === null) return fail('Not traded here.');
  const n = Math.min(want, freeCargo(ps), Math.floor(ps.credits / price));
  if (n <= 0) return fail(freeCargo(ps) <= 0 ? 'Your cargo hold is full.' : "You can't afford any more.");
  const held = ps.cargo[id] ?? 0;
  const prevCost = ps.cargoCost[id] ?? price;
  ps.cargoCost[id] = Math.round((prevCost * held + price * n) / (held + n));
  ps.cargo[id] = held + n;
  ps.credits -= price * n;
  ps.flags.tutBought = true;
  return { ok: true, msg: `Bought ${n}t of ${COMMODITY_BY_ID[id].name}.` };
}

export function sellCommodity(ps: PlayerState, planet: PlanetDef, id: CommodityId, want: number): Result {
  const price = priceAt(planet, id, ps.day);
  if (price === null) return fail('Nobody here will buy that.');
  const held = ps.cargo[id] ?? 0;
  const n = Math.min(want, held);
  if (n <= 0) return fail("You don't have any.");
  const cost = ps.cargoCost[id] ?? price;
  ps.cargo[id] = held - n;
  if (ps.cargo[id] === 0) {
    delete ps.cargo[id];
    delete ps.cargoCost[id];
  }
  ps.credits += price * n;
  ps.stats.profit += (price - cost) * n;
  return { ok: true, msg: `Sold ${n}t of ${COMMODITY_BY_ID[id].name}.` };
}

// ── Outfits ──────────────────────────────────────────────────────

export interface OutfitListing {
  o: OutfitDef;
  locked: string | null;
}

function govFor(o: { gov?: GovId }, planet: PlanetDef): GovId {
  return o.gov ?? planet.gov;
}

export function outfitsForSale(planet: PlanetDef, ps: PlayerState): OutfitListing[] {
  if (!planet.services.includes('O')) return [];
  return OUTFIT_LIST.filter((o) => {
    if (o.hidden || o.tech > planet.tech) return false;
    if (planet.gov === 'vael') return o.gov === 'vael' || o.id === 'map_local';
    if (o.gov && o.gov !== planet.gov) return false;
    return true;
  }).map((o) => {
    let locked: string | null = null;
    if (o.reqRep !== undefined) {
      const g = govFor(o, planet);
      if ((ps.rep[g] ?? 0) < o.reqRep) locked = `Requires ${GOVS[g].short} standing of ${o.reqRep}+`;
    }
    return { o, locked };
  });
}

export function outfitSellPrice(o: OutfitDef) {
  return o.cat === 'Ammunition' ? Math.round(o.price * 0.5) : Math.round(o.price * 0.6);
}

export function mapIsUseful(ps: PlayerState, o: OutfitDef): boolean {
  if (!o.map) return false;
  const trial = { ...ps, known: [...ps.known] };
  const added = o.map.region ? revealRegion(trial, o.map.region) : revealRadius(trial, ps.system, o.map.radius ?? 3);
  return added > 0;
}

export function buyOutfit(ps: PlayerState, planet: PlanetDef, id: string): Result {
  const o = OUTFITS[id];
  if (!o) return fail('Unknown item.');
  if (ps.credits < o.price) return fail("You can't afford that.");
  const def = shipDef(ps.shipId);
  if (o.cat === 'Maps') {
    if (!mapIsUseful(ps, o)) return fail('You already have those charts.');
    const added = o.map!.region ? revealRegion(ps, o.map!.region) : revealRadius(ps, planet.systemId, o.map!.radius ?? 3);
    ps.credits -= o.price;
    return { ok: true, msg: `${added} new system${added === 1 ? '' : 's'} added to your map.` };
  }
  const blocker = installBlocker(def, ps.outfits, o, ps.ammo);
  if (blocker) return fail(blocker);
  ps.credits -= o.price;
  if (o.cat === 'Ammunition') ps.ammo[o.id] = (ps.ammo[o.id] ?? 0) + 1;
  else {
    ps.outfits[o.id] = (ps.outfits[o.id] ?? 0) + 1;
    if (o.fuel) ps.fuel += o.fuel;
  }
  ps.flags.tutOutfit = true;
  return { ok: true, msg: `Purchased ${o.name}.` };
}

export function sellOutfit(ps: PlayerState, id: string): Result {
  const o = OUTFITS[id];
  if (!o) return fail('Unknown item.');
  if (o.cat === 'Ammunition') {
    if ((ps.ammo[id] ?? 0) <= 0) return fail("You don't have any.");
    ps.ammo[id]! -= 1;
    ps.credits += outfitSellPrice(o);
    return { ok: true };
  }
  const have = ps.outfits[id] ?? 0;
  if (have <= 0) return fail("You don't have one installed.");
  if (o.cargo) {
    const after = playerStats(ps).cargo - o.cargo;
    if (cargoUsed(ps) > after) return fail('Empty some cargo space first.');
  }
  ps.outfits[id] = have - 1;
  if (ps.outfits[id] === 0) delete ps.outfits[id];
  if (o.weapon?.ammo) {
    const cap = ammoCapacity(ps.outfits, o.weapon.ammo);
    const extra = (ps.ammo[o.weapon.ammo] ?? 0) - cap;
    if (extra > 0) {
      ps.ammo[o.weapon.ammo] = cap;
      ps.credits += extra * outfitSellPrice(OUTFITS[o.weapon.ammo]!);
    }
  }
  ps.fuel = Math.min(ps.fuel, playerStats(ps).maxFuel);
  ps.credits += outfitSellPrice(o);
  return { ok: true, msg: `Sold ${o.name}.` };
}

// ── Ships ────────────────────────────────────────────────────────

export interface ShipListing {
  def: ShipDef;
  locked: string | null;
}

export function shipsForSale(planet: PlanetDef, ps: PlayerState): ShipListing[] {
  if (!planet.services.includes('S')) return [];
  return SHIP_LIST.filter((s) => {
    if (s.hidden || s.tech > planet.tech) return false;
    if (planet.gov === 'vael') return s.gov === 'vael';
    if (s.gov && s.gov !== planet.gov) return false;
    return true;
  }).map((def) => {
    let locked: string | null = null;
    if (def.reqRep !== undefined && def.gov && (ps.rep[def.gov] ?? 0) < def.reqRep) {
      locked = `Requires ${GOVS[def.gov].short} standing of ${def.reqRep}+`;
    }
    return { def, locked };
  });
}

export function tradeInValue(ps: PlayerState) {
  return shipValue(shipDef(ps.shipId), ps.outfits);
}

export function buyShip(ps: PlayerState, id: string): Result {
  const def = shipDef(id);
  if (def.id === ps.shipId) return fail('You already fly one.');
  const cost = def.price - tradeInValue(ps);
  if (ps.credits < cost) return fail("You can't afford it, even with your trade-in.");
  const { outfits, ammo } = defaultLoadout(def);
  const stats = computeStats(def, outfits);
  if (missionTons(ps) > stats.cargo) return fail('Your mission cargo would not fit in that hull.');
  if (commodityTons(ps) + missionTons(ps) > stats.cargo) return fail('Sell some cargo first; it would not fit in that hull.');
  ps.credits -= cost;
  ps.shipId = def.id;
  ps.outfits = outfits;
  ps.ammo = ammo;
  ps.fuel = stats.maxFuel;
  return { ok: true, msg: `You are now the proud owner of a ${def.name}.` };
}

// ── Services ─────────────────────────────────────────────────────

export function fuelPrice(planet: PlanetDef) {
  return planet.gov === 'vael' ? 3 : planet.gov === 'corsair' ? 2.5 : 2;
}

export function refuelCost(ps: PlayerState, planet: PlanetDef) {
  const missing = Math.max(0, playerStats(ps).maxFuel - ps.fuel);
  return Math.ceil(missing * fuelPrice(planet));
}

export function refuel(ps: PlayerState, planet: PlanetDef): Result {
  const max = playerStats(ps).maxFuel;
  if (ps.fuel >= max) return fail('Your tanks are already full.');
  const unit = fuelPrice(planet);
  const units = Math.min(max - ps.fuel, Math.floor(ps.credits / unit));
  if (units <= 0) return fail("You can't afford any fuel.");
  ps.fuel += units;
  ps.credits -= Math.ceil(units * unit);
  return { ok: true, msg: ps.fuel >= max ? 'Tanks full.' : 'Partially refueled.' };
}

export interface Completion {
  title: string;
  pay: number;
  /** Story chapter completed, if any. */
  story?: number;
}

/** Pay out and remove missions that end at this planet. */
export function completeMissions(ps: PlayerState, planet: PlanetDef): Completion[] {
  const done: Completion[] = [];
  ps.missions = ps.missions.filter((m) => {
    if (m.type === 'bounty' || m.destPlanet !== planet.id) return true;
    if (m.target && !m.targetDead) return true;
    if (m.client && !ps.escorts.some((e) => e.client === m.id)) return true;
    ps.credits += m.pay;
    ps.stats.missionsDone++;
    adjustRep(ps, m.gov, Math.min(12, 3 + Math.floor(m.pay / 3000)));
    if (m.type === 'smuggle' && planet.gov !== 'corsair') adjustRep(ps, planet.gov, -2);
    if (m.client) ps.escorts = ps.escorts.filter((e) => e.client !== m.id);
    if (m.story) {
      chapter(m.story)?.onComplete?.(ps);
      ps.flags.story = m.story;
    }
    done.push({ title: m.title, pay: m.pay, story: m.story });
    return false;
  });
  return done;
}
