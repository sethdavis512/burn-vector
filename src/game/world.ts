import { audio } from '../core/audio';
import { TAU, angleDiff, interceptTime, pick, rand, randInt, segmentPointDist, weightedPick } from '../core/math';
import { COMMODITIES } from '../data/commodities';
import { TRAFFIC, fleetGov, resolveFleet, type Role } from '../data/fleets';
import { SYSTEMS } from '../data/galaxy';
import { GOVS } from '../data/governments';
import { shipDef } from '../data/ships';
import type { GovId, PlanetDef, SystemDef, WeaponDef } from '../data/types';
import { chooseGoal, updateAI } from './ai';
import { ARRIVE_DIST, DISABLE_FRAC } from './constants';
import { Effects } from './effects';
import { Projectile, Ship, type Mount } from './entities';
import { escortDisplayName } from './escorts';
import type { EscortState, PlayerState } from './player';
import { defaultLoadout } from './stats';


export interface WorldHooks {
  message(text: string, color?: string): void;
  kill(victim: Ship, killer: Ship | null): void;
  playerLanded(planet: PlanetDef): void;
  playerJumped(): void;
  playerDisabled(): void;
  playerDestroyed(): void;
  playerBoarded(by: Ship): void;
  aggression(victim: Ship, gov: GovId): void;
}

export class World {
  sys: SystemDef;
  ps: PlayerState;
  ships: Ship[] = [];
  projectiles: Projectile[] = [];
  fx = new Effects();
  player: Ship | null = null;
  time = 0;
  spawnT = 0;
  angered = new Set<GovId>();
  bribed = new Set<GovId>();
  shake = 0;
  private hooks: WorldHooks;

  constructor(ps: PlayerState, sys: SystemDef, hooks: WorldHooks) {
    this.ps = ps;
    this.sys = sys;
    this.hooks = hooks;
  }

  // ── Spawning ────────────────────────────────────────────────────

  populate() {
    const t = TRAFFIC[this.sys.traffic];
    for (let i = 0; i < t.initial; i++) this.spawnFleet('initial');
    this.spawnT = rand(3, t.rate);
  }

  npcCount() {
    let n = 0;
    for (const s of this.ships) if (!s.isPlayer && !s.gone) n++;
    return n;
  }

  /** Whether a ship of `gov` would land at this planet. */
  planetWelcomes(p: PlanetDef, gov: GovId) {
    if (!p.landable) return false;
    if (gov === 'corsair') return p.gov === 'corsair' || (p.gov === 'independent' && this.sys.region === 'shoal');
    if (p.gov === 'corsair') return false;
    if (gov === 'vael' || p.gov === 'vael') return gov === p.gov;
    return true;
  }

  makeShip(defId: string, gov: GovId, role: Role): Ship {
    const def = shipDef(defId);
    const { outfits, ammo } = defaultLoadout(def);
    const s = new Ship(def, gov, outfits, ammo);
    s.angle = rand(0, TAU);
    s.ai = {
      role,
      mode: 'travel',
      destX: 0,
      destY: 0,
      planet: null,
      jumpAngle: 0,
      think: rand(0, 0.5),
      leaveAt: this.time + rand(45, 110),
      bravery: role === 'trader' ? rand(0.55, 0.9) : role === 'pirate' ? rand(0.15, 0.35) : rand(0.08, 0.25),
      boardT: 0,
      secCd: rand(1, 3),
      attackedAt: -99,
      hunting: false,
    };
    if (role === 'trader') {
      let room = Math.floor(def.cargo * rand(0.3, 0.9));
      while (room > 0) {
        const c = pick(COMMODITIES);
        const n = Math.min(room, randInt(2, Math.max(2, Math.ceil(def.cargo / 3))));
        s.cargo[c.id] = (s.cargo[c.id] ?? 0) + n;
        room -= n;
      }
    }
    s.credits = Math.round(rand(150, 1200) * (1 + def.strength * 0.4));
    return s;
  }

  spawnFleet(how: 'initial' | 'jumpin' | 'takeoff', fleetId?: string): Ship[] {
    const t = TRAFFIC[this.sys.traffic];
    const f = resolveFleet(fleetId ?? weightedPick(t.fleets), this.sys);
    const gov = fleetGov(f, this.sys);
    let planet: PlanetDef | null = null;
    if (how === 'takeoff') {
      const options = this.sys.planets.filter((p) => this.planetWelcomes(p, gov));
      if (options.length) planet = pick(options);
      else how = 'jumpin';
    }
    const leader = this.makeShip(pick(f.leader), gov, f.role);
    const group = [leader];
    if (f.escorts && f.escortCount) {
      const n = randInt(f.escortCount[0], f.escortCount[1]);
      for (let i = 0; i < n; i++) {
        const e = this.makeShip(pick(f.escorts), gov, 'escort');
        e.leader = leader;
        const side = i % 2 === 0 ? 1 : -1;
        const row = Math.floor(i / 2) + 1;
        e.formX = -row * (leader.def.len * 0.45 + 34);
        e.formY = side * row * (leader.def.len * 0.4 + 30);
        group.push(e);
      }
    }
    this.placeGroup(group, how, planet);
    this.ships.push(...group);
    return group;
  }

  placeGroup(group: Ship[], how: 'initial' | 'jumpin' | 'takeoff', planet: PlanetDef | null) {
    const leader = group[0]!;
    if (how === 'jumpin') {
      const originId = pick(this.sys.links);
      const o = SYSTEMS[originId]!;
      const a = Math.atan2(o.y - this.sys.y, o.x - this.sys.x);
      const lat = rand(-500, 500);
      const cx = Math.cos(a) * ARRIVE_DIST - Math.sin(a) * lat;
      const cy = Math.sin(a) * ARRIVE_DIST + Math.cos(a) * lat;
      const heading = a + Math.PI + rand(-0.35, 0.35);
      for (const s of group) {
        const { x, y } = this.formationPos(leader, s, cx, cy, heading);
        s.x = x;
        s.y = y;
        s.angle = heading;
        s.state = 'jumpin';
        s.stateT = 0;
        s.stateDur = 0.9;
        s.alpha = 0.3;
      }
    } else if (how === 'takeoff' && planet) {
      for (const s of group) {
        s.x = planet.x + rand(-planet.r * 0.3, planet.r * 0.3);
        s.y = planet.y + rand(-planet.r * 0.3, planet.r * 0.3);
        s.angle = rand(0, TAU);
        s.vx = Math.cos(s.angle) * 40;
        s.vy = Math.sin(s.angle) * 40;
        s.state = 'takeoff';
        s.stateT = 0;
        s.stateDur = 1.4 + rand(0, 0.6);
        s.scale = 0.2;
        s.alpha = 0;
        if (s.ai) s.ai.planet = planet;
      }
    } else {
      const a = rand(0, TAU);
      const r = rand(350, 2000);
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r;
      const heading = rand(0, TAU);
      for (const s of group) {
        const { x, y } = this.formationPos(leader, s, cx, cy, heading);
        s.x = x;
        s.y = y;
        s.angle = heading;
        s.vx = Math.cos(heading) * s.stats.maxSpeed * 0.5;
        s.vy = Math.sin(heading) * s.stats.maxSpeed * 0.5;
      }
    }
    chooseGoal(this, leader, how === 'takeoff' ? planet : null);
    for (const s of group) if (s !== leader && s.ai) s.ai.mode = 'follow';
  }

  private formationPos(leader: Ship, s: Ship, cx: number, cy: number, heading: number) {
    if (s === leader) return { x: cx, y: cy };
    const c = Math.cos(heading);
    const sn = Math.sin(heading);
    return { x: cx + s.formX * c - s.formY * sn, y: cy + s.formX * sn + s.formY * c };
  }

  /** Spawn a specific hostile group (bounty targets, ambushes). */
  spawnSpecial(leaderDef: string, gov: GovId, role: Role, escorts: string[], how: 'initial' | 'jumpin'): Ship[] {
    const leader = this.makeShip(leaderDef, gov, role);
    const group = [leader];
    escorts.forEach((id, i) => {
      const e = this.makeShip(id, gov, 'escort');
      e.leader = leader;
      const side = i % 2 === 0 ? 1 : -1;
      const row = Math.floor(i / 2) + 1;
      e.formX = -row * (leader.def.len * 0.45 + 34);
      e.formY = side * row * (leader.def.len * 0.4 + 30);
      group.push(e);
    });
    this.placeGroup(group, how, null);
    this.ships.push(...group);
    return group;
  }

  addPlayer(ship: Ship, how: { planet?: PlanetDef; from?: string }) {
    this.player = ship;
    ship.isPlayer = true;
    ship.gone = false;
    ship.dead = false;
    ship.target = null;
    ship.scale = 1;
    ship.alpha = 1;
    if (how.planet) {
      const p = how.planet;
      ship.x = p.x;
      ship.y = p.y;
      ship.angle = rand(0, TAU);
      ship.vx = Math.cos(ship.angle) * 50;
      ship.vy = Math.sin(ship.angle) * 50;
      ship.state = 'takeoff';
      ship.stateT = 0;
      ship.stateDur = 1.3;
      ship.scale = 0.2;
      ship.alpha = 0;
    } else if (how.from) {
      const o = SYSTEMS[how.from]!;
      const a = Math.atan2(o.y - this.sys.y, o.x - this.sys.x);
      ship.x = Math.cos(a) * ARRIVE_DIST * 0.85;
      ship.y = Math.sin(a) * ARRIVE_DIST * 0.85;
      ship.angle = a + Math.PI;
      ship.state = 'jumpin';
      ship.stateT = 0;
      ship.stateDur = 1.2;
      ship.alpha = 0.4;
    }
    this.ships.push(ship);
  }

  /** Spawn the player's escorts in formation around the (already placed) player ship. */
  addEscorts(list: EscortState[]) {
    const p = this.player;
    if (!p) return;
    list.forEach((e, i) => {
      const s = this.makeShip(e.shipId, 'independent', 'escort');
      s.playerEscort = true;
      s.client = !!e.client;
      s.escortId = e.id;
      s.title = escortDisplayName(e);
      s.leader = p;
      s.credits = 0;
      s.cargo = {};
      s.armor = s.stats.maxArmor * Math.max(0.3, Math.min(1, e.armor));
      const side = i % 2 === 0 ? 1 : -1;
      const row = Math.floor(i / 2) + 1;
      s.formX = -row * (30 + s.def.len * 0.5);
      s.formY = side * (row * 34 + s.def.len * 0.3);
      const c = Math.cos(p.angle);
      const sn = Math.sin(p.angle);
      s.angle = p.angle;
      s.vx = p.vx;
      s.vy = p.vy;
      s.state = p.state;
      s.stateT = 0;
      s.stateDur = p.stateDur + 0.15 * (i + 1);
      s.scale = p.scale;
      s.alpha = p.alpha;
      if (p.state === 'takeoff') {
        s.x = p.x + rand(-20, 20);
        s.y = p.y + rand(-20, 20);
        s.angle = p.angle + rand(-0.7, 0.7);
      } else {
        s.x = p.x + s.formX * c - s.formY * sn;
        s.y = p.y + s.formX * sn + s.formY * c;
      }
      s.ai!.mode = 'follow';
      s.ai!.leaveAt = Infinity;
      this.ships.push(s);
    });
  }

  // ── Relationships ──────────────────────────────────────────────

  hostileToPlayer(s: Ship): boolean {
    if (s.isPlayer || s.playerEscort) return false;
    if (s.provokedByPlayer || s.missionId) return true;
    if (this.angered.has(s.gov)) return true;
    if (this.bribed.has(s.gov)) return false;
    return (this.ps.rep[s.gov] ?? 0) < GOVS[s.gov].hostileBelow;
  }

  isHostile(a: Ship, b: Ship): boolean {
    if (a === b) return false;
    const aFleet = a.isPlayer || a.playerEscort;
    const bFleet = b.isPlayer || b.playerEscort;
    if (aFleet && bFleet) return false;
    if (aFleet) return this.hostileToPlayer(b);
    if (bFleet) return this.hostileToPlayer(a);
    if (a.gov === b.gov) return false;
    if (GOVS[a.gov].enemies.includes(b.gov) || GOVS[b.gov].enemies.includes(a.gov)) return true;
    return a.attackers.has(b.id) || b.attackers.has(a.id);
  }

  sameGroup(a: Ship, b: Ship) {
    const la = a.leader ?? a;
    const lb = b.leader ?? b;
    return la === lb;
  }

  canHit(owner: Ship, victim: Ship) {
    if (victim === owner || victim.dead || victim.state !== 'flying') return false;
    if (this.sameGroup(owner, victim)) return false;
    if (owner.target === victim) return true;
    return this.isHostile(owner, victim);
  }

  private provoke(victim: Ship) {
    victim.provokedByPlayer = true;
    const govs: GovId[] = [victim.gov];
    if (this.sys.gov && GOVS[this.sys.gov].lawful && victim.gov !== 'corsair' && this.sys.gov !== victim.gov) {
      govs.push(this.sys.gov);
    }
    for (const g of govs) {
      if (this.angered.has(g)) continue;
      this.angered.add(g);
      this.hooks.aggression(victim, g);
    }
    // Wingmen of the victim join in.
    const leader = victim.leader ?? victim;
    for (const s of this.ships) if ((s.leader ?? s) === leader) s.provokedByPlayer = true;
  }

  // ── Simulation ─────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    const t = TRAFFIC[this.sys.traffic];
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = t.rate * rand(0.6, 1.4);
      if (this.npcCount() < t.max) this.spawnFleet(Math.random() < 0.6 ? 'jumpin' : 'takeoff');
    }
    for (const s of this.ships) {
      if (!s.isPlayer && s.ai) updateAI(this, s, dt);
      this.updateShip(s, dt);
      this.updateWeapons(s, dt);
    }
    this.updateProjectiles(dt);
    this.fx.update(dt);
    if (this.ships.some((s) => s.gone)) {
      this.ships = this.ships.filter((s) => !s.gone);
      for (const s of this.ships) {
        if (s.target?.gone) s.target = null;
        if (s.leader?.gone) s.leader = null;
        if (s.lastAttacker?.gone) s.lastAttacker = null;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  private updateShip(s: Ship, dt: number) {
    s.shieldFlash = Math.max(0, s.shieldFlash - dt * 3);
    s.hitFlash = Math.max(0, s.hitFlash - dt * 4);
    const engineOn = s.thrusting && s.state === 'flying' && !s.disabled && !s.dead;
    s.thrust += ((engineOn ? (s.afterburning ? 1.5 : 1) : 0) - s.thrust) * Math.min(1, dt * 10);

    if (s.dead) {
      this.updateDying(s, dt);
      return;
    }

    switch (s.state) {
      case 'landing': {
        s.stateT += dt;
        const p = s.landPlanet!;
        const k = Math.min(1, s.stateT / s.stateDur);
        s.x += (p.x - s.x) * Math.min(1, dt * 2.5);
        s.y += (p.y - s.y) * Math.min(1, dt * 2.5);
        s.vx *= 0.9;
        s.vy *= 0.9;
        s.scale = 1 - 0.8 * k;
        s.alpha = 1 - k;
        if (k >= 1) {
          if (s.isPlayer) {
            s.state = 'flying';
            this.hooks.playerLanded(p);
          } else {
            s.gone = true;
          }
        }
        return;
      }
      case 'takeoff': {
        s.stateT += dt;
        const k = Math.min(1, s.stateT / s.stateDur);
        s.scale = 0.2 + 0.8 * (1 - (1 - k) ** 2);
        s.alpha = Math.min(1, k * 1.6);
        s.vx = Math.cos(s.angle) * (40 + 60 * k);
        s.vy = Math.sin(s.angle) * (40 + 60 * k);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (k >= 1) {
          s.state = 'flying';
          s.scale = 1;
          s.alpha = 1;
        }
        return;
      }
      case 'jumpout': {
        s.stateT += dt;
        const k = s.stateT / s.stateDur;
        const d = angleDiff(s.angle, s.jumpAngle);
        s.angle += d * Math.min(1, dt * 6);
        const sp = s.stats.maxSpeed * (1 + k * k * 22);
        s.vx = Math.cos(s.angle) * sp;
        s.vy = Math.sin(s.angle) * sp;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.thrust = 1.6;
        if (!s.isPlayer) s.alpha = 1 - Math.max(0, (k - 0.55) / 0.45);
        if (k >= 1) {
          if (s.isPlayer) {
            this.hooks.playerJumped();
          } else {
            s.gone = true;
            this.fx.flash(s.x, s.y, 24 + s.def.len * 0.5, '#d8ecff', 0.22);
          }
        }
        return;
      }
      case 'jumpin': {
        s.stateT += dt;
        const k = Math.min(1, s.stateT / s.stateDur);
        const sp = s.stats.maxSpeed * (0.55 + (1 - k) ** 2 * 6);
        s.vx = Math.cos(s.angle) * sp;
        s.vy = Math.sin(s.angle) * sp;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.alpha = Math.min(1, 0.3 + k * 1.5);
        if (k >= 1) {
          s.state = 'flying';
          s.alpha = 1;
        }
        return;
      }
      case 'flying':
        break;
    }

    if (!s.disabled) {
      const ab = s.afterburning && s.stats.afterburner > 0 && s.fuel > 1;
      if (ab) s.fuel = Math.max(0, s.fuel - 14 * dt);
      if (s.thrusting) {
        const acc = s.stats.accel * (ab ? 1.7 : 1);
        s.vx += Math.cos(s.angle) * acc * dt;
        s.vy += Math.sin(s.angle) * acc * dt;
      }
      const maxS = s.stats.maxSpeed * (ab ? 1.6 : 1);
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > maxS) {
        const ns = Math.max(maxS, sp - s.stats.accel * 1.2 * dt);
        s.vx *= ns / sp;
        s.vy *= ns / sp;
      }
      s.shield = Math.min(s.stats.maxShield, s.shield + s.stats.shieldRegen * dt);
      if (s.stats.armorRegen) s.armor = Math.min(s.stats.maxArmor, s.armor + s.stats.armorRegen * dt);
      if (s.stats.ramscoop) s.fuel = Math.min(s.stats.maxFuel, s.fuel + s.stats.ramscoop * dt);
    } else {
      const k = Math.max(0, 1 - 0.12 * dt);
      s.vx *= k;
      s.vy *= k;
      s.angle += 0.12 * dt;
      s.fxT -= dt;
      if (s.fxT <= 0) {
        s.fxT = rand(0.08, 0.2);
        const a = rand(0, TAU);
        const r = rand(0, s.radius * 0.6);
        this.fx.smoke(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, s.vx, s.vy, 4 + s.def.len * 0.08);
        if (Math.random() < 0.25) this.fx.sparks(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 3, '#ffd28a', 120, s.vx, s.vy);
      }
      // Ships recover slowly once the fighting stops.
      if (!s.isPlayer && s.ai && this.time - s.ai.attackedAt > 25) {
        s.armor += s.stats.maxArmor * 0.02 * dt;
        if (s.armor > s.stats.maxArmor * 0.3) s.disabled = false;
      }
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }

  private updateDying(s: Ship, dt: number) {
    s.dieT -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.angle += 0.7 * dt;
    s.fxT -= dt;
    if (s.fxT <= 0) {
      s.fxT = rand(0.05, 0.16);
      const a = rand(0, TAU);
      const r = rand(0, s.def.len * 0.4);
      this.fx.burst(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 5 + s.def.len * 0.06, s.vx, s.vy);
      if (Math.random() < 0.5) audio.play('explodeSmall', s.x, s.y, 0.5);
    }
    if (s.dieT <= 0) {
      const scale = s.def.len / 36;
      this.fx.explosion(s.x, s.y, scale, s.vx * 0.5, s.vy * 0.5);
      audio.play(s.def.len > 130 ? 'explodeHuge' : s.def.len > 60 ? 'explodeLarge' : 'explodeSmall', s.x, s.y, 1);
      if (this.player && Math.hypot(this.player.x - s.x, this.player.y - s.y) < 900) {
        this.shake = Math.min(1.2, this.shake + scale * 0.25);
      }
      s.gone = true;
      if (s.isPlayer) this.hooks.playerDestroyed();
    }
  }

  // ── Weapons ────────────────────────────────────────────────────

  private updateWeapons(s: Ship, dt: number) {
    const canFire = s.state === 'flying' && !s.disabled && !s.dead;
    for (const m of s.guns) {
      m.cd -= dt;
      if (m.w.kind === 'beam') {
        m.beamOn = canFire && s.fireGuns;
        if (m.beamOn) this.fireBeam(s, m, s.angle, dt);
        continue;
      }
      if (canFire && s.fireGuns && m.cd <= 0) this.fireMount(s, m, s.angle);
    }
    for (const m of s.turrets) {
      m.cd -= dt;
      const t = canFire && s.fireTurrets ? this.turretTarget(s, m) : null;
      if (m.w.kind === 'beam') {
        m.beamOn = !!t;
        if (t) {
          m.aim = Math.atan2(t.y - s.y, t.x - s.x);
          this.fireBeam(s, m, m.aim, dt);
        }
        continue;
      }
      if (!t) {
        m.aim += angleDiff(m.aim, s.angle) * Math.min(1, dt * 2);
        continue;
      }
      m.aim = this.leadAngle(s, t, m.w.speed);
      if (m.cd <= 0) this.fireMount(s, m, m.aim);
    }
    for (const m of s.secondaries) m.cd -= dt;
    const sec = s.secondary();
    if (sec && canFire && s.fireSecondary && sec.cd <= 0 && s.hasAmmoFor(sec)) this.fireMount(s, sec, s.angle);
  }

  leadAngle(s: Ship, t: Ship, speed: number) {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const time = interceptTime(dx, dy, t.vx - s.vx, t.vy - s.vy, speed);
    if (time === null) return Math.atan2(dy, dx);
    return Math.atan2(dy + (t.vy - s.vy) * time, dx + (t.vx - s.vx) * time);
  }

  private weaponRange(w: WeaponDef) {
    return w.kind === 'beam' ? w.range ?? 400 : w.speed * w.life;
  }

  private turretTarget(s: Ship, m: Mount): Ship | null {
    const range = this.weaponRange(m.w) * 0.95;
    const t = s.target;
    if (t && this.canHit(s, t) && Math.hypot(t.x - s.x, t.y - s.y) < range) return t;
    let best: Ship | null = null;
    let bestD = range;
    for (const o of this.ships) {
      if (o === s || !o.active || !this.isHostile(s, o) || this.sameGroup(s, o)) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  private fireMount(s: Ship, m: Mount, angle: number) {
    const w = m.w;
    const c = Math.cos(s.angle);
    const sn = Math.sin(s.angle);
    const nose = s.def.len * 0.45;
    if (w.secondary) {
      if (w.ammo) s.ammo[w.ammo] = Math.max(0, (s.ammo[w.ammo] ?? 0) - 1);
      m.cd = w.reload / Math.max(1, m.count);
      const side = m.barrel++ % 2 === 0 ? 1 : -1;
      const lat = s.def.len * 0.18 * side;
      const x = s.x + c * nose * 0.6 - sn * lat;
      const y = s.y + sn * nose * 0.6 + c * lat;
      const a = angle + (w.spread ? rand(-w.spread, w.spread) : 0);
      this.projectiles.push(new Projectile(s, w, x, y, a, s.target));
      audio.play(w.sound, s.x, s.y, s.isPlayer ? 0.8 : 0.55);
      return;
    }
    m.cd = w.reload * (s.isPlayer || s.playerEscort ? 1 : rand(1.1, 1.4));
    const n = m.count;
    const inaccuracy = s.isPlayer ? 0 : 0.035;
    for (let i = 0; i < n; i++) {
      let x: number;
      let y: number;
      if (w.turret) {
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * s.def.len * 0.4;
        x = s.x + c * off + Math.cos(angle) * s.def.len * 0.12;
        y = s.y + sn * off + Math.sin(angle) * s.def.len * 0.12;
      } else {
        const lat = n === 1 ? 0 : (i / (n - 1) - 0.5) * Math.min(s.def.len * 0.5, 40);
        x = s.x + c * nose - sn * lat;
        y = s.y + sn * nose + c * lat;
      }
      const a = angle + rand(-inaccuracy, inaccuracy) + (w.spread ? rand(-w.spread, w.spread) : 0);
      this.projectiles.push(new Projectile(s, w, x, y, a, s.target));
    }
    if (!w.turret) {
      this.fx.add({ kind: 'glow', x: s.x + c * nose, y: s.y + sn * nose, vx: s.vx, vy: s.vy, life: 0.07, size: 6 + (w.width ?? 2) * 2, color: w.color });
    }
    audio.play(w.sound, s.x, s.y, s.isPlayer ? 0.75 : 0.5);
  }

  private fireBeam(s: Ship, m: Mount, angle: number, dt: number) {
    const range = m.w.range ?? 400;
    const startOff = m.w.turret ? s.def.len * 0.1 : s.def.len * 0.45;
    const ox = s.x + Math.cos(angle) * startOff;
    const oy = s.y + Math.sin(angle) * startOff;
    const ex = ox + Math.cos(angle) * range;
    const ey = oy + Math.sin(angle) * range;
    let best: Ship | null = null;
    let bestT = 1;
    for (const o of this.ships) {
      if (!this.canHit(s, o)) continue;
      const { d, t } = segmentPointDist(ox, oy, ex, ey, o.x, o.y);
      if (d < o.radius && t < bestT) {
        best = o;
        bestT = t;
      }
    }
    m.beamAngle = angle;
    m.beamX = ox;
    m.beamY = oy;
    m.beamLen = range * bestT;
    if (best) {
      const hx = ox + Math.cos(angle) * m.beamLen;
      const hy = oy + Math.sin(angle) * m.beamLen;
      this.damage(best, m.w, m.w.damage * dt * m.count, s, hx, hy, true);
      if (Math.random() < dt * 25) this.fx.sparks(hx, hy, 2, m.w.core ?? '#ffffff', 180, best.vx, best.vy);
    }
    audio.play(m.w.sound, s.x, s.y, s.isPlayer ? 0.6 : 0.4);
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.life -= dt;
      const w = p.w;
      if (p.life <= 0) {
        p.dead = true;
        if (w.kind !== 'bolt') this.fx.burst(p.x, p.y, 4, p.vx * 0.3, p.vy * 0.3);
        continue;
      }
      const homing = w.kind === 'missile' || w.kind === 'torpedo';
      if (homing) {
        const t = p.target;
        if (t && t.active && !t.dead) {
          const lead = interceptTime(t.x - p.x, t.y - p.y, t.vx, t.vy, Math.max(p.speed, 1));
          const tx = t.x + (lead !== null ? t.vx * Math.min(lead, 1.5) : 0);
          const ty = t.y + (lead !== null ? t.vy * Math.min(lead, 1.5) : 0);
          const d = angleDiff(p.angle, Math.atan2(ty - p.y, tx - p.x));
          const turn = (w.turn ?? 2) * dt;
          p.angle += Math.max(-turn, Math.min(turn, d));
        }
        p.speed = Math.min(w.speed, p.speed + w.speed * 1.4 * dt);
        p.vx = Math.cos(p.angle) * p.speed;
        p.vy = Math.sin(p.angle) * p.speed;
      }
      if (w.kind !== 'bolt') {
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = w.kind === 'torpedo' ? 0.02 : 0.03;
          const bx = p.x - Math.cos(p.angle) * 4;
          const by = p.y - Math.sin(p.angle) * 4;
          if (w.kind === 'torpedo') {
            this.fx.add({ kind: 'glow', x: bx, y: by, life: 0.35, size: 7, grow: -12, color: w.color });
          } else {
            this.fx.add({ kind: 'trail', x: bx, y: by, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.6, size: 2.2, grow: 5, color: '#8f8a86', drag: 1 });
            this.fx.add({ kind: 'glow', x: bx, y: by, life: 0.08, size: 5, color: '#ffb35a' });
          }
        }
      }
      const px = p.x;
      const py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      for (const s of this.ships) {
        if (s === p.owner || !s.active) continue;
        const r = s.radius + (w.width ?? 2) * 0.5 + 2;
        if (Math.abs(s.x - p.x) > r + 60 || Math.abs(s.y - p.y) > r + 60) continue;
        if (!this.canHit(p.owner, s)) continue;
        if (segmentPointDist(px, py, p.x, p.y, s.x, s.y).d < r) {
          this.impact(p, s);
          p.dead = true;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private impact(p: Projectile, s: Ship) {
    const w = p.w;
    switch (w.impact) {
      case 'explode':
        this.fx.burst(p.x, p.y, w.kind === 'torpedo' ? 14 : 7, s.vx, s.vy);
        audio.play('explodeSmall', p.x, p.y, w.kind === 'torpedo' ? 0.9 : 0.5);
        break;
      case 'plasma':
        this.fx.flash(p.x, p.y, 22, w.color, 0.18);
        this.fx.sparks(p.x, p.y, 6, w.color, 200, s.vx, s.vy);
        break;
      case 'flash':
        this.fx.flash(p.x, p.y, 14, w.color, 0.12);
        this.fx.sparks(p.x, p.y, 3, w.core ?? w.color, 160, s.vx, s.vy);
        break;
      default:
        this.fx.sparks(p.x, p.y, 4, w.core ?? w.color, 180, s.vx, s.vy);
    }
    this.damage(s, w, w.damage, p.owner, p.x, p.y, false);
    if (w.blast) {
      for (const o of this.ships) {
        if (o === s || !o.active || !this.canHit(p.owner, o)) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < w.blast + o.radius) this.damage(o, w, w.damage * 0.5 * (1 - d / (w.blast + o.radius)), p.owner, o.x, o.y, false);
      }
    }
  }

  damage(v: Ship, w: WeaponDef, amount: number, src: Ship | null, hx: number, hy: number, beam: boolean) {
    if (v.dead || v.state !== 'flying') return;
    const sm = w.shieldMult ?? 1;
    const am = w.armorMult ?? 1;
    let dmg = amount;
    let hitShield = false;
    if (v.shield > 0) {
      hitShield = true;
      const need = v.shield / sm;
      if (dmg <= need) {
        v.shield -= dmg * sm;
        dmg = 0;
      } else {
        v.shield = 0;
        dmg -= need;
      }
      v.shieldFlash = Math.min(1, v.shieldFlash + (beam ? 0.15 : 0.8));
      v.shieldHitAngle = Math.atan2(hy - v.y, hx - v.x);
    }
    if (dmg > 0) {
      v.armor -= dmg * am;
      v.hitFlash = 1;
      if (!beam) this.fx.sparks(hx, hy, 3, '#ffcf8a', 150, v.vx, v.vy);
    }
    if (!beam) audio.play(hitShield && dmg === 0 ? 'hitShield' : 'hitArmor', hx, hy, 0.45);
    v.hitAt = this.time;
    if (src) {
      v.lastAttacker = src;
      v.attackers.add(src.id);
      if (src.playerEscort && this.player) v.attackers.add(this.player.id);
      if (v.ai) v.ai.attackedAt = this.time;
      const byFleet = src.isPlayer || src.playerEscort;
      if (byFleet && !v.isPlayer && !v.playerEscort && !this.hostileToPlayer(v)) this.provoke(v);
    }
    if (v.isPlayer) this.shake = Math.min(1, this.shake + amount / 70);
    if (v.armor <= 0) {
      this.destroy(v, src);
      return;
    }
    if (!v.disabled && !v.def.noDisable && v.armor < v.stats.maxArmor * DISABLE_FRAC) this.disable(v);
  }

  private disable(s: Ship) {
    s.disabled = true;
    s.thrusting = false;
    s.fireGuns = false;
    s.fireTurrets = false;
    s.fireSecondary = false;
    audio.play('disabled', s.x, s.y, 0.7);
    if (s.isPlayer) this.hooks.playerDisabled();
    else if (this.player?.target === s) this.hooks.message(`${s.title ?? s.name} is disabled.`, '#ffd27a');
  }

  private destroy(s: Ship, killer: Ship | null) {
    if (s.dead) return;
    s.dead = true;
    s.disabled = true;
    s.dieT = s.def.len > 130 ? 1.6 : s.def.len > 60 ? 0.7 : 0.18;
    s.fxT = 0;
    this.hooks.kill(s, killer);
  }

  /** A pirate finishes boarding a disabled ship. */
  boarded(pirate: Ship, victim: Ship) {
    victim.plundered = true;
    audio.play('board', victim.x, victim.y, 0.6);
    if (victim.isPlayer) {
      this.hooks.playerBoarded(pirate);
    } else {
      pirate.credits += victim.credits;
      victim.credits = 0;
    }
  }

  // ── Queries ────────────────────────────────────────────────────

  nearestPlanet(x: number, y: number, landableOnly = true): PlanetDef | null {
    let best: PlanetDef | null = null;
    let bestD = Infinity;
    for (const p of this.sys.planets) {
      if (landableOnly && !p.landable) continue;
      const d = Math.hypot(p.x - x, p.y - y) - p.r;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  shipsNear(x: number, y: number, range: number, filter: (s: Ship) => boolean): Ship[] {
    return this.ships
      .filter((s) => s.active && filter(s) && Math.hypot(s.x - x, s.y - y) < range)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  }
}
