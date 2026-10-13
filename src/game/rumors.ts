import { RNG, hashStr } from '../core/math';
import { COMMODITIES } from '../data/commodities';
import { PLANETS, SYSTEMS, jumpDistances } from '../data/galaxy';
import type { GovId, PlanetDef } from '../data/types';
import type { PlayerState } from './player';
import { storyOffer, storyStep } from './story';

export const BAR_SCENES: Record<GovId, string> = {
  concord:
    'A spotless lounge with polished brass rails and a holo-screen running Concord news on a loop. Uniformed officers talk shop at the corner tables, and nobody raises their voice.',
  league:
    'A loud, crowded taproom hung with League banners and old mining gear. Somebody is always singing, and somebody else is always telling them to stop.',
  independent:
    'A smoky dockside bar where freighter crews swap stories, contracts and cheap synth-whiskey. The bartender knows everyone and trusts no one.',
  corsair:
    'A dim, dangerous den where every patron sits with their back to the wall. The bartender keeps a blaster under the counter and makes no secret of it.',
  vael:
    'There is no bar, exactly: a resonant chamber where the Vael drift and hum in slow chords. A small alcove has been set aside for human visitors, with a dispenser of something that tastes faintly of copper.',
};

const LORE: Record<GovId, string[]> = {
  concord: [
    'An officer complains that the Navy has three dreadnoughts tied up guarding Sol while the southern patrols go begging for frigates.',
    'Two clerks argue about the new tariff schedule. Apparently the free worlds are "taking advantage" again.',
    'A veteran says the Concord would never admit it, but the League Raptor out-turns anything in their inventory.',
    'Word is that Fomalhaut Bastion is paying good money to anyone who thins out the corsairs in the Shoal.',
  ],
  league: [
    'A colonist toasts "the Frontier, free and forever!" and half the room joins in.',
    'Someone grumbles that the Concord keeps "inspecting" League freighters at Mira Crossroads.',
    'A Raptor pilot claims the Vael escorted her convoy through the Shroud once, then vanished without a word.',
    'The bartender says Fort Alnilam is recruiting. "Good pilots get good ships," he adds, nodding at the shipyard.',
  ],
  independent: [
    'A trader swears the best money in the galaxy is hauling medical supplies out of Procyon.',
    'An old spacer insists the Capella Exchange sets every price in the north, whatever the planets think.',
    'Someone says a Corsair warlord has been seen as far north as Mira. Nobody believes it, but nobody laughs either.',
    'A mechanic says the first upgrade any shuttle pilot should buy is an escape pod. "Ships are cheap. You aren\'t."',
  ],
  corsair: [
    'A scarred woman tells you the Clans respect only two things: credits and kills.',
    'A drunk boasts that Black Harbor builds Vipers faster than the Navy can shoot them down.',
    'Someone whispers that the Gorgon\'s Den buys anything, including ships, no questions asked.',
    'A smuggler says Concord patrols are thin around Kaus. "Thin enough to slip a few tons past, anyway."',
  ],
  vael: [
    'A Vael drifts close and hums. Your translator renders it as: "Your vessel sings out of tune. Rest, small one."',
    'A human xenologist whispers that the Vael never forget a broken promise, or a kept one.',
    'A Vael regards your weapons and emits a long, falling chord. The translator offers only: "Unnecessary. For now."',
    'The xenologist claims the Vael will share their technology with humans they trust. Very few humans qualify.',
  ],
};

/** Overheard rumors: a mix of trade tips, warnings and lore. Deterministic per planet and day. */
export function barRumors(planet: PlanetDef, ps: PlayerState, count: number, salt = 0): string[] {
  const rng = new RNG(hashStr(`${planet.id}:${ps.day}:bar:${salt}`));
  const out = new Set<string>();
  const dists = jumpDistances(planet.systemId, 3);
  const nearby = Object.values(PLANETS).filter((p) => p.landable && p !== planet && dists.has(p.systemId) && p.services.includes('T'));
  const makers: (() => string | null)[] = [
    () => {
      const c = rng.pick(COMMODITIES);
      const idx = COMMODITIES.indexOf(c);
      const hi = nearby.filter((p) => p.eco[idx] === 'H');
      const here = planet.eco[idx];
      if (!hi.length || here !== 'L') return null;
      const p = rng.pick(hi);
      return `A freighter captain swears ${c.name.toLowerCase()} sells for a fortune on ${p.name}, and it's cheap right here.`;
    },
    () => {
      const c = rng.pick(COMMODITIES);
      const idx = COMMODITIES.indexOf(c);
      const lo = nearby.filter((p) => p.eco[idx] === 'L');
      if (!lo.length) return null;
      const p = rng.pick(lo);
      return `"If you want ${c.name.toLowerCase()} on the cheap," a broker mutters, "go to ${p.name}."`;
    },
    () => {
      const hot = [...dists.keys()].filter((id) => ['badlands', 'pirate'].includes(SYSTEMS[id]!.traffic));
      if (!hot.length) return null;
      return `Corsairs have been hitting convoys near ${SYSTEMS[rng.pick(hot)]!.name}. Travel armed, or travel fast.`;
    },
    () => {
      const yards = Object.values(PLANETS).filter(
        (p) => p.services.includes('O') && p.tech >= 5 && p.tech > planet.tech && p.gov !== 'vael' && dists.has(p.systemId),
      );
      if (!yards.length) return null;
      return `If you want real firepower, ${rng.pick(yards).name} stocks hardware you won't find out here.`;
    },
    () => {
      const yards = Object.values(PLANETS).filter((p) => p.services.includes('S') && dists.has(p.systemId) && p !== planet);
      if (!yards.length) return null;
      return `A pilot recommends the shipyard at ${rng.pick(yards).name}. "Fair trade-ins, and they don't scratch the paint."`;
    },
    () => rng.pick(LORE[planet.gov]),
    () => rng.pick(LORE[planet.gov]),
  ];
  if (storyStep(ps) === 0 && storyOffer(planet, ps)) {
    out.add('A gray-haired man in a worn Concord flight jacket has been asking around for a pilot with nerve. He seems to be waiting for someone.');
  }
  let guard = 0;
  while (out.size < count && guard++ < 40) {
    const r = rng.pick(makers)();
    if (r) out.add(r);
  }
  return [...out];
}
