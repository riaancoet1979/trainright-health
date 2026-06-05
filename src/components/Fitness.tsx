import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Edit3, Dumbbell } from 'lucide-react';
import useRestTimer from '../hooks/useRestTimer';
import { getUserSettings } from '../utils/storage';
import { addAchievement } from '../utils/storage';
import type { PushupSet } from '../types';
import { getDailyEntry, addPushupSet, deletePushupSet, updatePushupSet, setSteps, getYesterdaySteps } from '../utils/storage';

interface FitnessProps {
  selectedDate: Date;
  onUpdate: () => void;
}

const DAILY_SETS_GOAL = 5;
const DAILY_REPS_GOAL = 100;
const DEFAULT_STEP_GOAL = 5000;

const Fitness = ({ selectedDate, onUpdate }: FitnessProps) => {
  const [customReps, setCustomReps] = useState('20');
  const [editingTimestamp, setEditingTimestamp] = useState<string | null>(null);
  const [editingReps, setEditingReps] = useState('20');
  const [celebrate, setCelebrate] = useState(false);

  // const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Re-read on every render (writes happen via storage; tick forces refresh)
  const [tick, setTick] = useState(0);
  const dailyFitness = useMemo(() => getDailyEntry(selectedDate).fitness, [selectedDate, tick]);
  const bump = () => setTick((t) => t + 1);
  const sets: PushupSet[] = dailyFitness?.pushups?.sets || [];
  const setsCompleted = dailyFitness?.pushups?.setsCompleted || 0;
  const totalReps = dailyFitness?.pushups?.totalReps || 0;
  const currentSteps = dailyFitness?.steps?.steps || 0;
  const stepGoal = dailyFitness?.steps?.goal || DEFAULT_STEP_GOAL;
  const yesterdaySteps = getYesterdaySteps(selectedDate);

  useEffect(() => {
    if (totalReps >= DAILY_REPS_GOAL) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 4000);
      return () => clearTimeout(t);
    }
  }, [totalReps]);

  const handleCompleteSet = () => {
    const before = totalReps;
    addPushupSet(selectedDate, 20);
    bump();
    onUpdate();
    // start rest timer by default
    restTimer.start();
    // haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(50);
    if (before < DAILY_REPS_GOAL && before + 20 >= DAILY_REPS_GOAL) {
      setCelebrate(true);
      // Award a daily achievement for reaching the goal
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      addAchievement({ id: `daily_goal_${dateStr}`, name: 'Daily Pushup Goal', date: new Date().toISOString() });
    }
  };

  const settings = getUserSettings();
  const restTimer = useRestTimer(settings.restTimerSeconds || 120);

  const handleAddCustom = () => {
    const reps = Math.max(1, parseInt(customReps) || 0);
    if (reps <= 0) return;
    addPushupSet(selectedDate, reps);
    setCustomReps('20');
    bump();
    onUpdate();
  };

  // Steps handlers
  const [stepsInput, setStepsInput] = useState(String(currentSteps || '0'));

  useEffect(() => {
    setStepsInput(String(currentSteps || 0));
  }, [currentSteps]);

  const handleSetSteps = () => {
    const v = Math.max(0, parseInt(stepsInput) || 0);
    setSteps(selectedDate, v);
    bump();
    onUpdate();
  };

  const handleQuickSet = (value: number) => {
    setSteps(selectedDate, value);
    onUpdate();
  };

  const handleDelete = (ts: string) => {
    deletePushupSet(selectedDate, ts);
    bump();
    onUpdate();
  };

  const startEdit = (s: PushupSet) => {
    setEditingTimestamp(s.timestamp);
    setEditingReps(String(s.reps));
  };

  const saveEdit = () => {
    if (!editingTimestamp) return;
    const reps = Math.max(0, parseInt(editingReps) || 0);
    updatePushupSet(selectedDate, editingTimestamp, reps);
    setEditingTimestamp(null);
    bump();
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Dumbbell className="w-5 h-5" /> Fitness
        </h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Sets</div>
            <div className="text-2xl font-bold">
              {setsCompleted}/{DAILY_SETS_GOAL} sets
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full mt-2">
              <div
                className="h-3 bg-primary-600 rounded-full"
                style={{ width: `${Math.min(100, (setsCompleted / DAILY_SETS_GOAL) * 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Reps</div>
            <div className="text-2xl font-bold">{totalReps}/{DAILY_REPS_GOAL}</div>
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full mt-2">
              <div
                className="h-3 bg-primary-600 rounded-full"
                style={{ width: `${Math.min(100, (totalReps / DAILY_REPS_GOAL) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {celebrate && (
          <div className="p-3 mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300">
            🎉 **Goal reached!** Great work — you've completed your pushup target for today.
          </div>
        )}

        <div className="mb-4">
          <button
            onClick={handleCompleteSet}
            className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
          >
            COMPLETE SET (20 reps)
          </button>
        </div>

        {restTimer.running && (
          <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Rest Timer</div>
              <div className="text-lg font-medium">{Math.floor(restTimer.secondsLeft / 60)}:{String(restTimer.secondsLeft % 60).padStart(2, '0')}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={restTimer.pause} className="btn-secondary px-3">Pause</button>
              <button onClick={() => restTimer.reset()} className="btn-secondary px-3">Reset</button>
            </div>
          </div>
        )}

        {/* Steps Section */}
        <div className="mb-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="font-semibold mb-3">Steps</h4>

          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">Today</div>
            <div className="font-medium">{currentSteps}/{stepGoal.toLocaleString()}</div>
          </div>

          <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full mb-3 overflow-hidden">
            <div
              className="h-3 bg-primary-600 rounded-full"
              style={{ width: `${Math.min(100, (currentSteps / stepGoal) * 100)}%` }}
            />
          </div>

          <div className="mb-3">
            <div className="flex gap-2 mb-2">
              {[5000, 8000, 10000, 12000, 15000].map((val) => (
                <button
                  key={val}
                  onClick={() => handleQuickSet(val)}
                  className="btn-secondary px-3 py-2 text-sm"
                >
                  {val >= 1000 ? `${val / 1000}K` : val}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                className="input-field"
              />
              <button onClick={handleSetSteps} className="btn-primary px-4">Set</button>
            </div>
          </div>

          <div className="text-sm text-gray-500">Yesterday: {yesterdaySteps.toLocaleString()} steps</div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Add custom set</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={customReps}
              onChange={(e) => setCustomReps(e.target.value)}
              className="input-field"
            />
            <button onClick={handleAddCustom} className="btn-secondary px-4">Add Set</button>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-3">Completed sets</h4>

          {sets.length === 0 && <div className="text-gray-500">No sets recorded yet</div>}

          <ul className="space-y-2">
            {sets
              .slice()
              .reverse()
              .map((s) => (
                <li key={s.timestamp} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div>
                    <div className="font-medium">{s.reps} reps</div>
                    <div className="text-sm text-gray-500">{format(new Date(s.timestamp), 'p, MMM d')}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {editingTimestamp === s.timestamp ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="input-field w-24"
                          value={editingReps}
                          onChange={(e) => setEditingReps(e.target.value)}
                        />
                        <button onClick={saveEdit} className="btn-primary px-3 py-2">Save</button>
                        <button onClick={() => setEditingTimestamp(null)} className="btn-secondary px-3 py-2">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => startEdit(s)} className="text-gray-600 hover:text-gray-900">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(s.timestamp)} className="text-red-600 hover:text-red-800">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Fitness;
