import { describe, it, expect, beforeEach } from 'vitest';
import {
  API_BASE, getDeviceToken, setDeviceToken, clearDeviceToken,
  getCursor, setCursor, isPaired, resetCursor, resetCursorIfDomainsChanged,
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

  it('resetCursor forces the next sync to re-pull everything', () => {
    setCursor(226);
    resetCursor();
    expect(getCursor()).toBe(0);
  });
});

describe('resetCursorIfDomainsChanged', () => {
  const DOMAINS = ['food_entry', 'custom_food'];

  beforeEach(() => localStorage.clear());

  it('does nothing on a fresh install with no cursor', () => {
    expect(resetCursorIfDomainsChanged(DOMAINS)).toBe(false);
    expect(getCursor()).toBe(0);
  });

  it('resets once on first run of a build that tracks domains, if a cursor exists', () => {
    // Simulates the phone: synced by an older build that had no domain
    // tracking, so its cursor may have advanced past records it dropped.
    setCursor(226);
    expect(resetCursorIfDomainsChanged(DOMAINS)).toBe(true);
    expect(getCursor()).toBe(0);
  });

  it('does not reset again when the domain set is unchanged', () => {
    setCursor(226);
    resetCursorIfDomainsChanged(DOMAINS);
    setCursor(300);

    expect(resetCursorIfDomainsChanged(DOMAINS)).toBe(false);
    expect(getCursor()).toBe(300);
  });

  it('resets when a new domain appears', () => {
    resetCursorIfDomainsChanged(DOMAINS);
    setCursor(300);

    expect(resetCursorIfDomainsChanged([...DOMAINS, 'garmin_daily'])).toBe(true);
    expect(getCursor()).toBe(0);
  });

  it('ignores ordering differences', () => {
    resetCursorIfDomainsChanged(['a', 'b', 'c']);
    setCursor(300);

    expect(resetCursorIfDomainsChanged(['c', 'a', 'b'])).toBe(false);
    expect(getCursor()).toBe(300);
  });

  it('does not reset when a domain is only removed', () => {
    resetCursorIfDomainsChanged(['a', 'b', 'c']);
    setCursor(300);

    // Nothing can have been skipped by losing a domain we already understood.
    expect(resetCursorIfDomainsChanged(['a', 'b'])).toBe(false);
    expect(getCursor()).toBe(300);
  });

  it('resets when the stored domain list is corrupt', () => {
    localStorage.setItem('trainright_sync_known_domains', 'not json');
    setCursor(300);

    expect(resetCursorIfDomainsChanged(DOMAINS)).toBe(true);
    expect(getCursor()).toBe(0);
  });
});
