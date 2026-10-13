import { PLANETS, SYSTEMS, findRoute } from '../data/galaxy';
import type { PlanetDef } from '../data/types';
import { commodityTons, fmtDate, isKnown, type Mission, type PlayerState } from './player';
import { CHAPTERS, storyStep } from './story';

/** The slice of game state the guide needs, so this module stays free of UI and rendering. */
export interface GuideContext {
  ps: PlayerState;
  mode: 'title' | 'space' | 'landed' | 'dead';
  systemId: string;
  landedAt: PlanetDef | null;
  route: string[];
  disabled: boolean;
  fuel: number;
}

export type GuideActionKind = 'trade' | 'outfit' | 'shipyard' | 'missions' | 'bar' | 'map' | 'takeoff' | 'refuel' | 'route';

export interface GuideAction {
  kind: GuideActionKind;
  label: string;
  system?: string;
}

export interface Objective {
  kicker: string;
  title: string;
  detail: string;
  action?: GuideAction;
}

export interface TutorialStep {
  id: string;
  title: string;
  done: (ps: PlayerState) => boolean;
  how: (c: GuideContext) => string;
  action?: (c: GuideContext) => GuideAction | undefined;
}

const landedWith = (c: GuideContext, service: string) => c.mode === 'landed' && !!c.landedAt?.services.includes(service);
const mapKey = (c: GuideContext) => (c.mode === 'landed' ? 'G' : 'M');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The core loop, taught one step at a time. */
export const TUTORIAL: TutorialStep[] = [
  {
    id: 'buy',
    title: 'Buy cargo to trade',
    done: (ps) => !!ps.flags.tutBought || commodityTons(ps) > 0 || ps.stats.profit !== 0,
    how: (c) =>
      c.mode === 'landed'
        ? 'Open the Commodity Exchange (T) and buy goods marked Low. Rumors in the bar (B) say where they sell High.'
        : 'Land on a planet (L), then buy goods marked Low at its Commodity Exchange.',
    action: (c) => (landedWith(c, 'T') ? { kind: 'trade', label: 'Commodity Exchange' } : undefined),
  },
  {
    id: 'route',
    title: 'Plot a hyperspace route',
    done: (ps) => !!ps.flags.tutRoute || ps.stats.jumps > 0,
    how: (c) => `Open the Galaxy Map (${mapKey(c)}) and click a nearby system. Systems joined by a line are one jump apart.`,
    action: () => ({ kind: 'map', label: 'Galaxy Map' }),
  },
  {
    id: 'jump',
    title: 'Jump to another system',
    done: (ps) => ps.stats.jumps > 0,
    how: (c) => {
      if (!c.route.length) return `Plot a route first: open the Galaxy Map (${mapKey(c)}) and click a nearby system.`;
      return c.mode === 'landed'
        ? 'Take off (L), then press J. Your autopilot flies clear of the star and jumps.'
        : 'Press J. Your autopilot flies clear of the star and jumps. Each jump burns 100 fuel.';
    },
    action: (c) => (c.mode === 'landed' && c.route.length ? { kind: 'takeoff', label: 'Take off' } : undefined),
  },
  {
    id: 'sell',
    title: 'Sell cargo for a profit',
    done: (ps) => ps.stats.profit > 0,
    how: (c) => {
      if (commodityTons(c.ps) === 0) return 'Buy goods where the market is Low, carry them to a world where they are High, and sell.';
      return c.mode === 'landed'
        ? 'Check the Commodity Exchange (T). Sell if your cargo is marked High here; otherwise try another world.'
        : 'Land (L) on a world where your cargo sells High, then sell it at the Commodity Exchange.';
    },
    action: (c) => (landedWith(c, 'T') && commodityTons(c.ps) > 0 ? { kind: 'trade', label: 'Commodity Exchange' } : undefined),
  },
  {
    id: 'mission',
    title: 'Take a job from a Mission Board',
    done: (ps) => !!ps.flags.tutMission || ps.stats.missionsDone > 0,
    how: (c) =>
      c.mode === 'landed'
        ? 'Open the Mission Board (M) and accept a delivery. Its route is plotted for you automatically.'
        : 'Land (L) and open the Mission Board. Deliveries pay well and take you somewhere new.',
    action: (c) => (landedWith(c, 'M') ? { kind: 'missions', label: 'Mission Board' } : undefined),
  },
  {
    id: 'outfit',
    title: 'Upgrade your ship',
    done: (ps) => !!ps.flags.tutOutfit,
    how: (c) =>
      `${c.mode === 'landed' ? 'Visit the Outfitter (O).' : 'Land and visit an Outfitter.'} An Escape Pod saves your life if your ship is destroyed; a second gun doubles your firepower.`,
    action: (c) => (landedWith(c, 'O') ? { kind: 'outfit', label: 'Outfitter' } : undefined),
  },
];

/** Longer-term goals shown in the handbook checklist. */
export const GOALS: { title: string; how: string; done: (ps: PlayerState) => boolean }[] = [
  { title: 'Win your first fight', how: 'Corsairs show red on radar. R targets, A aims, Space fires.', done: (ps) => ps.kills > 0 },
  { title: 'Buy a better ship', how: 'Shipyards take your current ship in trade.', done: (ps) => ps.shipId !== 'kestrel' },
  { title: 'Fly with an escort', how: 'Hire one in a bar, or capture a disabled ship.', done: (ps) => ps.escorts.some((e) => !e.client) },
  { title: 'Explore 15 systems', how: 'Buy maps at outfitters to plan longer trips.', done: (ps) => ps.explored.length >= 15 },
  { title: 'Finish the story', how: 'It starts with a gray-haired man at a frontier Mission Board.', done: (ps) => storyStep(ps) >= CHAPTERS.length },
  { title: 'Earn the trust of the Vael', how: 'Their space lies beyond the Shroud, east of the League.', done: (ps) => (ps.rep.vael ?? 0) >= 100 },
];

/** How to get to a system (and optionally a planet in it) from where the player is. */
export function travelHint(c: GuideContext, sysId: string, planet: PlanetDef | null, hunting: boolean): { detail: string; action?: GuideAction } {
  const ps = c.ps;
  const sys = SYSTEMS[sysId]!;
  if (c.systemId === sysId) {
    if (hunting) {
      return c.mode === 'landed'
        ? { detail: 'Your target is in this system. Take off (L) to hunt it down.', action: { kind: 'takeoff', label: 'Take off' } }
        : { detail: 'Your target is in this system. Press R or Tab to target it, A to aim, Space to fire.' };
    }
    if (planet) {
      if (c.mode === 'landed') {
        return c.landedAt?.id === planet.id
          ? { detail: `You are on ${planet.name}.` }
          : { detail: `${planet.name} is in this system. Take off (L) and land there.`, action: { kind: 'takeoff', label: 'Take off' } };
      }
      return { detail: `${planet.name} is in this system. Press L to land (press L again to pick another planet).` };
    }
    return { detail: `You are in the ${sys.name} system.` };
  }
  const where = planet ? `${planet.name} is in the ${sys.name} system` : `Head for the ${sys.name} system`;
  if (c.route.length && c.route[c.route.length - 1] === sysId) {
    const n = c.route.length;
    const fuel = n * 100 > c.fuel ? ' You need to refuel on the way.' : '';
    return c.mode === 'landed'
      ? { detail: `${where}. Route plotted (${plural(n, 'jump')}): take off (L), then press J.${fuel}`, action: { kind: 'takeoff', label: 'Take off' } }
      : { detail: `${where}. Route plotted (${plural(n, 'jump')}): press J to jump.${fuel}` };
  }
  const route = findRoute(ps.system, sysId, (id) => isKnown(ps, id));
  if (!route) {
    return { detail: `${sys.name} isn't on your charts yet. Explore toward it, or buy maps at an Outfitter.` };
  }
  return {
    detail: `${where}, ${plural(route.length, 'jump')} away. Open the map (${mapKey(c)}) and click ${sys.name}, or use Plot route.`,
    action: { kind: 'route', label: 'Plot route', system: sysId },
  };
}

function missionObjective(c: GuideContext, m: Mission): Objective {
  const planet = m.destPlanet ? PLANETS[m.destPlanet] ?? null : null;
  const hunting = !!m.target && !m.targetDead;
  let title = m.title;
  if (hunting) title = `Destroy the ${m.target!.shipName}`;
  else if (m.returnTo && planet) title = `Report back to ${planet.name}`;
  else if (m.client && planet) title = `Escort the ${m.client.name.split(' · ')[0]} to ${planet.name}`;
  const travel = travelHint(c, m.destSystem, hunting ? null : planet, hunting);
  const due = m.deadline !== undefined ? ` Due ${fmtDate(m.deadline)}.` : '';
  const risky = ['border', 'badlands', 'pirate'].includes(SYSTEMS[m.destSystem]!.traffic) && c.ps.combat < 25 && !hunting;
  const extra = (m.client ? ' Keep the client alive.' : '') + (risky ? ' Corsairs raid that system; be ready to run.' : '');
  return {
    kicker: m.story ? `Story · Chapter ${m.story}` : 'Mission',
    title,
    detail: `${travel.detail}${extra}${due}`,
    action: travel.action,
  };
}

function storyObjective(c: GuideContext): Objective | null {
  const ps = c.ps;
  const step = storyStep(ps);
  const ch = CHAPTERS[step];
  if (!ch) return null;
  if (step === 0) {
    if (!ch.available(ps)) {
      return {
        kicker: 'Story',
        title: 'Make a name for yourself',
        detail: 'Complete missions, make jumps or win a fight or two. Someone out there is looking for an experienced pilot.',
      };
    }
    return {
      kicker: 'Story',
      title: 'Find Captain Sato',
      detail:
        "A gray-haired man is asking for pilots at the Mission Boards of Mira Crossroads, Antares Waystation, Hyades Market, Kapteyn's Reach, Canopus Landing and Pollux Freeport.",
    };
  }
  const planet = PLANETS[ch.offerAt[0]!]!;
  const travel = travelHint(c, planet.systemId, planet, false);
  const here = c.mode === 'landed' && c.landedAt?.id === planet.id;
  return {
    kicker: `Story · Chapter ${ch.step}`,
    title: ch.title,
    detail: here ? 'Open the Mission Board (M) to accept the next chapter.' : `Visit the Mission Board on ${planet.name}. ${travel.detail}`,
    action: here ? { kind: 'missions', label: 'Mission Board' } : travel.action,
  };
}

export function tutorialProgress(ps: PlayerState) {
  const done = TUTORIAL.filter((s) => s.done(ps)).length;
  return { done, total: TUTORIAL.length };
}

/** What the player should do next, and how. */
export function currentObjective(c: GuideContext): Objective | null {
  const ps = c.ps;
  if (c.mode === 'title') return null;
  if (c.mode === 'space' && c.disabled) {
    return { kicker: 'Emergency', title: 'Your ship is disabled', detail: 'Wait for a salvage tug to answer your beacon, or hail a nearby ship (H).' };
  }
  if (c.mode === 'space' && c.fuel < 100) {
    return { kicker: 'Low fuel', title: 'Not enough fuel to jump', detail: 'Land (L) and refuel, or hail a passing trader (H) and ask for fuel.' };
  }
  if (c.mode === 'landed' && c.fuel < 100 && c.landedAt?.services.includes('F')) {
    return { kicker: 'Low fuel', title: 'Refuel before you leave', detail: 'You need 100 fuel for each hyperspace jump.', action: { kind: 'refuel', label: 'Refuel' } };
  }
  const missions = [...ps.missions].sort((a, b) => (a.deadline ?? 1e9) - (b.deadline ?? 1e9));
  if (missions[0]) return missionObjective(c, missions[0]);
  const index = TUTORIAL.findIndex((s) => !s.done(ps));
  if (index >= 0) {
    const step = TUTORIAL[index]!;
    return {
      kicker: `Getting started · ${index + 1} of ${TUTORIAL.length}`,
      title: step.title,
      detail: step.how(c),
      action: step.action?.(c),
    };
  }
  return (
    storyObjective(c) ?? {
      kicker: 'Free flight',
      title: 'The galaxy is yours',
      detail: 'Trade, take missions, hunt bounties, build a fleet, or earn the trust of the Vael beyond the Shroud.',
    }
  );
}
