import { RNG, fmt, hashStr } from '../core/math';
import { PLANETS, SYSTEMS, jumpDistances } from '../data/galaxy';
import { GOVS } from '../data/governments';
import { pirateName, pirateShipName } from '../data/names';
import { shipDef } from '../data/ships';
import type { PlanetDef } from '../data/types';
import { adjustRep, fmtDate, type Mission, type MissionType, type PlayerState } from './player';
import { chapter, storyOffer } from './story';

export function acceptMission(ps: PlayerState, m: Mission) {
  ps.missions.push(m);
  ps.flags.tutMission = true;
  if (!m.story) ps.taken.push(m.id);
  if (m.client) {
    ps.escorts.push({ id: `client-${m.id}`, shipId: m.client.shipId, name: m.client.name, hired: false, wage: 0, armor: 1, client: m.id });
  }
  if (m.story) chapter(m.story)?.onAccept?.(ps);
}

/** Drop a mission (abandoned or failed), along with any client ship. */
export function dropMission(ps: PlayerState, m: Mission, repPenalty: number) {
  ps.missions = ps.missions.filter((x) => x !== m);
  ps.escorts = ps.escorts.filter((e) => e.client !== m.id);
  if (repPenalty) adjustRep(ps, m.gov, -repPenalty);
}

const CARGO = [
  'machine parts',
  'medical supplies',
  'grain',
  'textiles',
  'data cores',
  'reactor coolant',
  'mining equipment',
  'art objects',
  'fabricator feedstock',
  'seed stock',
  'water purifiers',
  'construction alloys',
  'luxury foods',
  'scientific instruments',
  'bulk mail',
  'spare drive coils',
  'hydroponic pumps',
  'prefab habitat panels',
];

const CONTRABAND = ['unregistered weapons', 'stimulant chems', 'stolen data cores', 'counterfeit transit permits', 'banned cybernetics', 'untaxed spirits'];

const PASSENGERS: [string, number][] = [
  ['a retired schoolteacher', 1],
  ['a nervous young scientist', 1],
  ['a pair of honeymooners', 2],
  ['two Concord auditors', 2],
  ['a family of three', 3],
  ['three prospectors and their dog', 4],
  ['a traveling theater troupe', 6],
  ['a delegation of mining-guild officials', 5],
  ['a famous chef and her apprentices', 4],
  ['a pilgrim bound for a shrine', 1],
  ['four off-duty dockworkers', 4],
];

const BOUNTY_TIERS: { leader: string; escorts: string[]; pay: [number, number] }[] = [
  { leader: 'viper', escorts: [], pay: [7000, 11000] },
  { leader: 'viper', escorts: ['viper'], pay: [14000, 19000] },
  { leader: 'marauder', escorts: ['viper'], pay: [26000, 34000] },
  { leader: 'marauder', escorts: ['viper', 'viper'], pay: [40000, 54000] },
  { leader: 'reaver', escorts: ['marauder', 'viper'], pay: [85000, 120000] },
];

const round = (n: number, to = 50) => Math.round(n / to) * to;

function destinations(origin: PlanetDef, maxJumps: number, filter: (p: PlanetDef, jumps: number) => boolean) {
  const dists = jumpDistances(origin.systemId, maxJumps);
  const out: { p: PlanetDef; jumps: number }[] = [];
  for (const p of Object.values(PLANETS)) {
    if (!p.landable || p === origin) continue;
    const j = dists.get(p.systemId);
    if (j === undefined || j === 0) continue;
    if (filter(p, j)) out.push({ p, jumps: j });
  }
  return out;
}

/** The mission board for a planet on a given day. Deterministic per planet and day. */
export function missionsFor(planet: PlanetDef, ps: PlayerState): Mission[] {
  if (!planet.services.includes('M')) return [];
  const rng = new RNG(hashStr(`${planet.id}:${ps.day}`));
  const sys = SYSTEMS[planet.systemId]!;
  const lawless = planet.gov === 'corsair';
  const vael = planet.gov === 'vael';
  const lawful = (p: PlanetDef) => p.gov !== 'corsair' && (vael ? p.gov === 'vael' : p.gov !== 'vael');
  const normal = destinations(planet, 5, (p) => (lawless ? true : lawful(p)));
  const count = rng.int(planet.tech >= 3 ? 4 : 2, planet.tech >= 4 ? 7 : 5);
  const out: Mission[] = [];
  const weights: [MissionType, number][] = lawless
    ? [
        ['smuggle', 4],
        ['cargo', 2],
        ['passengers', 1],
      ]
    : [
        ['cargo', 5],
        ['rush', 2],
        ['passengers', 2.5],
        ['courier', 1.5],
        ['bounty', vael ? 0.6 : 2],
        ['smuggle', sys.region === 'shoal' ? 1.5 : 0],
      ];

  const story = storyOffer(planet, ps);
  if (story) out.push(story);
  for (let i = 0; i < count; i++) {
    const id = `${planet.id}:${ps.day}:${i}`;
    const type = rng.weighted(weights);
    const m = makeMission(type, id, planet, ps, rng, normal);
    if (m && !ps.taken.includes(id)) out.push(m);
  }
  return out;
}

function makeMission(
  type: MissionType,
  id: string,
  planet: PlanetDef,
  ps: PlayerState,
  rng: RNG,
  pool: { p: PlanetDef; jumps: number }[],
): Mission | null {
  const base = { id, type, issuer: planet.id, gov: planet.gov };
  const near = (max: number) => pool.filter((d) => d.jumps <= max);
  switch (type) {
    case 'cargo': {
      const opts = near(4);
      if (!opts.length) return null;
      const { p, jumps } = rng.pick(opts);
      const big = rng.chance(0.2);
      const tons = big ? rng.int(30, 90) : rng.int(3, 22);
      const cargo = rng.pick(CARGO);
      const pay = round((700 + jumps * (420 + tons * 52)) * rng.range(0.9, 1.25));
      const deadline = ps.day + jumps * 3 + rng.int(4, 8);
      return {
        ...base,
        title: `Deliver ${tons}t of ${cargo} to ${p.name}`,
        brief: `A shipping broker needs ${tons} tons of ${cargo} delivered to ${p.name} in the ${SYSTEMS[p.systemId]!.name} system by ${fmtDate(deadline)}. Payment on delivery: ${fmt(pay)} credits.`,
        destSystem: p.systemId,
        destPlanet: p.id,
        cargoName: cargo,
        tons,
        pay,
        deadline,
      };
    }
    case 'rush': {
      const opts = near(3);
      if (!opts.length) return null;
      const { p, jumps } = rng.pick(opts);
      const tons = rng.int(1, 10);
      const cargo = rng.pick(CARGO);
      const pay = round((1400 + jumps * (950 + tons * 85)) * rng.range(0.95, 1.3));
      const deadline = ps.day + jumps + 1;
      return {
        ...base,
        title: `RUSH: ${cargo} to ${p.name}`,
        brief: `Time-critical freight: ${tons} tons of ${cargo} must reach ${p.name} (${SYSTEMS[p.systemId]!.name}) no later than ${fmtDate(deadline)}. No excuses, no extensions. Pays ${fmt(pay)} credits.`,
        destSystem: p.systemId,
        destPlanet: p.id,
        cargoName: cargo,
        tons,
        pay,
        deadline,
      };
    }
    case 'passengers': {
      const opts = near(4);
      if (!opts.length) return null;
      const { p, jumps } = rng.pick(opts);
      const [who, n] = rng.pick(PASSENGERS);
      const pay = round((900 + jumps * (520 + n * 170)) * rng.range(0.9, 1.2));
      const deadline = ps.day + jumps * 2 + rng.int(3, 6);
      return {
        ...base,
        title: `Passage to ${p.name} for ${n}`,
        brief: `${capitalize(who)} ${n > 1 ? 'need' : 'needs'} passage to ${p.name} in the ${SYSTEMS[p.systemId]!.name} system, arriving by ${fmtDate(deadline)}. Requires ${n} ton${n > 1 ? 's' : ''} of space for berths. Fare: ${fmt(pay)} credits.`,
        destSystem: p.systemId,
        destPlanet: p.id,
        cargoName: `${n} passenger${n > 1 ? 's' : ''}`,
        tons: n,
        pay,
        deadline,
      };
    }
    case 'courier': {
      const opts = near(4);
      if (!opts.length) return null;
      const { p, jumps } = rng.pick(opts);
      const pay = round((1200 + jumps * 1150) * rng.range(0.9, 1.25));
      const deadline = ps.day + jumps + 2;
      return {
        ...base,
        title: `Courier packet to ${p.name}`,
        brief: `Carry a sealed data packet to ${p.name} (${SYSTEMS[p.systemId]!.name}) by ${fmtDate(deadline)}. Takes no cargo space. Payment: ${fmt(pay)} credits.`,
        destSystem: p.systemId,
        destPlanet: p.id,
        cargoName: 'data packet',
        tons: 0,
        pay,
        deadline,
      };
    }
    case 'bounty': {
      const dists = jumpDistances(planet.systemId, 4);
      const hunting = [...dists.entries()]
        .filter(([sid, j]) => {
          const s = SYSTEMS[sid]!;
          return j >= 1 && s.region !== 'vael' && ['border', 'badlands', 'pirate', 'frontier', 'corelow'].includes(s.traffic);
        })
        .map(([sid, j]) => ({ sid, j }));
      if (!hunting.length) return null;
      const { sid, j } = rng.pick(hunting);
      const maxTier = Math.min(4, 1 + Math.floor(Math.log2(1 + ps.combat / 12)));
      const tier = rng.int(0, maxTier);
      const t = BOUNTY_TIERS[tier]!;
      const pay = round(rng.range(t.pay[0], t.pay[1]), 500);
      const name = pirateName(rng);
      const shipName = pirateShipName(rng);
      const deadline = ps.day + j * 2 + 12;
      const dsys = SYSTEMS[sid]!;
      return {
        ...base,
        title: `Bounty: ${name}`,
        brief: `The ${GOVS[planet.gov].name} has posted a bounty of ${fmt(pay)} credits on the corsair ${name}, last seen in the ${dsys.name} system aboard the ${shipDef(t.leader).name} "${shipName}"${t.escorts.length ? ` with ${t.escorts.length} wingm${t.escorts.length > 1 ? 'en' : 'an'}` : ''}. Destroy the ship before ${fmtDate(deadline)} to collect.`,
        destSystem: sid,
        tons: 0,
        pay,
        deadline,
        target: { name, ship: t.leader, shipName, escorts: t.escorts },
      };
    }
    case 'smuggle': {
      const opts = pool.filter((d) => d.jumps <= 4 && d.p.gov !== 'corsair');
      if (!opts.length) return null;
      const { p, jumps } = rng.pick(opts);
      const tons = rng.int(3, 18);
      const goods = rng.pick(CONTRABAND);
      const pay = round((2200 + jumps * (750 + tons * 95)) * rng.range(0.9, 1.3));
      const deadline = ps.day + jumps * 2 + rng.int(3, 6);
      return {
        ...base,
        gov: 'corsair',
        title: `Smuggle ${goods} to ${p.name}`,
        brief: `A man with a scarred face wants ${tons} tons of ${goods} delivered to a contact on ${p.name} (${SYSTEMS[p.systemId]!.name}) by ${fmtDate(deadline)}. He pays ${fmt(pay)} credits and asks no questions. You should ask none either.`,
        destSystem: p.systemId,
        destPlanet: p.id,
        cargoName: goods,
        tons,
        pay,
        deadline,
      };
    }
  }
  return null;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
