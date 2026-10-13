import { TAU, rand } from '../core/math';

export type PKind = 'spark' | 'smoke' | 'fire' | 'flash' | 'ring' | 'debris' | 'glow' | 'trail';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  angle: number;
  spin: number;
  drag: number;
}

const FIRE = ['#fff3c2', '#ffd27a', '#ff9a3c', '#ff6a2a', '#e8432a'];
const MAX_PARTICLES = 2400;

export class Effects {
  items: Particle[] = [];

  add(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y' | 'life' | 'size' | 'color'>) {
    if (this.items.length >= MAX_PARTICLES) this.items.shift();
    this.items.push({
      vx: 0,
      vy: 0,
      grow: 0,
      angle: 0,
      spin: 0,
      drag: 0,
      max: p.life,
      ...p,
    });
  }

  update(dt: number) {
    const items = this.items;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i]!;
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.angle += p.spin * dt;
      items[w++] = p;
    }
    items.length = w;
  }

  sparks(x: number, y: number, n: number, color: string, speed = 260, bvx = 0, bvy = 0) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.3, 1) * speed;
      this.add({
        kind: 'spark',
        x,
        y,
        vx: bvx + Math.cos(a) * s,
        vy: bvy + Math.sin(a) * s,
        life: rand(0.15, 0.5),
        size: rand(1, 2.2),
        color,
        drag: 2,
      });
    }
  }

  flash(x: number, y: number, size: number, color = '#ffffff', life = 0.18) {
    this.add({ kind: 'flash', x, y, life, size, color });
  }

  smoke(x: number, y: number, vx: number, vy: number, size: number, color = '#5a5652') {
    this.add({
      kind: 'smoke',
      x,
      y,
      vx: vx + rand(-12, 12),
      vy: vy + rand(-12, 12),
      life: rand(0.9, 1.8),
      size,
      grow: size * 0.9,
      color,
      drag: 0.6,
    });
  }

  /** A full ship explosion; `scale` is roughly ship length / 30. */
  explosion(x: number, y: number, scale: number, bvx = 0, bvy = 0) {
    const s = Math.max(0.5, scale);
    this.flash(x, y, 46 * s, '#ffffff', 0.22);
    this.flash(x, y, 90 * s, '#ffb35a', 0.4);
    this.add({ kind: 'ring', x, y, vx: bvx, vy: bvy, life: 0.45, size: 6 * s, grow: 150 * s, color: '#ffd9a0' });
    const fires = Math.round(8 + 7 * s);
    for (let i = 0; i < fires; i++) {
      const a = rand(0, TAU);
      const sp = rand(15, 120) * Math.sqrt(s);
      this.add({
        kind: 'fire',
        x: x + Math.cos(a) * rand(0, 10 * s),
        y: y + Math.sin(a) * rand(0, 10 * s),
        vx: bvx * 0.6 + Math.cos(a) * sp,
        vy: bvy * 0.6 + Math.sin(a) * sp,
        life: rand(0.45, 1.1),
        size: rand(8, 20) * s,
        grow: 14 * s,
        color: FIRE[Math.floor(rand(0, FIRE.length))]!,
        drag: 1.2,
      });
    }
    const sparks = Math.round(18 + 12 * s);
    for (let i = 0; i < sparks; i++) {
      const a = rand(0, TAU);
      const sp = rand(120, 480) * Math.sqrt(s);
      this.add({
        kind: 'spark',
        x,
        y,
        vx: bvx + Math.cos(a) * sp,
        vy: bvy + Math.sin(a) * sp,
        life: rand(0.3, 0.9),
        size: rand(1.2, 2.6),
        color: '#ffe7b0',
        drag: 1.4,
      });
    }
    const smokes = Math.round(5 + 4 * s);
    for (let i = 0; i < smokes; i++) {
      const a = rand(0, TAU);
      const sp = rand(10, 60) * Math.sqrt(s);
      this.add({
        kind: 'smoke',
        x,
        y,
        vx: bvx * 0.5 + Math.cos(a) * sp,
        vy: bvy * 0.5 + Math.sin(a) * sp,
        life: rand(1.4, 2.6),
        size: rand(10, 22) * s,
        grow: 16 * s,
        color: '#3e3a38',
        drag: 0.5,
      });
    }
    const debris = Math.round(3 + 4 * s);
    for (let i = 0; i < debris; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 200);
      this.add({
        kind: 'debris',
        x,
        y,
        vx: bvx + Math.cos(a) * sp,
        vy: bvy + Math.sin(a) * sp,
        life: rand(1.5, 3.2),
        size: rand(1.5, 4) * Math.sqrt(s),
        color: '#8a8580',
        angle: rand(0, TAU),
        spin: rand(-8, 8),
        drag: 0.3,
      });
    }
  }

  /** Small blast for missile impacts and capital-ship death throes. */
  burst(x: number, y: number, size: number, bvx = 0, bvy = 0) {
    this.flash(x, y, size * 2.2, '#ffe2b0', 0.16);
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU);
      const sp = rand(20, 90);
      this.add({
        kind: 'fire',
        x,
        y,
        vx: bvx * 0.7 + Math.cos(a) * sp,
        vy: bvy * 0.7 + Math.sin(a) * sp,
        life: rand(0.3, 0.6),
        size: size * rand(0.5, 1),
        grow: size,
        color: FIRE[Math.floor(rand(0, FIRE.length))]!,
        drag: 1.5,
      });
    }
    this.sparks(x, y, 8, '#ffe2b0', 300, bvx, bvy);
  }
}
