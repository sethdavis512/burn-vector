import { rgba, shade } from '../core/color';
import { TAU } from '../core/math';
import type { Livery, ShipDef } from '../data/types';

interface Shades {
  base: string;
  light: string;
  dark: string;
}

interface PreparedPart {
  path: Path2D;
  colors: Shades;
  z: number;
}

interface Prepared {
  hull: Path2D;
  hullColors: Shades;
  below: PreparedPart[];
  above: PreparedPart[];
  lines: Path2D | null;
  spine: Path2D;
  engines: [number, number, number][];
  lights: [number, number][];
}

const cache = new Map<string, Prepared>();

/** Light comes from the upper left of the screen. */
const LIGHT_X = -0.62;
const LIGHT_Y = -0.78;

function shades(c: string): Shades {
  return { base: c, light: shade(c, 0.35), dark: shade(c, -0.5) };
}

function colorFor(name: string | undefined, liv: Livery): string {
  switch (name) {
    case undefined:
    case 'hull':
      return liv.hull;
    case 'accent':
      return liv.accent;
    case 'dark':
      return liv.dark;
    case 'light':
      return shade(liv.hull, 0.3);
    case 'glow':
      return liv.glow ?? liv.accent;
    default:
      return name;
  }
}

function mirroredPath(pts: number[], mirror = true): Path2D {
  const path = new Path2D();
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2]!;
    const y = pts[i * 2 + 1]!;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  if (mirror) {
    for (let i = n - 1; i >= 0; i--) path.lineTo(pts[i * 2]!, -pts[i * 2 + 1]!);
  }
  path.closePath();
  return path;
}

function partPath(pts: number[], mirror: boolean): Path2D {
  const path = new Path2D();
  const n = pts.length / 2;
  const add = (sign: number) => {
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2]!;
      const y = pts[i * 2 + 1]! * sign;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
  };
  add(1);
  if (mirror) add(-1);
  return path;
}

function prepare(def: ShipDef): Prepared {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const liv = def.livery;
  const art = def.art;
  const below: PreparedPart[] = [];
  const above: PreparedPart[] = [];
  for (const p of art.parts ?? []) {
    const part = { path: partPath(p.pts, p.mirror !== false), colors: shades(colorFor(p.color, liv)), z: p.z ?? 1 };
    (part.z < 0 ? below : above).push(part);
  }
  let lines: Path2D | null = null;
  if (art.lines?.length) {
    lines = new Path2D();
    for (const l of art.lines) {
      lines.moveTo(l[0]!, l[1]!);
      lines.lineTo(l[2]!, l[3]!);
      lines.moveTo(l[0]!, -l[1]!);
      lines.lineTo(l[2]!, -l[3]!);
    }
  }
  const xs = art.hull.filter((_, i) => i % 2 === 0);
  const spine = new Path2D();
  spine.moveTo(Math.max(...xs) * 0.85, 0);
  spine.lineTo(Math.min(...xs) * 0.85, 0);
  const engines: [number, number, number][] = [];
  for (const e of art.engines ?? []) {
    engines.push(e);
    if (e[1] !== 0) engines.push([e[0], -e[1], e[2]]);
  }
  const lights: [number, number][] = [];
  for (const l of art.lights ?? []) {
    lights.push(l);
    if (l[1] !== 0) lights.push([l[0], -l[1]]);
  }
  const prepared: Prepared = {
    hull: mirroredPath(art.hull),
    hullColors: shades(liv.hull),
    below,
    above,
    lines,
    spine,
    engines,
    lights,
  };
  cache.set(def.id, prepared);
  return prepared;
}

export interface DrawShipOpts {
  thrust?: number;
  time?: number;
  disabled?: boolean;
  alpha?: number;
  scale?: number;
  hitFlash?: number;
  /** World angles of turret barrels. */
  turretAims?: number[];
  lights?: boolean;
}

function litFill(ctx: CanvasRenderingContext2D, lx: number, ly: number, c: Shades) {
  const g = ctx.createLinearGradient(lx, ly, -lx, -ly);
  g.addColorStop(0, c.light);
  g.addColorStop(0.45, c.base);
  g.addColorStop(1, c.dark);
  return g;
}

/** Draw a ship centered at (x, y) facing `angle`, in the current transform. */
export function drawShip(ctx: CanvasRenderingContext2D, def: ShipDef, x: number, y: number, angle: number, o: DrawShipOpts = {}) {
  const p = prepare(def);
  const liv = def.livery;
  const scale = (o.scale ?? 1) * (def.len / 2);
  const thrust = o.thrust ?? 0;
  const time = o.time ?? 0;
  const ca = Math.cos(-angle);
  const sa = Math.sin(-angle);
  const lx = LIGHT_X * ca - LIGHT_Y * sa;
  const ly = LIGHT_X * sa + LIGHT_Y * ca;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = o.alpha ?? 1;
  const px = 1 / scale;

  // Engine flames sit behind the hull.
  if (thrust > 0.02 && p.engines.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.85 + 0.15 * Math.sin(time * 60 + def.len);
    for (const [ex, ey, er] of p.engines) {
      const len = er * (3 + 4 * thrust) * flick;
      const g = ctx.createRadialGradient(ex, ey, 0, ex - len * 0.4, ey, len);
      g.addColorStop(0, rgba('#ffffff', 0.95 * Math.min(1, thrust)));
      g.addColorStop(0.25, rgba(liv.engine, 0.85 * Math.min(1, thrust)));
      g.addColorStop(1, rgba(liv.engine, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ex - len * 0.45, ey, len * 0.6, er * 1.15, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.lineWidth = px;
  ctx.lineJoin = 'round';
  for (const part of p.below) {
    ctx.fillStyle = litFill(ctx, lx, ly, part.colors);
    ctx.fill(part.path);
    ctx.strokeStyle = part.colors.dark;
    ctx.stroke(part.path);
  }

  ctx.fillStyle = litFill(ctx, lx, ly, p.hullColors);
  ctx.fill(p.hull);
  ctx.strokeStyle = shade(liv.hull, -0.6);
  ctx.stroke(p.hull);

  ctx.strokeStyle = rgba('#ffffff', 0.18);
  ctx.lineWidth = px * 1.2;
  ctx.stroke(p.spine);
  if (p.lines) {
    ctx.strokeStyle = rgba('#000000', 0.25);
    ctx.lineWidth = px;
    ctx.stroke(p.lines);
  }

  ctx.lineWidth = px;
  for (const part of p.above) {
    ctx.fillStyle = litFill(ctx, lx, ly, part.colors);
    ctx.fill(part.path);
    ctx.strokeStyle = rgba('#000000', 0.35);
    ctx.stroke(part.path);
  }

  // Engine nozzles
  for (const [ex, ey, er] of p.engines) {
    ctx.fillStyle = shade(liv.dark, -0.3);
    ctx.fillRect(ex - er * 0.6, ey - er, er * 0.9, er * 2);
    if (thrust > 0.02) {
      ctx.fillStyle = rgba(liv.engine, 0.9);
      ctx.fillRect(ex - er * 0.7, ey - er * 0.6, er * 0.3, er * 1.2);
    }
  }

  const art = def.art;
  if (art.turrets) {
    let ti = 0;
    for (const [tx, ty] of art.turrets) {
      const spots: [number, number][] = ty === 0 ? [[tx, ty]] : [[tx, ty], [tx, -ty]];
      for (const [sx, sy] of spots) {
        const aim = o.turretAims?.[ti % Math.max(1, o.turretAims.length)];
        ti++;
        const r = Math.max(0.05, 9 / def.len);
        if (aim !== undefined) {
          const la = aim - angle;
          ctx.strokeStyle = shade(liv.dark, -0.2);
          ctx.lineWidth = r * 0.6;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(la) * r * 2.2, sy + Math.sin(la) * r * 2.2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fillStyle = litFill(ctx, lx * r, ly * r, shades(shade(liv.hull, -0.2)));
        ctx.fill();
        ctx.lineWidth = px;
        ctx.strokeStyle = rgba('#000000', 0.5);
        ctx.stroke();
      }
    }
  }

  if (art.cockpit) {
    const [cx, cy, rx, ry] = art.cockpit;
    const g = ctx.createLinearGradient(cx + lx * rx, cy + ly * ry, cx - lx * rx, cy - ly * ry);
    g.addColorStop(0, shade(liv.glass, 0.6));
    g.addColorStop(0.5, liv.glass);
    g.addColorStop(1, shade(liv.glass, -0.65));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba('#000000', 0.45);
    ctx.stroke();
  }

  if (art.core) {
    const [cx, cy, r] = art.core;
    const pulse = o.disabled ? 0.25 : 0.8 + 0.2 * Math.sin(time * 3 + def.len);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
    g.addColorStop(0, rgba('#ffffff', 0.95 * pulse));
    g.addColorStop(0.35, rgba(liv.glow ?? liv.accent, 0.7 * pulse));
    g.addColorStop(1, rgba(liv.glow ?? liv.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  if (o.disabled) {
    ctx.fillStyle = 'rgba(10,8,8,0.45)';
    ctx.fill(p.hull);
  }
  if (o.hitFlash && o.hitFlash > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba('#ff7a40', o.hitFlash * 0.4);
    ctx.fill(p.hull);
    ctx.restore();
  }

  if (o.lights !== false && !o.disabled && p.lights.length) {
    const blink = (time + def.len * 0.01) % 1.4 < 0.14;
    if (blink) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [lx2, ly2] of p.lights) {
        const col = liv.glow ?? (ly2 > 0 ? '#5aff8a' : ly2 < 0 ? '#ff4a4a' : '#ffffff');
        const r = 2.4 / scale;
        const g = ctx.createRadialGradient(lx2, ly2, 0, lx2, ly2, r * 2.5);
        g.addColorStop(0, rgba('#ffffff', 1));
        g.addColorStop(0.3, rgba(col, 0.9));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx2, ly2, r * 2.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Render a ship into a standalone canvas, nose up, fitted to `size` px. */
export function shipThumbnail(def: ShipDef, size: number, angle = -Math.PI / 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const fit = (size * 0.86) / def.len;
  drawShip(ctx, def, size / 2, size / 2, angle, { scale: Math.min(fit, 3.2), lights: false });
  return c;
}
