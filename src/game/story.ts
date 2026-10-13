import { PLANETS } from '../data/galaxy';
import type { PlanetDef } from '../data/types';
import { MAX_ESCORTS, adjustRep, fleetCount, fmtDate, revealRegion, type Mission, type PlayerState } from './player';

export interface StoryChoice {
  label: string;
  apply: (ps: PlayerState) => string;
}

export interface StoryChapter {
  step: number;
  title: string;
  /** Planets whose mission board offers this chapter. */
  offerAt: string[];
  available: (ps: PlayerState) => boolean;
  make: (ps: PlayerState, issuer: PlanetDef) => Mission;
  onAccept?: (ps: PlayerState) => void;
  completeText: string;
  onComplete?: (ps: PlayerState) => void;
  choices?: StoryChoice[];
}

const deliver = (
  ps: PlayerState,
  issuer: PlanetDef,
  step: number,
  title: string,
  brief: string,
  dest: string,
  pay: number,
  days: number,
): Mission => {
  const p = PLANETS[dest]!;
  return {
    id: `story-${step}`,
    type: 'story',
    story: step,
    title,
    brief: `${brief} Deliver by ${fmtDate(ps.day + days)}.`,
    issuer: issuer.id,
    gov: issuer.gov,
    destSystem: p.systemId,
    destPlanet: dest,
    tons: 0,
    pay,
    deadline: ps.day + days,
  };
};

export const CHAPTERS: StoryChapter[] = [
  {
    step: 1,
    title: 'A Quiet Word',
    offerAt: ['miracrossroads', 'antaresway', 'hyades', 'kapteynreach', 'canopuslanding', 'polluxfreeport'],
    available: (ps) => ps.combat >= 8 || ps.stats.jumps >= 8 || ps.stats.missionsDone >= 3,
    make: (ps, issuer) =>
      deliver(
        ps,
        issuer,
        1,
        'A Quiet Word',
        'A gray-haired man in a worn Concord flight jacket catches your eye. "Captain Imre Sato, retired. I need a data core carried to Fomalhaut Bastion. Quietly. No scans, no detours, no questions. Eight thousand credits."',
        'fomalhautbastion',
        8000,
        14,
      ),
    completeText:
      'A Navy lieutenant meets you on the pad and escorts you, not entirely politely, to an office deep inside the station. Commodore Ines Halvard turns the data core over in her hands. "Sato always did have a flair for drama. Do you know what this is? Telemetry from the CNS Meridian, a frigate we lost near the Shroud four months ago. It says her guns are now flying with the Corsairs." She looks up at you. "I could use a pilot nobody is watching."',
  },
  {
    step: 2,
    title: 'Gunrunner',
    offerAt: ['fomalhautbastion'],
    available: () => true,
    make: (ps, issuer) => ({
      id: 'story-2',
      type: 'story',
      story: 2,
      title: 'Gunrunner',
      brief: `Commodore Halvard wants the Corsair gunrunner "Widow's Due", a Marauder flying with two Vipers, destroyed. It was last seen selling Navy hardware in the Sargas system. Return to Fomalhaut Bastion for payment of 25,000 credits before ${fmtDate(ps.day + 20)}.`,
      issuer: issuer.id,
      gov: 'concord',
      destSystem: 'sargas',
      returnTo: 'fomalhautbastion',
      tons: 0,
      pay: 25000,
      deadline: ps.day + 20,
      target: { name: 'the gunrunner', ship: 'marauder', shipName: "Widow's Due", escorts: ['viper', 'viper'] },
    }),
    completeText:
      'Halvard reads the logs you pulled from the wreck and goes very still. "These weapons were paid for from a League shipping account. Rigel Shipworks." She closes the file. "If the League is arming the Corsairs, this is a war. If it isn\'t, someone wants us to think it is. Either way, I can\'t send a Navy ship to ask."',
    onComplete: (ps) => adjustRep(ps, 'concord', 15),
  },
  {
    step: 3,
    title: 'The Paper Trail',
    offerAt: ['fomalhautbastion'],
    available: () => true,
    make: (ps, issuer) =>
      deliver(
        ps,
        issuer,
        3,
        'The Paper Trail',
        'Carry Commodore Halvard\'s sealed message to Minister Odo Renn on New Haven, the League capital at Rigel. A Concord warship would never be allowed to land. You might. Payment: 15,000 credits.',
        'newhaven',
        15000,
        16,
      ),
    completeText:
      'Minister Renn reads Halvard\'s message twice, then burns it in his desk lamp. "The League did not sell those guns. But someone inside the League did. A faction in our own fleet, the Ember Circle, believes only a war with the Concord can secure our independence. They have been selling hulls to the Corsairs to pay for it." He leans forward. "My aide has the proof. She must reach Fort Alnilam alive."',
  },
  {
    step: 4,
    title: 'Lantern',
    offerAt: ['newhaven'],
    available: () => true,
    make: (ps, issuer) => ({
      id: 'story-4',
      type: 'story',
      story: 4,
      title: 'Lantern',
      brief: `Escort Minister Renn's aide, Petra Okoro, aboard the courier "Lantern" to Fort Alnilam before ${fmtDate(ps.day + 10)}. The Ember Circle will try to stop her. If the Lantern is destroyed, the mission fails. Payment: 20,000 credits.`,
      issuer: issuer.id,
      gov: 'league',
      destSystem: 'alnilam',
      destPlanet: 'fortalnilam',
      tons: 0,
      pay: 20000,
      deadline: ps.day + 10,
      client: { shipId: 'courier', name: '"Lantern" · Petra Okoro' },
      ambush: { system: '*', leader: 'raptor', escorts: ['raptor', 'raptor'], title: 'Ember Circle Raptor' },
    }),
    completeText:
      'Petra Okoro steps off the Lantern pale but alive, and within the hour Fort Alnilam\'s commander has her evidence. "The Ember Circle\'s flagship is the Warden \'Cinder\', hiding among the Corsairs at Nunki," he says grimly. "We cannot send League ships after League traitors without starting a civil war. You, however, are not League."',
    onComplete: (ps) => adjustRep(ps, 'league', 20),
  },
  {
    step: 5,
    title: 'Cinder',
    offerAt: ['fortalnilam'],
    available: () => true,
    make: (ps, issuer) => ({
      id: 'story-5',
      type: 'story',
      story: 5,
      title: 'Cinder',
      brief: `Destroy the Ember Circle flagship, the League Warden "Cinder", and her Raptor escorts at Nunki. Return to Fort Alnilam for payment of 60,000 credits before ${fmtDate(ps.day + 20)}. She is heavily armed; bring friends.`,
      issuer: issuer.id,
      gov: 'league',
      destSystem: 'nunki',
      returnTo: 'fortalnilam',
      tons: 0,
      pay: 60000,
      deadline: ps.day + 20,
      target: { name: 'the Ember Circle', ship: 'warden', shipName: 'Cinder', escorts: ['raptor', 'raptor'] },
    }),
    completeText:
      'The commander of Fort Alnilam salutes you, which he does not have to do. "The Ember Circle is broken. Minister Renn wants to see you on New Haven. I believe he means to end this properly."',
    onComplete: (ps) => {
      adjustRep(ps, 'league', 40);
      adjustRep(ps, 'corsair', -20);
    },
  },
  {
    step: 6,
    title: 'The Rigel Accord',
    offerAt: ['newhaven'],
    available: () => true,
    make: (ps, issuer) =>
      deliver(
        ps,
        issuer,
        6,
        'The Rigel Accord',
        'Minister Renn hands you a data slate sealed with both League and Concord crests: the draft of the Rigel Accord, a non-aggression treaty. Carry it to Earth. Payment: 30,000 credits.',
        'earth',
        30000,
        16,
      ),
    completeText:
      'The Accord passes the Concord Council by a single vote. Ines Halvard, promoted to Admiral in the meantime, finds you in the spaceport. "Good work, captain." Then she frowns. "One loose end. The Meridian\'s black box. The Vael have asked for it. Specifically, they asked for you to bring it."',
    onComplete: (ps) => {
      adjustRep(ps, 'concord', 30);
      adjustRep(ps, 'league', 30);
    },
  },
  {
    step: 7,
    title: 'Beyond the Shroud',
    offerAt: ['earth'],
    available: () => true,
    make: (ps, issuer) =>
      deliver(
        ps,
        issuer,
        7,
        'Beyond the Shroud',
        'Admiral Halvard asks you to carry the CNS Meridian\'s black box to the Vael at Aelith, beyond the Shroud nebula. Nobody knows what the Vael want with it. Your charts have been updated with Vael space. Payment: 50,000 credits.',
        'aelithprime',
        50000,
        30,
      ),
    onAccept: (ps) => {
      revealRegion(ps, 'vael');
      revealRegion(ps, 'league');
    },
    completeText:
      'The Vael receive the black box in a chamber of singing crystal. A voice you feel more than hear: "The Meridian\'s crew sang to us as they died. We kept their song. Now it may rest." The chorus shifts. "You have carried peace across many borders, small one. The Collective will remember you. Choose your gift."',
    onComplete: (ps) => adjustRep(ps, 'vael', 160),
    choices: [
      {
        label: 'A Vael Dart for my fleet',
        apply: (ps) => {
          if (fleetCount(ps) >= MAX_ESCORTS) {
            ps.credits += 200000;
            return 'Your fleet has no room for another ship, so the Vael offer the equivalent in credits instead. They seem faintly amused.';
          }
          ps.escorts.push({ id: `esc-vael-${ps.day}`, shipId: 'vdart', name: 'Vael Dart', hired: false, wage: 0, armor: 1 });
          return 'A crescent of living crystal detaches from the spire and falls into formation beside your ship. It hums, contentedly.';
        },
      },
      {
        label: '200,000 credits',
        apply: (ps) => {
          ps.credits += 200000;
          return 'The Vael do not use money, but they understand that you do. Your account balance is suddenly much larger.';
        },
      },
    ],
  },
];

export function storyStep(ps: PlayerState) {
  return Number(ps.flags.story ?? 0);
}

/** The story mission offered at this planet right now, if any. */
export function storyOffer(planet: PlanetDef, ps: PlayerState): Mission | null {
  const ch = CHAPTERS[storyStep(ps)];
  if (!ch || ps.missions.some((m) => m.story)) return null;
  if (!ch.offerAt.includes(planet.id) || !ch.available(ps)) return null;
  return ch.make(ps, planet);
}

export function chapter(step: number) {
  return CHAPTERS[step - 1];
}
