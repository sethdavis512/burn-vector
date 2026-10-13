import { audio } from '../core/audio';
import { rgba } from '../core/color';
import { TAU, clamp, fmt } from '../core/math';
import { REGION_NAMES, SYSTEMS, SYSTEM_LIST } from '../data/galaxy';
import { GOVS } from '../data/governments';
import { isKnown, visibleSystems } from '../game/player';
import { ICONS, button, h } from './dom';
import type { UI } from './ui';

const SERVICE_LABEL: Record<string, string> = { O: 'Outfitter', S: 'Shipyard', M: 'Missions', B: 'Bar', T: 'Trade' };

export function openMap(ui: UI) {
  const game = ui.game;
  const ps = game.ps!;
  let close = () => {};
  const canvas = h('canvas', { class: 'map-canvas' });
  const info = h('div', { class: 'map-info' });
  const vis = visibleSystems(ps);
  let selected: string | null = game.route.length ? game.route[game.route.length - 1]! : null;
  let hover: string | null = null;

  // View transform: screen = (map - c) * scale + half
  const cur = SYSTEMS[ps.system]!;
  let cx = cur.x;
  let cy = cur.y;
  let scale = 1.6;
  let fitted = false;
  let dpr = 1;
  let W = 0;
  let H = 0;

  const toScreen = (x: number, y: number) => [(x - cx) * scale + W / 2, (y - cy) * scale + H / 2] as const;
  const toMap = (sx: number, sy: number) => [(sx - W / 2) / scale + cx, (sy - H / 2) / scale + cy] as const;

  const missionSystems = new Set(ps.missions.map((m) => m.destSystem));

  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = rect.width;
    H = rect.height;
    if (!fitted) {
      fitted = true;
      const pts = SYSTEM_LIST.filter((s) => vis.has(s.id));
      const xs = pts.map((s) => s.x);
      const ys = pts.map((s) => s.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      scale = clamp(Math.min((W - 160) / Math.max(1, maxX - minX), (H - 140) / Math.max(1, maxY - minY)), 0.6, 2.4);
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2;
    }
    if (canvas.width !== Math.floor(W * dpr)) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#03060d';
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = 'rgba(80,120,180,0.06)';
    ctx.lineWidth = 1;
    const step = 50 * scale;
    const [gx0, gy0] = toScreen(0, 0);
    for (let x = gx0 % step; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = gy0 % step; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // region labels
    const regions = new Map<string, { x: number; y: number; n: number }>();
    for (const s of SYSTEM_LIST) {
      if (!isKnown(ps, s.id)) continue;
      const r = regions.get(s.region) ?? { x: 0, y: 0, n: 0 };
      r.x += s.x;
      r.y += s.y;
      r.n++;
      regions.set(s.region, r);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(30 * Math.min(1.5, scale))}px "Chakra Petch", sans-serif`;
    for (const [region, r] of regions) {
      const [sx, sy] = toScreen(r.x / r.n, r.y / r.n);
      ctx.fillStyle = 'rgba(140,170,220,0.07)';
      ctx.fillText((REGION_NAMES[region] ?? region).toUpperCase(), sx, sy);
    }
    ctx.textBaseline = 'alphabetic';

    // links
    const routeSet = new Set<string>();
    const path = [ps.system, ...game.route];
    for (let i = 0; i < path.length - 1; i++) routeSet.add([path[i], path[i + 1]].sort().join('|'));
    for (const s of SYSTEM_LIST) {
      if (!vis.has(s.id)) continue;
      for (const n of s.links) {
        if (n < s.id || !vis.has(n)) continue;
        const known = isKnown(ps, s.id) || isKnown(ps, n);
        if (!known) continue;
        const o = SYSTEMS[n]!;
        const [ax, ay] = toScreen(s.x, s.y);
        const [bx, by] = toScreen(o.x, o.y);
        const onRoute = routeSet.has([s.id, n].sort().join('|'));
        ctx.strokeStyle = onRoute ? '#5ec8ff' : isKnown(ps, s.id) && isKnown(ps, n) ? 'rgba(120,150,200,0.38)' : 'rgba(120,150,200,0.16)';
        ctx.lineWidth = onRoute ? 2.5 : 1.2;
        if (!onRoute && !(isKnown(ps, s.id) && isKnown(ps, n))) ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // systems
    const t = performance.now() / 1000;
    for (const s of SYSTEM_LIST) {
      if (!vis.has(s.id)) continue;
      const [sx, sy] = toScreen(s.x, s.y);
      const known = isKnown(ps, s.id);
      const r = Math.max(4, 5 * Math.min(1.3, scale));
      if (known) {
        const col = s.gov ? GOVS[s.gov].color : '#9aa4b4';
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        g.addColorStop(0, rgba(col, 0.35));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
        if (!ps.explored.includes(s.id)) {
          ctx.fillStyle = '#03060d';
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.45, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = 'rgba(150,160,180,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.8, 0, TAU);
        ctx.stroke();
      }
      if (s.id === ps.system) {
        ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(t * 4)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 5, 0, TAU);
        ctx.stroke();
      }
      if (s.id === selected) {
        ctx.strokeStyle = '#f0b54a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 8, 0, TAU);
        ctx.stroke();
      }
      if (missionSystems.has(s.id)) {
        ctx.fillStyle = '#ffb04a';
        ctx.beginPath();
        ctx.moveTo(sx + r + 6, sy - r - 9);
        ctx.lineTo(sx + r + 10, sy - r - 5);
        ctx.lineTo(sx + r + 6, sy - r - 1);
        ctx.lineTo(sx + r + 2, sy - r - 5);
        ctx.closePath();
        ctx.fill();
      }
      if (known || s.id === hover) {
        ctx.font = `${s.id === selected || s.id === hover ? '600 ' : ''}12px "Share Tech Mono", monospace`;
        ctx.fillStyle = s.id === ps.system ? '#ffffff' : known ? 'rgba(210,222,240,0.85)' : 'rgba(160,170,190,0.6)';
        ctx.fillText(known ? s.name : 'Unexplored', sx, sy + r + 15);
      }
    }
    ctx.textAlign = 'left';
  };

  const renderInfo = () => {
    const id = selected ?? ps.system;
    const s = SYSTEMS[id]!;
    const known = isKnown(ps, id);
    const explored = ps.explored.includes(id);
    const routeLen = game.route.length;
    const fuelNeed = routeLen * 100;
    const children: (Node | null)[] = [];
    children.push(h('div', { class: 'kicker' }, id === ps.system ? 'Current system' : 'Selected system'));
    children.push(h('h2', {}, known ? s.name : 'Unexplored system'));
    if (known) {
      children.push(
        h('div', { class: 'map-gov', style: { color: s.gov ? GOVS[s.gov].color : '#9aa4b4' } }, s.gov ? GOVS[s.gov].name : 'Uninhabited'),
        h('div', { class: 'muted small' }, REGION_NAMES[s.region] ?? ''),
      );
      const landable = s.planets.filter((p) => p.landable);
      if (landable.length) {
        children.push(
          h(
            'ul',
            { class: 'map-planets' },
            ...landable.map((p) =>
              h(
                'li',
                {},
                h('span', {}, p.name),
                explored
                  ? h('small', {}, ['O', 'S'].filter((k) => p.services.includes(k)).map((k) => SERVICE_LABEL[k]).join(' · ') || 'Basic services')
                  : h('small', {}, 'Details unknown'),
              ),
            ),
          ),
        );
      } else {
        children.push(h('p', { class: 'muted small' }, 'No inhabited worlds.'));
      }
    } else {
      children.push(h('p', { class: 'muted small' }, 'No charts available. Visit it, or buy maps at an outfitter.'));
    }
    const ms = ps.missions.filter((m) => m.destSystem === id);
    if (ms.length) {
      children.push(h('div', { class: 'map-missions' }, h('div', { class: 'kicker' }, 'Your missions'), ...ms.map((m) => h('div', { class: 'small' }, m.title))));
    }
    if (routeLen) {
      const enough = ps.fuel >= fuelNeed;
      children.push(
        h(
          'div',
          { class: 'map-route' },
          h('div', { class: 'kicker' }, 'Route'),
          h('div', {}, [ps.system, ...game.route].map((r) => SYSTEMS[r]!.name).join(' → ')),
          h('div', { class: enough ? 'good small' : 'bad small' }, `${routeLen} jump${routeLen > 1 ? 's' : ''} · fuel ${fmt(fuelNeed)} of ${fmt(ps.fuel)}${enough ? '' : ' (not enough fuel)'}`),
          button('Clear route', () => {
            game.route = [];
            selected = null;
            renderInfo();
            draw();
          }, { small: true }),
        ),
      );
    } else {
      children.push(h('p', { class: 'muted small' }, 'Click a system to plot a hyperspace route. Press J in flight to jump.'));
    }
    info.replaceChildren(...children.filter((c): c is Node => c !== null));
  };

  const pick = (sx: number, sy: number): string | null => {
    let best: string | null = null;
    let bestD = 24;
    for (const s of SYSTEM_LIST) {
      if (!vis.has(s.id)) continue;
      const [x, y] = toScreen(s.x, s.y);
      const d = Math.hypot(x - sx, y - sy);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  };

  const select = (id: string) => {
    if (id === ps.system) {
      game.route = [];
      selected = null;
      audio.play('click');
    } else {
      selected = id;
      if (game.plotRouteTo(id) === null) {
        game.route = [];
        audio.play('error');
        ui.toast('No known route. Explore further or buy charts.', 'bad');
      } else {
        audio.play('select');
      }
    }
    renderInfo();
    draw();
  };

  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  canvas.addEventListener('mousedown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx, cy, moved: false };
  });
  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      cx = drag.cx - dx / scale;
      cy = drag.cy - dy / scale;
      draw();
      return;
    }
    const hv = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (hv !== hover) {
      hover = hv;
      canvas.style.cursor = hv ? 'pointer' : 'grab';
      draw();
    }
  };
  const onUp = (e: MouseEvent) => {
    if (drag && !drag.moved) {
      const rect = canvas.getBoundingClientRect();
      const id = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (id) select(id);
    }
    drag = null;
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const [mx, my] = toMap(e.clientX - rect.left, e.clientY - rect.top);
      const k = Math.exp(-e.deltaY * 0.0015);
      scale = clamp(scale * k, 0.5, 4);
      const [nx, ny] = toMap(e.clientX - rect.left, e.clientY - rect.top);
      cx += mx - nx;
      cy += my - ny;
      draw();
    },
    { passive: false },
  );

  const legend = h(
    'div',
    { class: 'map-legend' },
    ...(['concord', 'independent', 'league', 'corsair', 'vael'] as const).map((g) => h('span', {}, h('i', { style: { background: GOVS[g].color } }), GOVS[g].short)),
    h('span', {}, h('i', { class: 'hollow' }), 'Unexplored'),
    h('span', {}, h('i', { class: 'diamond' }), 'Mission'),
  );

  const el = h(
    'div',
    { class: 'map-overlay' },
    h(
      'header',
      { class: 'map-head' },
      h('h2', {}, 'Galaxy Map'),
      legend,
      h('button', { class: 'icon-btn', title: 'Close (Esc)', html: ICONS.close, onclick: () => close() }),
    ),
    h('div', { class: 'map-main' }, canvas, info),
  );

  const ro = new ResizeObserver(() => draw());
  let raf = 0;
  const loop = () => {
    draw();
    raf = requestAnimationFrame(loop);
  };
  const doClose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    closeModal();
    ui.refreshScreen?.();
  };
  const closeModal = ui.pushModal(el, () => doClose(), (e) => {
    if (e.code === 'KeyM' || e.code === 'KeyG') {
      doClose();
      return true;
    }
    return false;
  });
  close = doClose;
  el.parentElement?.classList.add('full');
  ro.observe(canvas);
  renderInfo();
  requestAnimationFrame(() => {
    draw();
    raf = requestAnimationFrame(loop);
  });
}
