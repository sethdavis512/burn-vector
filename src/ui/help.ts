import { audio } from '../core/audio';
import { GOALS, TUTORIAL, tutorialProgress } from '../game/guide';
import { ICONS, h } from './dom';
import { CONTROLS } from './title';
import type { UI } from './ui';

export type HelpTab = 'start' | 'flight' | 'travel' | 'port' | 'combat' | 'fleet';

const TABS: { id: HelpTab; label: string }[] = [
  { id: 'start', label: 'Start Here' },
  { id: 'flight', label: 'Flying' },
  { id: 'travel', label: 'Navigation' },
  { id: 'port', label: 'Spaceport' },
  { id: 'combat', label: 'Combat & Law' },
  { id: 'fleet', label: 'Fleet & Story' },
];

const k = (key: string) => h('kbd', {}, key);

/** A paragraph with inline <kbd> chips: write keys as [Key] in the text. */
function para(text: string, cls = '') {
  const parts = text.split(/(\[[^\]]+\])/g).filter(Boolean);
  return h('p', { class: cls }, ...parts.map((p) => (p.startsWith('[') ? k(p.slice(1, -1)) : p)));
}

function section(title: string, ...body: (Node | null)[]) {
  return h('section', { class: 'help-section' }, h('h3', {}, title), ...body);
}

function list(items: string[]) {
  return h('ul', { class: 'help-list' }, ...items.map((t) => h('li', {}, ...para(t).childNodes)));
}

function startTab(ui: UI) {
  const game = ui.game;
  const ps = game.ps;
  const nodes: Node[] = [];
  nodes.push(
    section(
      'Your career',
      para(
        'You are an independent pilot with a small ship and a little money. Earn credits by trading and taking missions, spend them on better weapons and bigger ships, and choose your own path: honest trader, bounty hunter, mercenary commander or pirate.',
      ),
      para(
        'Burn Vector is a tribute to Escape Velocity (Ambrosia Software, 1996), the game that defined this genre. Its ships, worlds, story, art and sound are all original.',
        'muted',
      ),
    ),
  );
  if (!ps) {
    nodes.push(
      section(
        'First flight',
        list([
          'Choose New Pilot, name yourself and pick a starting world.',
          'You land in a spaceport. Every service there has a one-key shortcut.',
          'Follow the objective in the top-left corner of the screen: it always says what to do next and which keys to press.',
          'Press [?] or click the [?] button (top left) any time to open this handbook.',
        ]),
      ),
    );
    return nodes;
  }
  const obj = game.currentObjective();
  if (obj) {
    nodes.push(
      h(
        'div',
        { class: 'help-objective' },
        h('div', { class: 'kicker' }, obj.kicker),
        h('div', { class: 'help-objective-title' }, obj.title),
        h('p', {}, obj.detail),
      ),
    );
  }
  const prog = tutorialProgress(ps);
  const firstOpen = TUTORIAL.findIndex((s) => !s.done(ps));
  nodes.push(
    section(
      `Getting started · ${prog.done}/${prog.total} done`,
      h(
        'ol',
        { class: 'checklist' },
        ...TUTORIAL.map((s, i) =>
          h(
            'li',
            { class: s.done(ps) ? 'done' : i === firstOpen ? 'current' : '' },
            h('span', { class: 'check', 'aria-hidden': 'true' }, s.done(ps) ? '✓' : String(i + 1)),
            h(
              'div',
              {},
              h('div', { class: 'check-title' }, s.title),
              // The objective box above already explains the current step when it's the active objective.
              i === firstOpen && !obj?.kicker.startsWith('Getting started') ? h('div', { class: 'check-how' }, s.how(game.guideContext())) : null,
            ),
          ),
        ),
      ),
    ),
  );
  nodes.push(
    section(
      'Goals',
      h(
        'ul',
        { class: 'checklist goals' },
        ...GOALS.map((g) =>
          h(
            'li',
            { class: g.done(ps) ? 'done' : '' },
            h('span', { class: 'check', 'aria-hidden': 'true' }, g.done(ps) ? '✓' : '·'),
            h('div', {}, h('div', { class: 'check-title' }, g.title), h('div', { class: 'check-how' }, g.how)),
          ),
        ),
      ),
    ),
  );
  return nodes;
}

function flightTab() {
  return [
    section(
      'Controls',
      h('div', { class: 'controls' }, ...CONTROLS.map(([key, d]) => h('div', { class: 'ctl' }, k(key), h('span', {}, d)))),
      para('Your ship keeps drifting when you stop thrusting. To slow down, press [↓] to turn around and thrust against your motion.', 'muted'),
    ),
    section(
      'Reading the display',
      list([
        'The radar (top right) shows the whole neighborhood: you are white, escorts green, neutral ships yellow, hostile ships red, disabled ships gray. Planets are blue circles; the dashed ring marks the minimum distance for a hyperspace jump.',
        'Shield recharges on its own. Armor does not; it is repaired when you land. Fuel is shown as the number of jumps you can make.',
        'The target panel shows your selected ship, its government, attitude toward you, distance and condition.',
        'Messages appear at the bottom left. The objective panel at the top left always says what to do next.',
      ]),
    ),
  ];
}

function travelTab() {
  return [
    section(
      'Plotting a route',
      list([
        'Open the Galaxy Map with [M] in flight or [G] in a spaceport, then click a system. A route through charted systems is plotted automatically.',
        'Filled circles are charted systems, colored by government. Hollow circles are unexplored: you can jump to them if they connect to charted space.',
        'Accepting a mission plots its route for you. The map marks mission destinations with an orange diamond.',
        'Outfitters sell maps that chart whole regions, so you can plan longer trips.',
      ]),
    ),
    section(
      'Jumping',
      list([
        'Press [J] to jump to the next system on your route. The autopilot turns, flies clear of the star (outside the dashed ring) and enters hyperspace.',
        'Each jump burns 100 fuel and takes one day. Refuel in any spaceport with [F]. A Ramscoop slowly refills fuel in flight.',
        'Stranded without fuel? Hail a friendly trader with [H] and ask to buy some.',
      ]),
    ),
    section(
      'Landing',
      list([
        'Press [L] to land on the nearest planet or station; the autopilot flies you in. Press [L] again to switch to the next planet. You can also click a planet to select it first.',
        'Worlds may refuse you if your reputation is bad or you attacked their ships. Hail the planet ([H] with no ship targeted) to negotiate a "docking fee".',
        'Landing repairs your ship and saves your game.',
      ]),
    ),
  ];
}

function portTab() {
  return [
    section(
      'Services',
      list([
        '[T] Commodity Exchange: prices are Low, Med or High compared to the galaxy. Buy Low, sell High. The amount you paid is shown next to your cargo.',
        '[O] Outfitter: weapons need a free gun mount (forward guns and launchers) or turret mount; everything uses outfit space. Buy ammunition for launchers here too.',
        '[S] Shipyard: your current ship and its outfits are traded in toward the new one. Captured ships can be sold here.',
        '[M] Mission Board: cargo runs, rush deliveries, passengers, courier packets, bounties and smuggling. Story chapters are marked STORY.',
        '[B] Spaceport Bar: overhear trade tips and rumors, buy a round for more, hire mercenary escorts and manage your fleet.',
        '[F] Refuel, [G] Galaxy Map, [I] Pilot Dossier, and [L] or [Enter] to take off.',
      ]),
    ),
    section(
      'Making money',
      list([
        'Early on, combine trading with deliveries heading the same way: a full hold and a paid contract on every trip.',
        'Bigger hulls carry more cargo, but hire escorts or buy guns before you haul expensive goods through the Shoal.',
        'Bounties pay best once you can fight. The Mission Board offers harder targets as your combat rating grows.',
      ]),
    ),
  ];
}

function combatTab() {
  return [
    section(
      'Fighting',
      list([
        '[R] targets the nearest hostile ship, [Tab] cycles through ships, [A] turns you to aim at your target with lead.',
        '[Space] fires your guns and turrets. [Shift] fires the selected secondary weapon (missiles, rockets, torpedoes); [W] switches between them.',
        'Ions strip shields, mass drivers punch through armor, missiles track their target. Turrets aim by themselves.',
        'A ship below a quarter of its armor is disabled. Fly alongside, match speed and press [B] to board: take credits, cargo, fuel and ammo, or try to capture the ship.',
      ]),
    ),
    section(
      'Reputation and the law',
      list([
        'Every government remembers you. Firing on lawful ships makes them, and the local police, hostile; killing corsairs earns gratitude everywhere.',
        'Hail ([H]) a patrol to pay a fine and clear your record, hail corsairs to pay tribute, and hail a planet to bribe your way in.',
        'Boarding or capturing lawful ships is piracy. The Corsair Clans will like you more; nobody else will.',
      ]),
    ),
    section(
      'When things go wrong',
      list([
        'If your ship is disabled and no one hostile is near, a salvage tug answers your beacon and tows you to safety for a fee.',
        'If your ship is destroyed, an Escape Pod saves you (and your credits). Without one, you restart from your last landing.',
      ]),
    ),
  ];
}

function fleetTab() {
  return [
    section(
      'Escorts',
      list([
        'Hire mercenaries in spaceport bars: a signing fee, then a daily wage taken each time you jump. If you can\'t pay, they leave.',
        'Capture disabled ships by boarding them. Prizes cost nothing to keep and can be sold at shipyards.',
        'Up to four escorts fly with you. They guard you, attack what you target and land and jump when you do.',
      ]),
    ),
    section(
      'The story',
      list([
        "Once you have some experience, a gray-haired man starts asking for pilots at the Mission Boards of Mira Crossroads, Antares Waystation, Hyades Market, Kapteyn's Reach, Canopus Landing and Pollux Freeport.",
        'Each chapter tells you where to go next. If you fail one, it is offered again.',
        'The tale ends beyond the Shroud, with the Vael, whose technology is the best in the galaxy.',
      ]),
    ),
  ];
}

function defaultTab(ui: UI): HelpTab {
  const ps = ui.game.ps;
  if (!ps || tutorialProgress(ps).done < TUTORIAL.length) return 'start';
  if (document.querySelector('.map-overlay')) return 'travel';
  return ui.game.mode === 'landed' ? 'port' : ui.game.mode === 'space' ? 'flight' : 'start';
}

export function openHelp(ui: UI, initial?: HelpTab): () => void {
  let tab = initial ?? defaultTab(ui);
  const body = h('div', { class: 'help-body', role: 'tabpanel', tabindex: '-1' });
  const tabBar = h('div', { class: 'help-tabs', role: 'tablist', 'aria-label': 'Handbook sections' });
  const guideToggle = h('input', { type: 'checkbox', id: 'help-guide-toggle' }) as HTMLInputElement;
  guideToggle.checked = ui.game.showGuide;
  guideToggle.addEventListener('change', () => ui.game.setShowGuide(guideToggle.checked));

  const render = () => {
    tabBar.replaceChildren(
      ...TABS.map((t) =>
        h(
          'button',
          {
            class: `help-tab${t.id === tab ? ' on' : ''}`,
            role: 'tab',
            'aria-selected': t.id === tab ? 'true' : 'false',
            onclick: () => {
              tab = t.id;
              audio.play('click');
              render();
              body.scrollTop = 0;
            },
          },
          t.label,
        ),
      ),
    );
    const content =
      tab === 'start'
        ? startTab(ui)
        : tab === 'flight'
          ? flightTab()
          : tab === 'travel'
            ? travelTab()
            : tab === 'port'
              ? portTab()
              : tab === 'combat'
                ? combatTab()
                : fleetTab();
    body.replaceChildren(...content);
  };
  render();

  let close = () => {};
  const dlg = h(
    'dialog',
    { class: 'help-dialog', 'aria-labelledby': 'help-title' },
    h(
      'div',
      { class: 'help-inner' },
      h(
        'header',
        { class: 'panel-head' },
        h('h2', { id: 'help-title' }, "Pilot's Handbook"),
        h('button', { class: 'icon-btn', title: 'Close (Esc)', 'aria-label': 'Close', html: ICONS.close, onclick: () => close() }),
      ),
      tabBar,
      body,
      h(
        'footer',
        { class: 'help-foot' },
        h('label', { class: 'help-check', for: 'help-guide-toggle' }, guideToggle, ' Show the objective panel in flight'),
        h('span', { class: 'muted small' }, 'Open this handbook any time with ', k('?'), ' · sound on/off with ', k('V')),
      ),
    ),
  );
  close = ui.openNativeDialog(dlg, (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      tab = TABS[(i + (e.code === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id;
      render();
      return true;
    }
    return false;
  });
  return close;
}
