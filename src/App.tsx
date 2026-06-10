import { useState, useEffect, lazy, Suspense } from 'react';
import { Calendar as CalendarIcon, PlusCircle, BarChart3, Settings as SettingsIcon, Dumbbell, Activity, Scale } from 'lucide-react';
import Calendar from './components/Calendar';
import DailySummary from './components/DailySummary';
import FoodEntry from './components/FoodEntry';
import ExerciseEntry from './components/ExerciseEntry';
import Settings from './components/Settings';
import Fitness from './components/Fitness';
import Train from './components/Train';
import ProgramSettings from './components/ProgramSettings';
import { CoachWeekly } from './components/Coach';

// Lazy-load the two heaviest views so they don't bloat the initial Train-tab
// bundle. Analytics pulls in chart.js + the weekly review surface; BodyStats
// is a 900-line entry/history component the user only opens on weigh-in days.
const Analytics = lazy(() => import('./components/Analytics'));
const BodyStats = lazy(() => import('./components/BodyStats'));

const LazyFallback = () => (
  <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-10">Loading…</div>
);
import { getDailyEntry } from './utils/storage';
import type { DailyEntry } from './types';
import usePushupReminders from './hooks/usePushupReminders';
import { fetchGarminFile } from './utils/health';
import { runMigrations } from './utils/migrations';

// Stamp schema versions for every tracked localStorage store on first boot of
// versioned code. Runs at module init (before React mounts) so the rest of
// the app can rely on the meta blob being present. Idempotent — subsequent
// boots are a no-op.
runMigrations();

type View = 'calendar' | 'train' | 'add' | 'analytics' | 'fitness' | 'body' | 'settings';

interface NavItem {
  key: View;
  /** Long label exposed to screen readers via aria-label. */
  label: string;
  /** Short tab text shown under the icon. */
  short: string;
  icon: typeof CalendarIcon;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'calendar',  label: 'Calendar',  short: 'Cal',      icon: CalendarIcon },
  { key: 'train',     label: 'Train',     short: 'Train',    icon: Dumbbell },
  { key: 'add',       label: 'Add food or exercise', short: 'Add', icon: PlusCircle },
  { key: 'analytics', label: 'Stats',     short: 'Stats',    icon: BarChart3 },
  { key: 'fitness',   label: 'Fitness',   short: 'Fitness',  icon: Activity },
  { key: 'body',      label: 'Body',      short: 'Body',     icon: Scale },
  { key: 'settings',  label: 'Settings',  short: 'Settings', icon: SettingsIcon },
];

function App() {
  const [view, setView] = useState<View>('train');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dailyEntry, setDailyEntry] = useState<DailyEntry>(getDailyEntry(selectedDate));

  useEffect(() => {
    setDailyEntry(getDailyEntry(selectedDate));
  }, [selectedDate]);

  // Auto-absorb Garmin sync file when reachable (written by garmin_sync.py)
  useEffect(() => {
    fetchGarminFile().then((n) => {
      if (n !== null) setDailyEntry(getDailyEntry(selectedDate));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshDailyEntry = () => {
    setDailyEntry(getDailyEntry(selectedDate));
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setView('calendar');
  };

  // Start reminders scheduler
  usePushupReminders();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* Reminders scheduler running in background */}
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            TrainRight Health
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {view === 'calendar' && (
          <div className="space-y-6">
            <Calendar onDateSelect={handleDateSelect} selectedDate={selectedDate} />
            <DailySummary
              selectedDate={selectedDate}
              dailyEntry={dailyEntry}
              onUpdate={refreshDailyEntry}
            />
          </div>
        )}

        {view === 'add' && (
          <div className="space-y-6">
            <FoodEntry selectedDate={selectedDate} onEntryAdded={refreshDailyEntry} />
            <ExerciseEntry selectedDate={selectedDate} onEntryAdded={refreshDailyEntry} />
          </div>
        )}

        {view === 'train' && <Train selectedDate={selectedDate} onUpdate={refreshDailyEntry} />}
        {view === 'analytics' && (
          <Suspense fallback={<LazyFallback />}>
            <div>
              <CoachWeekly />
              <Analytics />
            </div>
          </Suspense>
        )}
        {view === 'fitness' && <Fitness selectedDate={selectedDate} onUpdate={refreshDailyEntry} />}
        {view === 'body' && (
          <Suspense fallback={<LazyFallback />}>
            <BodyStats />
          </Suspense>
        )}

        {view === 'settings' && (
          <div>
            <ProgramSettings onSaved={refreshDailyEntry} />
            <Settings onSettingsSaved={refreshDailyEntry} />
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-inset-bottom">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-7 gap-0">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isCurrent = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  aria-label={item.label}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`flex flex-col items-center py-2.5 px-1 min-h-[44px] transition-colors ${
                    isCurrent
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-0.5" aria-hidden />
                  <span className="text-xs font-medium">{item.short}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

export default App;
