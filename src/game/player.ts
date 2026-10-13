import { COMMODITIES } from '../data/commodities';
import { GOV_IDS, GOVS } from '../data/governments';
import { SYSTEM_LIST, SYSTEMS, jumpDistances } from '../data/galaxy';
import { shipDef } from '../data/ships';
import type { CommodityId, GovId } from '../data/types';
import { computeStats, defaultLoadout, type Loadout } from './stats';

export type MissionType = 'cargo' | 'rush' | 'passengers' | 'courier' | 'bounty' | 'smuggle' | 'story';

export interface Mission {
  id: string;
  type: MissionType;
  title: string;
  brief: string;
  issuer: string;
  gov: GovId;
  destSystem: string;
  destPlanet?: string;
  cargoName?: string;
  tons: number;
  pay: number;
  deadline?: number;
  target?: { name: string; ship: string; shipName: string; escorts: string[] };
  /** Story chapter this mission belongs to. */
  story?: number;
  /** For kill missions: after the target dies, land here to be paid. */
  returnTo?: string;
  targetDead?: boolean;
  /** A ship that must reach the destination alive. */
  client?: { shipId: string; name: string };
  /** Hostiles that warp in when entering `system` ('*' = first system after leaving). */
  ambush?: { system: string; leader: string; escorts: string[]; title: string; done?: boolean };
}

export interface EscortState {
  id: string;
  shipId: string;
  name: string;
  /** Hired mercenaries draw a daily wage; captured ships are yours outright. */
  hired: boolean;
  wage: number;
  /** Armor fraction carried between systems. */
  armor: number;
  /** Mission id when this ship is a client under the player's protection. */
  client?: string;
}

export const MAX_ESCORTS = 4;

/** Escorts that count against the fleet limit (mission clients don't). */
export function fleetCount(p: { escorts: EscortState[] }) {
  return p.escorts.filter((e) => !e.client).length;
}

export interface PlayerState {
  v: 1;
  id: string;
  name: string;
  shipName: string;
  shipId: string;
  outfits: Loadout;
  ammo: Record<string, number>;
  credits: number;
  cargo: Partial<Record<CommodityId, number>>;
  /** Average purchase price per commodity, for profit display. */
  cargoCost: Partial<Record<CommodityId, number>>;
  fuel: number;
  system: string;
  planet: string;
  day: number;
  explored: string[];
  known: string[];
  rep: Record<GovId, number>;
  kills: number;
  combat: number;
  missions: Mission[];
  taken: string[];
  escorts: EscortState[];
  flags: Record<string, number | string | boolean>;
  stats: { jumps: number; landings: number; profit: number; missionsDone: number; bounties: number };
  created: number;
  saved: number;
}

export interface StartOption {
  id: string;
  title: string;
  blurb: string;
  system: string;
  planet: string;
  gov: GovId;
  region: string;
}

export const STARTS: StartOption[] = [
  {
    id: 'concord',
    title: 'Concord Citizen',
    blurb: 'Born under the blue banner. Begin on Earth with clean papers, a modest loan paid off, and the whole core at your feet.',
    system: 'sol',
    planet: 'earth',
    gov: 'concord',
    region: 'concord',
  },
  {
    id: 'free',
    title: 'Free Trader',
    blurb: 'A northern spacer with grease under your nails. Begin at Port Arcturus with charts of the free worlds.',
    system: 'arcturus',
    planet: 'portarcturus',
    gov: 'independent',
    region: 'north',
  },
  {
    id: 'league',
    title: 'League Colonist',
    blurb: 'A child of the frontier. Begin on New Haven, where the League is young, bold and short of good pilots.',
    system: 'rigel',
    planet: 'newhaven',
    gov: 'league',
    region: 'league',
  },
];

export const START_CREDITS = 12000;
const EPOCH = Date.UTC(2847, 0, 1);

export function fmtDate(day: number): string {
  const d = new Date(EPOCH + day * 86400000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function newPlayer(name: string, shipName: string, start: StartOption): PlayerState {
  const def = shipDef('kestrel');
  const { outfits, ammo } = defaultLoadout(def);
  const rep = Object.fromEntries(GOV_IDS.map((g) => [g, GOVS[g].startRep])) as Record<GovId, number>;
  rep[start.gov] += 20;
  const known = SYSTEM_LIST.filter((s) => s.region === start.region).map((s) => s.id);
  const p: PlayerState = {
    v: 1,
    id: `pilot-${Date.now().toString(36)}`,
    name,
    shipName,
    shipId: def.id,
    outfits,
    ammo,
    credits: START_CREDITS,
    cargo: {},
    cargoCost: {},
    fuel: computeStats(def, outfits).maxFuel,
    system: start.system,
    planet: start.planet,
    day: 0,
    explored: [start.system],
    known,
    rep,
    kills: 0,
    combat: 0,
    missions: [],
    taken: [],
    escorts: [],
    flags: { start: start.id },
    stats: { jumps: 0, landings: 0, profit: 0, missionsDone: 0, bounties: 0 },
    created: Date.now(),
    saved: Date.now(),
  };
  return p;
}

/** Fill in fields added after a save was written. */
export function normalizePlayer(p: PlayerState): PlayerState {
  p.escorts ??= [];
  p.taken ??= [];
  p.flags ??= {};
  p.cargoCost ??= {};
  for (const g of GOV_IDS) p.rep[g] ??= GOVS[g].startRep;
  return p;
}

export function playerStats(p: PlayerState) {
  return computeStats(shipDef(p.shipId), p.outfits);
}

export function commodityTons(p: PlayerState): number {
  let t = 0;
  for (const c of COMMODITIES) t += p.cargo[c.id] ?? 0;
  return t;
}

export function missionTons(p: PlayerState): number {
  return p.missions.reduce((sum, m) => sum + m.tons, 0);
}

export function cargoUsed(p: PlayerState): number {
  return commodityTons(p) + missionTons(p);
}

export function freeCargo(p: PlayerState): number {
  return playerStats(p).cargo - cargoUsed(p);
}

export function isKnown(p: PlayerState, id: string) {
  return p.known.includes(id) || p.explored.includes(id);
}

/** Systems that appear on the map: known ones and the neighbors of explored ones. */
export function visibleSystems(p: PlayerState): Set<string> {
  const vis = new Set<string>([...p.known, ...p.explored]);
  for (const id of [...vis]) for (const n of SYSTEMS[id]!.links) vis.add(n);
  return vis;
}

export function revealRegion(p: PlayerState, region: string): number {
  let added = 0;
  for (const s of SYSTEM_LIST) {
    if (s.region === region && !isKnown(p, s.id)) {
      p.known.push(s.id);
      added++;
    }
  }
  return added;
}

export function revealRadius(p: PlayerState, from: string, radius: number): number {
  let added = 0;
  for (const id of jumpDistances(from, radius).keys()) {
    if (!isKnown(p, id)) {
      p.known.push(id);
      added++;
    }
  }
  return added;
}

export function adjustRep(p: PlayerState, gov: GovId, delta: number) {
  p.rep[gov] = Math.max(-2000, Math.min(2000, (p.rep[gov] ?? 0) + delta));
}
