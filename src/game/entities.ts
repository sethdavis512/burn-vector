import { OUTFITS } from '../data/outfits';
import type { Role } from '../data/fleets';
import type { CommodityId, GovId, OutfitDef, PlanetDef, ShipDef, WeaponDef } from '../data/types';
import { computeStats, type Loadout, type ShipStats } from './stats';

export type ShipState = 'flying' | 'landing' | 'takeoff' | 'jumpout' | 'jumpin';

export interface Mount {
  o: OutfitDef;
  w: WeaponDef;
  count: number;
  cd: number;
  /** Next barrel to fire, for alternating multi-gun mounts. */
  barrel: number;
  aim: number;
  beamOn: boolean;
  beamLen: number;
  beamAngle: number;
  beamX: number;
  beamY: number;
}

export type AIMode = 'travel' | 'land' | 'jump' | 'fight' | 'flee' | 'board' | 'follow';

export interface AIState {
  role: Role;
  mode: AIMode;
  destX: number;
  destY: number;
  planet: PlanetDef | null;
  jumpAngle: number;
  think: number;
  leaveAt: number;
  bravery: number;
  boardT: number;
  secCd: number;
  attackedAt: number;
  hunting: boolean;
}

export class Ship {
  static nextId = 1;
  id = Ship.nextId++;
  def: ShipDef;
  gov: GovId;
  name: string;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  stats!: ShipStats;
  outfits: Loadout = {};
  ammo: Record<string, number> = {};
  shield = 0;
  armor = 0;
  fuel = 0;
  guns: Mount[] = [];
  turrets: Mount[] = [];
  secondaries: Mount[] = [];
  secIndex = 0;
  isPlayer = false;
  ai: AIState | null = null;
  target: Ship | null = null;
  thrust = 0;
  thrusting = false;
  afterburning = false;
  fireGuns = false;
  fireTurrets = false;
  fireSecondary = false;
  disabled = false;
  dead = false;
  dieT = 0;
  gone = false;
  state: ShipState = 'flying';
  stateT = 0;
  stateDur = 1;
  scale = 1;
  alpha = 1;
  landPlanet: PlanetDef | null = null;
  jumpAngle = 0;
  shieldFlash = 0;
  shieldHitAngle = 0;
  hitFlash = 0;
  cargo: Partial<Record<CommodityId, number>> = {};
  credits = 0;
  plundered = false;
  provokedByPlayer = false;
  attackers = new Set<number>();
  lastAttacker: Ship | null = null;
  hitAt = -99;
  /** Belongs to the player's fleet. */
  playerEscort = false;
  /** A mission client: follows the player and never fights. */
  client = false;
  escortId: string | null = null;
  leader: Ship | null = null;
  formX = 0;
  formY = 0;
  missionId: string | null = null;
  title: string | null = null;
  lightPhase = Math.random() * 10;
  fxT = 0;

  constructor(def: ShipDef, gov: GovId, outfits: Loadout, ammo: Record<string, number> = {}) {
    this.def = def;
    this.gov = gov;
    this.name = def.name;
    this.setLoadout(outfits, ammo);
    this.shield = this.stats.maxShield;
    this.armor = this.stats.maxArmor;
    this.fuel = this.stats.maxFuel;
  }

  setLoadout(outfits: Loadout, ammo: Record<string, number>) {
    this.outfits = outfits;
    this.ammo = ammo;
    this.stats = computeStats(this.def, outfits);
    this.guns = [];
    this.turrets = [];
    this.secondaries = [];
    for (const [id, n] of Object.entries(outfits)) {
      const o = OUTFITS[id];
      if (!o?.weapon || n <= 0) continue;
      const m: Mount = {
        o,
        w: o.weapon,
        count: n,
        cd: Math.random() * o.weapon.reload,
        barrel: 0,
        aim: 0,
        beamOn: false,
        beamLen: 0,
        beamAngle: 0,
        beamX: 0,
        beamY: 0,
      };
      if (o.weapon.secondary) this.secondaries.push(m);
      else if (o.weapon.turret) this.turrets.push(m);
      else this.guns.push(m);
    }
    if (this.secIndex >= this.secondaries.length) this.secIndex = 0;
    this.shield = Math.min(this.shield, this.stats.maxShield);
    this.armor = Math.min(this.armor, this.stats.maxArmor);
    this.fuel = Math.min(this.fuel, this.stats.maxFuel);
  }

  get radius() {
    return this.def.len * 0.42 * this.scale;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get active() {
    return this.state === 'flying' && !this.dead && !this.gone;
  }

  secondary(): Mount | null {
    return this.secondaries[this.secIndex] ?? null;
  }

  cycleSecondary() {
    if (this.secondaries.length === 0) return;
    this.secIndex = (this.secIndex + 1) % this.secondaries.length;
  }

  hasAmmoFor(m: Mount) {
    return !m.w.ammo || (this.ammo[m.w.ammo] ?? 0) > 0;
  }

  /** Strongest forward gun, used by AI for lead calculation. */
  mainGun(): Mount | null {
    let best: Mount | null = null;
    for (const m of this.guns) if (!best || m.w.damage * m.count > best.w.damage * best.count) best = m;
    return best;
  }

  gunRange(): number {
    const g = this.mainGun();
    if (!g) return 0;
    return g.w.kind === 'beam' ? g.w.range ?? 400 : g.w.speed * g.w.life;
  }

  repair() {
    this.shield = this.stats.maxShield;
    this.armor = this.stats.maxArmor;
    this.disabled = false;
  }
}

export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  life: number;
  max: number;
  owner: Ship;
  w: WeaponDef;
  target: Ship | null;
  dead = false;
  trailT = 0;
  speed: number;

  constructor(owner: Ship, w: WeaponDef, x: number, y: number, angle: number, target: Ship | null, inherit = true) {
    this.owner = owner;
    this.w = w;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = w.kind === 'missile' || w.kind === 'torpedo' ? w.speed * 0.45 : w.speed;
    this.vx = Math.cos(angle) * this.speed + (inherit ? owner.vx : 0);
    this.vy = Math.sin(angle) * this.speed + (inherit ? owner.vy : 0);
    this.life = w.life;
    this.max = w.life;
    this.target = target;
  }
}
