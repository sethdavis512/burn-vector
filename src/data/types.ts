import type { SoundId } from '../core/audio';

export type GovId = 'concord' | 'league' | 'independent' | 'corsair' | 'vael';
export type CommodityId = 'food' | 'industrial' | 'medical' | 'luxury' | 'metal' | 'equipment';
export type PriceLevel = 'L' | 'M' | 'H';

export type WeaponKind = 'bolt' | 'beam' | 'missile' | 'rocket' | 'torpedo';

export interface WeaponDef {
  kind: WeaponKind;
  /** Damage per hit; for beams, damage per second. */
  damage: number;
  shieldMult?: number;
  armorMult?: number;
  /** Seconds between shots (per mount group). */
  reload: number;
  speed: number;
  life: number;
  /** Beam length in px. */
  range?: number;
  /** Homing turn rate, rad/s. */
  turn?: number;
  ammo?: string;
  turret?: boolean;
  secondary?: boolean;
  spread?: number;
  color: string;
  core?: string;
  width?: number;
  length?: number;
  sound: SoundId;
  blast?: number;
  impact?: 'spark' | 'flash' | 'plasma' | 'explode';
}

export type OutfitCategory = 'Weapons' | 'Turrets' | 'Launchers' | 'Ammunition' | 'Systems' | 'Maps';

export interface OutfitDef {
  id: string;
  name: string;
  cat: OutfitCategory;
  price: number;
  mass: number;
  tech: number;
  max?: number;
  desc: string;
  weapon?: WeaponDef;
  /** This outfit is ammunition with this ammo id. */
  ammoId?: string;
  /** Launcher capacity: max ammo this launcher can hold. */
  ammoCap?: number;
  shield?: number;
  shieldRegen?: number;
  armor?: number;
  armorRegen?: number;
  cargo?: number;
  fuel?: number;
  speed?: number;
  accel?: number;
  turn?: number;
  afterburner?: number;
  ramscoop?: number;
  escapePod?: boolean;
  map?: { region?: string; radius?: number };
  gov?: GovId;
  reqRep?: number;
  hidden?: boolean;
}

export interface ArtPart {
  /** Flat [x, y, x, y, ...] polygon in normalized ship units (nose at +1). */
  pts: number[];
  mirror?: boolean;
  color?: string;
  z?: number;
}

export interface ShipArt {
  /** Right half outline, nose to tail; mirrored across the x axis. */
  hull: number[];
  parts?: ArtPart[];
  cockpit?: [number, number, number, number];
  engines?: [number, number, number][];
  lights?: [number, number][];
  lines?: number[][];
  core?: [number, number, number];
  turrets?: [number, number][];
}

export interface Livery {
  hull: string;
  accent: string;
  dark: string;
  glass: string;
  engine: string;
  glow?: string;
}

export interface ShipDef {
  id: string;
  name: string;
  cls: string;
  price: number;
  tech: number;
  shield: number;
  shieldRegen: number;
  armor: number;
  speed: number;
  accel: number;
  /** Degrees per second. */
  turn: number;
  fuel: number;
  cargo: number;
  mass: number;
  guns: number;
  turrets: number;
  len: number;
  strength: number;
  outfits: [string, number][];
  art: ShipArt;
  livery: Livery;
  desc: string;
  gov?: GovId;
  reqRep?: number;
  hidden?: boolean;
  noDisable?: boolean;
}

export type PlanetStyle =
  | 'terran'
  | 'ocean'
  | 'jungle'
  | 'desert'
  | 'red'
  | 'ice'
  | 'lava'
  | 'barren'
  | 'toxic'
  | 'gas'
  | 'gasblue'
  | 'crystal'
  | 'station-ring'
  | 'station-spindle'
  | 'station-rock'
  | 'station-military'
  | 'station-vael';

export interface PlanetDef {
  id: string;
  name: string;
  style: PlanetStyle;
  x: number;
  y: number;
  r: number;
  gov: GovId;
  /** 0 means nothing sold; otherwise the max tech level of goods sold. */
  tech: number;
  /** T trade, O outfitter, S shipyard, M missions, B bar, F fuel. */
  services: string;
  /** Six chars, commodity order, each L/M/H or '-' when not traded. */
  eco: string;
  desc: string;
  landable: boolean;
  systemId: string;
  seed: number;
}

export type TrafficId =
  | 'core'
  | 'corelow'
  | 'north'
  | 'border'
  | 'badlands'
  | 'pirate'
  | 'league'
  | 'frontier'
  | 'vael'
  | 'empty';

export interface SystemDef {
  id: string;
  name: string;
  x: number;
  y: number;
  gov: GovId | null;
  region: string;
  links: string[];
  star: { color: string; r: number } | null;
  star2?: { color: string; r: number; x: number; y: number };
  nebula: string;
  traffic: TrafficId;
  planets: PlanetDef[];
}
