export const API_BASE = 'https://trainright-api.lifestyleapp.workers.dev';

const TOKEN_KEY = 'trainright_sync_token';
const CURSOR_KEY = 'trainright_sync_cursor';

export const getDeviceToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const setDeviceToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

/** Unpairing must also reset the cursor, or a re-pair would skip everything
 *  the server already had. */
export const clearDeviceToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CURSOR_KEY);
};

export const isPaired = (): boolean => getDeviceToken() !== null;

export const getCursor = (): number => {
  const raw = localStorage.getItem(CURSOR_KEY);
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

export const setCursor = (revision: number): void => {
  localStorage.setItem(CURSOR_KEY, String(revision));
};

/** Forget the cursor so the next sync re-pulls the entire history. Applying a
 *  change is idempotent, so a full re-pull is always safe — it costs bandwidth,
 *  never correctness. */
export const resetCursor = (): void => {
  localStorage.removeItem(CURSOR_KEY);
};

const KNOWN_DOMAINS_KEY = 'trainright_sync_known_domains';

/**
 * Reset the cursor if this build understands domains the last one didn't.
 *
 * apply.ts skips changes whose domain it doesn't recognise, while the engine
 * advances the cursor regardless — so a client that synced *before* a domain
 * existed drops those records and then never asks for them again. That is
 * exactly what happened to the phone when garmin_daily shipped: it pulled all
 * 32 days on an older bundle, discarded every one, and moved its cursor past
 * them.
 *
 * Comparing the known-domain set on every boot closes that hole for good,
 * including for domains added later (trading, Phase E).
 *
 * Returns true if a reset was triggered, so the caller can say so.
 */
export const resetCursorIfDomainsChanged = (currentDomains: readonly string[]): boolean => {
  const sorted = [...currentDomains].sort();
  const serialized = JSON.stringify(sorted);
  const previousRaw = localStorage.getItem(KNOWN_DOMAINS_KEY);
  localStorage.setItem(KNOWN_DOMAINS_KEY, serialized);

  // First run on a build that has this check: if a cursor already exists, it
  // was advanced by a build that had no domain tracking, so it may have skipped
  // records. Re-pull to be safe. A fresh install has no cursor and no work.
  if (previousRaw === null) {
    if (getCursor() === 0) return false;
    resetCursor();
    return true;
  }

  if (previousRaw === serialized) return false;

  let previous: string[];
  try {
    previous = JSON.parse(previousRaw) as string[];
  } catch {
    resetCursor();
    return true;
  }

  // Only a domain we didn't previously understand can have been skipped.
  // Losing a domain is harmless and must not trigger a full re-pull.
  const known = new Set(previous);
  const gained = sorted.some((domain) => !known.has(domain));
  if (!gained) return false;

  resetCursor();
  return true;
};
