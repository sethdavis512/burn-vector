import { hashStr } from '../core/math';
import type { GovId, PlanetDef, PlanetStyle, SystemDef, TrafficId } from './types';

interface PlanetSpec {
  id: string;
  name: string;
  style: PlanetStyle;
  at: [number, number];
  r: number;
  tech?: number;
  svc?: string;
  eco?: string;
  desc?: string;
  gov?: GovId;
}

interface SystemSpec {
  id: string;
  name: string;
  pos: [number, number];
  gov: GovId | null;
  region: string;
  star: [string, number] | null;
  star2?: [string, number, number, number];
  traffic: TrafficId;
  planets?: PlanetSpec[];
}

const NEBULA: Record<string, string> = {
  concord: '#2a4c9a',
  north: '#1a6a70',
  shoal: '#8a2436',
  league: '#22704a',
  vael: '#6a2aa0',
  shroud: '#9a3ad0',
};

const SPECS: SystemSpec[] = [
  // ── Concord core ────────────────────────────────────────────────
  {
    id: 'sol',
    name: 'Sol',
    pos: [300, 350],
    gov: 'concord',
    region: 'concord',
    star: ['#fff1c4', 150],
    traffic: 'core',
    planets: [
      {
        id: 'earth',
        name: 'Earth',
        style: 'terran',
        at: [-950, -420],
        r: 118,
        tech: 6,
        svc: 'TOSMBF',
        eco: 'HMLLHM',
        desc: 'The cradle of humanity and seat of the Terran Concord. Arcologies crown every continent, and the orbital lanes above the old blue world are the busiest in known space. Concord law is absolute here, and so is the price of a decent meal.',
      },
      {
        id: 'mars',
        name: 'Mars',
        style: 'red',
        at: [820, 640],
        r: 72,
        tech: 4,
        svc: 'TOMBF',
        eco: 'HLMMML',
        desc: 'Terraformed over five centuries and still not quite finished, Mars is the industrial heart of the Concord. Foundries run day and night beneath the domed cities of Tharsis, and their output is cheap if you buy it by the ton.',
      },
      {
        id: 'ceres',
        name: 'Ceres Yards',
        style: 'station-rock',
        at: [1550, -880],
        r: 52,
        tech: 5,
        svc: 'TOSF',
        eco: 'HM--LM',
        desc: "Built inside the hollowed husk of a dwarf planet, Ceres Yards turns out the Concord's warships and sells their civilian cousins to anyone with clean papers. The waiting list for a berth is measured in years; the waiting list for a ship, in credits.",
      },
    ],
  },
  {
    id: 'centauri',
    name: 'Alpha Centauri',
    pos: [252, 300],
    gov: 'concord',
    region: 'concord',
    star: ['#fff3d0', 120],
    star2: ['#ffcf8f', 70, 300, -200],
    traffic: 'core',
    planets: [
      {
        id: 'newarcadia',
        name: 'New Arcadia',
        style: 'jungle',
        at: [700, -560],
        r: 96,
        tech: 4,
        svc: 'TOSMBF',
        eco: 'LHMMMH',
        desc: 'Endless terraced farmland and quiet market towns make New Arcadia the breadbasket of the Concord core. Its people are famously polite and famously unimpressed by spacers.',
      },
      {
        id: 'proxima',
        name: 'Proxima Relay',
        style: 'station-ring',
        at: [-1150, 760],
        r: 42,
        tech: 2,
        svc: 'TMBF',
        eco: 'M-H-MM',
        desc: 'A navigation relay that grew a marketplace around it. Mostly freight brokers, recycled air and long waits for customs.',
      },
    ],
  },
  {
    id: 'procyon',
    name: 'Procyon',
    pos: [352, 296],
    gov: 'concord',
    region: 'concord',
    star: ['#f8f6ff', 125],
    traffic: 'core',
    planets: [
      {
        id: 'procyonprime',
        name: 'Procyon Prime',
        style: 'ocean',
        at: [-560, 720],
        r: 102,
        tech: 5,
        svc: 'TOSMBF',
        eco: 'LHLHMM',
        desc: "A world-ocean seeded with engineered kelp forests. Procyon's biotech houses supply most of the Concord's medicines and guard their patents with a ferocity usually reserved for warships.",
      },
      { id: 'procyonb', name: 'Procyon b', style: 'gas', at: [1400, -300], r: 150 },
    ],
  },
  {
    id: 'altair',
    name: 'Altair',
    pos: [305, 238],
    gov: 'concord',
    region: 'concord',
    star: ['#eef3ff', 110],
    traffic: 'core',
    planets: [
      {
        id: 'altairgate',
        name: 'Altair Gate',
        style: 'station-ring',
        at: [420, -640],
        r: 60,
        tech: 4,
        svc: 'TOMBF',
        eco: 'HMMMHL',
        desc: 'A great ring station marking the northern edge of the Concord core. Convoys bound for the free worlds gather here to wait for escorts, and the bars are full of captains comparing insurance rates.',
      },
      {
        id: 'altair3',
        name: 'Altair III',
        style: 'barren',
        at: [-980, 420],
        r: 70,
        tech: 1,
        svc: 'TF',
        eco: 'H---LH',
        desc: "An airless rock riddled with mine shafts. The handful of contract miners here will pay almost anything for food that didn't come out of a vat.",
      },
    ],
  },
  {
    id: 'sirius',
    name: 'Sirius',
    pos: [238, 408],
    gov: 'concord',
    region: 'concord',
    star: ['#e6efff', 175],
    traffic: 'core',
    planets: [
      {
        id: 'siriusstation',
        name: 'Sirius Station',
        style: 'station-spindle',
        at: [900, 320],
        r: 58,
        tech: 5,
        svc: 'TOSMBF',
        eco: 'MLMLMM',
        desc: 'A gleaming spindle station in the glare of the brightest star in the old sky. Sirius Station is a shipping hub, a banking center and the most expensive place in the Concord to park a freighter.',
      },
      {
        id: 'hephaestus',
        name: 'Hephaestus',
        style: 'lava',
        at: [-760, -720],
        r: 86,
        tech: 3,
        svc: 'TOF',
        eco: 'H-H-LL',
        desc: 'A volcanic world whose crust is rich in heavy metals. Robotic refineries do most of the work; the few humans here are paid very well to watch them and not ask about the air.',
      },
    ],
  },
  {
    id: 'vega',
    name: 'Vega',
    pos: [362, 410],
    gov: 'concord',
    region: 'concord',
    star: ['#dde8ff', 140],
    traffic: 'core',
    planets: [
      {
        id: 'vega4',
        name: 'Vega IV',
        style: 'terran',
        at: [-620, 560],
        r: 92,
        tech: 4,
        svc: 'TOSMBF',
        eco: 'LMHLMH',
        desc: 'Vega IV is a garden world famous for its wines, its universities and its stubborn refusal to build anything taller than the trees. Visitors are welcome, provided they wipe their boots.',
      },
    ],
  },
  {
    id: 'tauceti',
    name: 'Tau Ceti',
    pos: [192, 352],
    gov: 'concord',
    region: 'concord',
    star: ['#ffe8b5', 110],
    traffic: 'core',
    planets: [
      {
        id: 'tauceti3',
        name: 'Tau Ceti III',
        style: 'desert',
        at: [640, 540],
        r: 86,
        tech: 3,
        svc: 'TOMBF',
        eco: 'MLHHLM',
        desc: 'Arid and wind-scoured, Tau Ceti III was settled for its minerals and stayed for the sunsets. Its foundry towns sell cheap industrial goods to anyone heading coreward.',
      },
    ],
  },
  {
    id: 'eridani',
    name: 'Epsilon Eridani',
    pos: [188, 262],
    gov: 'concord',
    region: 'concord',
    star: ['#ffd49a', 100],
    traffic: 'core',
    planets: [
      {
        id: 'erid',
        name: 'Erid',
        style: 'ice',
        at: [-700, -480],
        r: 82,
        tech: 3,
        svc: 'TOMBF',
        eco: 'HMMHLM',
        desc: "A frozen world of glittering ice shelves and deep geothermal cities. Erid's miners pull iridium from the crust and spend it all in the dance halls of Rimeport.",
      },
      { id: 'eridanib', name: 'Eridani b', style: 'gasblue', at: [1200, 700], r: 125 },
    ],
  },
  // ── Concord outer worlds ───────────────────────────────────────
  {
    id: 'lalande',
    name: 'Lalande',
    pos: [126, 326],
    gov: 'concord',
    region: 'concord',
    star: ['#ffad78', 78],
    traffic: 'corelow',
    planets: [
      {
        id: 'lalandeoutpost',
        name: 'Lalande Outpost',
        style: 'station-ring',
        at: [560, -380],
        r: 40,
        tech: 2,
        svc: 'TMF',
        eco: 'H-H-M-',
        desc: 'Little more than a fuel depot and a Concord customs office, Lalande Outpost exists because the jump lanes say it must.',
      },
      { id: 'lalandeb', name: 'Lalande b', style: 'gas', at: [-1100, 600], r: 135 },
    ],
  },
  {
    id: 'groombridge',
    name: 'Groombridge',
    pos: [118, 214],
    gov: 'concord',
    region: 'concord',
    star: ['#ff9e6e', 72],
    traffic: 'frontier',
    planets: [
      {
        id: 'abbey',
        name: 'Groombridge Abbey',
        style: 'ice',
        at: [-520, -620],
        r: 68,
        tech: 1,
        svc: 'TMBF',
        eco: 'MH-LMH',
        desc: 'A contemplative order keeps this lonely monastery on the far edge of Concord space. Travelers are welcome to stay as long as they like. Few stay long.',
      },
    ],
  },
  {
    id: 'barnard',
    name: 'Barnard',
    pos: [152, 420],
    gov: 'concord',
    region: 'concord',
    star: ['#ff8a5c', 70],
    traffic: 'corelow',
    planets: [
      {
        id: 'forge',
        name: "Barnard's Forge",
        style: 'lava',
        at: [720, 420],
        r: 82,
        tech: 4,
        svc: 'TOSMF',
        eco: 'H-HMLL',
        desc: 'Fabrication yards cover half the surface of this tidally locked world. On the night side the furnace glow is visible from orbit, and the shipwrights here build freighters that last a century.',
      },
    ],
  },
  {
    id: 'ross',
    name: 'Ross',
    pos: [298, 470],
    gov: 'concord',
    region: 'concord',
    star: ['#ff9a6a', 82],
    traffic: 'corelow',
    planets: [
      {
        id: 'rosshaven',
        name: 'Ross Haven',
        style: 'ocean',
        at: [-640, -540],
        r: 86,
        tech: 3,
        svc: 'TOMBF',
        eco: 'LMMHHM',
        desc: 'A pleasant, rain-soaked world of fishing towns and shipping cooperatives. Its harbor masters have long memories for spacers who skip their docking fees.',
      },
    ],
  },
  {
    id: 'kapteyn',
    name: 'Kapteyn',
    pos: [205, 498],
    gov: 'concord',
    region: 'concord',
    star: ['#ffb080', 70],
    traffic: 'corelow',
    planets: [
      {
        id: 'kapteynreach',
        name: "Kapteyn's Reach",
        style: 'station-rock',
        at: [480, 560],
        r: 46,
        tech: 2,
        svc: 'TMBF',
        eco: 'HHM-MH',
        desc: "An aging habitat burrowed into an asteroid, Kapteyn's Reach has seen better centuries. The locals trade in salvage and rumor, and both come cheap.",
      },
    ],
  },
  {
    id: 'fomalhaut',
    name: 'Fomalhaut',
    pos: [372, 528],
    gov: 'concord',
    region: 'concord',
    star: ['#f2f5ff', 130],
    traffic: 'border',
    planets: [
      {
        id: 'fomalhautbastion',
        name: 'Fomalhaut Bastion',
        style: 'station-military',
        at: [-700, 380],
        r: 62,
        tech: 5,
        svc: 'TOSMF',
        eco: 'HMM-HM',
        desc: "The Concord Navy's southern bastion, watching over the lawless Shoal. Patrol wings launch at all hours, and the outfitters stock heavier hardware than anywhere outside Sol.",
      },
      {
        id: 'dagon',
        name: 'Dagon',
        style: 'ocean',
        at: [980, -620],
        r: 80,
        tech: 2,
        svc: 'TMBF',
        eco: 'LLHMMH',
        desc: 'A dark ocean world whose floating platforms harvest deep-sea biomass. The Dagonese keep one eye on the southern lanes and the other on the Navy.',
      },
    ],
  },
  {
    id: 'achernar',
    name: 'Achernar',
    pos: [270, 575],
    gov: 'concord',
    region: 'concord',
    star: ['#cfe0ff', 150],
    traffic: 'corelow',
    planets: [
      {
        id: 'spindle',
        name: 'Achernar Spindle',
        style: 'station-spindle',
        at: [620, -520],
        r: 52,
        tech: 3,
        svc: 'TOMBF',
        eco: 'MHLMMH',
        desc: 'A spinning cylinder colony housing three million people, Achernar Spindle is known for its pharmaceutical labs and its vertigo-inducing sky.',
      },
    ],
  },
  {
    id: 'canopus',
    name: 'Canopus',
    pos: [372, 622],
    gov: 'concord',
    region: 'concord',
    star: ['#fffaf0', 160],
    traffic: 'border',
    planets: [
      {
        id: 'canopuslanding',
        name: 'Canopus Landing',
        style: 'desert',
        at: [-760, -500],
        r: 90,
        tech: 2,
        svc: 'TMBF',
        eco: 'MMHLLH',
        desc: 'A frontier boomtown on the edge of the Shoal. Prospectors, drifters and Concord marshals share the same three streets and pretend not to notice each other.',
      },
    ],
  },
  // ── Free worlds of the north ───────────────────────────────────
  {
    id: 'castor',
    name: 'Castor',
    pos: [382, 150],
    gov: 'independent',
    region: 'north',
    star: ['#f0f5ff', 120],
    traffic: 'north',
    planets: [
      {
        id: 'castorprime',
        name: 'Castor Prime',
        style: 'terran',
        at: [-820, 480],
        r: 92,
        tech: 3,
        svc: 'TOMBF',
        eco: 'LHMMHM',
        desc: 'One half of the Twin Worlds, Castor Prime is a sprawling agricultural republic whose grain freighters reach every corner of the north.',
      },
    ],
  },
  {
    id: 'pollux',
    name: 'Pollux',
    pos: [452, 92],
    gov: 'independent',
    region: 'north',
    star: ['#ffcf8a', 130],
    traffic: 'north',
    planets: [
      {
        id: 'polluxfreeport',
        name: 'Pollux Freeport',
        style: 'station-ring',
        at: [640, 600],
        r: 56,
        tech: 4,
        svc: 'TOSMBF',
        eco: 'HMLHMM',
        desc: "A freeport with no tariffs and few questions. Pollux's dockmasters care about the color of your credits, not where they came from.",
      },
    ],
  },
  {
    id: 'capella',
    name: 'Capella',
    pos: [446, 208],
    gov: 'independent',
    region: 'north',
    star: ['#ffe6a6', 140],
    traffic: 'north',
    planets: [
      {
        id: 'capellaexchange',
        name: 'Capella Exchange',
        style: 'station-spindle',
        at: [-600, -560],
        r: 64,
        tech: 5,
        svc: 'TOSMBF',
        eco: 'MMMLMM',
        desc: 'The great commodity exchange of the free worlds. Billions of credits in futures change hands here every hour, though very little actual cargo does.',
      },
      {
        id: 'aurum',
        name: 'Aurum',
        style: 'desert',
        at: [1100, 520],
        r: 78,
        tech: 2,
        svc: 'TMBF',
        eco: 'LH-HMH',
        desc: 'A gold-hued desert world owned outright by three mining families who have been feuding for two hundred years. Outsiders are advised to stay neutral and keep their receipts.',
      },
    ],
  },
  {
    id: 'arcturus',
    name: 'Arcturus',
    pos: [528, 148],
    gov: 'independent',
    region: 'north',
    star: ['#ffb066', 170],
    traffic: 'north',
    planets: [
      {
        id: 'portarcturus',
        name: 'Port Arcturus',
        style: 'desert',
        at: [760, -620],
        r: 96,
        tech: 4,
        svc: 'TOSMBF',
        eco: 'HLMMLM',
        desc: 'An old orange world beneath an old orange star. Port Arcturus runs the largest independent shipyard in the north, and its engineers will refit anything that still holds air.',
      },
    ],
  },
  {
    id: 'aldebaran',
    name: 'Aldebaran',
    pos: [572, 236],
    gov: 'independent',
    region: 'north',
    star: ['#ff9d58', 180],
    traffic: 'north',
    planets: [
      {
        id: 'hyades',
        name: 'Hyades Market',
        style: 'station-rock',
        at: [-760, 520],
        r: 50,
        tech: 3,
        svc: 'TOMBF',
        eco: 'MHHL-M',
        desc: 'A sprawling bazaar station where traders from the north, the core and the frontier all meet. Anything can be bought here. Most of it is even legal.',
      },
    ],
  },
  {
    id: 'regulus',
    name: 'Regulus',
    pos: [618, 132],
    gov: 'independent',
    region: 'north',
    star: ['#e0ebff', 130],
    traffic: 'north',
    planets: [
      {
        id: 'regulusminor',
        name: 'Regulus Minor',
        style: 'ice',
        at: [540, 640],
        r: 70,
        tech: 2,
        svc: 'TMBF',
        eco: 'HM-HLM',
        desc: "A cold, bright world of crystalline plains. Regulus Minor's mining guilds are fiercely independent and fiercely suspicious of outsiders.",
      },
    ],
  },
  {
    id: 'deneb',
    name: 'Deneb',
    pos: [690, 64],
    gov: 'independent',
    region: 'north',
    star: ['#ffffff', 230],
    traffic: 'frontier',
    planets: [
      {
        id: 'denebobs',
        name: 'Deneb Observatory',
        style: 'station-ring',
        at: [-1100, -700],
        r: 44,
        tech: 2,
        svc: 'TMBF',
        eco: 'HMH-MH',
        desc: 'A research station studying the blinding supergiant Deneb. The scientists are always short of supplies and always glad to pay for them.',
      },
    ],
  },
  {
    id: 'mira',
    name: 'Mira',
    pos: [500, 292],
    gov: 'independent',
    region: 'north',
    star: ['#ff7f5a', 160],
    traffic: 'border',
    planets: [
      {
        id: 'miracrossroads',
        name: 'Mira Crossroads',
        style: 'station-ring',
        at: [560, 520],
        r: 58,
        tech: 3,
        svc: 'TOMBF',
        eco: 'HMMHLM',
        desc: 'Where the lanes of the core, the north, the frontier and the Shoal all meet. Mira Crossroads is crowded, loud and occasionally violent, and every trader passes through it sooner or later.',
      },
      { id: 'mira6', name: 'Mira VI', style: 'gas', at: [-1300, -500], r: 155 },
    ],
  },
  // ── The Shoal ───────────────────────────────────────────────────
  {
    id: 'hadar',
    name: 'Hadar',
    pos: [448, 452],
    gov: 'independent',
    region: 'shoal',
    star: ['#d6e4ff', 130],
    traffic: 'border',
    planets: [
      {
        id: 'hadarsrest',
        name: "Hadar's Rest",
        style: 'barren',
        at: [-640, 600],
        r: 72,
        tech: 2,
        svc: 'TMBF',
        eco: 'HLHHML',
        desc: 'A dusty mining world where Concord law runs out and frontier justice takes over. Everyone here carries a gun, and most of them know how to use it.',
      },
    ],
  },
  {
    id: 'antares',
    name: 'Antares',
    pos: [540, 432],
    gov: 'independent',
    region: 'shoal',
    star: ['#ff5b3b', 235],
    traffic: 'border',
    planets: [
      {
        id: 'antaresway',
        name: 'Antares Waystation',
        style: 'station-rock',
        at: [900, -500],
        r: 46,
        tech: 3,
        svc: 'TOMBF',
        eco: 'HMHHMM',
        desc: 'A battered waystation in the glare of the red supergiant. Bounty hunters use it as a base for runs into the Shoal, and the bulletin board is papered with wanted notices.',
      },
    ],
  },
  {
    id: 'shaula',
    name: 'Shaula',
    pos: [470, 560],
    gov: 'independent',
    region: 'shoal',
    star: ['#d0deff', 120],
    traffic: 'badlands',
    planets: [
      {
        id: 'stinger',
        name: 'Stinger',
        style: 'toxic',
        at: [-580, -560],
        r: 76,
        tech: 2,
        svc: 'TMBF',
        eco: 'HHH-LM',
        desc: "A toxic world of acid seas, mined by people who couldn't find work anywhere else. Even the Corsairs leave it alone; there is nothing here worth stealing.",
      },
    ],
  },
  {
    id: 'algol',
    name: 'Algol',
    pos: [612, 500],
    gov: 'corsair',
    region: 'shoal',
    star: ['#ffefc0', 110],
    star2: ['#ff8f5a', 60, -240, 170],
    traffic: 'pirate',
    planets: [
      {
        id: 'gorgon',
        name: "Gorgon's Den",
        style: 'station-rock',
        at: [720, 480],
        r: 62,
        tech: 5,
        svc: 'TOSMBF',
        eco: 'HHHLML',
        desc: "Carved into a tumbling asteroid in the light of the Demon Star, the Gorgon's Den is the closest thing the Corsair Clans have to a capital. Its outfitters sell weapons no lawful world would license, and buy stolen goods without asking.",
      },
    ],
  },
  {
    id: 'sargas',
    name: 'Sargas',
    pos: [560, 612],
    gov: 'corsair',
    region: 'shoal',
    star: ['#ffd69a', 120],
    traffic: 'badlands',
    planets: [
      {
        id: 'wreckers',
        name: "Wreckers' Moon",
        style: 'barren',
        at: [-620, 520],
        r: 60,
        tech: 3,
        svc: 'TOMBF',
        eco: 'HMH-LL',
        desc: 'A graveyard moon where the Corsairs strip captured ships for parts. The smell of burning insulation never quite leaves your flight suit.',
      },
    ],
  },
  {
    id: 'kaus',
    name: 'Kaus',
    pos: [668, 600],
    gov: 'independent',
    region: 'shoal',
    star: ['#e8eeff', 110],
    traffic: 'badlands',
    planets: [
      {
        id: 'kausdrift',
        name: 'Kaus Drift',
        style: 'station-ring',
        at: [560, -520],
        r: 46,
        tech: 3,
        svc: 'TOMBF',
        eco: 'LHMLHH',
        desc: 'A drifting habitat of smugglers, gamblers and retired pirates. Officially independent, unofficially neutral, and very unofficially for sale.',
      },
    ],
  },
  {
    id: 'nunki',
    name: 'Nunki',
    pos: [760, 550],
    gov: 'corsair',
    region: 'shoal',
    star: ['#dce8ff', 120],
    traffic: 'badlands',
    planets: [
      {
        id: 'blackharbor',
        name: 'Black Harbor',
        style: 'ocean',
        at: [-700, -480],
        r: 84,
        tech: 4,
        svc: 'TOSMBF',
        eco: 'MHH-MM',
        desc: "A storm-wracked water world whose floating cities pay tribute to the Corsair clans. Black Harbor's shipwrights build fast raiders for anyone who can pay in cash.",
      },
    ],
  },
  // ── Frontier League ─────────────────────────────────────────────
  {
    id: 'spica',
    name: 'Spica',
    pos: [630, 340],
    gov: 'league',
    region: 'league',
    star: ['#cfdcff', 150],
    traffic: 'border',
    planets: [
      {
        id: 'spicajunction',
        name: 'Spica Junction',
        style: 'station-military',
        at: [-620, 420],
        r: 52,
        tech: 3,
        svc: 'TOMBF',
        eco: 'HMHMMH',
        desc: "The League's westernmost outpost, watching the lanes to Mira and the Shoal. Its customs officers are courteous, thorough and impossible to bribe.",
      },
    ],
  },
  {
    id: 'betelgeuse',
    name: 'Betelgeuse',
    pos: [706, 208],
    gov: 'league',
    region: 'league',
    star: ['#ff6a3a', 245],
    traffic: 'league',
    planets: [
      {
        id: 'ember',
        name: 'Ember',
        style: 'red',
        at: [980, 560],
        r: 86,
        tech: 3,
        svc: 'TOMBF',
        eco: 'MLHHLM',
        desc: "A ruddy world lit by the swollen red giant overhead. Ember's foundries feed the League's growing fleet, and its people are proud of every hull.",
      },
    ],
  },
  {
    id: 'rigel',
    name: 'Rigel',
    pos: [726, 314],
    gov: 'league',
    region: 'league',
    star: ['#cfe0ff', 190],
    traffic: 'league',
    planets: [
      {
        id: 'newhaven',
        name: 'New Haven',
        style: 'terran',
        at: [-900, -460],
        r: 116,
        tech: 5,
        svc: 'TOSMBF',
        eco: 'MMLHHM',
        desc: 'Capital of the Frontier League, New Haven is a young world of bold architecture and bolder politics. Colonists from a hundred worlds came here to build something the Concord could not tax.',
      },
      {
        id: 'rigelworks',
        name: 'Rigel Shipworks',
        style: 'station-military',
        at: [1000, 640],
        r: 54,
        tech: 5,
        svc: 'TOSF',
        eco: 'H-M-LL',
        desc: "The League's premier shipyard, where Raptors roll off the line by the hundred. Civilian hulls are built here too, mostly to pay for the Raptors.",
      },
    ],
  },
  {
    id: 'bellatrix',
    name: 'Bellatrix',
    pos: [796, 232],
    gov: 'league',
    region: 'league',
    star: ['#d6e2ff', 140],
    traffic: 'league',
    planets: [
      {
        id: 'valor',
        name: 'Valor',
        style: 'ice',
        at: [620, -560],
        r: 80,
        tech: 3,
        svc: 'TOMBF',
        eco: 'HMMHLM',
        desc: "An ice world named for the colonists who died settling it. The survivors' grandchildren run a thriving export trade in cold-cured luxury goods.",
      },
    ],
  },
  {
    id: 'thuban',
    name: 'Thuban',
    pos: [812, 112],
    gov: 'league',
    region: 'league',
    star: ['#eef3ff', 110],
    traffic: 'frontier',
    planets: [
      {
        id: 'thubancolony',
        name: 'Thuban Colony',
        style: 'jungle',
        at: [-560, 560],
        r: 74,
        tech: 1,
        svc: 'TMBF',
        eco: 'LHHHMH',
        desc: 'A young colony scratching out a living on a cold, beautiful world. Supplies are always short and always welcome.',
      },
    ],
  },
  {
    id: 'mintaka',
    name: 'Mintaka',
    pos: [812, 338],
    gov: 'league',
    region: 'league',
    star: ['#d8e4ff', 130],
    traffic: 'league',
    planets: [
      {
        id: 'mintakabelt',
        name: 'Mintaka Belt',
        style: 'station-rock',
        at: [700, 380],
        r: 50,
        tech: 3,
        svc: 'TOMF',
        eco: 'HMH-LM',
        desc: 'A cluster of mining habitats strung through a dense asteroid belt. The ore is rich, the rocks are dangerous and the pay is excellent.',
      },
    ],
  },
  {
    id: 'alnilam',
    name: 'Alnilam',
    pos: [790, 438],
    gov: 'league',
    region: 'league',
    star: ['#c8d8ff', 170],
    traffic: 'league',
    planets: [
      {
        id: 'fortalnilam',
        name: 'Fort Alnilam',
        style: 'station-military',
        at: [-640, -420],
        r: 56,
        tech: 4,
        svc: 'TOSMF',
        eco: 'HHM-MM',
        desc: "The League's southern bulwark against the Corsair clans. Raptors launch from Fort Alnilam on patrol every hour of every day.",
      },
    ],
  },
  {
    id: 'saiph',
    name: 'Saiph',
    pos: [696, 420],
    gov: 'league',
    region: 'league',
    star: ['#cad9ff', 150],
    traffic: 'league',
    planets: [
      {
        id: 'meridian',
        name: 'Meridian',
        style: 'ocean',
        at: [760, -560],
        r: 90,
        tech: 3,
        svc: 'TOMBF',
        eco: 'LHMMHH',
        desc: "A warm ocean world of island cities and endless regattas. Meridian's markets are the busiest in the League, and its beaches are the best in known space.",
      },
    ],
  },
  {
    id: 'denebola',
    name: 'Denebola',
    pos: [888, 290],
    gov: 'league',
    region: 'league',
    star: ['#f4f8ff', 120],
    traffic: 'frontier',
    planets: [
      {
        id: 'lastlight',
        name: 'Lastlight',
        style: 'ice',
        at: [-560, 520],
        r: 66,
        tech: 2,
        svc: 'TMBF',
        eco: 'HHH-MH',
        desc: "The last settled world before the Shroud. Lastlight's people watch the violet nebula with a mixture of awe and dread; the Vael have been seen at its edge.",
      },
    ],
  },
  // ── The Shroud and Vael space ──────────────────────────────────
  {
    id: 'shroud',
    name: 'The Shroud',
    pos: [965, 330],
    gov: null,
    region: 'vael',
    star: null,
    traffic: 'empty',
  },
  {
    id: 'ysara',
    name: 'Ysara',
    pos: [1030, 252],
    gov: 'vael',
    region: 'vael',
    star: ['#e8d0ff', 140],
    traffic: 'vael',
    planets: [
      {
        id: 'ysarachoir',
        name: 'Ysara',
        style: 'crystal',
        at: [-700, 500],
        r: 92,
        tech: 6,
        svc: 'TOSMBF',
        eco: 'MHL-HL',
        desc: 'Spires of living crystal rise from the oceans of Ysara, humming in chords too low for human ears. The Vael receive visitors here with grave courtesy.',
      },
    ],
  },
  {
    id: 'quorr',
    name: 'Quorr',
    pos: [1030, 412],
    gov: 'vael',
    region: 'vael',
    star: ['#d6c4ff', 120],
    traffic: 'vael',
    planets: [
      {
        id: 'quorrlattice',
        name: 'Quorr Lattice',
        style: 'station-vael',
        at: [640, -480],
        r: 70,
        tech: 6,
        svc: 'TOMF',
        eco: 'HMLHHL',
        desc: 'A Vael station that looks less built than grown: a lattice of glowing violet filaments enclosing a slowly turning heart of light.',
      },
    ],
  },
  {
    id: 'aelith',
    name: 'Aelith',
    pos: [1104, 330],
    gov: 'vael',
    region: 'vael',
    star: ['#f2e2ff', 170],
    traffic: 'vael',
    planets: [
      {
        id: 'aelithprime',
        name: 'Aelith',
        style: 'crystal',
        at: [-980, -380],
        r: 122,
        tech: 7,
        svc: 'TOSMBF',
        eco: 'HMLLHM',
        desc: 'The heart of the Vael Collective. Few humans have set foot on Aelith, and those who have rarely describe it the same way twice.',
      },
    ],
  },
  {
    id: 'orushan',
    name: "Oru'shan",
    pos: [1110, 200],
    gov: 'vael',
    region: 'vael',
    star: ['#bfa8ff', 100],
    traffic: 'vael',
    planets: [
      {
        id: 'orusanctum',
        name: 'Oru Sanctum',
        style: 'ice',
        at: [560, 560],
        r: 80,
        tech: 4,
        svc: 'TMBF',
        eco: 'LHM-HM',
        desc: 'A quiet ice world where the Vael come, it is said, to listen to the stars. Humans are tolerated, provided they keep their voices down.',
      },
    ],
  },
  {
    id: 'viss',
    name: 'Viss',
    pos: [1118, 462],
    gov: 'vael',
    region: 'vael',
    star: ['#ead6ff', 120],
    traffic: 'vael',
    planets: [
      {
        id: 'vissdeep',
        name: 'Viss Deep',
        style: 'station-vael',
        at: [-640, -520],
        r: 64,
        tech: 5,
        svc: 'TOSMBF',
        eco: 'MHLHHM',
        desc: 'A Vael waystation anchored at the edge of a dark nebula. Its markets trade in things humans have no words for, and a few that they do.',
      },
    ],
  },
];

const LINKS: [string, string][] = [
  ['sol', 'centauri'],
  ['sol', 'procyon'],
  ['sol', 'sirius'],
  ['sol', 'vega'],
  ['sol', 'tauceti'],
  ['centauri', 'altair'],
  ['centauri', 'eridani'],
  ['centauri', 'tauceti'],
  ['procyon', 'altair'],
  ['procyon', 'capella'],
  ['procyon', 'vega'],
  ['altair', 'castor'],
  ['altair', 'eridani'],
  ['sirius', 'tauceti'],
  ['sirius', 'barnard'],
  ['sirius', 'ross'],
  ['vega', 'ross'],
  ['vega', 'fomalhaut'],
  ['vega', 'hadar'],
  ['tauceti', 'lalande'],
  ['eridani', 'lalande'],
  ['eridani', 'groombridge'],
  ['lalande', 'barnard'],
  ['barnard', 'kapteyn'],
  ['ross', 'kapteyn'],
  ['ross', 'fomalhaut'],
  ['kapteyn', 'achernar'],
  ['fomalhaut', 'achernar'],
  ['fomalhaut', 'canopus'],
  ['fomalhaut', 'shaula'],
  ['achernar', 'canopus'],
  ['canopus', 'shaula'],
  ['castor', 'pollux'],
  ['castor', 'capella'],
  ['pollux', 'arcturus'],
  ['capella', 'arcturus'],
  ['capella', 'mira'],
  ['arcturus', 'regulus'],
  ['arcturus', 'aldebaran'],
  ['aldebaran', 'mira'],
  ['aldebaran', 'spica'],
  ['aldebaran', 'regulus'],
  ['regulus', 'deneb'],
  ['regulus', 'betelgeuse'],
  ['deneb', 'thuban'],
  ['mira', 'spica'],
  ['mira', 'hadar'],
  ['hadar', 'antares'],
  ['hadar', 'shaula'],
  ['antares', 'algol'],
  ['antares', 'spica'],
  ['antares', 'saiph'],
  ['shaula', 'sargas'],
  ['algol', 'sargas'],
  ['algol', 'kaus'],
  ['algol', 'saiph'],
  ['sargas', 'kaus'],
  ['kaus', 'nunki'],
  ['nunki', 'alnilam'],
  ['spica', 'rigel'],
  ['spica', 'betelgeuse'],
  ['betelgeuse', 'rigel'],
  ['betelgeuse', 'bellatrix'],
  ['rigel', 'bellatrix'],
  ['rigel', 'mintaka'],
  ['rigel', 'saiph'],
  ['bellatrix', 'thuban'],
  ['bellatrix', 'denebola'],
  ['mintaka', 'alnilam'],
  ['mintaka', 'denebola'],
  ['alnilam', 'saiph'],
  ['denebola', 'shroud'],
  ['shroud', 'ysara'],
  ['shroud', 'quorr'],
  ['ysara', 'aelith'],
  ['ysara', 'orushan'],
  ['quorr', 'aelith'],
  ['quorr', 'viss'],
  ['orushan', 'aelith'],
  ['viss', 'aelith'],
];

function buildSystems(): Record<string, SystemDef> {
  const out: Record<string, SystemDef> = {};
  for (const s of SPECS) {
    const sys: SystemDef = {
      id: s.id,
      name: s.name,
      x: s.pos[0],
      y: s.pos[1],
      gov: s.gov,
      region: s.region,
      links: [],
      star: s.star ? { color: s.star[0], r: s.star[1] } : null,
      nebula: s.id === 'shroud' ? NEBULA.shroud! : NEBULA[s.region]!,
      traffic: s.traffic,
      planets: [],
    };
    if (s.star2) sys.star2 = { color: s.star2[0], r: s.star2[1], x: s.star2[2], y: s.star2[3] };
    for (const p of s.planets ?? []) {
      const landable = !!p.svc;
      const planet: PlanetDef = {
        id: p.id,
        name: p.name,
        style: p.style,
        x: p.at[0],
        y: p.at[1],
        r: p.r,
        gov: p.gov ?? s.gov ?? 'independent',
        tech: p.tech ?? 0,
        services: p.svc ?? '',
        eco: p.eco ?? '------',
        desc: p.desc ?? '',
        landable,
        systemId: s.id,
        seed: hashStr(p.id),
      };
      sys.planets.push(planet);
    }
    out[s.id] = sys;
  }
  for (const [a, b] of LINKS) {
    const sa = out[a];
    const sb = out[b];
    if (!sa || !sb) throw new Error(`Bad link ${a}-${b}`);
    sa.links.push(b);
    sb.links.push(a);
  }
  return out;
}

export const SYSTEMS = buildSystems();
export const SYSTEM_LIST = Object.values(SYSTEMS);

export const PLANETS: Record<string, PlanetDef> = Object.fromEntries(
  SYSTEM_LIST.flatMap((s) => s.planets.map((p) => [p.id, p] as const)),
);

export function system(id: string): SystemDef {
  const s = SYSTEMS[id];
  if (!s) throw new Error(`Unknown system ${id}`);
  return s;
}

export function planet(id: string): PlanetDef {
  const p = PLANETS[id];
  if (!p) throw new Error(`Unknown planet ${id}`);
  return p;
}

export const REGION_NAMES: Record<string, string> = {
  concord: 'Concord Space',
  north: 'Free Worlds',
  shoal: 'The Shoal',
  league: 'Frontier League',
  vael: 'Vael Expanse',
};

/** Breadth-first jump distances from a system. */
export function jumpDistances(from: string, maxDepth = 99): Map<string, number> {
  const seen = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = seen.get(cur)!;
    if (d >= maxDepth) continue;
    for (const n of SYSTEMS[cur]!.links) {
      if (!seen.has(n)) {
        seen.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Shortest route (excluding `from`) using only systems that pass `canTraverse`. */
export function findRoute(from: string, to: string, canTraverse: (id: string) => boolean): string[] | null {
  if (from === to) return [];
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of SYSTEMS[cur]!.links) {
      if (seen.has(n)) continue;
      if (n !== to && !canTraverse(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const route = [to];
        let c = cur;
        while (c !== from) {
          route.unshift(c);
          c = prev.get(c)!;
        }
        return route;
      }
      queue.push(n);
    }
  }
  return null;
}

export function landablePlanets(sys: SystemDef): PlanetDef[] {
  return sys.planets.filter((p) => p.landable);
}
