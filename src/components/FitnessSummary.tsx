import { format } from 'date-fns';
import { PlusCircle, ArrowUpRight } from 'lucide-react';
import type { DailyEntry } from '../types';
import { addPushupSet, setSteps, addSteps, getDailyEntry } from '../utils/storage';

interface Props {
  selectedDate: Date;
  onUpdate: () => void;
}

const FitnessSummary = ({ selectedDate, onUpdate }: Props) => {
  const entry: DailyEntry = getDailyEntry(selectedDate);
  const pushups = entry.fitness?.pushups;
  const steps = entry.fitness?.steps;

  const pushupsCount = pushups?.setsCompleted || 0;
  const pushupsReps = pushups?.totalReps || 0;
  const stepsCount = steps?.steps || 0;
  const stepGoal = steps?.goal || 10000;

  const pushupMet = pushupsReps >= 100 || pushupsCount >= 5;
  const stepsMet = stepsCount >= stepGoal;

  const statusClass = () => {
    if (pushupMet && stepsMet) return 'bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800';
    if ((pushupRepsOrClose(pushupsReps) || stepsClose(stepsCount, stepGoal))) return 'bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800';
    return 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800';
  };

  function pushupRepsOrClose(reps: number) {
    return reps >= 80; // close or better
  }

  function stepsClose(val: number, goal: number) {
    return val >= Math.floor(goal * 0.8);
  }

  const handleAddSet = () => {
    addPushupSet(selectedDate, 20);
    onUpdate();
  };

  const handleLogSteps = () => {
    const raw = prompt('Enter steps (e.g., 5000 to set total, or +500 to add):', String(stepsCount));
    if (!raw) return;
    const trimmed = raw.trim();
    if (trimmed.startsWith('+')) {
      const amt = parseInt(trimmed.substring(1)) || 0;
      if (amt > 0) addSteps(selectedDate, amt);
    } else {
      const amt = parseInt(trimmed) || 0;
      if (amt >= 0) setSteps(selectedDate, amt);
    }
    onUpdate();
  };

  return (
    <div className={`p-4 rounded-lg ${statusClass()}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{format(selectedDate, 'EEEE, MMM d')}</div>
          <div className="font-semibold mt-1">Pushups: {pushupsCount}/5 • Steps: {stepsCount.toLocaleString()}</div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleAddSet} className="btn-secondary px-3 py-2 flex items-center gap-2">
            <PlusCircle className="w-4 h-4" /> Add Set
          </button>
          <button onClick={handleLogSteps} className="btn-primary px-3 py-2 flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4" /> Log Steps
          </button>
        </div>
      </div>
    </div>
  );
};

export default FitnessSummary;
