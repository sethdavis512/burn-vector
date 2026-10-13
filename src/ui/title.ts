import { audio } from '../core/audio';
import { fmt } from '../core/math';
import { PLANETS, SYSTEMS } from '../data/galaxy';
import { SHIPS } from '../data/ships';
import { STARTS, fmtDate, type StartOption } from '../game/player';
import { deletePilot, lastPilotId, listPilots } from '../game/save';
import { button, h, panel } from './dom';
import type { UI } from './ui';

export const CONTROLS: [string, string][] = [
  ['← →', 'Turn'],
  ['↑', 'Thrust'],
  ['↓', 'Turn to reverse heading'],
  ['Z', 'Afterburner (if installed)'],
  ['Space', 'Fire primary weapons'],
  ['Shift', 'Fire secondary weapon'],
  ['W / Q', 'Cycle secondary weapon'],
  ['Tab', 'Cycle targets (Shift+Tab: back)'],
  ['R', 'Target nearest hostile'],
  ['A', 'Aim at target'],
  ['C', 'Clear target'],
  ['L', 'Land (press again to pick the next planet)'],
  ['M', 'Galaxy map / plot a route'],
  ['J', 'Hyperspace jump along your route'],
  ['H', 'Hail target ship or planet'],
  ['B', 'Board a disabled ship'],
  ['I', 'Pilot dossier'],
  ['- / =', 'Zoom out / in'],
  ['Esc / P', 'Pause'],
  ['V', 'Sound on / off (works anywhere)'],
  ['? or F1', "Pilot's handbook (works anywhere)"],
  ['Click', 'Select a ship or planet'],
];

export function renderTitle(ui: UI) {
  const game = ui.game;
  const lastId = lastPilotId();
  const last = lastId ? listPilots().find((p) => p.id === lastId) : null;

  const menu = h(
    'div',
    { class: 'title-menu' },
    last
      ? button(`Continue · ${last.name}`, () => game.loadGame(last.id), { primary: true, key: 'Enter' })
      : null,
    button('New Pilot', () => openNewPilot(ui), { primary: !last, key: last ? 'N' : 'Enter' }),
    listPilots().length ? button('Load Pilot', () => openLoad(ui), { key: 'O' }) : null,
    button('How to Play', () => ui.showHelp('start'), { key: 'H' }),
  );

  const el = h(
    'div',
    { class: 'screen title-screen' },
    h(
      'div',
      { class: 'title-wrap' },
      h(
        'div',
        { class: 'logo' },
        h('div', { class: 'logo-a' }, 'BURN'),
        h('div', { class: 'logo-b' }, 'VECTOR'),
        h('div', { class: 'logo-sub' }, 'A space trading and combat game'),
      ),
      last
        ? h(
            'div',
            { class: 'title-last' },
            `${last.shipName} · ${SHIPS[last.shipId]?.name ?? ''} · docked at ${PLANETS[last.planet]?.name ?? '?'} · ${fmtDate(last.day)} · ${fmt(last.credits)} cr`,
          )
        : null,
      menu,
      h('div', { class: 'title-foot' }, 'Trade · Fight · Explore · Build a legend among the stars'),
      h(
        'div',
        { class: 'title-credit' },
        'Inspired by Escape Velocity (Ambrosia Software, 1996). An independent tribute, not affiliated with or endorsed by its creators.',
      ),
      h('div', { class: 'title-sound', hidden: !audio.muted }, 'Sound is off · press V or click the speaker (top left) to turn it on'),
    ),
  );

  ui.setScreen(el, (e) => {
    if (e.code === 'Enter') {
      if (last) game.loadGame(last.id);
      else openNewPilot(ui);
      return true;
    }
    if (e.code === 'KeyN') {
      openNewPilot(ui);
      return true;
    }
    if (e.code === 'KeyO' && listPilots().length) {
      openLoad(ui);
      return true;
    }
    if (e.code === 'KeyH') {
      ui.showHelp('start');
      return true;
    }
    return true;
  });
}

function openNewPilot(ui: UI) {
  let close = () => {};
  let start: StartOption = STARTS[0]!;
  const nameInput = h('input', { class: 'field', maxlength: 24, placeholder: 'Pilot name', value: '' }) as HTMLInputElement;
  const shipInput = h('input', { class: 'field', maxlength: 24, placeholder: 'Ship name', value: 'Wayfarer' }) as HTMLInputElement;
  const cards = STARTS.map((s) => {
    const card = h(
      'button',
      {
        class: `start-card${s === start ? ' on' : ''}`,
        onclick: () => {
          start = s;
          audio.play('select');
          for (const c of cards) c.classList.toggle('on', c === card);
        },
      },
      h('div', { class: 'start-title' }, s.title),
      h('div', { class: 'start-loc' }, `${PLANETS[s.planet]!.name} · ${SYSTEMS[s.system]!.name}`),
      h('div', { class: 'start-blurb' }, s.blurb),
    );
    return card;
  });
  const begin = () => {
    const name = nameInput.value.trim() || 'Nameless Pilot';
    const shipName = shipInput.value.trim() || 'Wayfarer';
    close();
    audio.play('takeoff');
    ui.game.newGame(name, shipName, start);
  };
  // The flight-key handler ignores text fields, so Enter needs its own listener here.
  for (const input of [nameInput, shipInput]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        begin();
      }
    });
  }
  const el = panel(
    'New Pilot',
    () => close(),
    h(
      'div',
      { class: 'form-grid' },
      h('label', {}, h('span', {}, 'Pilot name'), nameInput),
      h('label', {}, h('span', {}, 'Ship name'), shipInput),
    ),
    h('h3', { class: 'section-title' }, 'Choose your beginning'),
    h('div', { class: 'start-cards' }, ...cards),
    h(
      'p',
      { class: 'muted small' },
      'Every pilot begins with a Kestrel Shuttle, a light blaster and 12,000 credits. Where you go from there is up to you.',
    ),
    h('div', { class: 'panel-actions' }, button('Launch Career', begin, { primary: true, key: 'Enter' })),
  );
  el.classList.add('narrow');
  close = ui.pushModal(el, () => close(), (e) => {
    if (e.code === 'Enter') {
      begin();
      return true;
    }
    return false;
  });
  setTimeout(() => nameInput.focus(), 40);
}

function openLoad(ui: UI) {
  let close = () => {};
  const list = h('div', { class: 'pilot-list' });
  const render = () => {
    list.replaceChildren(
      ...listPilots().map((p) =>
        h(
          'div',
          { class: 'pilot-row' },
          h(
            'div',
            { class: 'pilot-meta' },
            h('div', { class: 'pilot-name' }, p.name),
            h(
              'div',
              { class: 'pilot-sub' },
              `${p.shipName} (${SHIPS[p.shipId]?.name ?? '?'}) · ${PLANETS[p.planet]?.name ?? '?'} · ${fmt(p.credits)} cr · ${fmtDate(p.day)}`,
            ),
          ),
          button('Load', () => {
            close();
            ui.game.loadGame(p.id);
          }, { primary: true, small: true }),
          button('Delete', () => {
            ui.dialog({
              title: 'Delete pilot?',
              body: `${p.name} and the ${p.shipName} will be gone forever.`,
              cancelable: true,
              buttons: [
                { label: 'Delete', danger: true, onClick: () => { deletePilot(p.id); render(); } },
                { label: 'Cancel', onClick: () => {} },
              ],
            });
          }, { danger: true, small: true }),
        ),
      ),
    );
    if (!listPilots().length) list.append(h('p', { class: 'muted' }, 'No saved pilots.'));
  };
  render();
  const el = panel('Load Pilot', () => {
    close();
    renderTitle(ui);
  }, list);
  el.classList.add('narrow');
  close = ui.pushModal(el, () => {
    close();
    renderTitle(ui);
  });
}
