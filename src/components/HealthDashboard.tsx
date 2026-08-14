import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Activity, BatteryCharging, Footprints, HeartPulse, Moon, Wind } from 'lucide-react';
import { getHealthMetrics, lastSyncLabel, type DayHealth } from '../utils/health';

type Metric = { label: string; key: keyof DayHealth; unit?: string; digits?: number };
type Group = { title: string; icon: typeof Activity; metrics: Metric[] };

const GROUPS: Group[] = [
  { title: 'Movement & energy', icon: Footprints, metrics: [
    { label: 'Steps', key: 'steps' }, { label: 'Step goal', key: 'stepGoal' },
    { label: 'Distance', key: 'distanceKm', unit: 'km', digits: 3 },
    { label: 'Total calories', key: 'totalCalories', unit: 'kcal' },
    { label: 'Active calories', key: 'activeCalories', unit: 'kcal' },
    { label: 'BMR calories', key: 'bmrCalories', unit: 'kcal' },
    { label: 'Intensity minutes', key: 'moderateIntensityMinutes', unit: 'moderate' },
    { label: 'Vigorous minutes', key: 'vigorousIntensityMinutes', unit: 'vigorous' },
    { label: 'Floors ascended', key: 'floorsAscended' },
    { label: 'Active time', key: 'activeHours', unit: 'h', digits: 2 },
    { label: 'Sedentary time', key: 'sedentaryHours', unit: 'h', digits: 2 },
  ]},
  { title: 'Sleep', icon: Moon, metrics: [
    { label: 'Sleep duration', key: 'sleepHours', unit: 'h', digits: 2 },
    { label: 'Sleep score', key: 'sleepScore' },
    { label: 'Deep sleep', key: 'deepSleepHours', unit: 'h', digits: 2 },
    { label: 'Light sleep', key: 'lightSleepHours', unit: 'h', digits: 2 },
    { label: 'REM sleep', key: 'remSleepHours', unit: 'h', digits: 2 },
    { label: 'Awake time', key: 'awakeSleepHours', unit: 'h', digits: 2 },
    { label: 'Sleep stress', key: 'averageSleepStress' },
  ]},
  { title: 'Heart & recovery', icon: HeartPulse, metrics: [
    { label: 'Resting heart rate', key: 'rhr', unit: 'bpm' },
    { label: 'Minimum heart rate', key: 'minHeartRate', unit: 'bpm' },
    { label: 'Maximum heart rate', key: 'maxHeartRate', unit: 'bpm' },
    { label: 'HRV', key: 'hrv', unit: 'ms' },
    { label: '7-day HRV', key: 'hrvWeeklyAvg', unit: 'ms' },
    { label: 'HRV status', key: 'hrvStatus' },
    { label: 'Average stress', key: 'averageStress' },
    { label: 'Stress status', key: 'stressQualifier' },
  ]},
  { title: 'Body Battery', icon: BatteryCharging, metrics: [
    { label: 'At wake', key: 'bodyBatteryWake' }, { label: 'Highest', key: 'bodyBatteryHigh' },
    { label: 'Lowest', key: 'bodyBatteryLow' }, { label: 'Latest', key: 'bodyBatteryLatest' },
    { label: 'Charged', key: 'bodyBatteryCharged' }, { label: 'Drained', key: 'bodyBatteryDrained' },
  ]},
  { title: 'Oxygen & respiration', icon: Wind, metrics: [
    { label: 'Average SpO₂', key: 'averageSpo2', unit: '%' },
    { label: 'Lowest SpO₂', key: 'lowestSpo2', unit: '%' },
    { label: 'Average respiration', key: 'averageRespiration', unit: 'brpm', digits: 1 },
  ]},
];

const valueText = (day: DayHealth, metric: Metric): string => {
  const value = day[metric.key];
  if (value === undefined || value === null || value === '') return '—';
  const shown = typeof value === 'number'
    ? value.toLocaleString('en-US', metric.digits === undefined ? {} : { minimumFractionDigits: metric.digits, maximumFractionDigits: metric.digits })
    : String(value);
  if (!metric.unit) return shown;
  return metric.unit === '%' ? `${shown}%` : `${shown} ${metric.unit}`;
};

const HealthDashboard = () => {
  const health = getHealthMetrics();
  const [visibleDays, setVisibleDays] = useState(60);
  const ordered = useMemo(() => Object.entries(health.days).sort(([a], [b]) => b.localeCompare(a)), [health.days]);
  const visibleHistory = ordered.slice(0, visibleDays);
  const [latestDate, latest = {}] = ordered[0] ?? [];

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold">Garmin Health</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {latestDate ? `Latest data: ${format(parseISO(latestDate), 'd MMMM yyyy')}` : 'No Garmin data available'} · synced {lastSyncLabel(health)}
            </p>
          </div>
        </div>
      </section>

      {latestDate && (
        <div className="grid gap-4 md:grid-cols-2">
          {GROUPS.map(({ title, icon: Icon, metrics }) => (
            <section className="card p-5" key={title}>
              <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><Icon className="w-5 h-5 text-primary-600" />{title}</h2>
              <div className="grid grid-cols-2 gap-3">
                {metrics.map((metric) => (
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3" key={metric.key}>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</div>
                    <div className="font-semibold mt-1">{valueText(latest, metric)}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold text-lg mb-3">Activities ({health.activities?.length ?? 0})</h2>
          <div className="space-y-2 text-sm">
            {(health.activities ?? []).slice(0, 8).map((activity, index) => (
              <div key={String(activity.startTimeLocal ?? `${activity.activityName ?? 'activity'}-${index}`)} className="flex justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                <span>{String(activity.activityName ?? activity.activityType ?? 'Garmin activity')}</span>
                <span className="text-gray-500">{String(activity.startTimeLocal ?? '')}</span>
              </div>
            ))}
            {!health.activities?.length && <p className="text-gray-500">No Garmin activities in this range.</p>}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-bold text-lg mb-3">Fitness & body composition</h2>
          <p className="text-sm"><span className="font-medium">Fitness age:</span> {String(((health.fitness?.fitnessAge as Record<string, unknown> | undefined)?.fitnessAge) ?? '—')}</p>
          <p className="text-sm mt-2"><span className="font-medium">Body-composition records:</span> {health.bodyComposition?.records?.length ?? 0}</p>
        </section>
      </div>

      {latestDate && (
        <details className="card p-5">
          <summary className="font-bold text-lg cursor-pointer">Garmin source detail</summary>
          <p className="text-xs text-gray-500 mt-2">Sanitized Garmin statistics, aggregate lists, events and source timestamps for {latestDate}. Account/device identifiers, location data and high-frequency sample arrays are removed.</p>
          <pre className="mt-3 max-h-96 overflow-auto text-xs bg-gray-950 text-gray-100 rounded-lg p-3">{JSON.stringify(latest.garminDetails ?? {}, null, 2)}</pre>
        </details>
      )}

      <section className="card p-5 overflow-x-auto">
        <h2 className="font-bold text-lg mb-4">Daily Garmin history</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b border-gray-200 dark:border-gray-700">
            {['Date','Steps','Distance','Sleep','Score','RHR','HRV','Stress','Body Battery','SpO₂'].map(h => <th className="p-2" key={h}>{h}</th>)}
          </tr></thead>
          <tbody>{visibleHistory.map(([date, day]) => (
            <tr className="border-b border-gray-100 dark:border-gray-800" key={date}>
              <td className="p-2 whitespace-nowrap">
                <details>
                  <summary className="cursor-pointer">{date}</summary>
                  <pre className="mt-2 max-h-80 min-w-96 overflow-auto whitespace-pre-wrap text-xs bg-gray-950 text-gray-100 rounded p-2">{JSON.stringify(day, null, 2)}</pre>
                </details>
              </td><td className="p-2">{valueText(day,{label:'',key:'steps'})}</td>
              <td className="p-2">{valueText(day,{label:'',key:'distanceKm',unit:'km',digits:3})}</td>
              <td className="p-2">{valueText(day,{label:'',key:'sleepHours',unit:'h',digits:2})}</td>
              <td className="p-2">{valueText(day,{label:'',key:'sleepScore'})}</td><td className="p-2">{valueText(day,{label:'',key:'rhr',unit:'bpm'})}</td>
              <td className="p-2">{valueText(day,{label:'',key:'hrv',unit:'ms'})}</td><td className="p-2">{valueText(day,{label:'',key:'averageStress'})}</td>
              <td className="p-2">{valueText(day,{label:'',key:'bodyBatteryWake'})}</td><td className="p-2">{valueText(day,{label:'',key:'averageSpo2',unit:'%'})}</td>
            </tr>
          ))}</tbody>
        </table>
        {visibleDays < ordered.length && (
          <button className="btn-secondary mt-4" onClick={() => setVisibleDays((count) => count + 60)}>
            Load older health days
          </button>
        )}
      </section>
    </div>
  );
};

export default HealthDashboard;
