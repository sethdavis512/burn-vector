import { hashStr } from '../core/math';
import type { CommodityId, PlanetDef, PriceLevel } from './types';

export interface CommodityDef {
  id: CommodityId;
  name: string;
  base: number;
}

export const COMMODITIES: CommodityDef[] = [
  { id: 'food', name: 'Food', base: 110 },
  { id: 'industrial', name: 'Industrial', base: 230 },
  { id: 'medical', name: 'Medical', base: 340 },
  { id: 'luxury', name: 'Luxury', base: 470 },
  { id: 'metal', name: 'Metal', base: 260 },
  { id: 'equipment', name: 'Equipment', base: 390 },
];

export const COMMODITY_BY_ID = Object.fromEntries(COMMODITIES.map((c) => [c.id, c])) as Record<
  CommodityId,
  CommodityDef
>;

const LEVEL_MULT: Record<PriceLevel, number> = { L: 0.72, M: 1, H: 1.34 };

export function priceLevel(planet: PlanetDef, id: CommodityId): PriceLevel | null {
  const idx = COMMODITIES.findIndex((c) => c.id === id);
  const ch = planet.eco[idx];
  return ch === 'L' || ch === 'M' || ch === 'H' ? ch : null;
}

/** Current price per ton, drifting a few percent every few days. */
export function priceAt(planet: PlanetDef, id: CommodityId, day: number): number | null {
  const level = priceLevel(planet, id);
  if (!level) return null;
  const c = COMMODITY_BY_ID[id];
  const drift = ((hashStr(`${planet.id}:${id}:${Math.floor(day / 4)}`) % 1000) / 1000 - 0.5) * 0.1;
  return Math.round(c.base * LEVEL_MULT[level] * (1 + drift));
}
