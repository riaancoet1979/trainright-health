import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { mergeGarminData } from '../utils/health';
import HealthDashboard from '../components/HealthDashboard';

beforeEach(() => localStorage.clear());

describe('HealthDashboard', () => {
  it('shows all Garmin metric groups and their latest values', async () => {
    mergeGarminData({
      source: 'garmin_connect',
      syncedAt: '2026-08-14T06:00:00+02:00',
      days: {
        '2026-08-13': {
          steps: 9829, distanceKm: 8.813, totalCalories: 3082,
          activeCalories: 1019, sleepHours: 8.63, sleepScore: 82,
          rhr: 59, hrv: 47, averageStress: 24, bodyBatteryWake: 77,
          averageSpo2: 96, averageRespiration: 13.5,
          moderateIntensityMinutes: 12, vigorousIntensityMinutes: 18,
          garminDetails: { hydration: { valueInML: 1800, goalInML: 2500 } },
        },
      },
      activities: [{ activityType: 'strength_training', startTimeLocal: '2026-08-13 15:00:00' }],
      fitness: { fitnessAge: { fitnessAge: 44 } },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<HealthDashboard />);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const text = container.textContent ?? '';
    for (const expected of [
      'Garmin Health', '9,829', '8.813 km', '3,082 kcal', '1,019 kcal',
      '8.63 h', 'Sleep score', '59 bpm', '47 ms', 'Body Battery',
      '96%', '13.5 brpm', 'Intensity minutes', 'Garmin source detail',
      'strength_training', 'Fitness age',
    ]) expect(text).toContain(expected);
    root.unmount();
    container.remove();
  });

  it('paginates older normalized health days instead of rendering an unbounded table', async () => {
    const days: Record<string, { steps: number }> = {};
    for (let offset = 0; offset < 61; offset++) {
      const day = new Date('2026-08-14T00:00:00Z');
      day.setUTCDate(day.getUTCDate() - offset);
      days[day.toISOString().slice(0, 10)] = { steps: 1000 + offset };
    }
    mergeGarminData({ source: 'garmin_connect', days });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<HealthDashboard />);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(container.textContent).toContain('Load older health days');
    root.unmount();
    container.remove();
  });
});
