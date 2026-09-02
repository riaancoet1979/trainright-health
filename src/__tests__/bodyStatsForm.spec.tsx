import React, { act } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import BodyStats from '../components/BodyStats';
import { ToastProvider, ConfirmProvider } from '../components/ui';
import { getBodyStats } from '../utils/storage';
import { KNOWN_INBODY_SCANS } from '../data/inbodyScans';

/**
 * Regression cover for the manual body-composition entry form.
 *
 * Before this form existed, the only way a scan's skeletal-muscle mass, body-fat
 * mass or segmental values could reach storage was the hard-coded importer — the
 * Log Entry form exposed weight and body-fat percentage and nothing else. These
 * tests assert the whole InBody sheet can be typed in, saved, and read back.
 */

// React 19 requires this flag before act() will drive updates outside a test
// renderer; without it every act() call logs a warning and state lands late.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => localStorage.clear());

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise<void>(r => setTimeout(r, 10));
  }
};

const mount = async (): Promise<{ container: HTMLDivElement; root: Root }> => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ToastProvider>
        <ConfirmProvider>
          <BodyStats />
        </ConfirmProvider>
      </ToastProvider>,
    );
  });
  return { container, root };
};

/** Set a controlled React input/select and fire the change React listens for. */
const setValue = async (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

// Attribute selector rather than `#id` — the ids contain no metacharacters and
// this jsdom build has no CSS.escape.
const byId = <T extends HTMLElement>(c: HTMLElement, id: string): T => {
  const el = c.querySelector<T>(`[id="${id}"]`);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

/** Click the collapsed section header whose label matches `title`. */
const openSection = async (c: HTMLElement, title: string) => {
  const button = [...c.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(title));
  if (!button) throw new Error(`no section button for "${title}"`);
  await act(async () => { button.click(); });
};

const clickText = async (c: HTMLElement, text: string) => {
  const button = [...c.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
  if (!button) throw new Error(`no button labelled "${text}"`);
  await act(async () => { button.click(); });
};

describe('BodyStats manual entry form', () => {
  it('saves the full InBody sheet typed in by hand', async () => {
    const { container, root } = await mount();

    await clickText(container, '+ Log Entry');
    await setValue(byId<HTMLInputElement>(container, 'bs-date'), '2026-09-01');
    await setValue(byId<HTMLInputElement>(container, 'bs-measuredTime'), '07:45');
    await setValue(byId<HTMLInputElement>(container, 'bs-weight'), '90.5');
    await setValue(byId<HTMLInputElement>(container, 'bs-bodyFat'), '17.2');

    await openSection(container, 'Body Composition');
    await setValue(byId<HTMLInputElement>(container, 'bs-sourceDevice'), 'InBody 270');
    await setValue(byId<HTMLInputElement>(container, 'bs-skeletalMuscleMassKg'), '42.8');
    await setValue(byId<HTMLInputElement>(container, 'bs-bodyFatMassKg'), '15.6');
    await setValue(byId<HTMLInputElement>(container, 'bs-fatFreeMassKg'), '74.9');
    await setValue(byId<HTMLInputElement>(container, 'bs-totalBodyWaterL'), '54.8');
    await setValue(byId<HTMLInputElement>(container, 'bs-bmi'), '28.6');
    await setValue(byId<HTMLInputElement>(container, 'bs-inBodyScore'), '93');

    await openSection(container, 'Metabolic Estimates');
    await setValue(byId<HTMLInputElement>(container, 'bs-basalMetabolicRateKcal'), '1985');
    await setValue(byId<HTMLInputElement>(container, 'bs-visceralFatLevel'), '7');

    await openSection(container, 'Device Suggestion');
    await setValue(byId<HTMLInputElement>(container, 'bs-weightControlKg'), '-2.5');

    await openSection(container, 'Segmental Analysis');
    await setValue(byId<HTMLInputElement>(container, 'bs-lean-mass-trunk'), '33.9');
    await setValue(byId<HTMLInputElement>(container, 'bs-lean-ref-trunk'), '118.2');
    await setValue(byId<HTMLSelectElement>(container, 'bs-lean-class-trunk'), 'Over');
    await setValue(byId<HTMLInputElement>(container, 'bs-fat-mass-trunk'), '9.1');

    await clickText(container, 'Save Entry');
    await waitFor(() => getBodyStats().length === 1);

    const entry = getBodyStats()[0];
    expect(entry.date).toBe('2026-09-01');
    expect(entry.measuredAt).toBe('2026-09-01T07:45:00');
    expect(entry.weight).toBe(90.5);
    expect(entry.bodyFat).toBe(17.2);
    expect(entry.skeletalMuscleMassKg).toBe(42.8);
    expect(entry.bodyFatMassKg).toBe(15.6);
    expect(entry.fatFreeMassKg).toBe(74.9);
    expect(entry.totalBodyWaterL).toBe(54.8);
    expect(entry.bmi).toBe(28.6);
    expect(entry.inBodyScore).toBe(93);
    expect(entry.inBodyScoreMax).toBe(100);
    expect(entry.basalMetabolicRateKcal).toBe(1985);
    expect(entry.visceralFatLevel).toBe(7);
    // Control values are negative on the printout and must survive as negatives.
    expect(entry.weightControlKg).toBe(-2.5);
    expect(entry.sourceDevice).toBe('InBody 270');
    expect(entry.source).toBe('inbody-270');
    expect(entry.segmentalLean).toEqual([
      { region: 'trunk', massKg: 33.9, refPercent: 118.2, classification: 'Over' },
    ]);
    // A region with fat mass but no lean mass still records the fat side only.
    expect(entry.segmentalFat).toEqual([{ region: 'trunk', massKg: 9.1 }]);
    // Unfilled metrics stay absent rather than landing as 0.
    expect(entry.proteinMassKg).toBeUndefined();
    expect(entry.waist).toBeUndefined();

    root.unmount();
    container.remove();
  });

  it('reloads every composition field into the edit form and keeps import provenance', async () => {
    const { container, root } = await mount();

    // Import the hard-coded scans, then edit the newest one.
    const importButton = container.querySelector<HTMLButtonElement>('button[title^="Import InBody"]');
    if (!importButton) throw new Error('no InBody import button');
    await act(async () => { importButton.click(); });
    await waitFor(() => getBodyStats().length === KNOWN_INBODY_SCANS.length);
    const before = getBodyStats().find(e => e.date === '2026-08-06')!;
    expect(before.skeletalMuscleMassKg).toBe(42.3);

    const editButtons = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label="Edit entry"]')];
    // History renders newest first, so the first edit button is the 6 Aug scan.
    await act(async () => { editButtons[0].click(); });

    // Sections holding data open themselves, so the values are visible at once.
    expect(byId<HTMLInputElement>(container, 'bs-skeletalMuscleMassKg').value).toBe('42.3');
    expect(byId<HTMLInputElement>(container, 'bs-bodyFatMassKg').value).toBe('15.9');
    expect(byId<HTMLInputElement>(container, 'bs-basalMetabolicRateKcal').value).toBe('1971');
    expect(byId<HTMLInputElement>(container, 'bs-weightControlKg').value).toBe('-2.8');
    expect(byId<HTMLInputElement>(container, 'bs-lean-mass-trunk').value).toBe('33.5');
    expect(byId<HTMLSelectElement>(container, 'bs-fat-class-trunk').value).toBe('Over');
    expect(byId<HTMLInputElement>(container, 'bs-measuredTime').value).toBe('12:04');

    // Change one value and save — nothing else may be lost.
    await setValue(byId<HTMLInputElement>(container, 'bs-weight'), '90.4');
    await clickText(container, 'Update Entry');
    await waitFor(() => getBodyStats().find(e => e.date === '2026-08-06')?.weight === 90.4);

    const after = getBodyStats().find(e => e.date === '2026-08-06')!;
    expect(after.id).toBe(before.id);
    expect(after.sourceFingerprint).toBe(before.sourceFingerprint);
    expect(after.skeletalMuscleMassKg).toBe(42.3);
    expect(after.segmentalLean).toEqual(before.segmentalLean);
    expect(after.segmentalFat).toEqual(before.segmentalFat);
    expect(after.recommendedCalorieIntakeKcal).toBe(2879);

    root.unmount();
    container.remove();
  });
});
