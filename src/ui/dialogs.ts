import { audio } from '../core/audio';
import { pick } from '../core/math';
import { fmt } from '../core/math';
import { COMMODITIES, COMMODITY_BY_ID } from '../data/commodities';
import { SYSTEMS, PLANETS } from '../data/galaxy';
import { COMBAT_RANKS, GOVS, GOV_IDS, combatRank, repTitle } from '../data/governments';
import { OUTFITS } from '../data/outfits';
import { shipDef } from '../data/ships';
import type { PlanetDef } from '../data/types';
import type { Ship } from '../game/entities';
import { captureChance, escortDisplayName } from '../game/escorts';
import { MAX_ESCORTS, adjustRep, fleetCount, fmtDate, freeCargo, playerStats, type StartOption } from '../game/player';
import { ammoCapacity } from '../game/stats';
import { button, h, panel, stat } from './dom';
import type { DialogButton, UI } from './ui';

export function showWelcome(ui: UI, start: StartOption) {
  const ps = ui.game.ps!;
  const planet = PLANETS[start.planet]!;
  ui.dialog({
    title: `Welcome aboard, ${ps.name}`,
    wide: true,
    body: h(
      'div',
      {},
      h(
        'p',
        {},
        `The ${ps.shipName} is a battered Kestrel Shuttle with one light blaster, fifteen tons of cargo space and enough fuel for three jumps. She is all yours, and she is docked at ${planet.name}.`,
      ),
      h(
        'ul',
        { class: 'tips' },
        h('li', {}, 'Make money by trading commodities (buy Low, sell High) or by taking jobs from the Mission Board.'),
        h('li', {}, 'Spend it at the Outfitter and Shipyard. An escape pod is cheap insurance.'),
        h('li', {}, 'In flight: arrow keys to fly, Space to fire, L to land, M to plot a route, J to jump.'),
        h('li', {}, 'Not sure what to do? The "Next step" card here, and the objective panel in flight, always tell you, with the keys to press.'),
        h('li', {}, 'Press ? (or click the ? button, top left) any time for the Pilot\'s Handbook.'),
        h('li', {}, 'Corsairs prey on the weak. The Shoal, south of the core, is where they gather.'),
        h('li', {}, 'Your career saves automatically every time you land.'),
      ),
    ),
    buttons: [{ label: 'Let’s fly', primary: true, onClick: () => {} }],
  });
}

export function showPause(ui: UI) {
  const game = ui.game;
  const close = ui.dialog({
    title: 'Paused',
    body: h('p', { class: 'muted' }, `Last saved on landing at ${PLANETS[game.ps!.planet]?.name}.`),
    cancelable: true,
    buttons: [
      { label: 'Resume', primary: true, onClick: () => {} },
      { label: 'Handbook', onClick: () => ui.showHelp() },
      {
        label: `Objectives: ${game.showGuide ? 'On' : 'Off'}`,
        keep: true,
        onClick: () => {
          game.setShowGuide(!game.showGuide);
          close();
          showPause(ui);
        },
      },
      {
        label: `Sound: ${audio.muted ? 'Off' : 'On'}`,
        keep: true,
        onClick: () => {
          ui.toggleSound();
          close();
          showPause(ui);
        },
      },
      {
        label: `Music: ${audio.musicOn ? 'On' : 'Off'}`,
        keep: true,
        onClick: () => {
          audio.setMusicOn(!audio.musicOn);
          close();
          showPause(ui);
        },
      },
      {
        label: 'Quit to title',
        danger: true,
        onClick: () => {
          ui.dialog({
            title: 'Abandon flight?',
            body: 'Progress since your last landing will be lost.',
            cancelable: true,
            buttons: [
              { label: 'Quit', danger: true, onClick: () => game.quitToTitle(false) },
              { label: 'Keep flying', primary: true, onClick: () => {} },
            ],
          });
        },
      },
    ],
  });
}

function repBar(rep: number) {
  const pct = Math.max(0, Math.min(100, ((rep + 500) / 1100) * 100));
  const zero = (500 / 1100) * 100;
  return h(
    'div',
    { class: 'rep-bar' },
    h('i', { class: 'zero', style: { left: `${zero}%` } }),
    h('b', { class: rep >= 0 ? 'pos' : 'neg', style: rep >= 0 ? { left: `${zero}%`, width: `${pct - zero}%` } : { left: `${pct}%`, width: `${zero - pct}%` } }),
  );
}

export function showInfo(ui: UI) {
  const game = ui.game;
  const ps = game.ps!;
  const def = shipDef(ps.shipId);
  const st = playerStats(ps);
  let close = () => {};
  const rank = combatRank(ps.combat);
  const nextRank = COMBAT_RANKS.find(([min]) => min > ps.combat);
  const outfits = Object.entries(ps.outfits)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => h('li', {}, `${OUTFITS[id]?.name ?? id}${n > 1 ? ` ×${n}` : ''}`));
  const ammo = Object.entries(ps.ammo)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => h('li', {}, `${OUTFITS[id]?.name ?? id}: ${n} / ${ammoCapacity(ps.outfits, id)}`));
  const cargo = COMMODITIES.filter((c) => (ps.cargo[c.id] ?? 0) > 0).map((c) => h('li', {}, `${c.name}: ${ps.cargo[c.id]} t`));

  const el = panel(
    'Pilot Dossier',
    () => close(),
    h(
      'div',
      { class: 'dossier' },
      h(
        'section',
        {},
        h('div', { class: 'kicker' }, 'Pilot'),
        h('h3', {}, ps.name),
        h('div', { class: 'stat-grid' },
          stat('Combat rating', rank, 'gold'),
          stat('Kills', String(ps.kills)),
          stat('Next rank', nextRank ? `${nextRank[1]} (${nextRank[0] - ps.combat} pts)` : 'Max'),
          stat('Credits', `${fmt(ps.credits)} cr`, 'gold'),
          stat('Date', fmtDate(ps.day)),
          stat('Jumps', String(ps.stats.jumps)),
          stat('Missions done', String(ps.stats.missionsDone)),
          stat('Bounties', String(ps.stats.bounties)),
          stat('Trade profit', `${fmt(ps.stats.profit)} cr`),
          stat('Systems explored', `${ps.explored.length} / ${Object.keys(SYSTEMS).length}`),
        ),
        h('div', { class: 'kicker mt' }, 'Standing'),
        h(
          'div',
          { class: 'standing' },
          ...GOV_IDS.map((g) =>
            h(
              'div',
              { class: 'standing-row' },
              h('span', { class: 'gov', style: { color: GOVS[g].color } }, GOVS[g].short),
              repBar(ps.rep[g] ?? 0),
              h('span', { class: 'title' }, repTitle(g, ps.rep[g] ?? 0)),
            ),
          ),
        ),
      ),
      h(
        'section',
        {},
        h('div', { class: 'kicker' }, 'Ship'),
        h('h3', {}, `${ps.shipName}`),
        h('div', { class: 'muted small' }, `${def.name} · ${def.cls}`),
        h('div', { class: 'stat-grid' },
          stat('Shield', fmt(st.maxShield)),
          stat('Armor', fmt(st.maxArmor)),
          stat('Speed', fmt(st.maxSpeed)),
          stat('Cargo', `${st.cargo} t (${freeCargo(ps)} free)`),
          stat('Fuel', `${Math.floor(ps.fuel)} / ${st.maxFuel}`),
        ),
        ps.escorts.length ? h('div', { class: 'kicker mt' }, `Fleet (${fleetCount(ps)}/${MAX_ESCORTS})`) : null,
        ps.escorts.length
          ? h('ul', { class: 'plain' }, ...ps.escorts.map((e) => h('li', {}, `${escortDisplayName(e)}${e.client ? ' · mission client' : e.hired ? ` · ${fmt(e.wage)} cr/day` : ''}`)))
          : null,
        h('div', { class: 'kicker mt' }, 'Outfits'),
        h('ul', { class: 'plain' }, ...outfits),
        ammo.length ? h('div', { class: 'kicker mt' }, 'Ammunition') : null,
        ammo.length ? h('ul', { class: 'plain' }, ...ammo) : null,
        cargo.length ? h('div', { class: 'kicker mt' }, 'Cargo') : null,
        cargo.length ? h('ul', { class: 'plain' }, ...cargo) : null,
      ),
      h(
        'section',
        {},
        h('div', { class: 'kicker' }, 'Active missions'),
        ps.missions.length
          ? h(
              'div',
              { class: 'mission-cards' },
              ...ps.missions.map((m) =>
                h(
                  'div',
                  { class: 'mission-card' },
                  h('div', { class: 'mc-title' }, m.title),
                  h('div', { class: 'muted small' }, `${SYSTEMS[m.destSystem]!.name}${m.deadline !== undefined ? ` · by ${fmtDate(m.deadline)}` : ''} · ${fmt(m.pay)} cr`),
                  m.destSystem !== ps.system
                    ? button('Plot route', () => {
                        const n = game.plotRouteTo(m.destSystem);
                        ui.toast(n ? `Route plotted to ${SYSTEMS[m.destSystem]!.name} (${n} jump${n === 1 ? '' : 's'}).` : 'No known route there yet.', n ? 'good' : 'bad');
                      }, { small: true })
                    : null,
                ),
              ),
            )
          : h('p', { class: 'muted small' }, 'None. Visit a Mission Board to find work.'),
      ),
    ),
  );
  el.classList.add('wide');
  close = ui.pushModal(el, () => close(), (e) => {
    if (e.code === 'KeyI') {
      close();
      return true;
    }
    return false;
  });
}

const TRADER_LINES = [
  'Just hauling freight, friend. Nothing worth your trouble.',
  'Clear skies to you. Mind the corsairs past the core.',
  'We are on a tight schedule. Please keep your distance.',
  'Prices on Mira are a crime this week. Don\'t say I didn\'t warn you.',
  'Nice ship. Well, it flies, anyway.',
  'If you see a patrol, tell them our papers are in order.',
];
const PATROL_LINES = [
  'Keep your nose clean, pilot, and we won\'t have a problem.',
  'Patrol command here. Report any corsair activity on this channel.',
  'Move along. Nothing to see here.',
  'Your transponder checks out. Fly safe.',
];
const VAEL_LINES = [
  'We hear your engines singing, small one. The song is loud.',
  'Harmony to you, traveler. Pass in peace.',
  'Your kind burns so brightly, and so briefly.',
  'The stars remember your passage. As do we.',
];
const CORSAIR_THREATS = [
  'Your cargo or your life, spacer. Choose quickly.',
  'Nice ship. It\'ll be ours soon enough.',
  'Power down your weapons and nobody has to die. Probably.',
  'This is Clan space. You pay to pass, or you don\'t pass.',
];

export function showHail(ui: UI, t: Ship) {
  const game = ui.game;
  const w = game.world!;
  const ps = game.ps!;
  const s = game.ship!;
  const hostile = w.hostileToPlayer(t);
  const buttons: DialogButton[] = [];
  let line: string;
  const role = t.ai?.role ?? 'trader';
  if (t.dead) line = '…static…';
  else if (t.disabled) line = 'Mayday, mayday! We\'ve lost main power. Please, hold your fire!';
  else if (t.missionId) line = 'So you\'re the one they sent? I\'ll mount your hull plates on my wall.';
  else if (t.gov === 'corsair') {
    if (hostile) {
      line = pick(CORSAIR_THREATS);
      const cost = Math.round(1500 + ps.credits * 0.08);
      if (!w.angered.has('corsair') && !t.provokedByPlayer) {
        buttons.push({
          label: `Pay tribute · ${fmt(cost)} cr`,
          disabled: ps.credits < cost,
          onClick: () => {
            ps.credits -= cost;
            w.bribed.add('corsair');
            for (const o of w.ships) if (o.gov === 'corsair' && o.target === s) o.target = null;
            game.msg('Tribute paid. The Corsairs in this system will leave you be.', '#ffd27a');
            audio.play('sell');
          },
        });
      }
    } else line = 'Clan business is none of yours. Move along.';
  } else if (t.gov === 'vael') {
    line = hostile ? 'You have broken the harmony. Withdraw, or be silenced.' : pick(VAEL_LINES);
  } else if (role === 'patrol' || role === 'hunter' || (role === 'escort' && t.leader?.ai?.role === 'patrol')) {
    if (hostile) {
      const g = t.gov;
      line = `This is ${GOVS[g].short} security. You are wanted for crimes against the ${GOVS[g].name}. Stand down and prepare to be boarded!`;
      const cost = Math.round(2000 + Math.max(0, -(ps.rep[g] ?? 0)) * 35);
      buttons.push({
        label: `Pay fine · ${fmt(cost)} cr`,
        disabled: ps.credits < cost,
        onClick: () => {
          ps.credits -= cost;
          ps.rep[g] = Math.max(ps.rep[g] ?? 0, GOVS[g].hostileBelow + 25);
          w.angered.delete(g);
          for (const o of w.ships) {
            if (o.gov !== g) continue;
            o.provokedByPlayer = false;
            if (o.target === s) o.target = null;
          }
          game.msg(`Fine paid. Your record with the ${GOVS[g].name} is cleared, for now.`, '#7fdc8f');
          audio.play('sell');
        },
      });
    } else line = pick(PATROL_LINES);
  } else {
    line = hostile ? 'Stay away from us! We\'re armed!' : pick(TRADER_LINES);
    if (!hostile && s.fuel < 100) {
      const cost = Math.min(ps.credits, 300);
      buttons.push({
        label: `Request fuel · ${fmt(cost)} cr`,
        onClick: () => {
          if (t.fuel < 150) {
            game.msg('"Sorry, we can barely make our own jump."', '#9fb4cc');
            return;
          }
          t.fuel -= 100;
          s.fuel = Math.min(s.stats.maxFuel, s.fuel + 100);
          ps.credits -= cost;
          game.msg('Fuel transferred. "Safe travels."', '#7fdc8f');
          audio.play('buy');
        },
      });
    }
  }
  buttons.push({ label: 'Close', primary: true, onClick: () => {} });
  const thumb = game.renderer.thumbnail(t.def, 96);
  thumb.style.width = '96px';
  thumb.style.height = '96px';
  ui.dialog({
    title: `${t.title ?? t.def.name}`,
    body: h('div', {}, h('div', { class: 'kicker', style: { color: GOVS[t.gov].color } }, `${GOVS[t.gov].name}${hostile ? ' · hostile' : ''}`), h('p', { class: 'hail-line' }, `“${line}”`)),
    portrait: thumb,
    cancelable: true,
    buttons,
  });
}

export function showPlanetHail(ui: UI, p: PlanetDef) {
  const game = ui.game;
  const ps = game.ps!;
  const buttons: DialogButton[] = [];
  let line: string;
  const deny = game.landingDenied(p);
  if (!p.landable) line = 'There is no response. The world below is silent.';
  else if (deny) {
    line = `This is ${p.name} traffic control. You are not cleared to land. Leave the system.`;
    const cost = Math.round(1000 + ps.credits * 0.05);
    buttons.push({
      label: `Offer a "docking fee" · ${fmt(cost)} cr`,
      disabled: ps.credits < cost,
      onClick: () => {
        ps.credits -= cost;
        const lax = p.gov === 'corsair' || p.gov === 'independent';
        if (lax || Math.random() < 0.65) {
          game.landClearance.add(p.id);
          game.msg(`"...Clearance granted, ${ps.shipName}. Use pad nine."`, '#7fdc8f');
          audio.play('sell');
        } else {
          adjustRep(ps, p.gov, -10);
          game.msg('"Attempted bribery of a port official has been noted." Your credits are gone.', '#ff8a6a');
          audio.play('error');
        }
      },
    });
  } else {
    line = `${p.name} traffic control. You're cleared to land, ${ps.shipName}. Welcome.`;
  }
  buttons.push({ label: 'Close', primary: true, onClick: () => {} });
  ui.dialog({
    title: p.name,
    body: h('div', {}, h('div', { class: 'kicker', style: { color: GOVS[p.gov].color } }, GOVS[p.gov].name), h('p', { class: 'hail-line' }, `“${line}”`)),
    cancelable: true,
    buttons,
  });
}

export function showBoarding(ui: UI, t: Ship) {
  const game = ui.game;
  const ps = game.ps!;
  const s = game.ship!;
  let close = () => {};
  const body = h('div', { class: 'boarding' });
  const render = () => {
    const rows: Node[] = [];
    rows.push(
      h(
        'div',
        { class: 'loot-row' },
        h('span', {}, 'Credits'),
        h('span', { class: 'gold' }, `${fmt(t.credits)} cr`),
        button('Take', () => {
          ps.credits += t.credits;
          t.credits = 0;
          audio.play('buy');
          render();
        }, { small: true, disabled: t.credits <= 0, sound: false }),
      ),
    );
    for (const c of COMMODITIES) {
      const n = t.cargo[c.id] ?? 0;
      if (!n) continue;
      rows.push(
        h(
          'div',
          { class: 'loot-row' },
          h('span', {}, COMMODITY_BY_ID[c.id].name),
          h('span', {}, `${n} t`),
          button('Take', () => {
            const take = Math.min(n, freeCargo(ps));
            if (take <= 0) {
              ui.toast('Your hold is full.', 'bad');
              return;
            }
            t.cargo[c.id] = n - take;
            ps.cargo[c.id] = (ps.cargo[c.id] ?? 0) + take;
            ps.cargoCost[c.id] = ps.cargoCost[c.id] ?? 0;
            audio.play('buy');
            render();
          }, { small: true, sound: false }),
        ),
      );
    }
    const fuelSpace = Math.floor(s.stats.maxFuel - s.fuel);
    const fuel = Math.floor(Math.min(t.fuel, fuelSpace));
    rows.push(
      h(
        'div',
        { class: 'loot-row' },
        h('span', {}, 'Fuel'),
        h('span', {}, `${Math.floor(t.fuel)} units`),
        button('Siphon', () => {
          s.fuel += fuel;
          t.fuel -= fuel;
          audio.play('buy');
          render();
        }, { small: true, disabled: fuel <= 0, sound: false }),
      ),
    );
    for (const [id, n] of Object.entries(t.ammo)) {
      const room = ammoCapacity(ps.outfits, id) - (ps.ammo[id] ?? 0);
      if (n <= 0 || room <= 0) continue;
      rows.push(
        h(
          'div',
          { class: 'loot-row' },
          h('span', {}, OUTFITS[id]?.name ?? id),
          h('span', {}, `${n}`),
          button('Take', () => {
            const take = Math.min(n, room);
            t.ammo[id] = n - take;
            ps.ammo[id] = (ps.ammo[id] ?? 0) + take;
            audio.play('buy');
            render();
          }, { small: true, sound: false }),
        ),
      );
    }
    const chance = Math.round(captureChance(s, t) * 100);
    const full = fleetCount(ps) >= MAX_ESCORTS;
    rows.push(
      h(
        'div',
        { class: 'loot-row capture' },
        h('span', {}, 'Capture the ship'),
        h('span', { class: full ? 'muted' : chance >= 50 ? 'good' : 'bad' }, full ? 'Fleet full' : `${chance}% odds`),
        button('Attempt', () => {
          game.captureShip(t);
          close();
          game.finishBoarding(t);
        }, { small: true, danger: true, disabled: full, sound: false }),
      ),
    );
    body.replaceChildren(
      h('p', { class: 'muted' }, `Your boarding party forces the airlock of the ${t.title ?? t.def.name}. The crew offers no resistance, for now.`),
      ...rows,
      h('p', { class: 'muted small' }, `Free cargo: ${freeCargo(ps)} t${t.gov !== 'corsair' ? ' · Boarding a lawful ship is piracy.' : ''}`),
    );
  };
  render();
  const finish = () => {
    game.finishBoarding(t);
    close();
  };
  const el = h(
    'div',
    { class: 'dialog' },
    h('h2', {}, 'Boarding'),
    body,
    h('div', { class: 'dialog-buttons' }, button('Leave ship', finish, { primary: true })),
  );
  close = ui.pushModal(el, finish);
}
