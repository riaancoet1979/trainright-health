import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, PlusCircle, BarChart3, Settings as SettingsIcon, Dumbbell, Activity } from 'lucide-react';
import Calendar from './components/Calendar';
import DailySummary from './components/DailySummary';
import FoodEntry from './components/FoodEntry';
import ExerciseEntry from './components/ExerciseEntry';
import Settings from './components/Settings';
import Analytics from './components/Analytics';
import Fitness from './components/Fitness';
import Train from './components/Train';
import ProgramSettings from './components/ProgramSettings';
import { CoachWeekly } from './components/Coach';
import { getDailyEntry } from './utils/storage';
import type { DailyEntry } from './types';
import usePushupReminders from './hooks/usePushupReminders';
import { fetchGarminFile } from './utils/health';

type View = 'calendar' | 'train' | 'add' | 'analytics' | 'settings' | 'fitness';

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
          <div>
            <CoachWeekly />
            <Analytics />
          </div>
        )}
        {view === 'fitness' && <Fitness selectedDate={selectedDate} onUpdate={refreshDailyEntry} />}

        {view === 'settings' && (
          <div>
            <ProgramSettings onSaved={refreshDailyEntry} />
            <Settings onSettingsSaved={refreshDailyEntry} />
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-inset-bottom">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-6 gap-1">
            <button
              onClick={() => setView('calendar')}
              className={`flex flex-col items-center py-3 px-2 transition-colors ${
                view === 'calendar'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <CalendarIcon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Calendar</span>
            </button>

            <button
              onClick={() => setView('train')}
              className={`flex flex-col items-center py-3 px-2 transition-colors ${
                view === 'train'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <Dumbbell className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Train</span>
            </button>

            <button
              onClick={() => setView('add')}
              className={`flex flex-col items-center py-3 px-2 transition-colors ${
                view === 'add'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <PlusCircle className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Add</span>
            </button>

            <button
              onClick={() => setView('analytics')}
              className={`flex flex-col items-center py-3 px-2 transition-colors ${
                view === 'analytics'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <BarChart3 className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Analytics</span>
            </button>

            <button
              onClick={() => setView('fitness')}
              className={`flex flex-col items-center py-3 px-2 transition-colors ${
                view === 'fitness'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <Activity className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Fitness</span>
            </button>

            <button
              onClick={() => setView('settings')}
              className={`flex flex-col items-center py-3 px-2 transition-colors ${
                view === 'settings'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <SettingsIcon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Settings</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default App;
