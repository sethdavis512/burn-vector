import { STORAGE_PREFIX } from '../core/storage';
import type { PlayerState } from './player';

const INDEX_KEY = `${STORAGE_PREFIX}pilots`;
const LAST_KEY = `${STORAGE_PREFIX}last`;
const pilotKey = (id: string) => `${STORAGE_PREFIX}pilot.${id}`;

export interface PilotSummary {
  id: string;
  name: string;
  shipName: string;
  shipId: string;
  credits: number;
  system: string;
  planet: string;
  day: number;
  saved: number;
}

function readIndex(): PilotSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as PilotSummary[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: PilotSummary[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode); the game still runs, it just won't persist.
  }
}

export function listPilots(): PilotSummary[] {
  return readIndex().sort((a, b) => b.saved - a.saved);
}

export function savePilot(ps: PlayerState): boolean {
  ps.saved = Date.now();
  try {
    localStorage.setItem(pilotKey(ps.id), JSON.stringify(ps));
    localStorage.setItem(LAST_KEY, ps.id);
  } catch {
    return false;
  }
  const summary: PilotSummary = {
    id: ps.id,
    name: ps.name,
    shipName: ps.shipName,
    shipId: ps.shipId,
    credits: ps.credits,
    system: ps.system,
    planet: ps.planet,
    day: ps.day,
    saved: ps.saved,
  };
  writeIndex([summary, ...readIndex().filter((p) => p.id !== ps.id)]);
  return true;
}

export function loadPilot(id: string): PlayerState | null {
  try {
    const raw = localStorage.getItem(pilotKey(id));
    if (!raw) return null;
    const ps = JSON.parse(raw) as PlayerState;
    localStorage.setItem(LAST_KEY, id);
    return ps;
  } catch {
    return null;
  }
}

export function deletePilot(id: string) {
  try {
    localStorage.removeItem(pilotKey(id));
    if (localStorage.getItem(LAST_KEY) === id) localStorage.removeItem(LAST_KEY);
  } catch {
    // ignore
  }
  writeIndex(readIndex().filter((p) => p.id !== id));
}

export function lastPilotId(): string | null {
  try {
    const id = localStorage.getItem(LAST_KEY);
    return id && readIndex().some((p) => p.id === id) ? id : null;
  } catch {
    return null;
  }
}
