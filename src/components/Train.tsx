import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Dumbbell, CheckCircle2, Circle, AlertTriangle, Scale, Play } from 'lucide-react';
import type { Readiness } from '../types/training';
import {
  getSessionForDate, getSessionLog, updateSessionLog, adjustForReadiness,
  getLastExerciseLog, setProgramStartDate, getTrainingData, addBodyMetric,
  latestBodyweight, getTargetsForDate, dateKey,
} from '../utils/training';
import { WARMUP, TREADMILL_NOTE, PROGRAM_NAME } from '../data/program';
import { suggestReadiness } from '../utils/health';
import useRestTimer from '../hooks/useRestTimer';
import { CoachDaily } from './Coach';
import { getUserSettings } from '../utils/storage';

interface TrainProps {
  selectedDate: Date;
  onUpdate: () => void;
}

const READINESS_INFO: Record<Readiness, { label: string; desc: string; cls: string }> = {
  green: { label: 'GREEN', desc: 'Full session as written', cls: 'bg-green-600' },
  yellow: { label: 'YELLOW', desc: 'Reduced volume, accessories dropped', cls: 'bg-yellow-500' },
  red: { label: 'RED', desc: 'Rest / gentle mobility only', cls: 'bg-red-600' },
};

const Train = ({ selectedDate, onUpdate }: TrainProps) => {
  const [, setTick] = useState(0);
  const refresh = useCallback(() => { setTick((t) => t + 1); onUpdate(); }, [onUpdate]);
  const restTimer = useRestTimer(getUserSettings().restTimerSeconds ?? 120);

  const data = getTrainingData();
  const session = getSessionForDate(selectedDate);
  const log = getSessionLog(selectedDate);
  const key = dateKey(selectedDate);

  const readiness: Readiness = log?.readiness ?? 'green';
  const shoulderPain = log?.shoulderPain ?? 0;

  const [bwInput, setBwInput] = useState('');
  const [startInput, setStartInput] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => { setBwInput(''); }, [key]);

  // ── No program started yet ──
  if (!data.programStartDate) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
        <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
          <Dumbbell className="w-6 h-6" /> {PROGRAM_NAME}
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          16-week calisthenics-hybrid program. 4 days/week (Mon, Tue, Thu, Sat).
          Week 1 is an assessment week — everything submaximal. Pick your start
          date (it snaps to that week's Monday).
        </p>
        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            className="border rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white dark:border-gray-600"
          />
          <button
            onClick={() => { setProgramStartDate(startInput); refresh(); }}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
          >
            <Play className="w-4 h-4" /> Start program
          </button>
        </div>
      </div>
    );
  }

  const setReadiness = (r: Readiness) => {
    updateSessionLog(selectedDate, (l) => { l.readiness = r; });
    refresh();
  };
  const setPain = (p: number) => {
    updateSessionLog(selectedDate, (l) => { l.shoulderPain = p; });
    refresh();
  };

  const targets = getTargetsForDate(selectedDate);
  const bw = latestBodyweight();

  // ── Rest day ──
  if (!session) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            {format(selectedDate, 'EEEE d MMM')} — Rest day
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            No session scheduled. Walk, mobility, and hit the rest-day targets below.
          </p>
          <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 font-medium">
            Rest-day nutrition: {targets.dailyCalories} kcal · P {targets.dailyProtein}g ·
            C {targets.dailyCarbs}g · F {targets.dailyFats}g
          </div>
        </div>
        <BodyweightCard bw={bw} bwInput={bwInput} setBwInput={setBwInput} date={key} onSaved={refresh} />
      </div>
    );
  }

  const adjusted = adjustForReadiness(session.day.exercises, readiness, shoulderPain);
  const active = adjusted.filter((e) => !e.skipped);
  const skipped = adjusted.filter((e) => e.skipped);

  const exLog = (exId: string) => log?.exercises[exId];

  const updateSet = (exId: string, setIdx: number, field: 'weight' | 'reps', value: string) => {
    updateSessionLog(selectedDate, (l) => {
      if (!l.exercises[exId]) l.exercises[exId] = { sets: [] };
      const sets = l.exercises[exId].sets;
      while (sets.length <= setIdx) sets.push({ weight: '', reps: '', done: false });
      sets[setIdx][field] = value;
    });
    refresh();
  };

  const toggleDone = (exId: string, setIdx: number) => {
    let nowDone = false;
    updateSessionLog(selectedDate, (l) => {
      if (!l.exercises[exId]) l.exercises[exId] = { sets: [] };
      const sets = l.exercises[exId].sets;
      while (sets.length <= setIdx) sets.push({ weight: '', reps: '', done: false });
      sets[setIdx].done = !sets[setIdx].done;
      nowDone = sets[setIdx].done;
    });
    if (nowDone) restTimer.start();
    refresh();
  };

  const toggleComplete = () => {
    updateSessionLog(selectedDate, (l) => { l.completed = !l.completed; });
    refresh();
  };

  const saveNotes = (notes: string) => {
    updateSessionLog(selectedDate, (l) => { l.notes = notes; });
  };

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-primary-600 dark:text-primary-400 font-semibold">
              Week {session.weekNum}{session.isPastProgram ? ' (program complete — repeat Phase 4)' : ''} · {session.phaseLabel}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {format(selectedDate, 'EEE d MMM')} — {session.day.label}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{session.day.goal}</p>
          </div>
          <button
            onClick={toggleComplete}
            className={`px-4 py-2 rounded-lg font-semibold text-sm ${log?.completed ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
          >
            {log?.completed ? '✓ Completed' : 'Mark complete'}
          </button>
        </div>

        {/* Readiness */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Readiness today</div>
          {(() => {
            const sug = suggestReadiness(selectedDate);
            if (!sug) return null;
            const cls = sug.suggestion === 'green' ? 'text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300'
              : sug.suggestion === 'yellow' ? 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-300'
              : 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300';
            return (
              <div className={`text-xs rounded-lg px-3 py-2 mb-2 ${cls}`}>
                <strong>Garmin suggests {sug.suggestion.toUpperCase()}:</strong> {sug.reasons.join(' · ')}
                {sug.hrv !== undefined ? ` · HRV ${sug.hrv}ms` : ''} — your call, tap below.
              </div>
            );
          })()}
          <div className="flex gap-2">
            {(Object.keys(READINESS_INFO) as Readiness[]).map((r) => (
              <button
                key={r}
                onClick={() => setReadiness(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold text-white transition-opacity ${READINESS_INFO[r].cls} ${readiness === r ? 'opacity-100 ring-2 ring-offset-1 ring-gray-400' : 'opacity-40'}`}
              >
                {READINESS_INFO[r].label}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{READINESS_INFO[readiness].desc}</div>
        </div>

        {/* Shoulder pain */}
        <div className="mt-3">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Left shoulder pain today: <span className={shoulderPain > 2 ? 'text-red-600' : 'text-green-600'}>{shoulderPain}/10</span>
          </div>
          <input
            type="range" min={0} max={10} value={shoulderPain}
            onChange={(e) => setPain(Number(e.target.value))}
            className="w-full max-w-xs"
          />
          {shoulderPain > 2 && (
            <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Pain-only exercises auto-removed today. If this persists, see a physio.
            </div>
          )}
        </div>

        {/* Nutrition strip */}
        <div className="mt-4 text-sm bg-primary-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 font-medium">
          Training-day nutrition: {targets.dailyCalories} kcal · P {targets.dailyProtein}g · C {targets.dailyCarbs}g · F {targets.dailyFats}g · Water 2.5–3 L
        </div>
      </div>

      <CoachDaily date={selectedDate} />

      {/* Warm-up */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
        <h3 className="font-bold text-gray-900 dark:text-white mb-2">Warm-up</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{TREADMILL_NOTE}</p>
        <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc ml-5 space-y-0.5">
          {WARMUP.map((w) => <li key={w}>{w}</li>)}
        </ul>
      </div>

      {/* Rest timer */}
      {restTimer.running && (
        <div className="fixed bottom-24 right-4 bg-primary-600 text-white rounded-full px-5 py-3 shadow-lg font-bold text-lg z-20">
          Rest {Math.floor(restTimer.secondsLeft / 60)}:{String(restTimer.secondsLeft % 60).padStart(2, '0')}
        </div>
      )}

      {/* Exercises */}
      {readiness === 'red' ? (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-5 text-red-800 dark:text-red-200">
          <strong>RED day.</strong> No hard training. Walk, stretch, sleep, eat protein.
          If symptoms include chest pain, dizziness or unusual breathlessness — get medical help, not a workout.
        </div>
      ) : (
        active.map((ex) => {
          const elog = exLog(ex.id);
          const last = getLastExerciseLog(ex.id, selectedDate);
          return (
            <div key={ex.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
              <div className="flex justify-between items-start flex-wrap gap-1">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">
                    {ex.name}
                    {ex.painFreeOnly && <span className="ml-2 text-xs font-semibold text-amber-600">pain-free only</span>}
                    {ex.leftFocus && <span className="ml-2 text-xs font-semibold text-blue-500">left focus</span>}
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {ex.adjustedSets} × {ex.repsSpec.replace(/^×\s*/, '')}{ex.adjustedSets !== ex.sets ? ' (reduced — yellow)' : ''} · {ex.equipment} · rest {ex.rest}{ex.rir ? ` · RIR ${ex.rir}` : ''}
                  </div>
                  {ex.cues && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{ex.cues}</div>}
                  {(ex.regression || ex.progression) && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {ex.regression ? `↓ ${ex.regression}` : ''}{ex.regression && ex.progression ? ' · ' : ''}{ex.progression ? `↑ ${ex.progression}` : ''}
                    </div>
                  )}
                </div>
                {last && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
                    Last ({last.date}):<br />
                    {last.sets.filter((s) => s.done).map((s) => `${s.weight || 'BW'}×${s.reps}`).join(', ')}
                  </div>
                )}
              </div>

              {/* Set rows */}
              <div className="mt-3 space-y-1.5">
                {Array.from({ length: ex.adjustedSets }).map((_, i) => {
                  const s = elog?.sets[i];
                  const lastSet = last?.sets[i];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-10 text-xs text-gray-500 dark:text-gray-400">Set {i + 1}</span>
                      <input
                        className="w-24 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder={lastSet?.weight || (ex.timed ? '—' : 'kg / band')}
                        value={s?.weight ?? ''}
                        onChange={(e) => updateSet(ex.id, i, 'weight', e.target.value)}
                      />
                      <input
                        className="w-20 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder={lastSet?.reps || (ex.timed ? 'sec' : 'reps')}
                        value={s?.reps ?? ''}
                        onChange={(e) => updateSet(ex.id, i, 'reps', e.target.value)}
                      />
                      <button onClick={() => toggleDone(ex.id, i)} aria-label="toggle set done">
                        {s?.done
                          ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                          : <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Skipped exercises */}
      {skipped.length > 0 && readiness !== 'red' && (
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 text-sm text-gray-500 dark:text-gray-400">
          <strong className="text-gray-600 dark:text-gray-300">Removed today:</strong>
          <ul className="list-disc ml-5 mt-1">
            {skipped.map((ex) => <li key={ex.id}>{ex.name} — {ex.skipReason}</li>)}
          </ul>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
        <h3 className="font-bold text-gray-900 dark:text-white mb-2">Session notes</h3>
        <textarea
          defaultValue={log?.notes ?? ''}
          onBlur={(e) => { saveNotes(e.target.value); refresh(); }}
          placeholder="How did it feel? Shoulder OK? Any PRs?"
          className="w-full border rounded-lg px-3 py-2 text-sm min-h-[70px] dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
      </div>

      <BodyweightCard bw={bw} bwInput={bwInput} setBwInput={setBwInput} date={key} onSaved={refresh} />
    </div>
  );
};

interface BwProps {
  bw: { date: string; weight: number | '' } | null;
  bwInput: string;
  setBwInput: (v: string) => void;
  date: string;
  onSaved: () => void;
}

const BodyweightCard = ({ bw, bwInput, setBwInput, date, onSaved }: BwProps) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
    <h3 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
      <Scale className="w-5 h-5" /> Bodyweight
      {bw && <span className="text-sm font-normal text-gray-500 dark:text-gray-400">last: {bw.weight} kg ({bw.date})</span>}
    </h3>
    <div className="flex gap-2">
      <input
        type="number" step="0.1" placeholder="kg"
        value={bwInput}
        onChange={(e) => setBwInput(e.target.value)}
        className="w-28 border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
      />
      <button
        onClick={() => {
          const v = parseFloat(bwInput);
          if (!Number.isNaN(v) && v > 0) {
            addBodyMetric({ date, weight: v });
            setBwInput('');
            onSaved();
          }
        }}
        className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
      >
        Log
      </button>
    </div>
    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Weekly trend matters, not the daily number.</p>
  </div>
);

export default Train;
