import { RNG, clamp, hashStr } from '../core/math';
import { pilotName } from '../data/names';
import { shipDef } from '../data/ships';
import type { GovId, PlanetDef } from '../data/types';
import type { Result } from './economy';
import type { Ship } from './entities';
import { MAX_ESCORTS, fleetCount, type EscortState, type PlayerState } from './player';

export interface HireOffer {
  id: string;
  shipId: string;
  name: string;
  fee: number;
  wage: number;
  blurb: string;
}

const POOLS: Record<GovId, string[]> = {
  concord: ['wren', 'talon', 'ranger'],
  league: ['raptor', 'wren', 'talon'],
  independent: ['wren', 'talon', 'ranger', 'bastion'],
  corsair: ['viper', 'marauder'],
  vael: [],
};

const BLURBS = [
  'Ex-militia. Steady hands, steadier aim.',
  'Says they have never lost a client. Declines to say how many they have lost of their own.',
  'Young, fast and cocky. Will probably get you both killed, or famous.',
  'A grizzled veteran who charges extra for complaining.',
  'Quiet. Polishes their guns constantly. Seems competent.',
  'Claims to have flown escort for a Concord admiral. The admiral is not available for comment.',
  'Freshly out of a contract and looking for the next one.',
];

const fail = (msg: string): Result => ({ ok: false, msg });

export function escortDisplayName(e: EscortState) {
  return e.hired ? `${e.name} · ${shipDef(e.shipId).name}` : e.name;
}

export function dismissible(e: EscortState) {
  return !e.client;
}

/** Mercenaries looking for work at this spaceport today. */
export function hireOffers(planet: PlanetDef, ps: PlayerState): HireOffer[] {
  if (!planet.services.includes('B')) return [];
  const pool = POOLS[planet.gov].filter((id) => shipDef(id).tech <= planet.tech + 1);
  if (!pool.length) return [];
  const rng = new RNG(hashStr(`${planet.id}:${ps.day}:hire`));
  const n = rng.weighted([
    [0, 1],
    [1, 2.5],
    [2, 1.5],
  ] as const);
  const out: HireOffer[] = [];
  for (let i = 0; i < n; i++) {
    const shipId = rng.pick(pool);
    const def = shipDef(shipId);
    const id = `${planet.id}:${ps.day}:hire${i}`;
    const name = pilotName(rng);
    const blurb = rng.pick(BLURBS);
    if (ps.taken.includes(id)) continue;
    out.push({
      id,
      shipId,
      name,
      blurb,
      fee: Math.round((def.price * 0.06) / 50) * 50,
      wage: Math.round((def.price * 0.004) / 10) * 10,
    });
  }
  return out;
}

export function hireEscort(ps: PlayerState, o: HireOffer): Result {
  if (fleetCount(ps) >= MAX_ESCORTS) return fail(`Your fleet is full (${MAX_ESCORTS} escorts).`);
  if (ps.credits < o.fee) return fail("You can't afford the signing fee.");
  ps.credits -= o.fee;
  ps.taken.push(o.id);
  ps.escorts.push({ id: `esc-${o.id}`, shipId: o.shipId, name: o.name, hired: true, wage: o.wage, armor: 1 });
  return { ok: true, msg: `${o.name} has joined your fleet.` };
}

export function dismissEscort(ps: PlayerState, id: string): Result {
  const e = ps.escorts.find((x) => x.id === id);
  if (!e) return fail('No such escort.');
  ps.escorts = ps.escorts.filter((x) => x !== e);
  return { ok: true, msg: `${e.name} has left your fleet.` };
}

/** Captured ships can be sold for scrap and parts. */
export function escortSaleValue(e: EscortState) {
  return e.hired ? 0 : Math.round(shipDef(e.shipId).price * 0.3);
}

export function sellEscort(ps: PlayerState, id: string): Result {
  const e = ps.escorts.find((x) => x.id === id);
  if (!e || e.hired) return fail('You can only sell ships you own.');
  const value = escortSaleValue(e);
  ps.credits += value;
  ps.escorts = ps.escorts.filter((x) => x !== e);
  return { ok: true, msg: `Sold the ${shipDef(e.shipId).name}.` };
}

export function dailyWages(ps: PlayerState) {
  return ps.escorts.reduce((sum, e) => sum + (e.hired ? e.wage : 0), 0);
}

/** Odds that a boarding party takes the ship, from the relative size of the two crews. */
export function captureChance(player: Ship, target: Ship) {
  const attack = player.def.strength + 2 + player.def.len / 40;
  const defend = target.def.strength * 1.6 + 1;
  return clamp((attack / (attack + defend)) * 0.9, 0.05, 0.85);
}
