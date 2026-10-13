import { audio } from '../core/audio';
import { TAU, angleDiff, pick, rand } from '../core/math';
import { SYSTEMS } from '../data/galaxy';
import type { PlanetDef } from '../data/types';
import type { Ship } from './entities';
import { NPC_JUMP_DIST } from './constants';
import type { World } from './world';

export function turnToward(s: Ship, desired: number, dt: number): number {
  const d = angleDiff(s.angle, desired);
  const step = s.stats.turn * dt;
  if (Math.abs(d) <= step) s.angle = desired;
  else s.angle += Math.sign(d) * step;
  return angleDiff(s.angle, desired);
}

function steerVelocity(s: Ship, dvx: number, dvy: number, dt: number, tol = 0.4) {
  if (Math.hypot(dvx, dvy) < 6) return;
  const diff = turnToward(s, Math.atan2(dvy, dvx), dt);
  if (Math.abs(diff) < tol) s.thrusting = true;
}

/** Fly to a point (moving with velocity tv) and come to rest relative to it. */
export function arrive(s: Ship, tx: number, ty: number, tvx: number, tvy: number, dt: number, stop = 0) {
  const dx = tx - s.x;
  const dy = ty - s.y;
  const d = Math.hypot(dx, dy);
  const turnTime = Math.PI / s.stats.turn;
  const reach = Math.max(0, d - stop - s.speed * turnTime * 0.6);
  const want = Math.min(s.stats.maxSpeed, Math.sqrt(2 * s.stats.accel * 0.6 * reach));
  const vx = tvx + (d > 0.01 ? (dx / d) * want : 0);
  const vy = tvy + (d > 0.01 ? (dy / d) * want : 0);
  steerVelocity(s, vx - s.vx, vy - s.vy, dt);
}

export function startJumpOut(s: Ship, angle: number, dur = 0.9) {
  s.state = 'jumpout';
  s.stateT = 0;
  s.stateDur = dur;
  s.jumpAngle = angle;
  s.thrusting = false;
  audio.play('jumpOut', s.x, s.y, s.isPlayer ? 1 : 0.35);
}

export function chooseGoal(w: World, s: Ship, from: PlanetDef | null = null) {
  const ai = s.ai!;
  ai.planet = null;
  switch (ai.role) {
    case 'trader': {
      const options = w.sys.planets.filter((p) => p !== from && w.planetWelcomes(p, s.gov));
      if (options.length && Math.random() < 0.6) {
        ai.mode = 'land';
        ai.planet = pick(options);
      } else {
        setJump(w, s);
      }
      break;
    }
    case 'patrol':
    case 'hunter':
    case 'pirate':
      if (w.time > ai.leaveAt) leave(w, s);
      else {
        ai.mode = 'travel';
        pickWaypoint(w, s);
      }
      break;
    case 'escort':
      ai.mode = 'follow';
      break;
  }
}

function leave(w: World, s: Ship) {
  const options = w.sys.planets.filter((p) => w.planetWelcomes(p, s.gov));
  if (options.length && Math.random() < 0.45) {
    s.ai!.mode = 'land';
    s.ai!.planet = pick(options);
  } else {
    setJump(w, s);
  }
}

function setJump(w: World, s: Ship) {
  const ai = s.ai!;
  const dest = SYSTEMS[pick(w.sys.links)]!;
  ai.mode = 'jump';
  ai.jumpAngle = Math.atan2(dest.y - w.sys.y, dest.x - w.sys.x);
}

function pickWaypoint(w: World, s: Ship) {
  const ai = s.ai!;
  if (w.sys.planets.length && Math.random() < 0.5) {
    const p = pick(w.sys.planets);
    const a = rand(0, TAU);
    const r = p.r + rand(150, 450);
    ai.destX = p.x + Math.cos(a) * r;
    ai.destY = p.y + Math.sin(a) * r;
  } else {
    const a = rand(0, TAU);
    const r = rand(200, 1700);
    ai.destX = Math.cos(a) * r;
    ai.destY = Math.sin(a) * r;
  }
}

function startFlee(w: World, s: Ship) {
  const ai = s.ai!;
  ai.mode = 'flee';
  const att = s.lastAttacker;
  const away = att ? Math.atan2(s.y - att.y, s.x - att.x) : Math.atan2(s.y, s.x);
  let best = away;
  let bestD = Infinity;
  for (const id of w.sys.links) {
    const o = SYSTEMS[id]!;
    const a = Math.atan2(o.y - w.sys.y, o.x - w.sys.x);
    const d = Math.abs(angleDiff(a, away));
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  ai.jumpAngle = best;
}

function findTarget(w: World, s: Ship, range: number): Ship | null {
  const ai = s.ai!;
  let best: Ship | null = null;
  let bestScore = Infinity;
  for (const o of w.ships) {
    if (o === s || !o.active || w.sameGroup(s, o) || !w.isHostile(s, o)) continue;
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    if (d > range) continue;
    if (o.disabled) {
      if (ai.role === 'pirate') {
        if (o.plundered) continue;
      } else if (!o.isPlayer && o.gov !== 'corsair') continue;
    }
    let score = d;
    if (s.target === o) score *= 0.6;
    if (o.isPlayer && ai.role === 'pirate') score *= 0.75;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

function think(w: World, s: Ship) {
  const ai = s.ai!;
  if (s.target && (!s.target.active || s.target.dead)) s.target = null;
  const armorFrac = s.armor / s.stats.maxArmor;
  const recentlyHit = w.time - ai.attackedAt < 6;

  if (ai.mode !== 'flee' && ai.mode !== 'jump' && ai.mode !== 'land' && recentlyHit && armorFrac < ai.bravery && ai.role !== 'escort') {
    startFlee(w, s);
    return;
  }

  if (ai.role === 'trader') {
    if (recentlyHit && ai.mode !== 'flee' && ai.mode !== 'fight') {
      const att = s.lastAttacker;
      if (att && att.active && s.guns.length && armorFrac > 0.75 && Math.random() < 0.35) {
        s.target = att;
        ai.mode = 'fight';
      } else {
        startFlee(w, s);
      }
    } else if (ai.mode === 'fight' && (!s.target || !recentlyHit)) {
      s.target = null;
      chooseGoal(w, s);
    }
    return;
  }

  if (ai.role === 'escort' && s.playerEscort) {
    thinkPlayerEscort(w, s);
    return;
  }

  if (ai.role === 'escort') {
    const L = s.leader;
    if (!L || L.gone || L.dead) {
      s.leader = null;
      ai.role = s.gov === 'corsair' ? 'pirate' : 'patrol';
      chooseGoal(w, s);
      return;
    }
    if (ai.mode === 'land' || ai.mode === 'jump' || ai.mode === 'flee') return;
    let t: Ship | null = null;
    if (L.target && L.target.active && w.isHostile(s, L.target) && (L.ai?.mode === 'fight' || L.ai?.mode === 'board')) {
      t = L.target;
    }
    if (!t && s.lastAttacker?.active && recentlyHit && w.isHostile(s, s.lastAttacker)) t = s.lastAttacker;
    if (!t && L.lastAttacker?.active && L.ai && w.time - L.ai.attackedAt < 6 && w.isHostile(s, L.lastAttacker)) {
      t = L.lastAttacker;
    }
    if (!t && L.ai?.mode === 'flee') {
      ai.mode = 'flee';
      ai.jumpAngle = L.ai.jumpAngle;
      return;
    }
    if (t) {
      s.target = t;
      ai.mode = 'fight';
    } else {
      s.target = null;
      ai.mode = 'follow';
    }
    return;
  }

  const range = ai.role === 'pirate' ? 2000 : 1700;
  const t = findTarget(w, s, range);
  if (t) {
    s.target = t;
    ai.mode = t.disabled && ai.role === 'pirate' && !t.plundered ? 'board' : 'fight';
  } else if (ai.mode === 'fight' || ai.mode === 'board') {
    s.target = null;
    chooseGoal(w, s);
  } else if (ai.mode === 'travel' && w.time > ai.leaveAt) {
    leave(w, s);
  }
}

/** Wingmen in the player's fleet: guard the player and fight what the player fights. */
function thinkPlayerEscort(w: World, s: Ship) {
  const ai = s.ai!;
  const L = s.leader;
  if (!L || L.dead || L.gone) {
    s.leader = null;
    startFlee(w, s);
    return;
  }
  if (ai.mode === 'land' || ai.mode === 'jump' || ai.mode === 'flee') return;
  if (s.client) {
    s.target = null;
    ai.mode = 'follow';
    return;
  }
  const ok = (o: Ship | null | undefined): o is Ship => !!o && o.active && !o.disabled && !o.isPlayer && !o.playerEscort;
  const near = (o: Ship) => Math.hypot(o.x - L.x, o.y - L.y) < 1600;
  let t: Ship | null = null;
  if (ok(L.target) && w.hostileToPlayer(L.target)) t = L.target;
  if (t && !near(t) && Math.hypot(s.x - L.x, s.y - L.y) > 2200) t = null;
  if (!t && ok(L.lastAttacker) && near(L.lastAttacker) && w.time - L.hitAt < 8 && w.hostileToPlayer(L.lastAttacker)) t = L.lastAttacker;
  if (!t && ok(s.lastAttacker) && near(s.lastAttacker) && w.time - s.hitAt < 8 && w.hostileToPlayer(s.lastAttacker)) t = s.lastAttacker;
  if (!t) {
    let bestD = 1100;
    for (const o of w.ships) {
      if (!ok(o) || !w.hostileToPlayer(o)) continue;
      const d = Math.hypot(o.x - L.x, o.y - L.y);
      if (d < bestD) {
        bestD = d;
        t = o;
      }
    }
  }
  if (t) {
    s.target = t;
    ai.mode = 'fight';
  } else {
    s.target = null;
    ai.mode = 'follow';
  }
}

export function updateAI(w: World, s: Ship, dt: number) {
  s.thrusting = false;
  s.fireGuns = false;
  s.fireTurrets = false;
  s.fireSecondary = false;
  s.afterburning = false;
  if (s.state !== 'flying' || s.disabled || s.dead) return;
  const ai = s.ai!;
  ai.secCd -= dt;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = rand(0.3, 0.6);
    think(w, s);
  }
  switch (ai.mode) {
    case 'fight':
      fight(w, s, dt);
      break;
    case 'flee':
      flee(w, s, dt);
      break;
    case 'jump':
      jump(w, s, dt);
      break;
    case 'land':
      land(w, s, dt);
      break;
    case 'travel':
      travel(w, s, dt);
      break;
    case 'follow':
      follow(w, s, dt);
      break;
    case 'board':
      board(w, s, dt);
      break;
  }
}

function fight(w: World, s: Ship, dt: number) {
  const ai = s.ai!;
  const t = s.target;
  if (!t || !t.active || t.dead) {
    s.target = null;
    chooseGoal(w, s);
    return;
  }
  if (t.disabled && ai.role === 'pirate' && !t.plundered) {
    ai.mode = 'board';
    return;
  }
  if (t.disabled && s.playerEscort) {
    s.target = null;
    ai.mode = 'follow';
    return;
  }
  const gun = s.mainGun();
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d = Math.hypot(dx, dy);
  const range = gun ? s.gunRange() : 520;
  const aim = gun && gun.w.kind !== 'beam' ? w.leadAngle(s, t, gun.w.speed) : Math.atan2(dy, dx);
  const diff = turnToward(s, aim, dt);
  const closing = -((t.vx - s.vx) * dx + (t.vy - s.vy) * dy) / Math.max(d, 1);
  const prefer = Math.max(150, range * 0.5);
  if (Math.abs(diff) < 0.5) {
    if (d > prefer || closing < 50) s.thrusting = true;
  } else if (d > range * 1.3 && Math.abs(diff) < 1.3) {
    s.thrusting = true;
  }
  const tol = 0.05 + Math.atan2(t.radius, Math.max(d, 1));
  s.fireGuns = !!gun && d < range * 1.02 && Math.abs(diff) < tol;
  s.fireTurrets = true;
  const sec = s.secondary();
  if (sec && ai.secCd <= 0 && s.hasAmmoFor(sec)) {
    const rocket = sec.w.kind === 'rocket';
    const sr = sec.w.speed * sec.w.life * (rocket ? 0.75 : 0.55);
    if (d < sr && Math.abs(diff) < (rocket ? 0.1 : 0.5)) {
      s.fireSecondary = true;
      ai.secCd = rand(1.4, 3.8);
    }
  }
}

function flee(w: World, s: Ship, dt: number) {
  const ai = s.ai!;
  const diff = turnToward(s, ai.jumpAngle, dt);
  if (Math.abs(diff) < 0.6) s.thrusting = true;
  s.fireTurrets = true;
  if (Math.hypot(s.x, s.y) > NPC_JUMP_DIST * 0.8 && Math.abs(diff) < 0.25) startJumpOut(s, ai.jumpAngle);
}

function jump(w: World, s: Ship, dt: number) {
  const ai = s.ai!;
  const diff = turnToward(s, ai.jumpAngle, dt);
  if (Math.abs(diff) < 0.5) s.thrusting = true;
  if (Math.hypot(s.x, s.y) > NPC_JUMP_DIST && Math.abs(diff) < 0.15) startJumpOut(s, ai.jumpAngle);
  void w;
}

function land(w: World, s: Ship, dt: number) {
  const ai = s.ai!;
  const p = ai.planet;
  if (!p) {
    chooseGoal(w, s);
    return;
  }
  arrive(s, p.x, p.y, 0, 0, dt);
  const d = Math.hypot(p.x - s.x, p.y - s.y);
  if (d < p.r * 0.5 + 10 && s.speed < 70) {
    s.state = 'landing';
    s.landPlanet = p;
    s.stateT = 0;
    s.stateDur = 1.2;
  }
}

function travel(w: World, s: Ship, dt: number) {
  const ai = s.ai!;
  arrive(s, ai.destX, ai.destY, 0, 0, dt);
  if (Math.hypot(ai.destX - s.x, ai.destY - s.y) < 160) chooseGoal(w, s);
}

function follow(w: World, s: Ship, dt: number) {
  const ai = s.ai!;
  const L = s.leader;
  if (!L || !L.active) {
    if (L?.state === 'landing' && L.landPlanet) {
      ai.mode = 'land';
      ai.planet = L.landPlanet;
    } else if (L?.state === 'jumpout') {
      ai.mode = 'jump';
      ai.jumpAngle = L.jumpAngle;
    }
    return;
  }
  const c = Math.cos(L.angle);
  const sn = Math.sin(L.angle);
  const tx = L.x + s.formX * c - s.formY * sn;
  const ty = L.y + s.formX * sn + s.formY * c;
  arrive(s, tx, ty, L.vx, L.vy, dt);
  if (!s.thrusting && Math.hypot(tx - s.x, ty - s.y) < 40) turnToward(s, L.angle, dt);
}

function board(w: World, s: Ship, dt: number) {
  const ai = s.ai!;
  const t = s.target;
  if (!t || !t.active || t.dead || !t.disabled || t.plundered) {
    s.target = null;
    ai.boardT = 0;
    chooseGoal(w, s);
    return;
  }
  arrive(s, t.x, t.y, t.vx, t.vy, dt);
  const d = Math.hypot(t.x - s.x, t.y - s.y);
  const rel = Math.hypot(t.vx - s.vx, t.vy - s.vy);
  if (d < s.radius + t.radius + 18 && rel < 55) {
    ai.boardT += dt;
    if (ai.boardT > 1.6) {
      w.boarded(s, t);
      ai.boardT = 0;
      s.target = null;
      leave(w, s);
    }
  } else {
    ai.boardT = 0;
  }
}
