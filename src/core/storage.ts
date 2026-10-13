/** Prefix for every localStorage key the game writes. */
export const STORAGE_PREFIX = 'bv.';

// Saves from before the rename used an 'ev.' prefix; carry them over once so no pilot is lost.
const LEGACY_PREFIX = 'ev.';
try {
  const legacy: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_PREFIX)) legacy.push(key);
  }
  for (const key of legacy) {
    const next = STORAGE_PREFIX + key.slice(LEGACY_PREFIX.length);
    if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key)!);
    localStorage.removeItem(key);
  }
} catch {
  // Storage unavailable (private mode); nothing to migrate.
}
