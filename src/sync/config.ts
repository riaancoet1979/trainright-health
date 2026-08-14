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
