import { RNG } from '../core/math';

const FIRST = [
  'Mara', 'Jory', 'Saffi', 'Dren', 'Kett', 'Ilsa', 'Vane', 'Oren', 'Tamsin', 'Rook', 'Cass', 'Nyla', 'Brask', 'Hollis',
  'Zeph', 'Ines', 'Corvin', 'Pell', 'Rhea', 'Skarn', 'Tova', 'Wex', 'Yara', 'Lux', 'Garrick', 'Mirelle', 'Odo', 'Petra',
];
const LAST = [
  'Voss', 'Kell', 'Marrow', 'Dask', 'Quill', 'Harrow', 'Stroud', 'Vey', 'Calder', 'Blackwood', 'Okoro', 'Szabo', 'Renn',
  'Ashgrove', 'Tarkand', 'Ilyin', 'Moreau', 'Kaine', 'Drummond', 'Faraday', 'Holt', 'Ivers', 'Lazlo', 'Nakamura',
];
const EPITHET = [
  'Red', 'Black', 'Lucky', 'Mad', 'Old', 'Iron', 'Silent', 'Grinning', 'One-Eyed', 'Cold', 'Hollow', 'Bloody',
];
const SHIP_NAMES = [
  'Wayfarer', 'Second Chance', 'Lucky Strike', 'Kestrel Dawn', 'Far Horizon', 'Patience', 'Starwake', 'Long Odds',
  'Night Heron', 'Copper Penny', 'Daybreak', 'Wanderlust', 'Stray Cat', 'Last Light', 'Quiet Fortune', 'Drift',
  'Halcyon', 'Ember Run', 'Tin Lizzie', 'Open Road',
];
const PIRATE_SHIPS = [
  'Bloodtide', 'Widowmaker', 'Gutripper', 'Black Mercy', 'Carrion', 'Grave Wind', 'Rustjaw', 'Knife in the Dark',
  'Hungry Dog', 'Red Harvest', 'Sorrow', 'Bad Debt',
];

export function pilotName(rng: RNG) {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

export function pirateName(rng: RNG) {
  if (rng.chance(0.5)) return `${rng.pick(EPITHET)} ${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  return `${rng.pick(FIRST)} "${rng.pick(EPITHET)}" ${rng.pick(LAST)}`;
}

export function pirateShipName(rng: RNG) {
  return rng.pick(PIRATE_SHIPS);
}

export function randomShipName(rng: RNG) {
  return rng.pick(SHIP_NAMES);
}
