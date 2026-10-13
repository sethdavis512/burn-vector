import { hexToRgb } from '../core/color';

const glowCache = new Map<string, HTMLCanvasElement>();

/** A soft radial glow sprite (64px) for additive particles. */
export function glowSprite(color: string, hot = true): HTMLCanvasElement {
  const key = `${color}:${hot}`;
  const hit = glowCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const [r, g, b] = hexToRgb(color);
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (hot) {
    grad.addColorStop(0, `rgba(255,255,255,1)`);
    grad.addColorStop(0.18, `rgba(${r},${g},${b},0.95)`);
  } else {
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  }
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowCache.set(key, c);
  return c;
}

const smokeCache = new Map<string, HTMLCanvasElement>();

export function smokeSprite(color: string): HTMLCanvasElement {
  const hit = smokeCache.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const [r, g, b] = hexToRgb(color);
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  smokeCache.set(color, c);
  return c;
}
