import type { GovId, SystemDef, TrafficId } from './types';

export type Role = 'trader' | 'patrol' | 'pirate' | 'hunter' | 'escort';

export interface FleetDef {
  id: string;
  /** 'local' resolves to the system's lawful government. */
  gov: GovId | 'local';
  role: Role;
  leader: string[];
  escorts?: string[];
  escortCount?: [number, number];
}

export const FLEETS: Record<string, FleetDef> = {
  trader_small: { id: 'trader_small', gov: 'local', role: 'trader', leader: ['kestrel', 'kestrel', 'mule', 'courier', 'starling'] },
  trader_freight: { id: 'trader_freight', gov: 'local', role: 'trader', leader: ['drover', 'mule', 'drover'] },
  trader_convoy: {
    id: 'trader_convoy',
    gov: 'local',
    role: 'trader',
    leader: ['leviathan', 'drover'],
    escorts: ['wren', 'talon', 'wren'],
    escortCount: [1, 2],
  },
  smuggler: { id: 'smuggler', gov: 'corsair', role: 'trader', leader: ['courier', 'mule', 'starling', 'kestrel'] },
  concord_patrol: { id: 'concord_patrol', gov: 'concord', role: 'patrol', leader: ['cutter'], escorts: ['cutter'], escortCount: [0, 1] },
  concord_squadron: { id: 'concord_squadron', gov: 'concord', role: 'patrol', leader: ['frigate'], escorts: ['cutter'], escortCount: [1, 2] },
  concord_fleet: {
    id: 'concord_fleet',
    gov: 'concord',
    role: 'patrol',
    leader: ['dreadnought'],
    escorts: ['frigate', 'cutter', 'cutter'],
    escortCount: [2, 3],
  },
  league_patrol: { id: 'league_patrol', gov: 'league', role: 'patrol', leader: ['raptor'], escorts: ['raptor'], escortCount: [1, 1] },
  league_squadron: { id: 'league_squadron', gov: 'league', role: 'patrol', leader: ['warden'], escorts: ['raptor'], escortCount: [1, 2] },
  militia: { id: 'militia', gov: 'independent', role: 'patrol', leader: ['wren', 'talon'], escorts: ['wren'], escortCount: [0, 1] },
  militia_heavy: { id: 'militia_heavy', gov: 'independent', role: 'patrol', leader: ['bastion', 'ranger'], escorts: ['talon', 'wren'], escortCount: [0, 2] },
  hunter: { id: 'hunter', gov: 'independent', role: 'hunter', leader: ['talon', 'ranger', 'wren'] },
  corsair_lone: { id: 'corsair_lone', gov: 'corsair', role: 'pirate', leader: ['viper'], escorts: ['viper'], escortCount: [0, 1] },
  corsair_pack: { id: 'corsair_pack', gov: 'corsair', role: 'pirate', leader: ['marauder'], escorts: ['viper'], escortCount: [1, 2] },
  corsair_warband: {
    id: 'corsair_warband',
    gov: 'corsair',
    role: 'pirate',
    leader: ['reaver'],
    escorts: ['marauder', 'viper', 'viper'],
    escortCount: [2, 3],
  },
  vael_patrol: { id: 'vael_patrol', gov: 'vael', role: 'patrol', leader: ['vdart'], escorts: ['vdart'], escortCount: [1, 2] },
  vael_wing: { id: 'vael_wing', gov: 'vael', role: 'patrol', leader: ['vlancer'], escorts: ['vdart'], escortCount: [1, 2] },
  vael_spire: { id: 'vael_spire', gov: 'vael', role: 'patrol', leader: ['vspire'], escorts: ['vlancer', 'vdart'], escortCount: [2, 2] },
  vael_trader: { id: 'vael_trader', gov: 'vael', role: 'trader', leader: ['vlancer', 'vdart'] },
};

export interface TrafficDef {
  /** Average seconds between spawns. */
  rate: number;
  max: number;
  initial: number;
  fleets: [string, number][];
}

export const TRAFFIC: Record<TrafficId, TrafficDef> = {
  core: {
    rate: 8,
    max: 12,
    initial: 6,
    fleets: [
      ['trader_small', 5],
      ['trader_freight', 3],
      ['trader_convoy', 1],
      ['concord_patrol', 3],
      ['concord_squadron', 1],
      ['concord_fleet', 0.12],
      ['corsair_lone', 0.3],
    ],
  },
  corelow: {
    rate: 11,
    max: 10,
    initial: 5,
    fleets: [
      ['trader_small', 5],
      ['trader_freight', 2],
      ['concord_patrol', 2.5],
      ['concord_squadron', 0.5],
      ['corsair_lone', 1],
      ['hunter', 0.5],
    ],
  },
  border: {
    rate: 10,
    max: 11,
    initial: 6,
    fleets: [
      ['trader_small', 3],
      ['trader_freight', 2],
      ['trader_convoy', 0.8],
      ['corsair_lone', 2],
      ['corsair_pack', 1],
      ['gov_patrol', 1.6],
      ['hunter', 1],
      ['smuggler', 0.6],
    ],
  },
  north: {
    rate: 9,
    max: 11,
    initial: 6,
    fleets: [
      ['trader_small', 5],
      ['trader_freight', 3],
      ['trader_convoy', 1],
      ['militia', 2.5],
      ['militia_heavy', 0.5],
      ['corsair_lone', 1],
      ['hunter', 0.7],
      ['smuggler', 0.5],
    ],
  },
  badlands: {
    rate: 11,
    max: 10,
    initial: 5,
    fleets: [
      ['corsair_lone', 3],
      ['corsair_pack', 2],
      ['corsair_warband', 0.3],
      ['smuggler', 2],
      ['trader_small', 1],
      ['hunter', 1],
    ],
  },
  pirate: {
    rate: 8,
    max: 13,
    initial: 7,
    fleets: [
      ['corsair_lone', 3],
      ['corsair_pack', 3],
      ['corsair_warband', 0.8],
      ['smuggler', 2],
    ],
  },
  league: {
    rate: 9,
    max: 11,
    initial: 6,
    fleets: [
      ['trader_small', 4],
      ['trader_freight', 2],
      ['trader_convoy', 0.6],
      ['league_patrol', 3],
      ['league_squadron', 1],
      ['corsair_lone', 0.7],
    ],
  },
  frontier: {
    rate: 14,
    max: 8,
    initial: 4,
    fleets: [
      ['trader_small', 3],
      ['trader_freight', 1],
      ['gov_patrol', 1.5],
      ['corsair_lone', 1.2],
      ['hunter', 0.5],
    ],
  },
  vael: {
    rate: 11,
    max: 9,
    initial: 5,
    fleets: [
      ['vael_patrol', 3],
      ['vael_wing', 1.2],
      ['vael_trader', 2],
      ['vael_spire', 0.2],
    ],
  },
  empty: {
    rate: 22,
    max: 5,
    initial: 2,
    fleets: [
      ['vael_patrol', 1],
      ['corsair_lone', 0.6],
      ['trader_small', 0.6],
    ],
  },
};

export function resolveFleet(id: string, sys: SystemDef): FleetDef {
  if (id === 'gov_patrol') {
    const map: Record<string, string> = {
      concord: 'concord_patrol',
      league: 'league_patrol',
      independent: 'militia',
      vael: 'vael_patrol',
      corsair: 'corsair_lone',
    };
    return FLEETS[map[sys.gov ?? 'independent'] ?? 'militia']!;
  }
  const f = FLEETS[id];
  if (!f) throw new Error(`Unknown fleet ${id}`);
  return f;
}

export function fleetGov(f: FleetDef, sys: SystemDef): GovId {
  if (f.gov !== 'local') return f.gov;
  if (sys.gov === 'concord' || sys.gov === 'league' || sys.gov === 'independent' || sys.gov === 'vael') return sys.gov;
  return 'independent';
}
