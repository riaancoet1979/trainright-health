import { useMemo, useState, useEffect } from 'react';
// ChartJS registration is performed in the main analytics view to avoid duplicate registrations
import { Activity } from 'lucide-react';
import { getAllDailyEntries } from '../utils/storage';
import {
  get7DaySeries,
  weeklyPushupCompletionRate,
  steps7DayAverage,
  getStreaks,
  getPersonalRecords,
} from '../utils/fitness';
import Achievements from './Achievements';

// Chart registration is handled centrally by Analytics to avoid duplicate registration

const FitnessAnalytics = () => {
  const allEntries = getAllDailyEntries();

  const pushupSeries = useMemo(() => get7DaySeries(allEntries, 'pushups'), [allEntries]);
  const stepsSeries = useMemo(() => get7DaySeries(allEntries, 'steps'), [allEntries]);

  const pushupCompletion = useMemo(() => weeklyPushupCompletionRate(allEntries), [allEntries]);
  const stepsAvg = useMemo(() => steps7DayAverage(allEntries), [allEntries]);

  const pushupStreaks = useMemo(() => getStreaks(allEntries, 'pushups', 1), [allEntries]);
  const stepsStreaks = useMemo(() => getStreaks(allEntries, 'steps', 1000), [allEntries]);

  const records = useMemo(() => getPersonalRecords(allEntries), [allEntries]);

  const pushupChartData = {
    labels: pushupSeries.labels,
    datasets: [
      {
        label: 'Pushups (reps)',
        data: pushupSeries.values,
        borderColor: 'rgb(59,130,246)',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const stepsChartData = {
    labels: stepsSeries.labels,
    datasets: [
      {
        label: 'Steps',
        data: stepsSeries.values,
        borderColor: 'rgb(34,197,94)',
        backgroundColor: 'rgba(34,197,94,0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const [LineComp, setLineComp] = useState<any | null>(null);
  useEffect(() => {
    let mounted = true;
    import('react-chartjs-2')
      .then((mod) => {
        if (mounted) setLineComp(mod.Line || null);
      })
      .catch(() => setLineComp(null));
    return () => {
      mounted = false;
    };
  }, []);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
    },
    scales: { y: { beginAtZero: true } },
  };

  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Activity className="w-6 h-6" /> Fitness Analytics
      </h3>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="text-sm text-gray-600">Pushup Completion</div>
          <div className="text-2xl font-bold">{pushupCompletion}%</div>
          <div className="text-xs text-gray-500">(last 7 days)</div>
        </div>

        <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="text-sm text-gray-600">Steps Avg</div>
          <div className="text-2xl font-bold">{stepsAvg}</div>
          <div className="text-xs text-gray-500">steps/day (7d)</div>
        </div>

        <div className="p-4 rounded-lg border bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <div className="text-sm text-gray-600">Pushup Streak</div>
          <div className="text-2xl font-bold">{pushupStreaks.current}</div>
          <div className="text-xs text-gray-500">current / {pushupStreaks.longest} longest</div>
        </div>

        <div className="p-4 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <div className="text-sm text-gray-600">Steps Streak</div>
          <div className="text-2xl font-bold">{stepsStreaks.current}</div>
          <div className="text-xs text-gray-500">current / {stepsStreaks.longest} longest</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="font-semibold mb-2">7-Day Pushups</h4>
            <div className="h-40">
              {LineComp ? <LineComp data={pushupChartData} options={chartOptions} /> : <div className="h-full flex items-center justify-center text-sm text-gray-500">Chart unavailable</div>}
            </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">7-Day Steps</h4>
          <div className="h-40">
            {LineComp ? <LineComp data={stepsChartData} options={chartOptions} /> : <div className="h-full flex items-center justify-center text-sm text-gray-500">Chart unavailable</div>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="p-3 rounded border">
          <div className="text-sm text-gray-600">Best Pushup Day</div>
          <div className="text-lg font-bold">{records.bestPushups.reps} reps</div>
          <div className="text-xs text-gray-500">{records.bestPushups.date || '—'}</div>
        </div>

        <div className="p-3 rounded border">
          <div className="text-sm text-gray-600">Best Steps Day</div>
          <div className="text-lg font-bold">{records.bestSteps.steps} steps</div>
          <div className="text-xs text-gray-500">{records.bestSteps.date || '—'}</div>
        </div>
      </div>

      <Achievements />
    </div>
  );
};

export default FitnessAnalytics;
