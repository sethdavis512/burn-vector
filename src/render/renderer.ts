import { rgba, shade } from '../core/color';
import { TAU, clamp, fmt, rand } from '../core/math';
import { GOVS } from '../data/governments';
import { SYSTEMS } from '../data/galaxy';
import { SHIP_LIST } from '../data/ships';
import type { PlanetDef, ShipDef, SystemDef } from '../data/types';
import { JUMP_DIST } from '../game/constants';
import type { Ship } from '../game/entities';
import type { Game } from '../game/game';
import { cargoUsed, fmtDate } from '../game/player';
import type { World } from '../game/world';
import { isStation, renderPlanet, renderStar, renderStation, type StationSprite } from './planets';
import { drawShip } from './shipArt';
import { glowSprite, smokeSprite } from './sprites';
import { Starfield } from './starfield';

export const SIDEBAR_W = 240;
const MONO = '"Share Tech Mono", ui-monospace, monospace';
const SANS = '"Chakra Petch", system-ui, sans-serif';

interface TitleShip {
  def: ShipDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  w = 0;
  h = 0;
  zoom = 1;
  starfield = new Starfield();
  private sysId: string | null = null;
  private planetSprites = new Map<string, HTMLCanvasElement>();
  private stationSprites = new Map<string, StationSprite>();
  private titleShips: TitleShip[] = [];
  private titleT = 0;
  private thumbCache = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.starfield.setNebula('#2a4c9a', 7, 0.6);
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  get viewW() {
    return this.w - SIDEBAR_W;
  }

  prepareSystem(sys: SystemDef) {
    if (this.sysId === sys.id) return;
    this.sysId = sys.id;
    const strength = sys.id === 'shroud' ? 1 : sys.region === 'shoal' ? 0.75 : 0.6;
    let seed = 0;
    for (const ch of sys.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    this.starfield.setNebula(sys.nebula, seed, strength);
    for (const p of sys.planets) {
      if (isStation(p)) this.stationSprites.set(p.id, renderStation(p, p.r));
      else {
        const light = sys.star ? Math.atan2(-p.y, -p.x) : -2.3;
        this.planetSprites.set(p.id, renderPlanet(p, p.r, light));
      }
    }
  }

  screenToWorld(game: Game, sx: number, sy: number) {
    const s = game.ship;
    if (!s) return { x: 0, y: 0 };
    return { x: s.x + (sx - this.viewW / 2) / this.zoom, y: s.y + (sy - this.h / 2) / this.zoom };
  }

  render(game: Game, dt: number) {
    if (window.innerWidth !== this.w || window.innerHeight !== this.h) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (game.mode === 'title') {
      this.drawTitle(dt);
      return;
    }
    if (game.world && game.ship && (game.mode === 'space' || game.mode === 'dead')) {
      this.drawSpace(game, game.world, game.ship);
      this.drawHud(game, game.world, game.ship);
      return;
    }
    ctx.fillStyle = '#03050b';
    ctx.fillRect(0, 0, this.w, this.h);
    this.titleT += dt;
    this.starfield.draw(ctx, this.titleT * 6, this.titleT * 2, this.w, this.h);
  }

  // ── Title backdrop ─────────────────────────────────────────────

  private drawTitle(dt: number) {
    const ctx = this.ctx;
    this.titleT += dt;
    ctx.fillStyle = '#03050b';
    ctx.fillRect(0, 0, this.w, this.h);
    this.starfield.draw(ctx, this.titleT * 40, this.titleT * 12, this.w, this.h);
    if (this.titleShips.length < 5 && Math.random() < dt * 0.6) {
      const def = SHIP_LIST[Math.floor(rand(0, SHIP_LIST.length))]!;
      const fromLeft = Math.random() < 0.5;
      const speed = rand(60, 140) * (40 / Math.max(40, def.len)) + 30;
      const angle = (fromLeft ? 0 : Math.PI) + rand(-0.25, 0.25);
      this.titleShips.push({
        def,
        x: fromLeft ? -200 : this.w + 200,
        y: rand(this.h * 0.15, this.h * 0.85),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        angle,
      });
    }
    for (const t of this.titleShips) {
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      drawShip(ctx, t.def, t.x, t.y, t.angle, { thrust: 1, time: this.titleT, scale: 1.3 });
    }
    this.titleShips = this.titleShips.filter((t) => t.x > -400 && t.x < this.w + 400);
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.2, this.w / 2, this.h / 2, this.h * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  // ── Space view ─────────────────────────────────────────────────

  private drawSpace(game: Game, w: World, me: Ship) {
    const ctx = this.ctx;
    const vw = this.viewW;
    const vh = this.h;
    const shake = w.shake;
    const camX = me.x + (shake > 0 ? rand(-1, 1) * shake * 8 : 0);
    const camY = me.y + (shake > 0 ? rand(-1, 1) * shake * 8 : 0);
    const z = this.zoom;
    const time = game.time;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, vw, vh);
    ctx.clip();
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, vw, vh);
    this.starfield.draw(ctx, camX, camY, vw, vh);
    if (game.jumpFx > 0.01) this.starfield.drawStreaks(ctx, vw, vh, game.jumpAngle, game.jumpFx, time);

    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(z, z);
    ctx.translate(-camX, -camY);

    this.drawStars(w.sys, time);
    this.drawPlanets(game, w.sys, time);
    if (game.route.length && Math.hypot(me.x, me.y) < JUMP_DIST + 400) {
      ctx.strokeStyle = 'rgba(120,180,255,0.12)';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([18 / z, 14 / z]);
      ctx.beginPath();
      ctx.arc(0, 0, JUMP_DIST, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const ships = [...w.ships].sort((a, b) => b.def.len - a.def.len);
    for (const s of ships) this.drawShipEntity(s, time);
    this.drawProjectiles(w);
    this.drawBeams(w);
    this.drawParticles(w);
    for (const s of ships) this.drawShield(s);
    if (me.target && !me.target.gone) this.drawBrackets(me.target, w.hostileToPlayer(me.target) ? '#ff5050' : '#ffd860', z);
    if (game.navPlanet) this.drawPlanetBrackets(game.navPlanet, z);
    ctx.restore();

    this.drawIndicators(game, me, vw, vh);
    this.drawMessages(game, vh);
    this.drawBanner(game, vw, vh);
    this.drawStatus(game, me, vw);
    this.drawObjective(game, vw);
    if (me.hitFlash > 0.05 && me.shield <= 0) {
      const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vh * 0.8);
      g.addColorStop(0, 'rgba(255,40,20,0)');
      g.addColorStop(1, `rgba(255,40,20,${me.hitFlash * 0.25})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (game.jumpFlash > 0) {
      ctx.fillStyle = `rgba(230,240,255,${game.jumpFlash})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    ctx.restore();
  }

  private drawStars(sys: SystemDef, time: number) {
    const ctx = this.ctx;
    const draw = (x: number, y: number, r: number, color: string, seed: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 1 + Math.sin(time * 0.6 + seed) * 0.04;
      const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 7 * pulse);
      glow.addColorStop(0, rgba(color, 0.32));
      glow.addColorStop(0.2, rgba(color, 0.12));
      glow.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 7 * pulse, 0, TAU);
      ctx.fill();
      ctx.restore();
      const spr = renderStar(color, r, seed);
      ctx.drawImage(spr, x - spr.width / 2, y - spr.height / 2);
    };
    if (sys.star) draw(0, 0, sys.star.r, sys.star.color, sys.x * 7 + sys.y);
    if (sys.star2) draw(sys.star2.x, sys.star2.y, sys.star2.r, sys.star2.color, sys.x + sys.y * 3);
  }

  private drawPlanets(game: Game, sys: SystemDef, time: number) {
    const ctx = this.ctx;
    for (const p of sys.planets) {
      if (isStation(p)) {
        const st = this.stationSprites.get(p.id);
        if (!st) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(time * st.spin);
        ctx.drawImage(st.canvas, -st.canvas.width / 2, -st.canvas.height / 2);
        ctx.globalCompositeOperation = 'lighter';
        for (const l of st.lights) {
          const on = (time + l.phase) % 1.6 < 0.25;
          if (!on) continue;
          ctx.drawImage(glowSprite(l.color), l.x - 7, l.y - 7, 14, 14);
        }
        ctx.restore();
      } else {
        const spr = this.planetSprites.get(p.id);
        if (spr) ctx.drawImage(spr, p.x - spr.width / 2, p.y - spr.height / 2);
      }
    }
    void game;
  }

  private drawShipEntity(s: Ship, time: number) {
    if (s.gone) return;
    const aims = s.turrets.length ? s.turrets.map((m) => m.aim) : undefined;
    drawShip(this.ctx, s.def, s.x, s.y, s.angle, {
      thrust: s.thrust,
      time: time + s.lightPhase,
      disabled: s.disabled,
      alpha: s.alpha,
      scale: s.scale,
      hitFlash: s.hitFlash,
      turretAims: aims,
    });
  }

  private drawShield(s: Ship) {
    if (s.shieldFlash < 0.03 || s.gone || s.dead) return;
    const ctx = this.ctx;
    const r = s.def.len * 0.62 * s.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const col = s.gov === 'vael' ? '#d8a8ff' : '#7cc8ff';
    const g = ctx.createRadialGradient(s.x, s.y, r * 0.55, s.x, s.y, r);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.85, rgba(col, 0.18 * s.shieldFlash));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba('#e0f4ff', 0.75 * s.shieldFlash);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 0.95, s.shieldHitAngle - 0.6, s.shieldHitAngle + 0.6);
    ctx.stroke();
    ctx.restore();
  }

  private drawProjectiles(w: World) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of w.projectiles) {
      const wd = p.w;
      const c = Math.cos(p.angle);
      const s = Math.sin(p.angle);
      const fade = Math.min(1, p.life / 0.12);
      if (wd.kind === 'bolt') {
        const width = wd.width ?? 2;
        if (width >= 6) {
          const r = width * 2.2;
          ctx.globalAlpha = fade;
          ctx.drawImage(glowSprite(wd.color), p.x - r * 1.5, p.y - r * 1.5, r * 3, r * 3);
          ctx.globalAlpha = 1;
          continue;
        }
        const len = wd.length ?? 12;
        ctx.strokeStyle = rgba(wd.color, 0.4 * fade);
        ctx.lineWidth = width * 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - c * len, p.y - s * len);
        ctx.stroke();
        ctx.strokeStyle = rgba(wd.core ?? '#ffffff', fade);
        ctx.lineWidth = Math.max(1, width * 0.8);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - c * len * 0.8, p.y - s * len * 0.8);
        ctx.stroke();
      } else if (wd.kind === 'torpedo') {
        const pulse = 9 + Math.sin(p.life * 30) * 2;
        ctx.drawImage(glowSprite(wd.color), p.x - pulse * 1.6, p.y - pulse * 1.6, pulse * 3.2, pulse * 3.2);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#d8d4cc';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(p.x + c * 4, p.y + s * 4);
        ctx.lineTo(p.x - c * 5, p.y - s * 5);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite(wd.color), p.x - c * 7 - 6, p.y - s * 7 - 6, 12, 12);
      }
    }
    ctx.restore();
  }

  private drawBeams(w: World) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of w.ships) {
      for (const m of [...s.guns, ...s.turrets]) {
        if (!m.beamOn || m.w.kind !== 'beam') continue;
        const ex = m.beamX + Math.cos(m.beamAngle) * m.beamLen;
        const ey = m.beamY + Math.sin(m.beamAngle) * m.beamLen;
        const width = (m.w.width ?? 3) * (0.85 + Math.random() * 0.3);
        ctx.strokeStyle = rgba(m.w.color, 0.35);
        ctx.lineWidth = width * 3.2;
        ctx.beginPath();
        ctx.moveTo(m.beamX, m.beamY);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = rgba(m.w.core ?? '#ffffff', 0.95);
        ctx.lineWidth = width * 0.7;
        ctx.stroke();
        ctx.drawImage(glowSprite(m.w.color), ex - 10, ey - 10, 20, 20);
      }
    }
    ctx.restore();
  }

  private drawParticles(w: World) {
    const ctx = this.ctx;
    const items = w.fx.items;
    // Smoke and debris use normal blending, everything else is additive.
    for (const p of items) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'smoke' || p.kind === 'trail') {
        ctx.globalAlpha = a * (p.kind === 'smoke' ? 0.5 : 0.35);
        const s = p.size;
        ctx.drawImage(smokeSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.kind === 'debris') {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of items) {
      const a = clamp(p.life / p.max, 0, 1);
      switch (p.kind) {
        case 'spark': {
          ctx.strokeStyle = rgba(p.color, a);
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        }
        case 'fire':
        case 'glow':
        case 'flash': {
          const s = p.kind === 'flash' ? p.size * (1.2 - a * 0.2) : p.size;
          ctx.globalAlpha = p.kind === 'flash' ? a * a : a;
          ctx.drawImage(glowSprite(p.color, p.kind !== 'fire'), p.x - s, p.y - s, s * 2, s * 2);
          ctx.globalAlpha = 1;
          break;
        }
        case 'ring': {
          ctx.strokeStyle = rgba(p.color, a * a * 0.45);
          ctx.lineWidth = 1 + a * 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, TAU);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.restore();
  }

  private drawBrackets(s: Ship, color: string, z: number) {
    const ctx = this.ctx;
    const r = Math.max(18, s.def.len * 0.6) * s.scale + 6;
    const k = r * 0.4;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / z;
    ctx.globalAlpha = 0.9;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(s.x + sx * r, s.y + sy * (r - k));
      ctx.lineTo(s.x + sx * r, s.y + sy * r);
      ctx.lineTo(s.x + sx * (r - k), s.y + sy * r);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlanetBrackets(p: PlanetDef, z: number) {
    const ctx = this.ctx;
    const r = p.r + 14;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,200,255,0.75)';
    ctx.lineWidth = 1.5 / z;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, a - 0.25, a + 0.25);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawIndicators(game: Game, me: Ship, vw: number, vh: number) {
    const ctx = this.ctx;
    const mark = (wx: number, wy: number, color: string, label: string) => {
      const dx = (wx - me.x) * this.zoom;
      const dy = (wy - me.y) * this.zoom;
      const margin = 26;
      if (Math.abs(dx) < vw / 2 - margin && Math.abs(dy) < vh / 2 - margin) return;
      const a = Math.atan2(dy, dx);
      const sx = clamp(vw / 2 + dx, margin, vw - margin);
      const sy = clamp(vh / 2 + dy, margin, vh - margin);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = `11px ${MONO}`;
      ctx.fillStyle = color;
      ctx.textAlign = sx > vw - 120 ? 'right' : 'left';
      ctx.fillText(label, sx + (sx > vw - 120 ? -14 : 14), sy + 4);
      ctx.textAlign = 'left';
    };
    if (game.navPlanet) mark(game.navPlanet.x, game.navPlanet.y, 'rgba(120,200,255,0.9)', game.navPlanet.name);
    const t = me.target;
    if (t && !t.gone && game.world) mark(t.x, t.y, game.world.hostileToPlayer(t) ? '#ff6060' : '#ffd860', t.title ?? t.def.name);
  }

  private drawMessages(game: Game, vh: number) {
    const ctx = this.ctx;
    ctx.font = `13px ${MONO}`;
    const list = game.messages.slice(-6);
    let y = vh - 18 - (list.length - 1) * 18;
    for (const m of list) {
      const age = game.time - m.t;
      const a = clamp(1 - (age - 7) / 2, 0, 1);
      if (a <= 0) {
        y += 18;
        continue;
      }
      ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`;
      const tw = ctx.measureText(m.text).width;
      ctx.fillRect(10, y - 13, tw + 14, 18);
      ctx.fillStyle = rgba(m.color, a);
      ctx.fillText(m.text, 17, y);
      y += 18;
    }
  }

  private drawBanner(game: Game, vw: number, vh: number) {
    const b = game.banner;
    if (!b) return;
    const age = game.time - b.t;
    const a = clamp(Math.min(age / 0.5, (4.5 - age) / 1), 0, 1);
    if (a <= 0) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = `rgba(230,240,255,${a})`;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;
    ctx.fillText(b.title.toUpperCase(), vw / 2, vh * 0.22);
    if (b.sub) {
      ctx.font = `14px ${MONO}`;
      ctx.fillStyle = rgba(b.color ?? '#9fc4ff', a);
      ctx.fillText(b.sub, vw / 2, vh * 0.22 + 28);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  /** "What next" panel in the top-left corner, under the sound and help buttons. */
  private drawObjective(game: Game, vw: number) {
    const o = game.objective;
    if (!o || !game.showGuide || game.mode !== 'space') return;
    const ctx = this.ctx;
    const x = 12;
    const y = 56;
    const w = Math.min(430, vw - 24);
    const pad = 12;
    ctx.font = `12px ${MONO}`;
    const lines = wrapLines(ctx, o.detail, w - pad * 2).slice(0, 4);
    const h = pad + 13 + 19 + lines.length * 16 + pad - 4;
    ctx.fillStyle = 'rgba(4,9,18,0.74)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f0b54a';
    ctx.fillRect(x, y, 2, h);
    ctx.strokeStyle = 'rgba(80,110,150,0.35)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.font = `600 10px ${SANS}`;
    ctx.fillStyle = '#f0b54a';
    ctx.fillText(o.kicker.toUpperCase(), x + pad, y + pad + 8);
    ctx.font = `600 14px ${SANS}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitText(ctx, o.title, w - pad * 2), x + pad, y + pad + 27);
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = '#a9bbd2';
    lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + 46 + i * 16));
  }

  private drawStatus(game: Game, me: Ship, vw: number) {
    const ctx = this.ctx;
    let text = '';
    let color = '#9fd8ff';
    if (me.disabled && !me.dead) {
      text = 'SHIP DISABLED';
      color = '#ff6a50';
    } else if (game.autopilot?.kind === 'land') text = `AUTOPILOT · LANDING ON ${game.autopilot.planet?.name.toUpperCase()}`;
    else if (game.autopilot?.kind === 'jump') text = `AUTOPILOT · HYPERSPACE TO ${SYSTEMS[game.route[0] ?? '']?.name.toUpperCase() ?? ''}`;
    else if (me.state === 'jumpout') text = 'ENTERING HYPERSPACE';
    if (!text) return;
    ctx.font = `13px ${MONO}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,10,20,0.6)';
    ctx.fillRect(vw / 2 - tw / 2 - 12, 14, tw + 24, 24);
    ctx.strokeStyle = rgba(color, 0.5);
    ctx.strokeRect(vw / 2 - tw / 2 - 12 + 0.5, 14.5, tw + 24, 24);
    ctx.fillStyle = color;
    ctx.fillText(text, vw / 2, 31);
    ctx.textAlign = 'left';
  }

  // ── Sidebar HUD ────────────────────────────────────────────────

  private drawHud(game: Game, w: World, me: Ship) {
    const ctx = this.ctx;
    const x0 = this.viewW;
    const W = SIDEBAR_W;
    const H = this.h;
    const ps = game.ps!;
    const bg = ctx.createLinearGradient(x0, 0, x0 + W, 0);
    bg.addColorStop(0, '#0b111c');
    bg.addColorStop(1, '#101826');
    ctx.fillStyle = bg;
    ctx.fillRect(x0, 0, W, H);
    ctx.fillStyle = '#2a3a52';
    ctx.fillRect(x0, 0, 1, H);
    ctx.fillStyle = 'rgba(120,170,255,0.06)';
    ctx.fillRect(x0 + 1, 0, 1, H);

    const pad = 12;
    const radarSize = W - pad * 2;
    this.drawRadar(game, w, me, x0 + pad, pad, radarSize);
    let y = pad + radarSize + 14;

    const bar = (label: string, frac: number, color: string, text: string) => {
      ctx.font = `11px ${MONO}`;
      ctx.fillStyle = '#7f93ad';
      ctx.fillText(label, x0 + pad, y + 9);
      const bx = x0 + pad + 56;
      const bw = W - pad * 2 - 56;
      ctx.fillStyle = '#060a12';
      ctx.fillRect(bx, y, bw, 11);
      const f = clamp(frac, 0, 1);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, shade(color, -0.35));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fillRect(bx, y, bw * f, 11);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(bx, y, bw * f, 3);
      ctx.strokeStyle = '#24344a';
      ctx.strokeRect(bx + 0.5, y + 0.5, bw - 1, 10);
      ctx.fillStyle = '#d8e6f8';
      ctx.font = `10px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(text, bx + bw - 3, y + 9);
      ctx.textAlign = 'left';
      y += 19;
    };
    const st = me.stats;
    bar('SHIELD', me.shield / st.maxShield, '#4aa8ff', `${Math.round((me.shield / st.maxShield) * 100)}%`);
    bar('ARMOR', me.armor / st.maxArmor, '#ff8a3c', `${Math.round((Math.max(0, me.armor) / st.maxArmor) * 100)}%`);
    const jumps = Math.floor(me.fuel / 100);
    bar('FUEL', me.fuel / st.maxFuel, '#5ee08a', `${jumps} jump${jumps === 1 ? '' : 's'}`);
    y += 6;

    const section = (title: string) => {
      ctx.fillStyle = '#1e2c40';
      ctx.fillRect(x0 + pad, y, W - pad * 2, 1);
      y += 14;
      ctx.font = `600 10px ${SANS}`;
      ctx.fillStyle = '#f0b54a';
      ctx.fillText(title, x0 + pad, y);
      y += 15;
    };
    const line = (text: string, color = '#c8d6e8', size = 12) => {
      ctx.font = `${size}px ${MONO}`;
      ctx.fillStyle = color;
      ctx.fillText(fitText(ctx, text, W - pad * 2), x0 + pad, y);
      y += size + 4;
    };

    section('NAVIGATION');
    if (game.route.length) {
      const dest = SYSTEMS[game.route[game.route.length - 1]!]!;
      line(dest.name, '#ffffff');
      line(`${game.route.length} jump${game.route.length === 1 ? '' : 's'} · next ${SYSTEMS[game.route[0]!]!.name}`, '#7f93ad', 11);
    } else {
      line('No route plotted', '#5f7390');
      line('M: galaxy map', '#3f5370', 11);
    }
    if (game.navPlanet) {
      const d = Math.hypot(game.navPlanet.x - me.x, game.navPlanet.y - me.y);
      line(`◎ ${game.navPlanet.name}`, '#8fd0ff', 11);
      line(`  ${fmt(d)} km`, '#5f7390', 11);
    }

    section('SECONDARY');
    const sec = me.secondary();
    if (sec) {
      const ammo = sec.w.ammo ? me.ammo[sec.w.ammo] ?? 0 : 0;
      line(sec.o.name, '#ffffff');
      line(sec.w.ammo ? `Ammo: ${ammo}` : 'Ready', ammo > 0 ? '#9fd8a0' : '#ff7a6a', 11);
    } else {
      line('None', '#5f7390');
    }
    const fleet = w.ships.filter((s) => s.playerEscort && !s.gone);
    if (fleet.length) {
      const worst = Math.min(...fleet.map((s) => s.armor / s.stats.maxArmor));
      line(`Fleet: ${fleet.length} ship${fleet.length > 1 ? 's' : ''} · ${Math.round(worst * 100)}% min armor`, '#56e08a', 11);
    }

    section('TARGET');
    this.drawTargetPanel(game, w, me, x0 + pad, y, W - pad * 2);
    y += 128;

    const bottom = H - 70;
    y = Math.max(y + 8, bottom);
    ctx.fillStyle = '#1e2c40';
    ctx.fillRect(x0 + pad, y - 14, W - pad * 2, 1);
    const cargo = cargoUsed(ps);
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = '#7f93ad';
    ctx.fillText('CREDITS', x0 + pad, y);
    ctx.fillText('CARGO', x0 + pad, y + 17);
    ctx.fillText('DATE', x0 + pad, y + 34);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd98a';
    ctx.fillText(`${fmt(ps.credits)} cr`, x0 + W - pad, y);
    ctx.fillStyle = '#c8d6e8';
    ctx.fillText(`${cargo} / ${me.stats.cargo} t`, x0 + W - pad, y + 17);
    ctx.fillText(fmtDate(ps.day), x0 + W - pad, y + 34);
    ctx.textAlign = 'left';
  }

  private drawTargetPanel(game: Game, w: World, me: Ship, x: number, y: number, width: number) {
    const ctx = this.ctx;
    const t = me.target;
    ctx.fillStyle = '#060a12';
    ctx.fillRect(x, y - 4, width, 120);
    ctx.strokeStyle = '#1e2c40';
    ctx.strokeRect(x + 0.5, y - 3.5, width - 1, 119);
    if (!t || t.gone) {
      ctx.font = `12px ${MONO}`;
      ctx.fillStyle = '#3f5370';
      ctx.fillText('No target', x + 10, y + 18);
      ctx.font = `11px ${MONO}`;
      ctx.fillText('Tab: cycle   R: nearest', x + 10, y + 36);
      ctx.fillText('hostile', x + 10, y + 50);
      return;
    }
    // Live thumbnail of the target at its current heading.
    const box = 76;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, y, box, box);
    ctx.clip();
    const fit = Math.min(2.2, (box * 0.8) / t.def.len);
    drawShip(ctx, t.def, x + 4 + box / 2, y + box / 2, t.angle, { scale: fit, disabled: t.disabled, lights: false, time: game.time });
    ctx.restore();
    const hostile = w.hostileToPlayer(t);
    const tx = x + box + 10;
    const tw = width - box - 14;
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = '#ffffff';
    const name = t.title ?? t.def.name;
    wrapText(ctx, name, tx, y + 12, tw, 14, 2);
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = GOVS[t.gov].color;
    ctx.fillText(fitText(ctx, GOVS[t.gov].short, tw), tx, y + 44);
    ctx.fillStyle = t.playerEscort ? '#56e08a' : t.disabled ? '#ffb04a' : hostile ? '#ff6060' : '#e8d84a';
    ctx.fillText(t.dead ? 'DESTROYED' : t.playerEscort ? 'YOUR ESCORT' : t.disabled ? 'DISABLED' : hostile ? 'HOSTILE' : 'NEUTRAL', tx, y + 58);
    const d = Math.hypot(t.x - me.x, t.y - me.y);
    ctx.fillStyle = '#7f93ad';
    ctx.fillText(`${fmt(d)} km`, tx, y + 72);
    const mini = (label: string, frac: number, color: string, yy: number) => {
      ctx.fillStyle = '#7f93ad';
      ctx.font = `10px ${MONO}`;
      ctx.fillText(label, x + 6, yy + 8);
      ctx.fillStyle = '#0e1622';
      ctx.fillRect(x + 50, yy, width - 58, 8);
      ctx.fillStyle = color;
      ctx.fillRect(x + 50, yy, (width - 58) * clamp(frac, 0, 1), 8);
    };
    mini('SHIELD', t.shield / t.stats.maxShield, '#4aa8ff', y + 86);
    mini('ARMOR', t.armor / t.stats.maxArmor, '#ff8a3c', y + 100);
  }

  private drawRadar(game: Game, w: World, me: Ship, x: number, y: number, size: number) {
    const ctx = this.ctx;
    const range = 3600;
    const half = size / 2;
    const k = half / range;
    const cx = x + half;
    const cy = y + half;
    ctx.save();
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, half * 1.4);
    bg.addColorStop(0, '#0a1a1c');
    bg.addColorStop(1, '#040a0e');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, size, size);
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.strokeStyle = 'rgba(80,200,170,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (size * i) / 4, y);
      ctx.lineTo(x + (size * i) / 4, y + size);
      ctx.moveTo(x, y + (size * i) / 4);
      ctx.lineTo(x + size, y + (size * i) / 4);
      ctx.stroke();
    }
    const toR = (wx: number, wy: number) => [cx + (wx - me.x) * k, cy + (wy - me.y) * k] as const;
    if (w.sys.star) {
      const [sx, sy] = toR(0, 0);
      ctx.fillStyle = rgba(w.sys.star.color, 0.8);
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, TAU);
      ctx.fill();
    }
    if (game.route.length) {
      const [jx, jy] = toR(0, 0);
      ctx.strokeStyle = 'rgba(120,180,255,0.18)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(jx, jy, JUMP_DIST * k, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const p of w.sys.planets) {
      const [px, py] = toR(p.x, p.y);
      const pr = Math.max(2.5, p.r * k * 1.4);
      ctx.fillStyle = p.landable ? '#3a6a9a' : '#2a3a4a';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.fill();
      if (game.navPlanet === p) {
        ctx.strokeStyle = '#8fd0ff';
        ctx.beginPath();
        ctx.arc(px, py, pr + 3, 0, TAU);
        ctx.stroke();
      }
    }
    for (const p of w.projectiles) {
      if (p.w.kind === 'bolt') continue;
      const [px, py] = toR(p.x, p.y);
      ctx.fillStyle = '#ffcf7a';
      ctx.fillRect(px - 0.5, py - 0.5, 1.5, 1.5);
    }
    for (const s of w.ships) {
      if (s === me || s.gone) continue;
      const [sx, sy] = toR(s.x, s.y);
      const color = s.playerEscort ? '#56e08a' : s.disabled ? '#7a7a7a' : w.hostileToPlayer(s) ? '#ff4d4d' : '#e8d84a';
      const r = s.def.len > 120 ? 2.6 : s.def.len > 60 ? 2.1 : 1.6;
      ctx.fillStyle = color;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      if (me.target === s) {
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(sx - 5.5, sy - 5.5, 11, 11);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(me.angle) * 9, cy + Math.sin(me.angle) * 9);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#2a3a52';
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = '#4f6a7a';
    ctx.fillText(w.sys.name.toUpperCase(), x + 6, y + 14);
  }

  thumbnail(def: ShipDef, size: number): HTMLCanvasElement {
    const key = `${def.id}:${size}`;
    const hit = this.thumbCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = size * 2;
    c.height = size * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    drawShip(ctx, def, size / 2, size / 2, -Math.PI / 2, { scale: Math.min(2.6, (size * 0.86) / def.len), lights: false });
    this.thumbCache.set(key, c);
    return c;
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines: number) {
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y + lines * lh);
      lines++;
      line = word;
      if (lines >= maxLines - 1) {
        ctx.fillText(fitText(ctx, words.slice(words.indexOf(word)).join(' '), max), x, y + lines * lh);
        return;
      }
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y + lines * lh);
}
