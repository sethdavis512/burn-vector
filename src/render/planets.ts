import { RNG, TAU, clamp } from '../core/math';
import type { PlanetDef, PlanetStyle } from '../data/types';
import { fbm3, noise3, ridged3 } from './noise';

type RGB = [number, number, number];

interface Palette {
  deep?: RGB;
  shallow?: RGB;
  low: RGB;
  mid: RGB;
  high: RGB;
  ice?: RGB;
  sea?: number;
  clouds: number;
  cloudColor?: RGB;
  atm: RGB;
  atmStrength: number;
}

const PALETTES: Partial<Record<PlanetStyle, Palette>> = {
  terran: { deep: [10, 32, 80], shallow: [30, 96, 152], low: [58, 112, 52], mid: [112, 122, 64], high: [138, 118, 88], ice: [236, 242, 248], sea: 0.03, clouds: 0.85, atm: [120, 170, 255], atmStrength: 0.9 },
  ocean: { deep: [8, 30, 72], shallow: [26, 104, 156], low: [72, 132, 72], mid: [120, 140, 92], high: [146, 136, 112], ice: [236, 242, 248], sea: 0.2, clouds: 0.95, atm: [140, 190, 255], atmStrength: 1 },
  jungle: { deep: [14, 42, 72], shallow: [30, 92, 112], low: [30, 86, 38], mid: [44, 108, 44], high: [92, 104, 62], ice: [226, 236, 236], sea: -0.12, clouds: 1, atm: [150, 225, 190], atmStrength: 0.95 },
  desert: { low: [176, 126, 78], mid: [214, 168, 108], high: [236, 206, 152], clouds: 0.12, atm: [255, 196, 140], atmStrength: 0.55 },
  red: { low: [128, 56, 38], mid: [170, 84, 52], high: [196, 118, 74], ice: [240, 232, 226], clouds: 0.08, atm: [255, 170, 130], atmStrength: 0.4 },
  ice: { low: [168, 196, 218], mid: [218, 232, 244], high: [248, 251, 255], clouds: 0.25, atm: [190, 220, 255], atmStrength: 0.6 },
  lava: { low: [34, 26, 24], mid: [64, 52, 46], high: [92, 80, 72], clouds: 0, atm: [255, 120, 60], atmStrength: 0.5 },
  barren: { low: [92, 88, 84], mid: [128, 122, 116], high: [168, 162, 156], clouds: 0, atm: [0, 0, 0], atmStrength: 0 },
  toxic: { low: [96, 118, 38], mid: [150, 164, 56], high: [196, 196, 90], clouds: 0.6, cloudColor: [214, 214, 128], atm: [200, 232, 100], atmStrength: 0.85 },
  gas: { low: [150, 100, 70], mid: [204, 150, 100], high: [234, 214, 176], clouds: 0, atm: [232, 192, 144], atmStrength: 0.6 },
  gasblue: { low: [60, 100, 160], mid: [96, 146, 200], high: [170, 214, 236], clouds: 0, atm: [150, 200, 255], atmStrength: 0.7 },
  crystal: { low: [96, 70, 150], mid: [150, 118, 206], high: [214, 196, 244], clouds: 0.25, cloudColor: [226, 210, 255], atm: [200, 150, 255], atmStrength: 1 },
};

const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const isStation = (p: PlanetDef) => p.style.startsWith('station');

const planetCache = new Map<string, HTMLCanvasElement>();

/** Pre-render a lit, textured planet sphere (plus atmosphere halo). */
export function renderPlanet(p: PlanetDef, radius: number, lightAngle: number, lightElev = 0.42): HTMLCanvasElement {
  const key = `${p.id}:${radius}:${lightAngle.toFixed(2)}:${lightElev}`;
  const hit = planetCache.get(key);
  if (hit) return hit;
  const pal = PALETTES[p.style] ?? PALETTES.barren!;
  const pad = Math.ceil(radius * 0.22) + 4;
  const size = Math.ceil(radius * 2 + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rng = new RNG(p.seed);
  const ox = rng.range(-50, 50);
  const oy = rng.range(-50, 50);
  const oz = rng.range(-50, 50);
  const cox = rng.range(-50, 50);
  const tilt = rng.range(-0.45, 0.45);
  const spin = rng.range(0, TAU);
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  let lx = Math.cos(lightAngle);
  let ly = Math.sin(lightAngle);
  let lz = lightElev;
  const ll = Math.hypot(lx, ly, lz);
  lx /= ll;
  ly /= ll;
  lz /= ll;
  const hx = lx;
  const hy = ly;
  const hz = lz + 1;
  const hl = Math.hypot(hx, hy, hz);
  const craters = p.style === 'barren' || p.style === 'red' ? makeCraters(rng, p.style === 'barren' ? 28 : 10) : [];
  const inhabited = p.landable && p.tech >= 2;
  const center = size / 2;
  const style = p.style;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5 - center) / radius;
      const ny = (py + 0.5 - center) / radius;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2);
      // Rotate the view vector into planet space.
      const x1 = nx * cs + nz * ss;
      const z1 = -nx * ss + nz * cs;
      const x = x1 * ct - ny * st;
      const y = x1 * st + ny * ct;
      const z = z1;
      const lat = Math.abs(y);

      let col: RGB;
      let spec = 0;
      let er = 0;
      let eg = 0;
      let eb = 0;
      let cloud = 0;
      let land = false;

      switch (style) {
        case 'terran':
        case 'ocean':
        case 'jungle': {
          const h = fbm3(x * 1.7 + ox, y * 1.7 + oy, z * 1.7 + oz, 6);
          const sea = pal.sea!;
          if (h < sea) {
            col = mix3(pal.shallow!, pal.deep!, clamp(((sea - h) / 0.5) * 2.2, 0, 1));
            spec = 1;
          } else {
            land = true;
            const t = (h - sea) / 0.45;
            col = t < 0.35 ? mix3(pal.low, pal.mid, t / 0.35) : mix3(pal.mid, pal.high, clamp((t - 0.35) / 0.65, 0, 1));
          }
          const iceLine = 0.8 - h * 0.25;
          if (lat > iceLine) col = mix3(col, pal.ice!, smooth(iceLine, iceLine + 0.06, lat));
          const c = fbm3(x * 2.4 + cox, y * 5 + cox, z * 2.4 - cox, 5);
          cloud = smooth(0.02, 0.42, c) * pal.clouds;
          break;
        }
        case 'desert': {
          const h = fbm3(x * 2 + ox, y * 2 + oy, z * 2 + oz, 5);
          const t = clamp(h * 1.2 + 0.5, 0, 1);
          col = t < 0.5 ? mix3(pal.low, pal.mid, t * 2) : mix3(pal.mid, pal.high, (t - 0.5) * 2);
          const rdg = ridged3(x * 3 + oz, y * 3 + ox, z * 3 + oy, 3);
          col = mix3(col, [120, 80, 50], smooth(0.35, 0.55, rdg) * 0.35);
          cloud = smooth(0.25, 0.5, fbm3(x * 3 + cox, y * 6, z * 3, 4)) * pal.clouds;
          break;
        }
        case 'red': {
          const h = fbm3(x * 1.8 + ox, y * 1.8 + oy, z * 1.8 + oz, 6);
          const t = clamp(h * 1.3 + 0.5, 0, 1);
          col = t < 0.5 ? mix3(pal.low, pal.mid, t * 2) : mix3(pal.mid, pal.high, (t - 0.5) * 2);
          col = applyCraters(col, craters, x, y, z);
          if (lat > 0.86 - h * 0.15) col = mix3(col, pal.ice!, smooth(0.86 - h * 0.15, 0.92, lat));
          cloud = smooth(0.3, 0.55, fbm3(x * 3 + cox, y * 6, z * 3, 3)) * pal.clouds;
          break;
        }
        case 'ice': {
          const h = fbm3(x * 2 + ox, y * 2 + oy, z * 2 + oz, 5);
          const t = clamp(h * 1.2 + 0.5, 0, 1);
          col = t < 0.5 ? mix3(pal.low, pal.mid, t * 2) : mix3(pal.mid, pal.high, (t - 0.5) * 2);
          const crack = ridged3(x * 3.5 + oy, y * 3.5 + oz, z * 3.5 + ox, 4);
          col = mix3(col, [110, 150, 196], smooth(0.42, 0.6, crack) * 0.6);
          cloud = smooth(0.15, 0.5, fbm3(x * 2.5 + cox, y * 5, z * 2.5, 4)) * pal.clouds;
          break;
        }
        case 'lava': {
          const h = fbm3(x * 2 + ox, y * 2 + oy, z * 2 + oz, 5);
          const t = clamp(h * 1.2 + 0.5, 0, 1);
          col = t < 0.5 ? mix3(pal.low, pal.mid, t * 2) : mix3(pal.mid, pal.high, (t - 0.5) * 2);
          const crack = ridged3(x * 2.6 + oy, y * 2.6 + oz, z * 2.6 + ox, 4);
          const glow = smooth(0.38, 0.56, crack);
          er = 255 * glow;
          eg = 110 * glow * glow;
          eb = 30 * glow * glow;
          col = mix3(col, [90, 40, 20], glow * 0.6);
          break;
        }
        case 'barren': {
          const h = fbm3(x * 2.2 + ox, y * 2.2 + oy, z * 2.2 + oz, 6);
          const t = clamp(h * 1.3 + 0.5, 0, 1);
          col = t < 0.5 ? mix3(pal.low, pal.mid, t * 2) : mix3(pal.mid, pal.high, (t - 0.5) * 2);
          col = applyCraters(col, craters, x, y, z);
          break;
        }
        case 'toxic': {
          const warp = fbm3(x * 1.5 + ox, y * 1.5 + oy, z * 1.5 + oz, 3);
          const h = fbm3(x * 2 + warp * 1.5, y * 3 + warp, z * 2 - warp, 5);
          const t = clamp(h * 1.3 + 0.5, 0, 1);
          col = t < 0.5 ? mix3(pal.low, pal.mid, t * 2) : mix3(pal.mid, pal.high, (t - 0.5) * 2);
          cloud = smooth(0.05, 0.45, fbm3(x * 2 + cox + warp, y * 4, z * 2, 4)) * pal.clouds;
          break;
        }
        case 'gas':
        case 'gasblue': {
          const turb = fbm3(x * 1.6 + ox, y * 5 + oy, z * 1.6 + oz, 5);
          const v = y * 7 + turb * 2.2;
          const band = 0.5 + 0.5 * Math.sin(v * Math.PI);
          const band2 = 0.5 + 0.5 * Math.sin(v * 2.3 + 1.7);
          col = mix3(mix3(pal.low, pal.mid, band), pal.high, band2 * 0.55);
          // A great storm.
          const sx = x - 0.45;
          const sy = (y - 0.32) * 2.2;
          const sz = z - 0.75;
          const sd = sx * sx + sy * sy + sz * sz;
          if (sd < 0.09) col = mix3(col, style === 'gas' ? [196, 106, 72] : [220, 236, 250], smooth(0.09, 0.02, sd) * 0.8);
          break;
        }
        case 'crystal': {
          const h = fbm3(x * 1.6 + ox, y * 1.6 + oy, z * 1.6 + oz, 5);
          const t = clamp(h * 0.9 + 0.6, 0, 1);
          col = t < 0.5 ? mix3(pal.low, pal.mid, t * 2) : mix3(pal.mid, pal.high, (t - 0.5) * 2);
          // Faceted shelves of crystal catch the light in bands.
          const facet = Math.abs(Math.sin((h * 9 + x * 2) * Math.PI));
          col = mix3(col, pal.high, Math.pow(facet, 6) * 0.35);
          const vein = ridged3(x * 3 + oy, y * 3 + oz, z * 3 + ox, 4);
          const g = smooth(0.4, 0.58, vein);
          er = 170 * g;
          eg = 230 * g;
          eb = 255 * g;
          spec = 0.6;
          cloud = smooth(0.2, 0.55, fbm3(x * 2 + cox, y * 4, z * 2, 4)) * pal.clouds;
          break;
        }
        default:
          col = pal.mid;
      }

      const diff = nx * lx + ny * ly + nz * lz;
      let light = clamp((diff + 0.06) * 1.15, 0, 1);
      light = Math.pow(light, 0.85);
      const amb = 0.035;
      let r = col[0] * (amb + light);
      let g = col[1] * (amb + light);
      let b = col[2] * (amb + light);
      if (spec) {
        const nh = (nx * hx + ny * hy + nz * hz) / hl;
        const sp = Math.pow(Math.max(0, nh), 38) * 0.55 * (1 - cloud);
        r += 255 * sp;
        g += 245 * sp;
        b += 230 * sp;
      }
      if (inhabited && land && light < 0.18) {
        const city = noise3(x * 38 + ox, y * 38 + oy, z * 38 + oz);
        if (city > 0.42) {
          const k = (1 - light / 0.18) * smooth(0.42, 0.62, city) * (1 - cloud * 0.8);
          er += 255 * k;
          eg += 196 * k;
          eb += 120 * k;
        }
      }
      if (cloud > 0) {
        const cc = pal.cloudColor ?? [242, 245, 250];
        const cl = amb + light;
        r = r + (cc[0] * cl - r) * cloud;
        g = g + (cc[1] * cl - g) * cloud;
        b = b + (cc[2] * cl - b) * cloud;
      }
      const night = 1 - light * 0.6;
      r += er * night;
      g += eg * night;
      b += eb * night;
      if (pal.atmStrength > 0) {
        const rim = Math.pow(1 - nz, 2.6) * pal.atmStrength;
        const lit = clamp(diff + 0.35, 0, 1);
        r += pal.atm[0] * rim * lit;
        g += pal.atm[1] * rim * lit;
        b += pal.atm[2] * rim * lit;
      }
      const edge = clamp((1 - Math.sqrt(r2)) * radius * 1.4, 0, 1);
      const i = (py * size + px) * 4;
      data[i] = r > 255 ? 255 : r;
      data[i + 1] = g > 255 ? 255 : g;
      data[i + 2] = b > 255 ? 255 : b;
      data[i + 3] = 255 * edge;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (pal.atmStrength > 0) {
    ctx.globalCompositeOperation = 'destination-over';
    const [ar, ag, ab] = pal.atm;
    const gx = center + lx * radius * 0.12;
    const gy = center + ly * radius * 0.12;
    const halo = ctx.createRadialGradient(gx, gy, radius * 0.9, gx, gy, radius * 1.2);
    halo.addColorStop(0, `rgba(${ar},${ag},${ab},${0.42 * pal.atmStrength})`);
    halo.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }
  planetCache.set(key, canvas);
  return canvas;
}

interface Crater {
  x: number;
  y: number;
  z: number;
  r: number;
}

function makeCraters(rng: RNG, n: number): Crater[] {
  const out: Crater[] = [];
  for (let i = 0; i < n; i++) {
    const u = rng.range(-1, 1);
    const t = rng.range(0, TAU);
    const s = Math.sqrt(1 - u * u);
    out.push({ x: s * Math.cos(t), y: u, z: s * Math.sin(t), r: rng.range(0.05, 0.22) * (i < 3 ? 1.6 : 1) });
  }
  return out;
}

function applyCraters(col: RGB, craters: Crater[], x: number, y: number, z: number): RGB {
  let out = col;
  for (const c of craters) {
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / c.r;
    if (d > 1.15) continue;
    if (d < 0.85) out = mix3(out, [out[0] * 0.72, out[1] * 0.72, out[2] * 0.72], 0.8 * (1 - d * 0.4));
    else out = mix3(out, [Math.min(255, out[0] * 1.25), Math.min(255, out[1] * 1.25), Math.min(255, out[2] * 1.25)], 1 - Math.abs(d - 1) / 0.15);
  }
  return out;
}

// ── Stations ───────────────────────────────────────────────────────

export interface StationSprite {
  canvas: HTMLCanvasElement;
  lights: { x: number; y: number; color: string; phase: number }[];
  spin: number;
}

const stationCache = new Map<string, StationSprite>();

function metal(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, base: string, light: string, dark: string) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, light);
  g.addColorStop(0.5, base);
  g.addColorStop(1, dark);
  return g;
}

export function renderStation(p: PlanetDef, radius: number): StationSprite {
  const key = `${p.id}:${radius}`;
  const hit = stationCache.get(key);
  if (hit) return hit;
  const size = Math.ceil(radius * 2.6);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const R = radius;
  const rng = new RNG(p.seed);
  const lights: StationSprite['lights'] = [];
  let spin = 0;
  ctx.translate(c, c);
  ctx.lineJoin = 'round';

  switch (p.style) {
    case 'station-ring': {
      spin = 0.05;
      // solar wings
      ctx.fillStyle = '#1d2c4a';
      ctx.strokeStyle = '#4a6a9a';
      ctx.lineWidth = 1;
      for (const s of [-1, 1]) {
        ctx.fillRect(s > 0 ? R * 0.05 : -R * 1.25, -R * 0.12, R * 1.2, R * 0.24);
        ctx.strokeRect(s > 0 ? R * 0.05 : -R * 1.25, -R * 0.12, R * 1.2, R * 0.24);
        for (let i = 1; i < 6; i++) {
          const x = s > 0 ? R * 0.05 + (R * 1.2 * i) / 6 : -R * 1.25 + (R * 1.2 * i) / 6;
          ctx.beginPath();
          ctx.moveTo(x, -R * 0.12);
          ctx.lineTo(x, R * 0.12);
          ctx.stroke();
        }
      }
      // ring
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.arc(0, 0, R * 0.76, 0, TAU, true);
      ctx.fillStyle = metal(ctx, -R, -R, R, R, '#9aa4b0', '#e2e8ee', '#3e4650');
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(20,24,30,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
      }
      // windows
      for (let i = 0; i < 48; i++) {
        if (rng.chance(0.35)) continue;
        const a = (i / 48) * TAU;
        ctx.fillStyle = rng.chance(0.8) ? '#ffe7a8' : '#a8e0ff';
        ctx.fillRect(Math.cos(a) * R * 0.88 - 1, Math.sin(a) * R * 0.88 - 1, 2, 2);
      }
      // spokes
      ctx.fillStyle = metal(ctx, -R, -R, R, R, '#828c98', '#c8d0d8', '#3a424c');
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i / 4) * TAU + Math.PI / 4);
        ctx.fillRect(R * 0.2, -R * 0.05, R * 0.58, R * 0.1);
        ctx.restore();
      }
      // hub
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.28, 0, TAU);
      ctx.fillStyle = metal(ctx, -R * 0.3, -R * 0.3, R * 0.3, R * 0.3, '#a8b0bc', '#f0f4f8', '#4a525c');
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1a1e24';
      ctx.fillRect(-R * 0.08, -R * 0.12, R * 0.16, R * 0.24);
      ctx.fillStyle = '#7fd0ff';
      ctx.fillRect(-R * 0.08, -R * 0.12, R * 0.16, R * 0.03);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        lights.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, color: i % 2 ? '#ff4a4a' : '#ffffff', phase: i * 0.4 });
      }
      break;
    }
    case 'station-spindle': {
      spin = 0;
      const L = R * 1.15;
      const W = R * 0.32;
      // panels
      for (const yy of [-L * 0.55, L * 0.55]) {
        ctx.fillStyle = '#1b2a46';
        ctx.strokeStyle = '#4a6a9a';
        ctx.lineWidth = 1;
        ctx.fillRect(-R * 1.15, yy - R * 0.1, R * 2.3, R * 0.2);
        ctx.strokeRect(-R * 1.15, yy - R * 0.1, R * 2.3, R * 0.2);
        for (let i = 1; i < 10; i++) {
          ctx.beginPath();
          ctx.moveTo(-R * 1.15 + (R * 2.3 * i) / 10, yy - R * 0.1);
          ctx.lineTo(-R * 1.15 + (R * 2.3 * i) / 10, yy + R * 0.1);
          ctx.stroke();
        }
      }
      // body
      ctx.beginPath();
      ctx.roundRect(-W, -L, W * 2, L * 2, W);
      ctx.fillStyle = metal(ctx, -W, 0, W, 0, '#a2acb8', '#eef2f6', '#3c444e');
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,24,30,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // rings
      for (const yy of [-L * 0.3, 0, L * 0.3]) {
        ctx.beginPath();
        ctx.ellipse(0, yy, W * 1.9, W * 0.45, 0, 0, TAU);
        ctx.fillStyle = metal(ctx, -W * 2, yy, W * 2, yy, '#8a94a0', '#d8dee4', '#343c46');
        ctx.fill();
        ctx.stroke();
        for (let i = 0; i < 10; i++) {
          if (rng.chance(0.3)) continue;
          ctx.fillStyle = '#ffe7a8';
          ctx.fillRect(-W * 1.6 + (W * 3.2 * i) / 10, yy - 1, 2, 2);
        }
      }
      lights.push({ x: 0, y: -L, color: '#ff4a4a', phase: 0 }, { x: 0, y: L, color: '#ffffff', phase: 0.6 });
      lights.push({ x: -R * 1.15, y: -L * 0.55, color: '#ff4a4a', phase: 1.1 }, { x: R * 1.15, y: L * 0.55, color: '#4aff7a', phase: 1.6 });
      break;
    }
    case 'station-rock': {
      spin = 0.02;
      const pts: [number, number][] = [];
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = R * (0.72 + 0.22 * noise3(Math.cos(a) * 1.5 + p.seed % 50, Math.sin(a) * 1.5, 0.5) + rng.range(-0.04, 0.04));
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      const rg = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
      rg.addColorStop(0, '#8a8178');
      rg.addColorStop(0.6, '#5a524c');
      rg.addColorStop(1, '#2a2522');
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.strokeStyle = '#1c1816';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      for (let i = 0; i < 14; i++) {
        const x = rng.range(-R * 0.7, R * 0.7);
        const y = rng.range(-R * 0.7, R * 0.7);
        const r = rng.range(R * 0.05, R * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = 'rgba(20,16,14,0.35)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - r * 0.15, y - r * 0.15, r, Math.PI * 0.8, Math.PI * 1.7);
        ctx.strokeStyle = 'rgba(200,190,175,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
      // docking arm
      ctx.fillStyle = metal(ctx, 0, -R * 0.1, 0, R * 0.1, '#8c96a2', '#d0d8e0', '#3c444e');
      ctx.fillRect(R * 0.4, -R * 0.07, R * 0.75, R * 0.14);
      ctx.fillRect(R * 1.05, -R * 0.2, R * 0.16, R * 0.4);
      // domes
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, TAU);
        const d = rng.range(0, R * 0.4);
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        const r = rng.range(R * 0.12, R * 0.2);
        const dg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        dg.addColorStop(0, '#d8f4ff');
        dg.addColorStop(0.5, '#4a8ab0');
        dg.addColorStop(1, '#1a3048');
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = dg;
        ctx.fill();
        ctx.strokeStyle = '#9aa4b0';
        ctx.stroke();
      }
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = rng.chance(0.7) ? '#ffd890' : '#9ae0ff';
        ctx.fillRect(rng.range(-R * 0.6, R * 0.6), rng.range(-R * 0.6, R * 0.6), 1.5, 1.5);
      }
      lights.push({ x: R * 1.2, y: -R * 0.2, color: '#ff4a4a', phase: 0 }, { x: R * 1.2, y: R * 0.2, color: '#4aff7a', phase: 0.5 });
      lights.push({ x: -R * 0.6, y: -R * 0.5, color: '#ffffff', phase: 1.2 });
      break;
    }
    case 'station-military': {
      spin = 0.015;
      const arm = (rot: number) => {
        ctx.save();
        ctx.rotate(rot);
        ctx.fillStyle = metal(ctx, 0, -R * 0.16, 0, R * 0.16, '#7c8692', '#c4ccd4', '#2e343c');
        ctx.fillRect(R * 0.25, -R * 0.13, R * 0.7, R * 0.26);
        ctx.fillStyle = metal(ctx, 0, -R * 0.22, 0, R * 0.22, '#6a7480', '#b4bcc6', '#262c34');
        ctx.fillRect(R * 0.85, -R * 0.24, R * 0.2, R * 0.48);
        ctx.strokeStyle = 'rgba(15,18,22,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(R * 0.25, -R * 0.13, R * 0.7, R * 0.26);
        ctx.strokeRect(R * 0.85, -R * 0.24, R * 0.2, R * 0.48);
        ctx.fillStyle = '#101418';
        ctx.fillRect(R * 0.98, -R * 0.1, R * 0.07, R * 0.2);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = '#ffd890';
          ctx.fillRect(R * 0.32 + i * R * 0.11, -1, 2, 2);
        }
        ctx.restore();
      };
      for (let i = 0; i < 4; i++) arm((i / 4) * TAU);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        ctx.lineTo(Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38);
      }
      ctx.closePath();
      ctx.fillStyle = metal(ctx, -R * 0.4, -R * 0.4, R * 0.4, R * 0.4, '#8e98a4', '#dde4ea', '#323a44');
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,18,22,0.8)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.16, 0, TAU);
      ctx.fillStyle = '#28303a';
      ctx.fill();
      ctx.strokeStyle = '#6aa8ff';
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, R * 0.06, 0, TAU);
        ctx.fillStyle = '#4a525c';
        ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        lights.push({ x: Math.cos(a) * R * 1.05, y: Math.sin(a) * R * 1.05, color: i % 2 ? '#ff4a4a' : '#ffffff', phase: i * 0.5 });
      }
      break;
    }
    case 'station-vael': {
      spin = 0.08;
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.1);
      glow.addColorStop(0, 'rgba(255,240,255,0.9)');
      glow.addColorStop(0.25, 'rgba(210,150,255,0.55)');
      glow.addColorStop(1, 'rgba(120,60,200,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.1, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.95, R * 0.32, 0, 0, TAU);
        ctx.strokeStyle = `rgba(${200 + i * 8},${150 + i * 10},255,0.75)`;
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const x = Math.cos(a) * R * 0.95;
        const y = Math.sin(a) * R * 0.32;
        const rot = ((i % 6) / 6) * Math.PI;
        const xx = x * Math.cos(rot) - y * Math.sin(rot);
        const yy = x * Math.sin(rot) + y * Math.cos(rot);
        ctx.beginPath();
        ctx.moveTo(xx, yy - 4);
        ctx.lineTo(xx + 3, yy);
        ctx.lineTo(xx, yy + 4);
        ctx.lineTo(xx - 3, yy);
        ctx.closePath();
        ctx.fillStyle = '#f2dcff';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.2, 0, TAU);
      ctx.fillStyle = '#fff6ff';
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        lights.push({ x: Math.cos(a) * R * 0.6, y: Math.sin(a) * R * 0.6, color: '#e6b8ff', phase: i * 0.7 });
      }
      break;
    }
    default:
      break;
  }
  const sprite = { canvas, lights, spin };
  stationCache.set(key, sprite);
  return sprite;
}

// ── Stars ──────────────────────────────────────────────────────────

const starCache = new Map<string, HTMLCanvasElement>();

/** A pre-rendered star: granulated, limb-darkened disc with a soft corona. */
export function renderStar(color: string, radius: number, seed: number): HTMLCanvasElement {
  const key = `${color}:${radius}:${seed}`;
  const hit = starCache.get(key);
  if (hit) return hit;
  const r = Math.round(radius);
  const pad = Math.ceil(r * 0.95);
  const size = r * 2 + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const hex = color.replace('#', '');
  const cr = parseInt(hex.slice(0, 2), 16);
  const cg = parseInt(hex.slice(2, 4), 16);
  const cb = parseInt(hex.slice(4, 6), 16);
  const center = size / 2;
  const so = (seed % 997) * 0.13;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px + 0.5 - center) / r;
      const dy = (py + 0.5 - center) / r;
      const d2 = dx * dx + dy * dy;
      const i = (py * size + px) * 4;
      if (d2 <= 1) {
        const mu = Math.sqrt(1 - d2);
        const limb = 0.55 + 0.45 * mu;
        const gran = 1 + fbm3(dx * 7 + so, dy * 7 - so, mu * 5, 4) * 0.22;
        const t = Math.pow(1 - mu, 1.4);
        const edge = clamp((1 - Math.sqrt(d2)) * r * 1.5, 0, 1);
        data[i] = Math.min(255, (255 + (cr - 255) * t * 0.9) * limb * gran + 30 * (1 - t));
        data[i + 1] = Math.min(255, (250 + (cg - 250) * t * 0.9) * limb * gran + 20 * (1 - t));
        data[i + 2] = Math.min(255, (240 + (cb - 240) * t * 0.9) * limb * gran);
        data[i + 3] = 255 * Math.max(edge, 0.85);
      } else {
        const d = Math.sqrt(d2);
        const ang = Math.atan2(dy, dx);
        const streak = 1 + 0.25 * noise3(Math.cos(ang) * 3 + so, Math.sin(ang) * 3, d * 2);
        const a = Math.exp(-(d - 1) * 5) * 0.75 * streak;
        data[i] = Math.min(255, cr * 0.7 + 76);
        data[i + 1] = Math.min(255, cg * 0.7 + 70);
        data[i + 2] = Math.min(255, cb * 0.7 + 60);
        data[i + 3] = clamp(a, 0, 1) * 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  starCache.set(key, canvas);
  return canvas;
}
