export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed rotation from `from` to `to`. */
export const angleDiff = (from: number, to: number) => wrapAngle(to - from);

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const randInt = (lo: number, hi: number) => Math.floor(lo + Math.random() * (hi - lo + 1));
export const chance = (p: number) => Math.random() < p;
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export function weightedPick<T>(items: readonly (readonly [T, number])[], r = Math.random()): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let x = r * total;
  for (const [item, w] of items) {
    x -= w;
    if (x <= 0) return item;
  }
  return items[items.length - 1]![0];
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
export class RNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number) {
    return lo + this.next() * (hi - lo);
  }
  int(lo: number, hi: number) {
    return Math.floor(lo + this.next() * (hi - lo + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }
  chance(p: number) {
    return this.next() < p;
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    return weightedPick(items, this.next());
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}

/**
 * Time until a projectile fired at `speed` from the origin meets a target at
 * relative position (dx, dy) moving with relative velocity (dvx, dvy).
 */
export function interceptTime(dx: number, dy: number, dvx: number, dvy: number, speed: number): number | null {
  const a = dvx * dvx + dvy * dvy - speed * speed;
  const b = 2 * (dx * dvx + dy * dvy);
  const c = dx * dx + dy * dy;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return null;
    const t = -c / b;
    return t > 0 ? t : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  if (lo > 0) return lo;
  if (hi > 0) return hi;
  return null;
}

/** Distance from point P to segment AB, plus the param t along AB. */
export function segmentPointDist(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return { d: Math.hypot(px - cx, py - cy), t };
}

export const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
export const fmtCr = (n: number) => `${fmt(n)} cr`;
