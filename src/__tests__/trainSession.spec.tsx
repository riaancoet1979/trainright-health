import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import Train from '../components/Train';
import { setProgramStartDate, getSessionLog, updateSessionLog } from '../utils/training';

/**
 * Renders the Train tab against the real programme data. These cover the
 * three things Garage Block 16 needs that the previous build could not do:
 * a per-set RIR field, a per-exercise note that actually persists, and a
 * rest timer driven by each exercise's own prescription.
 */

let container: HTMLDivElement;
let root: Root;

const mount = (date: Date) => {
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(Train, { selectedDate: date, onUpdate: () => {} }));
  });
};

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { root?.unmount(); });
  container.remove();
});

// 2026-06-08 is a Monday → Push day in week 1.
const MONDAY = new Date('2026-06-08T09:00:00');

describe('Train tab — Garage Block 16', () => {
  it('renders the Push session with its exercises', () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    const text = container.textContent ?? '';
    expect(text).toContain('Push');
    expect(text).toContain('Barbell Bench Press');
    expect(text).toContain('Barbell Overhead Press');
    expect(text).not.toContain('Dip');
  });

  it('shows the prescribed rest and RIR for each exercise', () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    const text = container.textContent ?? '';
    expect(text).toContain('rest 2–3 min');
    expect(text).toContain('RIR 2–3');
  });

  it('gives every prescribed set a weight, reps AND RIR field', () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    // Bench is 4 sets in Block A.
    expect(container.querySelector('[aria-label="Set 1 weight"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Set 1 reps"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Set 4 reps in reserve"]')).toBeTruthy();
  });

  it('gives every exercise a note field', () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    const notes = container.querySelectorAll('[aria-label="Exercise notes"]');
    // Push day has 6 exercises in Block A.
    expect(notes.length).toBe(6);
  });

  it('persists a per-exercise note — the field the old build never wrote', async () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    const note = container.querySelector('[aria-label="Exercise notes"]') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value',
    )!.set!;
    act(() => {
      setter.call(note, 'Left side lagging on the last set');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The note autosaves on a short debounce rather than on blur, so that
    // swipe-closing the app mid-sentence cannot lose it. Wait for that.
    await new Promise((r) => setTimeout(r, 900));
    const log = getSessionLog('2026-06-08');
    expect(log?.exercises['bb_bench']?.note).toBe('Left side lagging on the last set');
  });

  it('flushes an unsaved note when the app is backgrounded (pagehide)', async () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    const note = container.querySelector('[aria-label="Exercise notes"]') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value',
    )!.set!;
    act(() => {
      setter.call(note, 'swipe-closed mid-sentence');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Background the app BEFORE the debounce would have fired.
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(getSessionLog('2026-06-08')?.exercises['bb_bench']?.note)
      .toBe('swipe-closed mid-sentence');
  });

  it('persists a per-set RIR value', () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    const rir = container.querySelector('[aria-label="Set 1 reps in reserve"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )!.set!;
    act(() => {
      setter.call(rir, '2');
      rir.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(getSessionLog('2026-06-08')?.exercises['bb_bench']?.sets[0].rir).toBe('2');
  });

  it('renders the programme notes card', () => {
    setProgramStartDate('2026-06-08');
    mount(MONDAY);
    expect(container.textContent).toContain('Programme notes');
  });

  it('shows a rest day on Thursday, not a session', () => {
    setProgramStartDate('2026-06-08');
    mount(new Date('2026-06-11T09:00:00')); // Thu
    expect(container.textContent).toContain('Rest day');
  });

  it('keeps a legacy session log visible after migration to session keys', () => {
    setProgramStartDate('2026-06-08');
    // A log written by the old build, already migrated to 'push'.
    updateSessionLog('2026-06-08', (l) => {
      l.dayKey = 'push';
      l.completed = true;
      l.exercises['bb_bench'] = { sets: [{ weight: '60', reps: '8', done: true }] };
    });
    mount(MONDAY);
    expect(container.textContent).toContain('Completed');
    const w = container.querySelector('[aria-label="Set 1 weight"]') as HTMLInputElement;
    expect(w.value).toBe('60');
  });
});
