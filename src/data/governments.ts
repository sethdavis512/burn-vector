import type { GovId } from './types';

export interface GovDef {
  id: GovId;
  name: string;
  short: string;
  color: string;
  enemies: GovId[];
  /** Ships of this government attack the player when rep falls below this. */
  hostileBelow: number;
  /** Planets of this government refuse landing below this rep. */
  landBelow: number;
  startRep: number;
  lawful: boolean;
  desc: string;
}

export const GOVS: Record<GovId, GovDef> = {
  concord: {
    id: 'concord',
    name: 'Terran Concord',
    short: 'Concord',
    color: '#5ea6ff',
    enemies: ['corsair'],
    hostileBelow: -60,
    landBelow: -150,
    startRep: 0,
    lawful: true,
    desc: 'The old core worlds of humanity, bound by treaty, tariff and an enormous navy.',
  },
  league: {
    id: 'league',
    name: 'Frontier League',
    short: 'League',
    color: '#5fd58c',
    enemies: ['corsair'],
    hostileBelow: -60,
    landBelow: -150,
    startRep: 0,
    lawful: true,
    desc: 'A young federation of eastern colonies that broke from Concord taxation and never looked back.',
  },
  independent: {
    id: 'independent',
    name: 'Independent Worlds',
    short: 'Independent',
    color: '#dcd3b4',
    enemies: ['corsair'],
    hostileBelow: -80,
    landBelow: -200,
    startRep: 0,
    lawful: true,
    desc: 'Free ports, merchant republics and frontier towns that answer to no flag but their own.',
  },
  corsair: {
    id: 'corsair',
    name: 'Corsair Clans',
    short: 'Corsairs',
    color: '#ff5f50',
    enemies: ['concord', 'league', 'independent', 'vael'],
    hostileBelow: 0,
    landBelow: -400,
    startRep: -40,
    lawful: false,
    desc: 'Raiders, smugglers and warlords of the Shoal. They respect strength and little else.',
  },
  vael: {
    id: 'vael',
    name: 'Vael Collective',
    short: 'Vael',
    color: '#c993ff',
    enemies: ['corsair'],
    hostileBelow: -20,
    landBelow: -60,
    startRep: 0,
    lawful: true,
    desc: 'An ancient, inscrutable species beyond the Shroud nebula. Their technology is decades ahead.',
  },
};

export const GOV_IDS = Object.keys(GOVS) as GovId[];

export function repTitle(gov: GovId, rep: number): string {
  if (gov === 'corsair') {
    if (rep >= 300) return 'Blood Brother';
    if (rep >= 100) return 'Trusted Smuggler';
    if (rep >= 0) return 'Tolerated';
    if (rep >= -200) return 'Mark';
    return 'Clan Enemy';
  }
  if (rep >= 600) return 'Hero';
  if (rep >= 250) return 'Honored';
  if (rep >= 80) return 'Trusted';
  if (rep >= 0) return 'Clean';
  if (rep >= -60) return 'Offender';
  if (rep >= -200) return 'Criminal';
  if (rep >= -500) return 'Wanted';
  return 'Enemy of the State';
}

export const COMBAT_RANKS: [number, string][] = [
  [0, 'Harmless'],
  [1, 'Fledgling'],
  [8, 'Novice'],
  [25, 'Competent'],
  [60, 'Capable'],
  [130, 'Seasoned'],
  [260, 'Veteran'],
  [480, 'Dangerous'],
  [800, 'Deadly'],
  [1300, 'Fearsome'],
  [2200, 'Legendary'],
];

export function combatRank(points: number): string {
  let title = COMBAT_RANKS[0]![1];
  for (const [min, name] of COMBAT_RANKS) if (points >= min) title = name;
  return title;
}
