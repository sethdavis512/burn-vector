import { RNG } from '../core/math';

const P = new Uint8Array(512);
{
  const rng = new RNG(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  rng.shuffle(p);
  for (let i = 0; i < 512; i++) P[i] = p[i & 255]!;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function grad3(h: number, x: number, y: number, z: number) {
  const hh = h & 15;
  const u = hh < 8 ? x : y;
  const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
  return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
}

/** Improved Perlin noise, roughly in [-1, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const X = xi & 255;
  const Y = yi & 255;
  const Z = zi & 255;
  x -= xi;
  y -= yi;
  z -= zi;
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = P[X]! + Y;
  const AA = P[A]! + Z;
  const AB = P[A + 1]! + Z;
  const B = P[X + 1]! + Y;
  const BA = P[B]! + Z;
  const BB = P[B + 1]! + Z;
  return lerp(
    lerp(
      lerp(grad3(P[AA]!, x, y, z), grad3(P[BA]!, x - 1, y, z), u),
      lerp(grad3(P[AB]!, x, y - 1, z), grad3(P[BB]!, x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(grad3(P[AA + 1]!, x, y, z - 1), grad3(P[BA + 1]!, x - 1, y, z - 1), u),
      lerp(grad3(P[AB + 1]!, x, y - 1, z - 1), grad3(P[BB + 1]!, x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}

export function fbm3(x: number, y: number, z: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal: sharp creases near 1. */
export function ridged3(x: number, y: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise3(x * freq, y * freq, z * freq));
    sum += n * n * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}

function grad2(h: number, x: number, y: number) {
  switch (h & 7) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}

/** 2D gradient noise that tiles with the given integer period (≤ 256). */
export function pnoise2(x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const u = fade(xf);
  const v = fade(yf);
  const aa = P[P[x0]! + y0]!;
  const ab = P[P[x0]! + y1]!;
  const ba = P[P[x1]! + y0]!;
  const bb = P[P[x1]! + y1]!;
  return lerp(lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u), lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u), v);
}

export function pfbm2(x: number, y: number, period: number, octaves = 5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += pnoise2(x * f, y * f, Math.min(256, period * f)) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
