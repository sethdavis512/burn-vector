import { audio } from '../core/audio';
import { RNG, fmt } from '../core/math';
import { COMMODITIES, priceAt, priceLevel } from '../data/commodities';
import { REGION_NAMES, SYSTEMS } from '../data/galaxy';
import { GOVS, repTitle } from '../data/governments';
import { OUTFITS } from '../data/outfits';
import { shipDef } from '../data/ships';
import type { OutfitDef, PlanetDef, ShipDef } from '../data/types';
import {
  buyCommodity,
  buyOutfit,
  buyShip,
  mapIsUseful,
  outfitSellPrice,
  outfitsForSale,
  refuel,
  refuelCost,
  sellCommodity,
  sellOutfit,
  shipsForSale,
  tradeInValue,
  type Completion,
  type Result,
} from '../game/economy';
import type { GuideAction } from '../game/guide';
import { acceptMission, dropMission, missionsFor } from '../game/missions';
import { chapter, storyOffer, storyStep } from '../game/story';
import { dismissEscort, escortDisplayName, escortSaleValue, hireEscort, hireOffers, sellEscort } from '../game/escorts';
import { MAX_ESCORTS, cargoUsed, commodityTons, fleetCount, fmtDate, freeCargo, missionTons, playerStats, type Mission } from '../game/player';
import { BAR_SCENES, barRumors } from '../game/rumors';
import { ammoCapacity, computeStats, defaultLoadout, installBlocker, slotsUsed, usedMass } from '../game/stats';
import { isStation, renderPlanet, renderStation } from '../render/planets';
import { ICONS, button, h, panel, setChildren, stat } from './dom';
import type { UI } from './ui';

const SERVICE_NAMES: Record<string, string> = {
  T: 'Trade',
  O: 'Outfitter',
  S: 'Shipyard',
  M: 'Missions',
  B: 'Bar',
  F: 'Fuel',
};

function portImage(p: PlanetDef, size: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const bg = ctx.createRadialGradient(size * 0.3, size * 0.3, 0, size / 2, size / 2, size * 0.8);
  bg.addColorStop(0, '#0b1424');
  bg.addColorStop(1, '#03060c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const rng = new RNG(p.seed);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rng.range(0.15, 0.8)})`;
    const r = rng.range(0.3, 1.1);
    ctx.beginPath();
    ctx.arc(rng.range(0, size), rng.range(0, size), r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (isStation(p)) {
    const st = renderStation(p, Math.round(size * 0.3));
    ctx.drawImage(st.canvas, size / 2 - st.canvas.width / 2, size / 2 - st.canvas.height / 2);
  } else {
    const r = Math.round(size * 0.4);
    const spr = renderPlanet(p, r, -2.4, 0.55);
    ctx.drawImage(spr, size / 2 - spr.width / 2, size / 2 - spr.height / 2);
  }
  return c;
}

export function renderSpaceport(ui: UI, p: PlanetDef, done: Completion[]) {
  const game = ui.game;
  const ps = game.ps!;
  const sys = SYSTEMS[p.systemId]!;
  const gov = GOVS[p.gov];
  const svc = (k: string) => p.services.includes(k);

  const footer = h('footer', { class: 'port-bar' });
  const actions = h('nav', { class: 'port-actions' });
  const nextStep = h('div', { class: 'next-step', role: 'status' });

  const runAction = (a: GuideAction) => {
    switch (a.kind) {
      case 'trade':
        return openTrade(ui, p);
      case 'outfit':
        return openOutfitter(ui, p);
      case 'shipyard':
        return openShipyard(ui, p);
      case 'missions':
        return openMissions(ui, p);
      case 'bar':
        return openBar(ui, p);
      case 'map':
        return ui.showMap();
      case 'takeoff':
        return leave();
      case 'refuel':
        return doRefuel();
      case 'route': {
        const n = game.plotRouteTo(a.system!);
        if (n) ui.toast(`Route plotted to ${SYSTEMS[a.system!]!.name} (${n} jump${n === 1 ? '' : 's'}).`, 'good');
        else ui.toast('No known route there yet.', 'bad');
        return refresh();
      }
    }
  };

  const refreshNextStep = () => {
    const o = game.showGuide ? game.currentObjective() : null;
    nextStep.hidden = !o;
    if (!o) return;
    setChildren(
      nextStep,
      h('div', { class: 'next-copy' }, h('div', { class: 'kicker' }, o.kicker), h('div', { class: 'next-title' }, o.title), h('p', {}, o.detail)),
      o.action ? button(o.action.label, () => runAction(o.action!), { small: true, primary: true }) : null,
    );
  };

  const refresh = () => {
    refreshNextStep();
    const st = playerStats(ps);
    const def = shipDef(ps.shipId);
    footer.replaceChildren(
      stat('Credits', `${fmt(ps.credits)} cr`, 'gold'),
      stat('Ship', `${ps.shipName} · ${def.name}`),
      stat('Fuel', `${Math.floor(ps.fuel)} / ${st.maxFuel} (${Math.floor(ps.fuel / 100)} jumps)`),
      stat('Cargo', `${cargoUsed(ps)} / ${st.cargo} t`),
      stat('Date', fmtDate(ps.day)),
      stat(`${gov.short} standing`, repTitle(p.gov, ps.rep[p.gov] ?? 0)),
    );
    const missionCount = svc('M') ? missionsFor(p, ps).length : 0;
    const cost = refuelCost(ps, p);
    const full = ps.fuel >= st.maxFuel;
    actions.replaceChildren(
      button('Commodity Exchange', () => openTrade(ui, p), { icon: ICONS.trade, key: 'T', disabled: !svc('T') }),
      button('Outfitter', () => openOutfitter(ui, p), { icon: ICONS.outfit, key: 'O', disabled: !svc('O') }),
      button('Shipyard', () => openShipyard(ui, p), { icon: ICONS.ship, key: 'S', disabled: !svc('S') }),
      button(`Mission Board${missionCount ? ` (${missionCount})` : ''}`, () => openMissions(ui, p), { icon: ICONS.missions, key: 'M', disabled: !svc('M') }),
      button('Spaceport Bar', () => openBar(ui, p), { icon: ICONS.bar, key: 'B', disabled: !svc('B') }),
      button(full ? 'Tanks Full' : `Refuel · ${fmt(cost)} cr`, () => doRefuel(), { icon: ICONS.fuel, key: 'F', disabled: !svc('F') || full }),
      button('Galaxy Map', () => ui.showMap(), { icon: ICONS.map, key: 'G' }),
      button('Pilot Dossier', () => ui.showInfo(), { icon: ICONS.info, key: 'I' }),
      button('Take Off', () => leave(), { icon: ICONS.launch, key: 'L', primary: true, sound: false }),
    );
  };

  const doRefuel = () => {
    const r = refuel(ps, p);
    audio.play(r.ok ? 'buy' : 'error');
    if (r.msg) ui.toast(r.msg, r.ok ? 'good' : 'bad');
    game.save();
    refresh();
  };

  const leave = () => {
    if (ps.fuel < 100 && svc('F') && ps.credits >= refuelCost(ps, p) && refuelCost(ps, p) > 0) {
      ui.dialog({
        title: 'Low fuel',
        body: `You don't have enough fuel for a hyperspace jump. Refuel for ${fmt(refuelCost(ps, p))} credits before leaving?`,
        cancelable: true,
        buttons: [
          { label: 'Refuel & launch', primary: true, onClick: () => { refuel(ps, p); game.takeoff(); } },
          { label: 'Launch anyway', onClick: () => game.takeoff() },
        ],
      });
      return;
    }
    game.takeoff();
  };

  const tags = Object.keys(SERVICE_NAMES)
    .filter((k) => svc(k))
    .map((k) => h('span', { class: 'tag' }, SERVICE_NAMES[k]!));

  const el = h(
    'div',
    { class: 'screen port' },
    h(
      'div',
      { class: 'port-frame' },
      h(
        'section',
        { class: 'port-hero' },
        h('div', { class: 'port-image' }, portImage(p, 300)),
        h(
          'div',
          { class: 'port-info' },
          h('div', { class: 'kicker', style: { color: gov.color } }, `${sys.name} system · ${gov.name} · ${REGION_NAMES[sys.region] ?? ''}`),
          h('h1', {}, p.name),
          h('div', { class: 'tags' }, h('span', { class: 'tag tech' }, `Tech ${p.tech}`), ...tags),
          h('p', { class: 'port-desc' }, p.desc),
          nextStep,
        ),
      ),
      actions,
      footer,
    ),
  );

  refresh();
  ui.setScreen(el, (e) => {
    const map: Record<string, () => void> = {
      KeyT: () => svc('T') && openTrade(ui, p),
      KeyO: () => svc('O') && openOutfitter(ui, p),
      KeyS: () => svc('S') && openShipyard(ui, p),
      KeyM: () => svc('M') && openMissions(ui, p),
      KeyB: () => svc('B') && openBar(ui, p),
      KeyF: () => svc('F') && doRefuel(),
      KeyG: () => ui.showMap(),
      KeyI: () => ui.showInfo(),
      KeyL: () => leave(),
      Enter: () => leave(),
      Escape: () => portMenu(ui),
    };
    const fn = map[e.code];
    if (fn) {
      if (e.code !== 'KeyL' && e.code !== 'Enter' && e.code !== 'KeyF') audio.play('click');
      fn();
    }
    return true;
  });
  ui.refreshScreen = refresh;

  const stories = done.filter((d) => d.story);
  const regular = done.filter((d) => !d.story);
  const showStories = () => {
    const next = stories.shift();
    if (next) storyComplete(ui, p, next, () => showStories());
    else offerNextChapter(ui, p);
  };
  if (regular.length) {
    audio.play('mission');
    ui.dialog({
      title: regular.length > 1 ? 'Missions Complete' : 'Mission Complete',
      body: h(
        'div',
        {},
        ...regular.map((d) => h('div', { class: 'done-row' }, h('span', {}, d.title), h('span', { class: 'gold' }, `+${fmt(d.pay)} cr`))),
      ),
      buttons: [
        {
          label: 'Excellent',
          primary: true,
          onClick: () => {
            refresh();
            showStories();
          },
        },
      ],
    });
  } else if (stories.length) {
    showStories();
  }
}

function storyComplete(ui: UI, p: PlanetDef, d: Completion, then: () => void) {
  const ch = chapter(d.story!);
  if (!ch) return then();
  audio.play('mission');
  const body = h(
    'div',
    {},
    h('p', { class: 'story-text' }, ch.completeText),
    h('div', { class: 'done-row' }, h('span', {}, `Chapter ${ch.step} complete: ${ch.title}`), h('span', { class: 'gold' }, `+${fmt(d.pay)} cr`)),
  );
  if (ch.choices?.length) {
    ui.dialog({
      title: ch.title,
      wide: true,
      body,
      buttons: ch.choices.map((c, i) => ({
        label: c.label,
        primary: i === 0,
        onClick: () => {
          const result = c.apply(ui.game.ps!);
          ui.game.save();
          ui.refreshScreen?.();
          ui.dialog({
            title: 'The Collective Remembers',
            wide: true,
            body: h('div', {}, h('p', { class: 'story-text' }, result), h('p', { class: 'muted small' }, 'You have reached the end of this story. The galaxy is yours to explore.')),
            buttons: [{ label: 'Fly on', primary: true, onClick: then }],
          });
        },
      })),
    });
    return;
  }
  ui.dialog({ title: ch.title, wide: true, body, buttons: [{ label: 'Continue', primary: true, onClick: then }] });
}

/** If the next chapter is offered right here, put it in front of the player. */
function offerNextChapter(ui: UI, p: PlanetDef) {
  const ps = ui.game.ps!;
  const m = storyOffer(p, ps);
  if (!m || storyStep(ps) === 0) return;
  ui.dialog({
    title: m.title,
    wide: true,
    body: h('div', {}, h('div', { class: 'kicker' }, `Chapter ${m.story}`), h('p', { class: 'story-text' }, m.brief), h('div', { class: 'gold' }, `Payment: ${fmt(m.pay)} cr`)),
    cancelable: true,
    buttons: [
      {
        label: 'Accept',
        primary: true,
        onClick: () => {
          acceptMission(ps, m);
          audio.play('mission');
          ui.toast(acceptedToast(ui, m), 'good');
          ui.game.save();
          ui.refreshScreen?.();
        },
      },
      { label: 'Later', onClick: () => ui.toast('You can accept it later from the Mission Board.') },
    ],
  });
}

function portMenu(ui: UI) {
  ui.dialog({
    title: 'Spaceport',
    body: 'Your progress is saved automatically every time you land.',
    cancelable: true,
    buttons: [
      { label: 'Handbook', onClick: () => ui.showHelp('port') },
      { label: 'Quit to title', danger: true, onClick: () => ui.game.quitToTitle() },
      { label: 'Back', primary: true, onClick: () => {} },
    ],
  });
}

function feedback(ui: UI, r: Result, ok: 'buy' | 'sell' = 'buy') {
  audio.play(r.ok ? ok : 'error');
  if (r.msg) ui.toast(r.msg, r.ok ? 'good' : 'bad');
  if (r.ok) ui.game.save();
}

// ── Commodity exchange ───────────────────────────────────────────

function openTrade(ui: UI, p: PlanetDef) {
  const ps = ui.game.ps!;
  let close = () => {};
  const body = h('div', { class: 'trade' });
  const LVL = { L: 'Low', M: 'Med', H: 'High' } as const;

  const render = () => {
    const st = playerStats(ps);
    const rows = COMMODITIES.map((c) => {
      const price = priceAt(p, c.id, ps.day);
      const lvl = priceLevel(p, c.id);
      const held = ps.cargo[c.id] ?? 0;
      const paid = ps.cargoCost[c.id];
      const act = (fn: () => Result, kind: 'buy' | 'sell') => () => {
        feedback(ui, fn(), kind);
        render();
      };
      const canBuy = price !== null && freeCargo(ps) > 0 && ps.credits >= price;
      const canSell = price !== null && held > 0;
      const diff = price !== null && paid ? price - paid : 0;
      return h(
        'tr',
        { class: price === null ? 'na' : '' },
        h('td', { class: 'c-name' }, c.name),
        h('td', { class: 'num' }, price === null ? '·' : `${fmt(price)}`),
        h('td', {}, lvl ? h('span', { class: `lvl lvl-${lvl}` }, LVL[lvl]) : h('span', { class: 'muted' }, 'not traded')),
        h(
          'td',
          { class: 'num' },
          held ? `${held} t` : '·',
          held && paid ? h('div', { class: `tiny ${diff > 0 ? 'good' : diff < 0 ? 'bad' : 'muted'}` }, `paid ${fmt(paid)}`) : null,
        ),
        h(
          'td',
          { class: 'act' },
          button('+1', act(() => buyCommodity(ps, p, c.id, 1), 'buy'), { small: true, disabled: !canBuy, sound: false }),
          button('+10', act(() => buyCommodity(ps, p, c.id, 10), 'buy'), { small: true, disabled: !canBuy, sound: false }),
          button('Max', act(() => buyCommodity(ps, p, c.id, 9999), 'buy'), { small: true, disabled: !canBuy, sound: false }),
        ),
        h(
          'td',
          { class: 'act' },
          button('-1', act(() => sellCommodity(ps, p, c.id, 1), 'sell'), { small: true, disabled: !canSell, sound: false }),
          button('All', act(() => sellCommodity(ps, p, c.id, 9999), 'sell'), { small: true, disabled: !canSell, sound: false }),
        ),
      );
    });
    const mt = missionTons(ps);
    body.replaceChildren(
      h(
        'table',
        { class: 'grid-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Commodity'), h('th', { class: 'num' }, 'Price/t'), h('th', {}, 'Market'), h('th', { class: 'num' }, 'Hold'), h('th', {}, 'Buy'), h('th', {}, 'Sell'))),
        h('tbody', {}, ...rows),
      ),
      h(
        'div',
        { class: 'panel-foot' },
        stat('Credits', `${fmt(ps.credits)} cr`, 'gold'),
        stat('Cargo', `${commodityTons(ps)} t goods${mt ? ` + ${mt} t missions` : ''} / ${st.cargo} t`),
        stat('Free', `${freeCargo(ps)} t`),
        stat('Trade profit', `${ps.stats.profit >= 0 ? '+' : ''}${fmt(ps.stats.profit)} cr`, ps.stats.profit >= 0 ? 'good' : 'bad'),
      ),
      h('p', { class: 'muted small' }, 'Buy where the market is Low, sell where it is High. Prices drift a little every few days.'),
    );
  };
  render();
  const el = panel(`Commodity Exchange · ${p.name}`, () => close(), body);
  close = ui.pushModal(el, () => close());
}

// ── Outfitter ────────────────────────────────────────────────────

function outfitStats(o: OutfitDef): [string, string][] {
  const out: [string, string][] = [];
  const w = o.weapon;
  if (w) {
    if (w.kind === 'beam') {
      out.push(['Damage', `${w.damage} / sec`], ['Range', fmt(w.range ?? 0)]);
    } else {
      out.push(['Damage', `${w.damage}${w.blast ? ' + blast' : ''}`], ['Fire rate', `${(1 / w.reload).toFixed(1)} / sec`], ['Range', fmt(w.speed * w.life)]);
    }
    if (w.shieldMult && w.shieldMult !== 1) out.push(['vs. shields', `×${w.shieldMult}`]);
    if (w.armorMult && w.armorMult !== 1) out.push(['vs. armor', `×${w.armorMult}`]);
    if (w.turn) out.push(['Guidance', 'Homing']);
    out.push(['Mount', w.turret ? 'Turret' : w.secondary ? 'Launcher (gun mount)' : 'Gun mount']);
    if (o.ammoCap) out.push(['Ammo capacity', String(o.ammoCap)]);
  }
  if (o.shield) out.push(['Shield', `+${o.shield}`]);
  if (o.shieldRegen) out.push(['Shield recharge', `+${o.shieldRegen}/sec`]);
  if (o.armor) out.push(['Armor', `+${o.armor}`]);
  if (o.armorRegen) out.push(['Armor repair', `+${o.armorRegen}/sec`]);
  if (o.cargo) out.push(['Cargo', `+${o.cargo} t`]);
  if (o.fuel) out.push(['Fuel', `+${o.fuel}`]);
  if (o.speed) out.push(['Top speed', `+${Math.round(o.speed * 100)}%`]);
  if (o.accel) out.push(['Acceleration', `+${Math.round(o.accel * 100)}%`]);
  if (o.turn) out.push(['Turning', `+${Math.round(o.turn * 100)}%`]);
  if (o.ramscoop) out.push(['Fuel regen', `${o.ramscoop}/sec`]);
  if (o.max) out.push(['Limit', `${o.max} per ship`]);
  if (o.cat !== 'Ammunition' && o.cat !== 'Maps') out.push(['Space used', `${o.mass} t`]);
  return out;
}

const CAT_ORDER: OutfitDef['cat'][] = ['Weapons', 'Turrets', 'Launchers', 'Ammunition', 'Systems', 'Maps'];

function openOutfitter(ui: UI, p: PlanetDef) {
  const ps = ui.game.ps!;
  let close = () => {};
  let sel: string | null = null;
  const listEl = h('div', { class: 'item-list' });
  const detail = h('div', { class: 'item-detail' });
  const foot = h('div', { class: 'panel-foot' });

  const render = () => {
    const def = shipDef(ps.shipId);
    const listings = outfitsForSale(p, ps);
    if (!sel && listings[0]) sel = listings[0].o.id;
    listEl.replaceChildren(
      ...CAT_ORDER.flatMap((cat) => {
        const items = listings.filter((l) => l.o.cat === cat);
        if (!items.length) return [];
        return [
          h('div', { class: 'list-head' }, cat),
          ...items.map(({ o, locked }) => {
            const owned = o.cat === 'Ammunition' ? ps.ammo[o.id] ?? 0 : ps.outfits[o.id] ?? 0;
            return h(
              'button',
              {
                class: `item${sel === o.id ? ' on' : ''}${locked ? ' locked' : ''}`,
                onclick: () => {
                  sel = o.id;
                  audio.play('click');
                  render();
                },
              },
              h('span', { class: 'item-name' }, o.name),
              owned ? h('span', { class: 'badge' }, `×${owned}`) : null,
              h('span', { class: 'item-price' }, `${fmt(o.price)}`),
            );
          }),
        ];
      }),
    );
    // Also list owned outfits that this shop doesn't sell, so they can be sold.
    const sold = new Set(listings.map((l) => l.o.id));
    const extra = Object.keys(ps.outfits).filter((id) => !sold.has(id) && OUTFITS[id]);
    if (extra.length) {
      listEl.append(
        h('div', { class: 'list-head' }, 'Installed elsewhere'),
        ...extra.map((id) =>
          h(
            'button',
            {
              class: `item${sel === id ? ' on' : ''}`,
              onclick: () => {
                sel = id;
                audio.play('click');
                render();
              },
            },
            h('span', { class: 'item-name' }, OUTFITS[id]!.name),
            h('span', { class: 'badge' }, `×${ps.outfits[id]}`),
          ),
        ),
      );
    }

    const o = sel ? OUTFITS[sel] : null;
    if (o) {
      const listing = listings.find((l) => l.o.id === o.id);
      const forSale = !!listing;
      const locked = listing?.locked ?? null;
      const owned = o.cat === 'Ammunition' ? ps.ammo[o.id] ?? 0 : ps.outfits[o.id] ?? 0;
      let blocker = o.cat === 'Maps' ? (mapIsUseful(ps, o) ? null : 'You already have these charts.') : installBlocker(def, ps.outfits, o, ps.ammo);
      if (!forSale) blocker = 'Not sold here.';
      if (locked) blocker = locked;
      if (!blocker && ps.credits < o.price) blocker = "You can't afford this.";
      const cap = o.cat === 'Ammunition' ? ammoCapacity(ps.outfits, o.id) : 0;
      setChildren(detail, 
        h('div', { class: 'kicker' }, o.cat),
        h('h3', {}, o.name),
        h('p', {}, o.desc),
        h('div', { class: 'stat-grid' }, ...outfitStats(o).map(([k, v]) => stat(k, v))),
        o.cat === 'Ammunition' ? h('p', { class: 'muted small' }, `Carried: ${owned} / ${cap}`) : owned ? h('p', { class: 'muted small' }, `Installed: ${owned}`) : null,
        h('div', { class: 'price-line' }, h('span', {}, 'Price'), h('span', { class: 'gold' }, `${fmt(o.price)} cr`)),
        blocker ? h('div', { class: 'blocker' }, blocker) : null,
        h(
          'div',
          { class: 'panel-actions' },
          button(o.cat === 'Maps' ? 'Buy Charts' : 'Buy', () => {
            feedback(ui, buyOutfit(ps, p, o.id));
            render();
          }, { primary: true, disabled: !!blocker, sound: false }),
          o.cat === 'Ammunition'
            ? button('Fill', () => {
                let n = 0;
                while (buyOutfit(ps, p, o.id).ok) n++;
                feedback(ui, n ? { ok: true, msg: `Bought ${n} ${o.name}.` } : { ok: false, msg: 'Nothing bought.' });
                render();
              }, { disabled: !!blocker, sound: false })
            : null,
          o.cat !== 'Maps'
            ? button(`Sell · ${fmt(outfitSellPrice(o))}`, () => {
                feedback(ui, sellOutfit(ps, o.id), 'sell');
                render();
              }, { disabled: owned <= 0, sound: false })
            : null,
        ),
      );
    }
    const slots = slotsUsed(ps.outfits);
    const free = def.mass - usedMass(ps.outfits);
    foot.replaceChildren(
      stat('Credits', `${fmt(ps.credits)} cr`, 'gold'),
      stat('Free space', `${free} / ${def.mass} t`),
      stat('Gun mounts', `${slots.guns} / ${def.guns}`),
      stat('Turret mounts', `${slots.turrets} / ${def.turrets}`),
    );
  };
  render();
  const el = panel(`Outfitter · ${p.name}`, () => close(), h('div', { class: 'split' }, listEl, detail), foot);
  el.classList.add('wide');
  close = ui.pushModal(el, () => close());
}

// ── Shipyard ─────────────────────────────────────────────────────

function compareRows(cur: ShipDef, next: ShipDef) {
  const a = computeStats(cur, defaultLoadout(cur).outfits);
  const b = computeStats(next, defaultLoadout(next).outfits);
  const rows: [string, number, number, (n: number) => string][] = [
    ['Shield', a.maxShield, b.maxShield, (n) => fmt(n)],
    ['Armor', a.maxArmor, b.maxArmor, (n) => fmt(n)],
    ['Top speed', cur.speed, next.speed, (n) => fmt(n)],
    ['Acceleration', cur.accel, next.accel, (n) => fmt(n)],
    ['Turn rate', cur.turn, next.turn, (n) => `${n}°/s`],
    ['Cargo', a.cargo, b.cargo, (n) => `${n} t`],
    ['Fuel', a.maxFuel, b.maxFuel, (n) => `${Math.floor(n / 100)} jumps`],
    ['Gun mounts', cur.guns, next.guns, (n) => String(n)],
    ['Turret mounts', cur.turrets, next.turrets, (n) => String(n)],
    ['Outfit space', cur.mass, next.mass, (n) => `${n} t`],
  ];
  return h(
    'table',
    { class: 'compare' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'num' }, 'Yours'), h('th', { class: 'num' }, 'This ship'))),
    h(
      'tbody',
      {},
      ...rows.map(([label, x, y, f]) =>
        h('tr', {}, h('td', {}, label), h('td', { class: 'num muted' }, f(x)), h('td', { class: `num ${y > x ? 'good' : y < x ? 'bad' : ''}` }, f(y))),
      ),
    ),
  );
}

function openShipyard(ui: UI, p: PlanetDef) {
  const game = ui.game;
  const ps = game.ps!;
  let close = () => {};
  let sel: string | null = null;
  const listEl = h('div', { class: 'item-list ships' });
  const detail = h('div', { class: 'item-detail' });
  const foot = h('div', { class: 'panel-foot' });

  const render = () => {
    const listings = shipsForSale(p, ps);
    if (!sel) sel = (listings.find((l) => l.def.id !== ps.shipId) ?? listings[0])?.def.id ?? null;
    listEl.replaceChildren(
      ...listings.map(({ def, locked }) => {
        const thumb = game.renderer.thumbnail(def, 48);
        thumb.style.width = '48px';
        thumb.style.height = '48px';
        return h(
          'button',
          {
            class: `item ship-item${sel === def.id ? ' on' : ''}${locked ? ' locked' : ''}`,
            onclick: () => {
              sel = def.id;
              audio.play('click');
              render();
            },
          },
          h('span', { class: 'thumb' }, thumb),
          h('span', { class: 'item-name' }, def.name, h('small', {}, def.cls)),
          ps.shipId === def.id ? h('span', { class: 'badge' }, 'Yours') : h('span', { class: 'item-price' }, fmt(def.price)),
        );
      }),
    );
    const listing = listings.find((l) => l.def.id === sel);
    if (listing) {
      const def = listing.def;
      const cur = shipDef(ps.shipId);
      const tradeIn = tradeInValue(ps);
      const net = def.price - tradeIn;
      let blocker: string | null = listing.locked;
      if (!blocker && def.id === ps.shipId) blocker = 'You already fly this ship.';
      if (!blocker && ps.credits < net) blocker = "You can't afford this ship, even with your trade-in.";
      const big = game.renderer.thumbnail(def, 200);
      big.style.width = '200px';
      big.style.height = '200px';
      setChildren(detail, 
        h('div', { class: 'ship-hero' }, big),
        h('div', { class: 'kicker' }, def.gov ? `${def.cls} · ${GOVS[def.gov].name}` : def.cls),
        h('h3', {}, def.name),
        h('p', {}, def.desc),
        compareRows(cur, def),
        h('div', { class: 'price-line' }, h('span', {}, 'Price'), h('span', {}, `${fmt(def.price)} cr`)),
        h('div', { class: 'price-line' }, h('span', {}, `Trade-in (${cur.name} + outfits)`), h('span', { class: 'good' }, `−${fmt(tradeIn)} cr`)),
        h('div', { class: 'price-line total' }, h('span', {}, net >= 0 ? 'You pay' : 'You receive'), h('span', { class: 'gold' }, `${fmt(Math.abs(net))} cr`)),
        blocker ? h('div', { class: 'blocker' }, blocker) : null,
        h(
          'div',
          { class: 'panel-actions' },
          button('Buy Ship', () => {
            ui.dialog({
              title: `Buy the ${def.name}?`,
              body: `Your ${cur.name} and every outfit aboard will be traded in. The new ship comes with its standard loadout${def.outfits.length ? '' : ' (no weapons)'}. Your cargo and missions transfer over.`,
              cancelable: true,
              buttons: [
                {
                  label: 'Buy it',
                  primary: true,
                  onClick: () => {
                    const r = buyShip(ps, def.id);
                    feedback(ui, r);
                    render();
                  },
                },
                { label: 'Cancel', onClick: () => {} },
              ],
            });
          }, { primary: true, disabled: !!blocker }),
        ),
      );
    }
    const prizes = ps.escorts.filter((e) => !e.hired);
    setChildren(
      foot,
      stat('Credits', `${fmt(ps.credits)} cr`, 'gold'),
      stat('Your ship', `${ps.shipName} · ${shipDef(ps.shipId).name}`),
      stat('Trade-in value', `${fmt(tradeInValue(ps))} cr`),
      prizes.length
        ? h(
            'div',
            { class: 'prize-sales' },
            ...prizes.map((e) =>
              button(`Sell captured ${shipDef(e.shipId).name} · ${fmt(escortSaleValue(e))}`, () => {
                feedback(ui, sellEscort(ps, e.id), 'sell');
                render();
              }, { small: true, sound: false }),
            ),
          )
        : null,
    );
  };
  render();
  const el = panel(`Shipyard · ${p.name}`, () => close(), h('div', { class: 'split' }, listEl, detail), foot);
  el.classList.add('wide');
  close = ui.pushModal(el, () => close());
}

// ── Mission board ────────────────────────────────────────────────

function missionLine(m: Mission) {
  const dest = m.destPlanet ? `${SYSTEMS[m.destSystem]!.name}` : SYSTEMS[m.destSystem]!.name;
  return `${dest}${m.deadline !== undefined ? ` · by ${fmtDate(m.deadline)}` : ''}`;
}

function openMissions(ui: UI, p: PlanetDef) {
  const ps = ui.game.ps!;
  let close = () => {};
  let tab: 'available' | 'active' = 'available';
  let sel: string | null = null;
  const tabs = h('div', { class: 'tabs' });
  const listEl = h('div', { class: 'item-list' });
  const detail = h('div', { class: 'item-detail' });

  const render = () => {
    const available = missionsFor(p, ps);
    const list = tab === 'available' ? available : ps.missions;
    if (!list.find((m) => m.id === sel)) sel = list[0]?.id ?? null;
    tabs.replaceChildren(
      h('button', { class: `tab${tab === 'available' ? ' on' : ''}`, onclick: () => { tab = 'available'; sel = null; audio.play('click'); render(); } }, `Available (${available.length})`),
      h('button', { class: `tab${tab === 'active' ? ' on' : ''}`, onclick: () => { tab = 'active'; sel = null; audio.play('click'); render(); } }, `Active (${ps.missions.length})`),
    );
    listEl.replaceChildren(
      ...(list.length
        ? list.map((m) =>
            h(
              'button',
              { class: `item mission-item${sel === m.id ? ' on' : ''}`, onclick: () => { sel = m.id; audio.play('click'); render(); } },
              h('span', { class: `mtype mtype-${m.type}` }, m.type),
              h('span', { class: 'item-name' }, m.title, h('small', {}, missionLine(m))),
              h('span', { class: 'item-price' }, fmt(m.pay)),
            ),
          )
        : [h('p', { class: 'muted pad' }, tab === 'available' ? 'No work posted today. Check back tomorrow.' : 'You have no active missions.')]),
    );
    const m = list.find((x) => x.id === sel);
    if (!m) {
      setChildren(detail, h('p', { class: 'muted' }, 'Select a mission to read the details.'));
      return;
    }
    const free = freeCargo(ps);
    const blocker = tab === 'available' && m.tons > free ? `Requires ${m.tons} t of free cargo space (you have ${free} t).` : null;
    setChildren(detail, 
      h('div', { class: 'kicker' }, `${m.type.toUpperCase()} · ${GOVS[m.gov].name}`),
      h('h3', {}, m.title),
      h('p', {}, m.brief),
      h(
        'div',
        { class: 'stat-grid' },
        stat('Payment', `${fmt(m.pay)} cr`, 'gold'),
        stat('Destination', m.destPlanet ? `${missionDest(m)}` : `${SYSTEMS[m.destSystem]!.name} system`),
        stat('Deadline', m.deadline !== undefined ? fmtDate(m.deadline) : 'None'),
        stat('Cargo space', m.tons ? `${m.tons} t` : 'None'),
      ),
      blocker ? h('div', { class: 'blocker' }, blocker) : null,
      h(
        'div',
        { class: 'panel-actions' },
        tab === 'available'
          ? button('Accept Mission', () => {
              acceptMission(ps, m);
              audio.play('mission');
              ui.toast(acceptedToast(ui, m), 'good');
              ui.game.save();
              render();
            }, { primary: true, disabled: !!blocker, sound: false })
          : null,
        tab === 'active' && m.destSystem !== ps.system
          ? button('Plot route', () => {
              const n = ui.game.plotRouteTo(m.destSystem);
              ui.toast(n ? `Route plotted to ${SYSTEMS[m.destSystem]!.name} (${n} jump${n === 1 ? '' : 's'}).` : 'No known route there yet.', n ? 'good' : 'bad');
            })
          : null,
        tab === 'active'
          ? button('Abandon', () => {
              ui.dialog({
                title: 'Abandon mission?',
                body: `Your client will not be pleased. (${GOVS[m.gov].short} standing will drop.)`,
                cancelable: true,
                buttons: [
                  {
                    label: 'Abandon',
                    danger: true,
                    onClick: () => {
                      dropMission(ps, m, 3);
                      ui.game.save();
                      render();
                    },
                  },
                  { label: 'Keep it', onClick: () => {} },
                ],
              });
            }, { danger: true })
          : null,
      ),
    );
  };
  render();
  const el = panel(`Mission Board · ${p.name}`, () => close(), tabs, h('div', { class: 'split' }, listEl, detail));
  el.classList.add('wide');
  close = ui.pushModal(el, () => close());
}

/** Accepting a mission plots its route, so the next step is always "press J". */
function acceptedToast(ui: UI, m: Mission) {
  const n = ui.game.plotRouteTo(m.destSystem);
  const name = SYSTEMS[m.destSystem]!.name;
  if (n === null) return `Mission accepted. ${name} isn't on your charts yet; explore toward it.`;
  if (n === 0) return 'Mission accepted. The destination is in this system.';
  return `Mission accepted. Route plotted to ${name} (${n} jump${n === 1 ? '' : 's'}).`;
}

function missionDest(m: Mission) {
  const sys = SYSTEMS[m.destSystem]!;
  const planetName = m.destPlanet ? sys.planets.find((p) => p.id === m.destPlanet)?.name : null;
  return planetName ? `${planetName} (${sys.name})` : sys.name;
}

// ── Bar ──────────────────────────────────────────────────────────

function openBar(ui: UI, p: PlanetDef) {
  const game = ui.game;
  const ps = game.ps!;
  let close = () => {};
  let rounds = 0;
  const list = h('ul', { class: 'rumors' });
  const actions = h('div', { class: 'panel-actions' });
  const hires = h('div', { class: 'hire-list' });
  const fleet = h('div', { class: 'hire-list' });
  const fleetTitle = h('h3', { class: 'section-title' });
  const render = () => {
    fleetTitle.textContent = `Your fleet (${fleetCount(ps)}/${MAX_ESCORTS})`;
    const crew = ps.escorts.filter((e) => !e.client);
    list.replaceChildren(...barRumors(p, ps, 2 + rounds).map((r) => h('li', {}, r)));
    actions.replaceChildren(
      button(rounds >= 4 ? 'The room has gone quiet' : 'Buy a round · 50 cr', () => {
        if (ps.credits < 50) {
          ui.toast("You can't even afford a round.", 'bad');
          return;
        }
        ps.credits -= 50;
        rounds++;
        audio.play('buy');
        render();
        ui.refreshScreen?.();
      }, { disabled: rounds >= 4, sound: false }),
    );
    const offers = hireOffers(p, ps);
    const full = fleetCount(ps) >= MAX_ESCORTS;
    setChildren(
      hires,
      ...(offers.length
        ? offers.map((o) => {
            const def = shipDef(o.shipId);
            const thumb = game.renderer.thumbnail(def, 52);
            thumb.style.width = '52px';
            thumb.style.height = '52px';
            return h(
              'div',
              { class: 'hire-card' },
              h('span', { class: 'thumb' }, thumb),
              h(
                'div',
                { class: 'hire-meta' },
                h('div', { class: 'hire-name' }, o.name, h('small', {}, def.name)),
                h('div', { class: 'muted small' }, o.blurb),
                h('div', { class: 'small' }, h('span', { class: 'gold' }, `${fmt(o.fee)} cr`), ' to sign, then ', h('span', { class: 'gold' }, `${fmt(o.wage)} cr`), ' per day'),
              ),
              button('Hire', () => {
                feedback(ui, hireEscort(ps, o));
                render();
              }, { primary: true, small: true, disabled: full || ps.credits < o.fee, sound: false }),
            );
          })
        : [h('p', { class: 'muted small' }, p.gov === 'vael' ? 'The Vael do not sell their service.' : 'No pilots are looking for work today.')]),
    );
    setChildren(
      fleet,
      ...(crew.length
        ? crew.map((e) =>
            h(
              'div',
              { class: 'hire-card slim' },
              h(
                'div',
                { class: 'hire-meta' },
                h('div', { class: 'hire-name' }, escortDisplayName(e)),
                h('div', { class: 'muted small' }, e.hired ? `Mercenary · ${fmt(e.wage)} cr per day` : 'Captured prize · no wages'),
              ),
              button(e.hired ? 'Dismiss' : 'Release', () => {
                feedback(ui, dismissEscort(ps, e.id), 'sell');
                render();
              }, { small: true, danger: true, sound: false }),
            ),
          )
        : [h('p', { class: 'muted small' }, `You fly alone. You can command up to ${MAX_ESCORTS} escorts.`)]),
    );
  };
  render();
  const el = panel(
    `Spaceport Bar · ${p.name}`,
    () => close(),
    h('p', { class: 'scene' }, BAR_SCENES[p.gov]),
    h('h3', { class: 'section-title' }, 'You overhear'),
    list,
    actions,
    h('h3', { class: 'section-title' }, 'Pilots for hire'),
    hires,
    fleetTitle,
    fleet,
  );
  el.classList.add('narrow');
  close = ui.pushModal(el, () => close());
}
