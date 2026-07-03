import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import SmartSuggestions from '../components/SmartSuggestions';
import type { DailyEntry } from '../types';
import type { MacroTargets } from '../types/training';

const flush = () => new Promise<void>((r) => setTimeout(r, 60));

const targets: MacroTargets = {
  dailyCalories: 2400,
  dailyProtein: 180,
  dailyCarbs: 220,
  dailyFats: 70,
};

const entry: DailyEntry = {
  date: '2026-07-03',
  foodEntries: [],
  exercises: [],
  totalCalories: 1000,
  totalProtein: 100,
  totalCarbs: 90,
  totalFats: 30,
  totalExerciseCalories: 0,
  netCalories: 1000,
};

class Boundary extends React.Component<
  { onError: (e: Error) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

describe('SmartSuggestions → Plan remaining meals', () => {
  it('does not crash (hook-count stable) when toggling into plan mode', async () => {
    localStorage.clear();
    let caught: Error | null = null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    // Render, then click the "Plan remaining meals" tab — this is the exact
    // interaction that used to blank the screen via a Rules-of-Hooks violation.
    await act(async () => {
      root.render(
        React.createElement(
          Boundary,
          { onError: (e: Error) => (caught = e) },
          React.createElement(SmartSuggestions, {
            dailyEntry: entry,
            onQuickAdd: () => {},
            selectedDate: new Date('2026-07-03T12:00:00'),
            targets,
            onUpdate: () => {},
          }),
        ),
      );
    });

    const planBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Plan remaining meals'),
    );
    expect(planBtn).toBeTruthy();

    await act(async () => {
      planBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    try { root.unmount(); } catch {}
    container.remove();
    if (caught) throw caught;
    expect(container.textContent).not.toContain('Goals Met'); // sanity: we left suggest mode
  });
});
