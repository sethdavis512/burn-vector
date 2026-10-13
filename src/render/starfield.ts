import { hexToRgb } from '../core/color';
import { RNG, TAU } from '../core/math';
import { pfbm2 } from './noise';

const TILE = 1024;

interface Layer {
  canvas: HTMLCanvasElement;
  factor: number;
}

interface StreakStar {
  x: number;
  y: number;
  z: number;
}

const nebulaCache = new Map<string, HTMLCanvasElement>();

function makeLayer(seed: number, count: number, minR: number, maxR: number, minA: number, maxA: number, tinted: boolean) {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext('2d')!;
  const rng = new RNG(seed);
  const tints = ['#ffffff', '#ffffff', '#cfe0ff', '#fff2d6', '#ffd8b0', '#d8e8ff'];
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, TILE);
    const y = rng.range(0, TILE);
    const r = rng.range(minR, maxR);
    const a = rng.range(minA, maxA);
    const col = tinted ? rng.pick(tints) : '#ffffff';
    const [cr, cg, cb] = hexToRgb(col);
    if (r > 1.2) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${a * 0.5})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, TAU);
    ctx.fill();
  }
  return c;
}

function makeNebula(color: string, seed: number, strength: number): HTMLCanvasElement {
  const key = `${color}:${seed}:${strength}`;
  const hit = nebulaCache.get(key);
  if (hit) return hit;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const [r, g, b] = hexToRgb(color);
  const ox = (seed % 97) * 0.37;
  const oy = (seed % 89) * 0.41;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * 4;
      const v = (y / N) * 4;
      const warp = pfbm2(u + ox, v + oy, 4, 3);
      const n = pfbm2(u + warp * 1.4 + 1.3, v - warp * 1.4 + 2.1, 4, 5);
      const n2 = pfbm2(u * 2 + 5.2, v * 2 + 7.7, 8, 4);
      let a = Math.max(0, n * 1.6 + 0.12);
      a = Math.min(1, a * a * 1.8) * strength;
      const dust = Math.max(0, -n2) * 0.6;
      const i = (y * N + x) * 4;
      img.data[i] = Math.min(255, r * (0.8 + n2 * 0.4) + 30 * a);
      img.data[i + 1] = Math.min(255, g * (0.8 - n2 * 0.2) + 20 * a);
      img.data[i + 2] = Math.min(255, b * (0.9 + n2 * 0.3) + 30 * a);
      img.data[i + 3] = Math.max(0, Math.min(255, 255 * a * (1 - dust)));
    }
  }
  ctx.putImageData(img, 0, 0);
  nebulaCache.set(key, c);
  return c;
}

export class Starfield {
  private layers: Layer[];
  private nebula: HTMLCanvasElement | null = null;
  private nebulaAlpha = 0.5;
  private streaks: StreakStar[] = [];

  constructor() {
    this.layers = [
      { canvas: makeLayer(11, 650, 0.6, 1.1, 0.25, 0.65, false), factor: 0.08 },
      { canvas: makeLayer(23, 240, 0.9, 1.5, 0.45, 0.85, true), factor: 0.2 },
      { canvas: makeLayer(37, 70, 1.3, 2.3, 0.65, 1, true), factor: 0.42 },
    ];
    const rng = new RNG(99);
    for (let i = 0; i < 220; i++) this.streaks.push({ x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(0.2, 1) });
  }

  setNebula(color: string, seed: number, strength: number) {
    this.nebula = makeNebula(color, seed, strength);
    this.nebulaAlpha = 0.55;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number) {
    if (this.nebula) {
      const scale = 7;
      const size = 256 * scale;
      const f = 0.035;
      const ox = (((-camX * f) % size) + size) % size;
      const oy = (((-camY * f) % size) + size) % size;
      ctx.save();
      ctx.globalAlpha = this.nebulaAlpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      for (let x = ox - size; x < w; x += size) {
        for (let y = oy - size; y < h; y += size) ctx.drawImage(this.nebula, x, y, size, size);
      }
      ctx.restore();
    }
    for (const l of this.layers) {
      const ox = (((-camX * l.factor) % TILE) + TILE) % TILE;
      const oy = (((-camY * l.factor) % TILE) + TILE) % TILE;
      for (let x = ox - TILE; x < w; x += TILE) {
        for (let y = oy - TILE; y < h; y += TILE) ctx.drawImage(l.canvas, x, y);
      }
    }
  }

  /** Hyperspace star streaks; `k` in 0..1 is intensity, `angle` is travel direction. */
  drawStreaks(ctx: CanvasRenderingContext2D, w: number, h: number, angle: number, k: number, time: number) {
    if (k <= 0.01) return;
    const cx = w / 2;
    const cy = h / 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const span = Math.max(w, h) * 0.75;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.streaks) {
      // Stars rush backwards along the travel direction.
      const along = ((((s.x + time * s.z * 2.4 * k) % 2) + 2) % 2) - 1;
      const px = cx + (-dx * along - dy * s.y) * span;
      const py = cy + (-dy * along + dx * s.y) * span;
      const len = 30 + 900 * k * k * s.z;
      ctx.strokeStyle = `rgba(${200 + s.z * 55},${220 + s.z * 35},255,${Math.min(1, k * 1.2) * s.z})`;
      ctx.lineWidth = 0.6 + s.z * 1.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + dx * len, py + dy * len);
      ctx.stroke();
    }
    ctx.restore();
  }
}
