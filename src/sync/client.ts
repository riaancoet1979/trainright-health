import { API_BASE, getDeviceToken, setDeviceToken } from './config';
import type { Change, Mutation, PushResult } from './types';

export type BootstrapResult = { ok: true; deviceId: string } | { ok: false; error: string };

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    return body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const authHeaders = (): Record<string, string> => {
  const token = getDeviceToken();
  if (!token) throw new Error('Device is not paired with the server.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export const bootstrapDevice = async (code: string, label: string): Promise<BootstrapResult> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/v1/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, label }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }

  if (!response.ok) return { ok: false, error: await parseError(response) };

  const body = await response.json() as { token: string; deviceId: string };
  setDeviceToken(body.token);
  return { ok: true, deviceId: body.deviceId };
};

export const pushMutations = async (mutations: Mutation[]): Promise<PushResult[]> => {
  const response = await fetch(`${API_BASE}/v1/sync/push`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ mutations }),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const body = await response.json() as { revision: number; results: PushResult[] };
  return body.results;
};

export interface PullPage {
  revision: number;
  hasMore: boolean;
  changes: Change[];
}

export const pullChanges = async (since: number): Promise<PullPage> => {
  const response = await fetch(`${API_BASE}/v1/sync/pull?since=${since}`, {
    headers: authHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response));
  return await response.json() as PullPage;
};
