import { audio } from '../core/audio';
import { Input } from '../core/input';
import { STORAGE_PREFIX } from '../core/storage';
import { clamp, fmt, rand } from '../core/math';
import { COMMODITIES } from '../data/commodities';
import { PLANETS, REGION_NAMES, SYSTEMS, findRoute, planet as getPlanet, jumpDistances } from '../data/galaxy';
import { GOVS, combatRank } from '../data/governments';
import { shipDef } from '../data/ships';
import type { GovId, PlanetDef } from '../data/types';
import { Renderer } from '../render/renderer';
import { UI } from '../ui/ui';
import { arrive, startJumpOut, turnToward } from './ai';
import { JUMP_DIST } from './constants';
import { completeMissions } from './economy';
import { Ship } from './entities';
import { captureChance, dailyWages } from './escorts';
import { currentObjective, type GuideContext, type Objective } from './guide';
import { dropMission } from './missions';
import { MAX_ESCORTS, adjustRep, fleetCount, isKnown, newPlayer, normalizePlayer, type EscortState, type PlayerState, type StartOption } from './player';
import { loadPilot, savePilot } from './save';
import { defaultLoadout } from './stats';
import { World, type WorldHooks } from './world';

export type Mode = 'title' | 'space' | 'landed' | 'dead';

const GUIDE_KEY = `${STORAGE_PREFIX}guide`;

function loadGuidePref() {
  try {
    return localStorage.getItem(GUIDE_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface Message {
  text: string;
  color: string;
  t: number;
}

export class Game {
  input = new Input();
  renderer: Renderer;
  ui: UI;
  mode: Mode = 'title';
  ps: PlayerState | null = null;
  world: World | null = null;
  ship: Ship | null = null;
  planet: PlanetDef | null = null;
  navPlanet: PlanetDef | null = null;
  route: string[] = [];
  autopilot: { kind: 'land' | 'jump'; planet?: PlanetDef } | null = null;
  messages: Message[] = [];
  banner: { title: string; sub?: string; color?: string; t: number } | null = null;
  time = 0;
  jumpFx = 0;
  jumpAngle = 0;
  jumpFlash = 0;
  paused = false;
  landClearance = new Set<string>();
  objective: Objective | null = null;
  showGuide = loadGuidePref();
  private guideT = 0;
  private last = 0;
  private deathT = 0;
  private deathShown = false;
  private disabledT = 0;
  private towOffered = false;

  private hooks: WorldHooks = {
    message: (t, c) => this.msg(t, c),
    kill: (v, k) => this.onKill(v, k),
    playerLanded: (p) => this.onLanded(p),
    playerJumped: () => this.onJumped(),
    playerDisabled: () => {
      this.msg('Your ship has been disabled!', '#ff6a50');
      audio.play('alert');
      this.autopilot = null;
      this.disabledT = 0;
      this.towOffered = false;
    },
    playerDestroyed: () => this.onDestroyed(),
    playerBoarded: (by) => this.onBoardedByPirate(by),
    aggression: (v, gov) => this.onAggression(v, gov),
  };

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.ui = new UI(this, uiRoot);
    this.input.capture = () => this.mode === 'space' && !this.paused;
    this.input.onKey((e) => this.onKey(e));
    canvas.addEventListener('mousedown', (e) => this.onClick(e));
    window.addEventListener('pointerdown', () => audio.init(), { once: false });
  }

  start() {
    this.ui.showTitle();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.renderer.render(this, dt);
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    this.time += dt;
    this.jumpFlash = Math.max(0, this.jumpFlash - dt * 1.4);
    if ((this.mode === 'space' || this.mode === 'dead') && !this.paused && this.world && this.ship) this.updateSpace(dt);
    else audio.setThrust(false, false);
  }

  // ── Flight ─────────────────────────────────────────────────────

  private updateSpace(dt: number) {
    const w = this.world!;
    const s = this.ship!;
    if (this.mode === 'space') this.controlShip(dt);
    w.update(dt);
    audio.listenerX = s.x;
    audio.listenerY = s.y;
    audio.setThrust(this.mode === 'space' && s.thrust > 0.15 && s.state === 'flying', s.afterburning);
    if (s.state === 'jumpout') {
      this.jumpFx = Math.min(1, (s.stateT / s.stateDur) * 1.3);
      this.jumpAngle = s.angle;
    } else if (s.state === 'jumpin') {
      this.jumpFx = Math.max(0, 1 - s.stateT / s.stateDur);
    } else {
      this.jumpFx = Math.max(0, this.jumpFx - dt * 2);
    }
    if (s.target?.gone) s.target = null;
    if (this.mode === 'space' && s.disabled && !s.dead) this.updateDisabled(dt);
    if (this.mode === 'dead') {
      this.deathT += dt;
      if (this.deathT > 2.6 && !this.deathShown) this.showDeath();
    }
    if (this.ps) this.ps.fuel = s.fuel;
    this.guideT -= dt;
    if (this.guideT <= 0 && this.mode === 'space') {
      this.guideT = 0.4;
      this.objective = this.currentObjective();
      this.checkHints();
    }
  }

  private controlShip(dt: number) {
    const s = this.ship!;
    const inp = this.input;
    s.thrusting = false;
    s.afterburning = false;
    s.fireGuns = false;
    s.fireTurrets = false;
    s.fireSecondary = false;
    if (s.state !== 'flying' || s.disabled || s.dead) return;
    const left = inp.isDown('ArrowLeft');
    const right = inp.isDown('ArrowRight');
    const up = inp.isDown('ArrowUp');
    const down = inp.isDown('ArrowDown');
    const ab = inp.isDown('KeyZ');
    if (this.autopilot && (left || right || up || down || ab)) {
      this.autopilot = null;
      this.msg('Autopilot disengaged.', '#9fb4cc');
    }
    if (this.autopilot) {
      this.runAutopilot(dt);
    } else {
      if (left) s.angle -= s.stats.turn * dt;
      if (right) s.angle += s.stats.turn * dt;
      if (down && !left && !right && s.speed > 4) turnToward(s, Math.atan2(-s.vy, -s.vx), dt);
      if (inp.isDown('KeyA') && s.target && !left && !right && !down) {
        const g = s.mainGun();
        const aim = g && g.w.kind !== 'beam' ? this.world!.leadAngle(s, s.target, g.w.speed) : Math.atan2(s.target.y - s.y, s.target.x - s.x);
        turnToward(s, aim, dt);
      }
      s.thrusting = up || ab;
      s.afterburning = ab && s.stats.afterburner > 0 && s.fuel > 1;
      if (inp.wasPressed('KeyZ') && s.stats.afterburner <= 0) this.msg('No afterburner installed.', '#9fb4cc');
    }
    const fire = inp.isDown('Space');
    s.fireGuns = fire;
    s.fireTurrets = fire;
    const shift = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    s.fireSecondary = shift;
    if ((inp.wasPressed('ShiftLeft') || inp.wasPressed('ShiftRight')) && shift) {
      const sec = s.secondary();
      if (!sec) this.msg('No secondary weapon.', '#9fb4cc');
      else if (!s.hasAmmoFor(sec)) {
        this.msg(`Out of ammunition for the ${sec.o.name}.`, '#ff8a6a');
        audio.play('error');
      }
    }
  }

  private runAutopilot(dt: number) {
    const s = this.ship!;
    const ap = this.autopilot!;
    if (ap.kind === 'land') {
      const p = ap.planet!;
      arrive(s, p.x, p.y, 0, 0, dt);
      if (Math.hypot(p.x - s.x, p.y - s.y) < p.r * 0.75 && s.speed < 90) this.beginLanding(p);
      return;
    }
    const next = SYSTEMS[this.route[0] ?? ''];
    if (!next) {
      this.autopilot = null;
      return;
    }
    const cur = this.world!.sys;
    const a = Math.atan2(next.y - cur.y, next.x - cur.x);
    const diff = turnToward(s, a, dt);
    if (Math.abs(diff) < 0.35) s.thrusting = true;
    if (Math.hypot(s.x, s.y) > JUMP_DIST && Math.abs(diff) < 0.06) this.beginJump(a);
  }

  private beginLanding(p: PlanetDef) {
    const s = this.ship!;
    this.autopilot = null;
    s.state = 'landing';
    s.landPlanet = p;
    s.stateT = 0;
    s.stateDur = 1.1;
    audio.play('land');
  }

  private beginJump(angle: number) {
    const s = this.ship!;
    this.autopilot = null;
    s.fuel = Math.max(0, s.fuel - 100);
    startJumpOut(s, angle, 1.5);
  }

  tryLand() {
    const w = this.world;
    const s = this.ship;
    if (!w || !s || s.state !== 'flying' || s.disabled) return;
    const landables = w.sys.planets.filter((p) => p.landable).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    if (!landables.length) {
      this.msg('There is nowhere to land in this system.', '#9fb4cc');
      audio.play('error');
      return;
    }
    let p = this.navPlanet && this.navPlanet.landable ? this.navPlanet : landables[0]!;
    if (this.autopilot?.kind === 'land' && this.autopilot.planet) {
      const i = landables.indexOf(this.autopilot.planet);
      p = landables[(i + 1) % landables.length]!;
    }
    this.navPlanet = p;
    const deny = this.landingDenied(p);
    if (deny) {
      this.msg(deny, '#ff8a6a');
      audio.play('error');
      this.autopilot = null;
      return;
    }
    if (Math.hypot(p.x - s.x, p.y - s.y) < p.r * 0.75 && s.speed < 90) {
      this.beginLanding(p);
      return;
    }
    this.autopilot = { kind: 'land', planet: p };
    this.msg(`Approaching ${p.name}. Landing clearance granted.`, '#9fd8ff');
    audio.play('select');
  }

  landingDenied(p: PlanetDef): string | null {
    if (!p.landable) return `${p.name} has no landing facilities.`;
    if (this.landClearance.has(p.id)) return null;
    const ps = this.ps!;
    if ((ps.rep[p.gov] ?? 0) < GOVS[p.gov].landBelow) return `${p.name} denies you landing clearance. Hail them (H) to negotiate.`;
    if (this.world?.angered.has(p.gov)) return `${p.name} refuses you: you fired on ${GOVS[p.gov].short} ships. Hail (H) to negotiate.`;
    return null;
  }

  tryJump() {
    const s = this.ship;
    const w = this.world;
    if (!s || !w || s.state !== 'flying' || s.disabled) return;
    if (!this.route.length) {
      this.msg('No hyperspace route plotted. Open the map (M) and pick a destination.', '#9fb4cc');
      audio.play('error');
      return;
    }
    const next = SYSTEMS[this.route[0]!]!;
    if (!w.sys.links.includes(next.id)) {
      this.route = [];
      this.msg('Route invalid. Plot a new course.', '#ff8a6a');
      return;
    }
    if (s.fuel < 100) {
      this.msg('Not enough fuel to jump! Land and refuel, or hail a ship for help.', '#ff8a6a');
      audio.play('error');
      return;
    }
    this.autopilot = { kind: 'jump' };
    this.msg(`Course laid in for ${next.name}.`, '#9fd8ff');
    audio.play('select');
  }

  // ── Targeting & interaction ────────────────────────────────────

  cycleTarget(reverse: boolean) {
    const s = this.ship;
    const w = this.world;
    if (!s || !w) return;
    const list = w.ships.filter((o) => o !== s && o.active).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    if (!list.length) {
      s.target = null;
      return;
    }
    const i = s.target ? list.indexOf(s.target) : -1;
    s.target = list[(i + (reverse ? -1 : 1) + list.length) % list.length]!;
    audio.play('select');
  }

  targetNearestHostile() {
    const s = this.ship;
    const w = this.world;
    if (!s || !w) return;
    const list = w.shipsNear(s.x, s.y, 1e9, (o) => o !== s && !o.disabled && w.hostileToPlayer(o));
    if (!list.length) {
      this.msg('No hostile ships detected.', '#9fb4cc');
      return;
    }
    s.target = list[0]!;
    audio.play('select');
  }

  private onClick(e: MouseEvent) {
    audio.init();
    if (this.mode !== 'space' || this.paused || !this.world || !this.ship) return;
    const rect = this.renderer.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (sx > this.renderer.viewW) return;
    const { x, y } = this.renderer.screenToWorld(this, sx, sy);
    let best: Ship | null = null;
    let bestD = 28 / this.renderer.zoom;
    for (const o of this.world.ships) {
      if (o === this.ship || !o.active) continue;
      const d = Math.hypot(o.x - x, o.y - y) - o.radius;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      this.ship.target = best;
      audio.play('select');
      return;
    }
    for (const p of this.world.sys.planets) {
      if (Math.hypot(p.x - x, p.y - y) < p.r + 12) {
        this.navPlanet = p;
        this.msg(`${p.name} selected${p.landable ? '. Press L to land.' : '.'}`, '#9fd8ff');
        audio.play('select');
        return;
      }
    }
  }

  hail() {
    const s = this.ship;
    if (!s || !this.world) return;
    if (s.target && !s.target.gone) this.ui.showHail(s.target);
    else if (this.navPlanet) this.ui.showPlanetHail(this.navPlanet);
    else this.msg('Select a ship (Tab) or a planet (L or click) to hail.', '#9fb4cc');
  }

  tryBoard() {
    const s = this.ship;
    const t = s?.target;
    if (!s || !this.world) return;
    if (!t || t.gone) return this.msg('No target selected.', '#9fb4cc');
    if (!t.disabled || t.dead) return this.msg('You can only board a disabled ship.', '#9fb4cc');
    if (t.plundered) return this.msg('That ship has already been stripped bare.', '#9fb4cc');
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    const rel = Math.hypot(t.vx - s.vx, t.vy - s.vy);
    if (d > s.radius + t.radius + 60) return this.msg('Move closer to board.', '#9fb4cc');
    if (rel > 80) return this.msg('Match velocity with the target to board.', '#9fb4cc');
    audio.play('board');
    this.ui.showBoarding(t);
  }

  /** Called when the player finishes looting a ship. */
  finishBoarding(t: Ship) {
    const ps = this.ps!;
    if (t.plundered) return;
    t.plundered = true;
    if (t.gov !== 'corsair' && !t.missionId) {
      adjustRep(ps, t.gov, -14);
      this.world?.angered.add(t.gov);
      this.msg(`Piracy! ${GOVS[t.gov].short} authorities will not forget this.`, '#ff8a6a');
    }
  }

  onKey(e: KeyboardEvent) {
    audio.init();
    if (e.code === 'KeyV') {
      if (!e.repeat) this.ui.toggleSound();
      e.preventDefault();
      return;
    }
    if (e.code === 'Slash' || e.code === 'F1') {
      if (!e.repeat) this.ui.toggleHelp();
      e.preventDefault();
      return;
    }
    if (this.ui.handleKey(e)) {
      e.preventDefault();
      return;
    }
    if (this.mode !== 'space' || this.paused) return;
    const s = this.ship;
    switch (e.code) {
      case 'KeyM':
        this.ui.showMap();
        break;
      case 'KeyI':
        this.ui.showInfo();
        break;
      case 'Escape':
      case 'KeyP':
        this.ui.showPause();
        break;
      case 'KeyL':
        this.tryLand();
        break;
      case 'KeyJ':
        this.tryJump();
        break;
      case 'Tab':
        e.preventDefault();
        this.cycleTarget(e.shiftKey);
        break;
      case 'KeyR':
        this.targetNearestHostile();
        break;
      case 'KeyC':
        if (s) s.target = null;
        break;
      case 'KeyH':
        this.hail();
        break;
      case 'KeyB':
        this.tryBoard();
        break;
      case 'KeyW':
      case 'KeyQ':
        if (s && s.secondaries.length) {
          s.cycleSecondary();
          const sec = s.secondary()!;
          this.msg(`Secondary: ${sec.o.name}`, '#9fd8ff');
          audio.play('select');
        }
        break;
      case 'Minus':
        this.renderer.zoom = clamp(this.renderer.zoom - 0.1, 0.5, 1.4);
        break;
      case 'Equal':
        this.renderer.zoom = clamp(this.renderer.zoom + 0.1, 0.5, 1.4);
        break;
    }
  }

  // ── World events ───────────────────────────────────────────────

  msg(text: string, color = '#cfe3ff') {
    this.messages.push({ text, color, t: this.time });
    if (this.messages.length > 30) this.messages.shift();
  }

  private onKill(v: Ship, killer: Ship | null) {
    const ps = this.ps!;
    if (v.playerEscort) {
      const e = ps.escorts.find((x) => x.id === v.escortId);
      ps.escorts = ps.escorts.filter((x) => x.id !== v.escortId);
      const m = e?.client ? ps.missions.find((x) => x.id === e.client) : undefined;
      if (m) {
        dropMission(ps, m, 6);
        this.msg(`The ${v.title ?? v.def.name} was destroyed. Mission failed: ${m.title}.`, '#ff6a50');
      } else {
        this.msg(`Your escort ${v.title ?? v.def.name} was destroyed!`, '#ff6a50');
      }
      audio.play('alert');
      return;
    }
    if (killer && (killer.isPlayer || killer.playerEscort)) this.creditKill(v, killer);
    if (v.missionId) this.collectBounty(v);
  }

  private creditKill(v: Ship, killer: Ship) {
    const ps = this.ps!;
    const str = v.def.strength;
    const before = combatRank(ps.combat);
    if (killer.isPlayer) {
      ps.kills++;
      ps.combat += str;
    }
    if (v.gov === 'corsair') {
      adjustRep(ps, 'corsair', -str * 2);
      for (const g of ['concord', 'league', 'independent'] as GovId[]) adjustRep(ps, g, Math.ceil(str * 1.2));
      adjustRep(ps, 'vael', Math.ceil(str * 0.5));
    } else {
      adjustRep(ps, v.gov, -(15 + str * 4));
      const sg = this.world?.sys.gov;
      if (sg && sg !== v.gov && GOVS[sg].lawful) adjustRep(ps, sg, -10);
      if (v.gov !== 'vael') adjustRep(ps, 'corsair', str);
    }
    this.msg(killer.isPlayer ? `${v.title ?? v.def.name} destroyed.` : `Your escort destroyed the ${v.title ?? v.def.name}.`, '#ffd27a');
    const after = combatRank(ps.combat);
    if (after !== before) {
      this.msg(`Combat rating increased: ${after}.`, '#f0b54a');
      audio.play('mission');
    }
  }

  private collectBounty(v: Ship) {
    const ps = this.ps!;
    const m = ps.missions.find((x) => x.id === v.missionId);
    if (!m || !this.ship) return;
    if (m.returnTo) {
      // Story kills: report back in person to get paid.
      m.targetDead = true;
      m.destPlanet = m.returnTo;
      m.destSystem = PLANETS[m.returnTo]!.systemId;
      this.msg(`The ${m.target?.shipName} is destroyed! Return to ${PLANETS[m.returnTo]!.name}.`, '#7fdc8f');
      audio.play('mission');
      return;
    }
    if (!v.attackers.has(this.ship.id)) {
      this.msg(`${m.target?.name ?? 'Your bounty'} was killed by someone else. The bounty is void.`, '#ff8a6a');
      ps.missions = ps.missions.filter((x) => x !== m);
      return;
    }
    ps.missions = ps.missions.filter((x) => x !== m);
    ps.credits += m.pay;
    ps.stats.bounties++;
    ps.stats.missionsDone++;
    adjustRep(ps, m.gov, 10);
    this.msg(`Bounty on ${m.target?.name} collected: ${fmt(m.pay)} credits.`, '#7fdc8f');
    audio.play('mission');
  }

  private onAggression(v: Ship, gov: GovId) {
    adjustRep(this.ps!, gov, GOVS[gov].lawful ? -8 : -3);
    if (gov === v.gov) this.msg(`You fired on a ${GOVS[gov].short} ship! Their forces are now hostile.`, '#ff8a6a');
    else this.msg(`${GOVS[gov].short} authorities in this system now consider you hostile.`, '#ff8a6a');
  }

  private onBoardedByPirate(by: Ship) {
    const ps = this.ps!;
    const take = Math.min(ps.credits, Math.round(ps.credits * rand(0.1, 0.25)) + 500);
    ps.credits -= take;
    let stolen = 0;
    for (const c of COMMODITIES) {
      const n = ps.cargo[c.id] ?? 0;
      const t = Math.floor(n * 0.6);
      if (t > 0) {
        ps.cargo[c.id] = n - t;
        stolen += t;
      }
    }
    this.msg(`${by.def.name} crew boarded you and took ${fmt(take)} credits${stolen ? ` and ${stolen}t of cargo` : ''}!`, '#ff6a50');
    audio.play('alert');
  }

  private updateDisabled(dt: number) {
    this.disabledT += dt;
    if (this.towOffered || this.disabledT < 6 || this.ui.hasModal()) return;
    const w = this.world!;
    const s = this.ship!;
    const threat = w.ships.some((o) => o !== s && o.active && !o.disabled && w.hostileToPlayer(o) && Math.hypot(o.x - s.x, o.y - s.y) < 2600);
    if (threat) return;
    this.towOffered = true;
    const dest = this.nearestHaven();
    const fee = Math.max(500, Math.round(this.ps!.credits * 0.08));
    this.ui.dialog({
      title: 'Distress Beacon',
      body: `A salvage tug answers your distress call. "Tough break, pilot. I can haul you to ${dest.name} for ${fmt(fee)} credits. Not like you have a choice."`,
      buttons: [{ label: 'Accept tow', primary: true, onClick: () => this.tow(dest, fee) }],
    });
  }

  /** Nearest planet that will accept the player, searching outward from here. */
  private nearestHaven(): PlanetDef {
    const ps = this.ps!;
    const dists = [...jumpDistances(ps.system, 6).entries()].sort((a, b) => a[1] - b[1]);
    for (const [sid] of dists) {
      const sys = SYSTEMS[sid]!;
      for (const p of sys.planets) {
        if (!p.landable) continue;
        if ((ps.rep[p.gov] ?? 0) < GOVS[p.gov].landBelow) continue;
        return p;
      }
    }
    return getPlanet(ps.planet);
  }

  private tow(p: PlanetDef, fee: number) {
    const ps = this.ps!;
    ps.credits = Math.max(0, ps.credits - fee);
    if (p.systemId !== ps.system) ps.day += 1;
    this.route = [];
    this.onLanded(p);
  }

  private onDestroyed() {
    this.mode = 'dead';
    this.deathT = 0;
    this.deathShown = false;
    this.autopilot = null;
    audio.setThrust(false, false);
  }

  private showDeath() {
    this.deathShown = true;
    const ps = this.ps!;
    if (ps.outfits.escapepod) {
      const p = this.nearestHaven();
      this.ui.dialog({
        title: 'Ejected!',
        body: `Your escape pod blasted clear a heartbeat before the explosion. A passing freighter picked you up and dropped you at ${p.name}. Your ship, its outfits and its cargo are gone, but you are alive, and your credits are safe.`,
        buttons: [{ label: 'Continue', primary: true, onClick: () => this.respawnFromPod(p) }],
      });
    } else {
      this.ui.dialog({
        title: 'Ship Destroyed',
        body: `The ${ps.shipName} breaks apart in a ball of fire, and ${ps.name}'s story ends here. (An escape pod would have saved you.)`,
        buttons: [
          { label: 'Load last landing', primary: true, onClick: () => this.loadGame(ps.id) },
          { label: 'Main menu', onClick: () => this.quitToTitle(false) },
        ],
      });
    }
  }

  private respawnFromPod(p: PlanetDef) {
    const ps = this.ps!;
    const def = shipDef('kestrel');
    const { outfits, ammo } = defaultLoadout(def);
    ps.shipId = def.id;
    ps.outfits = outfits;
    ps.ammo = ammo;
    ps.cargo = {};
    ps.cargoCost = {};
    ps.fuel = def.fuel;
    ps.missions = ps.missions.filter((m) => m.tons === 0);
    ps.day += 1;
    this.route = [];
    this.onLanded(p);
  }

  // ── Landing & travel ───────────────────────────────────────────

  private onLanded(p: PlanetDef, silent = false) {
    const ps = this.ps!;
    this.mode = 'landed';
    this.planet = p;
    this.autopilot = null;
    this.navPlanet = null;
    this.landClearance.clear();
    this.paused = false;
    ps.planet = p.id;
    ps.system = p.systemId;
    if (!silent) ps.stats.landings++;
    if (!ps.explored.includes(p.systemId)) ps.explored.push(p.systemId);
    if (this.ship && !silent) ps.fuel = Math.min(this.ship.fuel, this.ship.stats.maxFuel);
    this.world = null;
    this.ship = null;
    this.messages = [];
    audio.setThrust(false, false);
    audio.setMusic('port');
    for (const e of ps.escorts) e.armor = 1;
    const done = silent ? [] : completeMissions(ps, p);
    this.save();
    this.ui.showSpaceport(p, done);
  }

  takeoff() {
    const ps = this.ps!;
    const p = this.planet!;
    ps.taken = ps.taken.filter((id) => id.endsWith(`:${ps.day}`) || id.includes(`:${ps.day}:`));
    this.save();
    this.mode = 'space';
    this.ui.closeAll();
    this.ship = this.makePlayerShip();
    this.enterSystem(p.systemId, { planet: p });
    audio.play('takeoff');
    this.objective = this.currentObjective();
    this.hint('flight', 'Arrow keys fly. L lands, M opens the galaxy map, J jumps. Your objective is in the top left; press ? for the handbook.');
    audio.setMusic('space');
    const sys = SYSTEMS[p.systemId]!;
    this.banner = { title: sys.name, sub: sys.gov ? `${GOVS[sys.gov].name} · ${REGION_NAMES[sys.region]}` : 'Uncharted space', color: sys.gov ? GOVS[sys.gov].color : '#9fb4cc', t: this.time };
  }

  private enterSystem(sysId: string, how: { planet?: PlanetDef; from?: string }) {
    const sys = SYSTEMS[sysId]!;
    this.world = new World(this.ps!, sys, this.hooks);
    this.world.populate();
    this.world.addPlayer(this.ship!, how);
    this.world.addEscorts(this.ps!.escorts);
    this.renderer.prepareSystem(sys);
    this.navPlanet = null;
    this.autopilot = null;
    this.landClearance.clear();
    this.disabledT = 0;
    this.towOffered = false;
    this.spawnMissionTargets();
    const dest = this.ps!.missions.find((m) => m.destPlanet && PLANETS[m.destPlanet]?.systemId === sysId && (!m.target || m.targetDead));
    if (dest?.destPlanet && !how.planet) {
      this.navPlanet = PLANETS[dest.destPlanet]!;
      this.msg(`Mission destination: ${this.navPlanet.name}. Press L to land.`, '#9fd8ff');
    }
  }

  private spawnMissionTargets() {
    const ps = this.ps!;
    const w = this.world!;
    for (const m of ps.missions) {
      if (!m.target || m.targetDead || m.destSystem !== w.sys.id || (m.type !== 'bounty' && !m.story)) continue;
      const group = w.spawnSpecial(m.target.ship, 'corsair', 'pirate', m.target.escorts, 'initial');
      const leader = group[0]!;
      leader.missionId = m.id;
      leader.title = `"${m.target.shipName}" · ${m.target.name}`;
      if (leader.ai) leader.ai.leaveAt = w.time + 600;
      for (const e of group.slice(1)) {
        e.provokedByPlayer = true;
        if (m.story) e.title = `${m.target.shipName} escort`;
      }
      this.msg(`Sensors detect the ${m.target.shipName}. Your target is in this system.`, '#ffb04a');
    }
    for (const m of ps.missions) {
      const a = m.ambush;
      if (!a || a.done) continue;
      if (a.system === '*' ? w.sys.id === PLANETS[m.issuer]?.systemId : a.system !== w.sys.id) continue;
      a.done = true;
      const group = w.spawnSpecial(a.leader, 'corsair', 'pirate', a.escorts, 'initial');
      const p = this.ship!;
      const ang = Math.random() * Math.PI * 2;
      group.forEach((s, i) => {
        s.x = p.x + Math.cos(ang) * (900 + i * 60);
        s.y = p.y + Math.sin(ang) * (900 + i * 60);
        s.angle = ang + Math.PI;
        s.state = 'jumpin';
        s.stateT = 0;
        s.stateDur = 0.8 + i * 0.15;
        s.alpha = 0.3;
        s.title = a.title;
        s.provokedByPlayer = true;
        if (s.ai) s.ai.leaveAt = w.time + 600;
      });
      this.msg(`Ambush! ${a.title} ships are dropping out of hyperspace!`, '#ff6a50');
      audio.play('alert');
    }
  }

  private onJumped() {
    const ps = this.ps!;
    const from = ps.system;
    const next = this.route.shift()!;
    this.recordEscorts();
    ps.system = next;
    ps.day += 1;
    ps.stats.jumps++;
    if (!ps.explored.includes(next)) ps.explored.push(next);
    this.payWages();
    this.checkDeadlines();
    this.ship!.target = null;
    this.enterSystem(next, { from });
    const sys = SYSTEMS[next]!;
    this.banner = {
      title: sys.name,
      sub: sys.gov ? `${GOVS[sys.gov].name} · ${REGION_NAMES[sys.region]}` : 'Uncharted space',
      color: sys.gov ? GOVS[sys.gov].color : '#9fb4cc',
      t: this.time,
    };
    this.jumpFlash = 0.85;
    audio.play('jumpIn');
    if (this.route.length) this.msg(`${this.route.length} jump${this.route.length > 1 ? 's' : ''} remaining. Press J to continue.`, '#9fd8ff');
  }

  /** Remember escort damage when leaving a system. */
  private recordEscorts() {
    const ps = this.ps!;
    for (const s of this.world?.ships ?? []) {
      if (!s.playerEscort || !s.escortId) continue;
      const e = ps.escorts.find((x) => x.id === s.escortId);
      if (e) e.armor = Math.max(0.3, s.armor / s.stats.maxArmor);
    }
  }

  private payWages() {
    const ps = this.ps!;
    const total = dailyWages(ps);
    if (!total) return;
    if (ps.credits >= total) {
      ps.credits -= total;
      return;
    }
    ps.escorts = ps.escorts.filter((e) => !e.hired);
    this.msg("You couldn't make payroll. Your mercenaries have left your service.", '#ff8a6a');
  }

  /** Try to take a disabled ship as a prize. Returns true on success. */
  captureShip(t: Ship): boolean {
    const ps = this.ps!;
    const s = this.ship!;
    const w = this.world!;
    if (fleetCount(ps) >= MAX_ESCORTS || t.dead || t.playerEscort) return false;
    const lawful = t.gov !== 'corsair' && !t.missionId;
    if (Math.random() > captureChance(s, t)) {
      t.plundered = true;
      this.msg(`The crew of the ${t.title ?? t.def.name} repels your boarding party!`, '#ff8a6a');
      audio.play('error');
      if (lawful) {
        adjustRep(ps, t.gov, -14);
        w.angered.add(t.gov);
      }
      return false;
    }
    if (t.missionId) this.collectBounty(t);
    if (lawful) {
      adjustRep(ps, t.gov, -25);
      w.angered.add(t.gov);
      this.msg(`Piracy! ${GOVS[t.gov].short} authorities will hunt you for this.`, '#ff8a6a');
    }
    const e: EscortState = { id: `esc-${Date.now().toString(36)}`, shipId: t.def.id, name: t.def.name, hired: false, wage: 0, armor: 0.35 };
    ps.escorts.push(e);
    const index = ps.escorts.length - 1;
    t.plundered = true;
    t.playerEscort = true;
    t.escortId = e.id;
    t.gov = 'independent';
    t.title = e.name;
    t.missionId = null;
    t.disabled = false;
    t.armor = Math.max(t.armor, t.stats.maxArmor * 0.35);
    t.shield = 0;
    t.provokedByPlayer = false;
    t.attackers.clear();
    t.target = null;
    t.leader = s;
    t.credits = 0;
    t.cargo = {};
    const side = index % 2 === 0 ? 1 : -1;
    const row = Math.floor(index / 2) + 1;
    t.formX = -row * (30 + t.def.len * 0.5);
    t.formY = side * (row * 34 + t.def.len * 0.3);
    if (t.ai) {
      t.ai.role = 'escort';
      t.ai.mode = 'follow';
      t.ai.leaveAt = Infinity;
    }
    s.target = null;
    this.msg(`You captured the ${t.def.name}! She joins your fleet.`, '#7fdc8f');
    audio.play('mission');
    return true;
  }

  private checkDeadlines() {
    const ps = this.ps!;
    for (const m of [...ps.missions]) {
      if (m.deadline !== undefined && ps.day > m.deadline) {
        dropMission(ps, m, 4);
        this.msg(`Mission failed: ${m.title}.`, '#ff8a6a');
      }
    }
  }

  makePlayerShip(): Ship {
    const ps = this.ps!;
    const s = new Ship(shipDef(ps.shipId), 'independent', ps.outfits, ps.ammo);
    s.isPlayer = true;
    s.name = ps.shipName;
    s.fuel = Math.min(ps.fuel, s.stats.maxFuel);
    return s;
  }

  // ── Session ────────────────────────────────────────────────────

  newGame(name: string, shipName: string, start: StartOption) {
    this.ps = newPlayer(name, shipName, start);
    this.route = [];
    this.messages = [];
    this.onLanded(getPlanet(start.planet), true);
    this.ui.showWelcome(start);
  }

  loadGame(id: string) {
    const ps = loadPilot(id);
    if (!ps) {
      this.ui.dialog({ title: 'Load failed', body: 'That pilot file could not be read.', buttons: [{ label: 'OK', primary: true, onClick: () => {} }] });
      return;
    }
    this.ps = normalizePlayer(ps);
    this.route = [];
    this.messages = [];
    this.ui.closeAll();
    this.onLanded(getPlanet(ps.planet), true);
  }

  save() {
    if (this.ps) savePilot(this.ps);
  }

  quitToTitle(save = true) {
    if (save && this.mode === 'landed') this.save();
    this.mode = 'title';
    this.world = null;
    this.ship = null;
    this.paused = false;
    this.route = [];
    audio.setThrust(false, false);
    audio.setMusic('title');
    this.ui.closeAll();
    this.ui.showTitle();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) audio.setThrust(false, false);
  }

  // ── Guidance ───────────────────────────────────────────────────

  guideContext(): GuideContext {
    const ps = this.ps!;
    return {
      ps,
      mode: this.mode,
      systemId: ps.system,
      landedAt: this.mode === 'landed' ? this.planet : null,
      route: this.route,
      disabled: !!this.ship?.disabled,
      fuel: this.ship ? this.ship.fuel : ps.fuel,
    };
  }

  currentObjective(): Objective | null {
    return this.ps ? currentObjective(this.guideContext()) : null;
  }

  setShowGuide(on: boolean) {
    this.showGuide = on;
    try {
      localStorage.setItem(GUIDE_KEY, on ? 'on' : 'off');
    } catch {
      // Preference just won't persist.
    }
  }

  /** Plot a route to a system through charted space. Returns jumps, or null if unreachable. */
  plotRouteTo(sysId: string): number | null {
    const ps = this.ps!;
    if (sysId === ps.system) {
      this.route = [];
      return 0;
    }
    const route = findRoute(ps.system, sysId, (id) => isKnown(ps, id));
    if (!route) return null;
    this.route = route;
    ps.flags.tutRoute = true;
    return route.length;
  }

  /** One-time tips, shown in the message log the first time something happens. */
  private hint(id: string, text: string) {
    const ps = this.ps;
    if (!ps || !this.showGuide || ps.flags[`hint_${id}`]) return;
    ps.flags[`hint_${id}`] = true;
    this.msg(text, '#f0d48a');
  }

  private checkHints() {
    const w = this.world;
    const s = this.ship;
    if (!w || !s || s.state !== 'flying') return;
    if (!s.disabled && w.ships.some((o) => o.active && !o.disabled && w.hostileToPlayer(o) && Math.hypot(o.x - s.x, o.y - s.y) < 1600)) {
      this.hint('hostile', 'Hostile ship on radar (red)! R targets it, A aims, Space fires. Or plot a route and press J to escape.');
    }
    if (s.target?.disabled && !s.target.dead && !s.target.playerEscort) {
      this.hint('board', 'Your target is disabled. Fly alongside, match speed and press B to board it, or keep firing to destroy it.');
    }
    if (s.fuel < 100) this.hint('fuel', 'Fuel is too low to jump. Land (L) to refuel, or hail a passing ship (H) and ask for some.');
  }
}
