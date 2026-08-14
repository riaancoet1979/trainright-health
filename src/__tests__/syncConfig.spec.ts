import { describe, it, expect, beforeEach } from 'vitest';
import {
  API_BASE, getDeviceToken, setDeviceToken, clearDeviceToken,
  getCursor, setCursor, isPaired,
} from '../sync/config';

describe('sync config', () => {
  beforeEach(() => localStorage.clear());

  it('points at the deployed worker', () => {
    expect(API_BASE).toBe('https://trainright-api.lifestyleapp.workers.dev');
  });

  it('reports unpaired before a token is stored', () => {
    expect(isPaired()).toBe(false);
    expect(getDeviceToken()).toBeNull();
  });

  it('round-trips a device token', () => {
    setDeviceToken('tok_abc');
    expect(getDeviceToken()).toBe('tok_abc');
    expect(isPaired()).toBe(true);
  });

  it('clears the token and the cursor together', () => {
    setDeviceToken('tok_abc');
    setCursor(42);
    clearDeviceToken();
    expect(getDeviceToken()).toBeNull();
    expect(getCursor()).toBe(0);
  });

  it('defaults the cursor to zero and round-trips it', () => {
    expect(getCursor()).toBe(0);
    setCursor(17);
    expect(getCursor()).toBe(17);
  });

  it('treats a corrupt cursor as zero rather than NaN', () => {
    localStorage.setItem('trainright_sync_cursor', 'banana');
    expect(getCursor()).toBe(0);
  });
});
