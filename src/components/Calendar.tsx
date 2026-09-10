import { useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, isFuture } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDailyEntry, getUserSettings } from '../utils/storage';

interface CalendarProps {
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
}

const Calendar = ({ onDateSelect, selectedDate }: CalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const userSettings = getUserSettings();

  const getDayStatus = (date: Date): 'met' | 'close' | 'missed' | 'future' | 'no-data' => {
    if (isFuture(date)) {
      return 'future';
    }
    const entry = getDailyEntry(date);

    const hasNutrition = entry.foodEntries.length > 0;
    const pushups = entry.fitness?.pushups;
    const steps = entry.fitness?.steps;
    const hasFitness = (pushups && pushups.sets.length > 0) || (steps && steps.steps > 0);

    if (!hasNutrition && !hasFitness) return 'no-data';

    // Evaluate available metrics
    const statuses: ('met' | 'close' | 'missed')[] = [];

    if (hasNutrition) {
      const calorieProgress = (entry.totalCalories / userSettings.targets.dailyCalories) * 100;
      if (calorieProgress >= 90 && calorieProgress <= 110) statuses.push('met');
      else if (calorieProgress >= 80 && calorieProgress <= 120) statuses.push('close');
      else statuses.push('missed');
    }

    if (pushups && pushups.sets.length > 0) {
      const pct = (pushups.totalReps / 100) * 100;
      if (pct >= 100) statuses.push('met');
      else if (pct >= 80) statuses.push('close');
      else statuses.push('missed');
    }

    if (steps && steps.steps > 0) {
      const pct = (steps.steps / steps.goal) * 100;
      if (pct >= 100) statuses.push('met');
      else if (pct >= 80) statuses.push('close');
      else statuses.push('missed');
    }

    // Combine statuses: if any missed => missed, else if any close => close, else met
    if (statuses.includes('missed')) return 'missed';
    if (statuses.includes('close')) return 'close';
    return 'met';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'met':
        return 'bg-green-500 text-white';
      case 'close':
        return 'bg-yellow-500 text-white';
      case 'missed':
        return 'bg-red-500 text-white';
      case 'future':
        return 'bg-gray-200 dark:bg-gray-700 text-gray-400';
      default:
        return 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600';
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentMonth(addDays(currentMonth, -30))}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-4 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 font-medium"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(addDays(currentMonth, 30))}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 gap-2 mb-2">
        {days.map((day) => (
          <div
            key={day}
            className="text-center font-semibold text-gray-600 dark:text-gray-400 py-2"
          >
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, 'd');
        const cloneDay = day;
        const status = getDayStatus(day);
        const statusColor = getStatusColor(status);
        const entry = getDailyEntry(day);

        days.push(
          <button
            key={day.toString()}
            onClick={() => onDateSelect(cloneDay)}
            disabled={isFuture(day)}
            className={`
              relative p-2 sm:p-3 rounded-lg transition-all aspect-square flex items-center justify-center
              ${statusColor}
              ${!isSameMonth(day, monthStart) ? 'opacity-30' : ''}
              ${isSameDay(day, selectedDate) ? 'ring-2 ring-primary-600 ring-offset-2' : ''}
              ${isToday(day) ? 'font-bold' : ''}
              ${!isFuture(day) ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed'}
            `}
          >
            <span className="text-sm sm:text-base">{formattedDate}</span>
            <div className="absolute left-2 bottom-2 flex gap-1">
              {/* Pushup dot */}
              {(entry?.fitness?.pushups?.sets?.length ?? 0) > 0 && (
                <span
                  title={`Pushups: ${entry?.fitness?.pushups?.totalReps || 0} reps`}
                  className={`w-2 h-2 rounded-full ${getStatusColor(
                    (entry?.fitness?.pushups?.totalReps || 0) >= 100
                      ? 'met'
                      : (entry?.fitness?.pushups?.totalReps || 0) >= 80
                      ? 'close'
                      : 'missed'
                  )}`}
                />
              )}
              {/* Steps dot */}
              {typeof entry?.fitness?.steps?.steps === 'number' && (
                <span
                  title={`Steps: ${entry?.fitness?.steps?.steps || 0}`}
                  className={`w-2 h-2 rounded-full ${getStatusColor(
                    (entry?.fitness?.steps?.steps || 0) >= (entry?.fitness?.steps?.goal || 10000)
                      ? 'met'
                      : (entry?.fitness?.steps?.steps || 0) >= ((entry?.fitness?.steps?.goal || 10000) * 0.8)
                      ? 'close'
                      : 'missed'
                  )}`}
                />
              )}
            </div>
            {isToday(day) && (
              <span className="absolute bottom-1 right-2 w-1 h-1 rounded-full bg-current"></span>
            )}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-2" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return <div className="space-y-2">{rows}</div>;
  };

  const renderLegend = () => {
    return (
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500"></div>
          <span>Target Met</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500"></div>
          <span>Close</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500"></div>
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"></div>
          <span>No Data</span>
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      {renderHeader()}
      {renderDays()}
      {renderCells()}
      {renderLegend()}
    </div>
  );
};

export default Calendar;
