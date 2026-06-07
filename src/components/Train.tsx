import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Dumbbell, CheckCircle2, Circle, AlertTriangle, Scale, Play, CalendarDays, RotateCcw } from 'lucide-react';
import type { Readiness, RedFlagState, DayKey } from '../types/training';
import {
  getSessionForDate, getSessionLog, updateSessionLog, adjustForReadiness,
  applyPrerequisites, effectiveReadiness,
  getLastExerciseLog, setProgramStartDate, getTrainingData, addBodyMetric,
  latestBodyweight, getTargetsForDate, dateKey, getDayKeyForDate,
} from '../utils/training';
import { WARMUP, TREADMILL_NOTE, PROGRAM_NAME, PHASES, getPhaseForWeek } from '../data/program';
import { suggestReadiness, lastSyncLabel, isHealthDataStale } from '../utils/health';
import useRestTimer from '../hooks/useRestTimer';
import { CoachDaily } from './Coach';
import RedFlagChecklist from './RedFlagChecklist';
import { getUserSettings } from '../utils/storage';

const BODYWEIGHT_MIN_KG = 20;
const BODYWEIGHT_MAX_KG = 300;

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
  const log = getSessionLog(selectedDate);
  const key = dateKey(selectedDate);

  // Day-key override: when the user picks "train Monday's workout today" we
  // resolve the session using that override instead of the date's natural
  // day-of-week. The override lives on the SessionLog so it persists across
  // refreshes and the weekly coach review counts it as a planned session.
  const naturalDayKey = getDayKeyForDate(selectedDate);
  const dayKeyOverride = log?.dayKeyOverride;
  const session = getSessionForDate(selectedDate, { dayKeyOverride });
  const isOverridden = Boolean(dayKeyOverride) && dayKeyOverride !== naturalDayKey;

  const pickedReadiness: Readiness = log?.readiness ?? 'green';
  const redFlags: RedFlagState | undefined = log?.redFlags;
  // H-02: any unmitigated acute symptom forces RED regardless of picker / Garmin.
  const readiness: Readiness = effectiveReadiness(pickedReadiness, redFlags);
  const shoulderPain = log?.shoulderPain ?? 0;

  const [startInput, setStartInput] = useState(format(new Date(), 'yyyy-MM-dd'));

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
  const setRedFlags = (rf: RedFlagState) => {
    updateSessionLog(selectedDate, (l) => { l.redFlags = rf; });
    refresh();
  };

  /** Pick which day's workout to do today. Setting it to the natural day of
   *  the date clears the override so the schedule "snaps back" by itself. */
  const setDayOverride = (k: DayKey) => {
    updateSessionLog(selectedDate, (l) => {
      if (k === naturalDayKey) {
        delete l.dayKeyOverride;
      } else {
        l.dayKeyOverride = k;
      }
      // Keep the log's denormalised dayKey in sync with what was actually
      // trained — analytics + last-exercise-log queries look at this field.
      l.dayKey = k;
    });
    refresh();
  };
  const clearDayOverride = () => {
    updateSessionLog(selectedDate, (l) => {
      delete l.dayKeyOverride;
      if (naturalDayKey) l.dayKey = naturalDayKey;
    });
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

        {/* Want to train anyway? Let the user pick a workout to do today. */}
        <DayPickerCard
          date={selectedDate}
          currentKey={null}
          naturalKey={naturalDayKey}
          onPick={setDayOverride}
          onReset={null}
          intro="Want to train today instead? Pick a workout — it logs against today's date."
        />

        <BodyweightCard key={key} bw={bw} date={key} onSaved={refresh} />
      </div>
    );
  }

  // H-03: gate exercises by their prerequisite (e.g. strict pull-up needs band
  // pull-up at top of range × 2). gated[] preserves all original entries; any
  // unmet prereq swaps the exercise for its fallback regression and tags
  // `prerequisiteUnmet` so the UI explains why.
  const gated = applyPrerequisites(session.day.exercises, selectedDate);
  const adjusted = adjustForReadiness(gated, readiness, shoulderPain);
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
            const stale = isHealthDataStale();
            const syncLbl = lastSyncLabel();
            if (!sug) {
              return (
                <div className="text-xs rounded-lg px-3 py-2 mb-2 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  No Garmin readiness data for today{syncLbl !== 'never' ? ` · last synced ${syncLbl}` : ''} — pick by feel.
                  {stale && <span className="ml-1 text-amber-700 dark:text-amber-300">Sync may be out of date — run <code>garmin_sync.py</code>.</span>}
                </div>
              );
            }
            const cls = sug.suggestion === 'green' ? 'text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300'
              : sug.suggestion === 'yellow' ? 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-300'
              : 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300';
            return (
              <div className={`text-xs rounded-lg px-3 py-2 mb-2 ${cls}`}>
                <strong>Garmin suggests {sug.suggestion.toUpperCase()}:</strong> {sug.reasons.join(' · ')}
                {sug.hrv !== undefined ? ` · HRV ${sug.hrv}ms` : ''} — your call, tap below.
                <div className="mt-0.5 opacity-80">Last sync: {syncLbl}{stale ? ' — may be stale' : ''}.</div>
              </div>
            );
          })()}
          <div className="flex gap-2">
            {(Object.keys(READINESS_INFO) as Readiness[]).map((r) => {
              const forced = readiness === 'red' && pickedReadiness !== 'red' && r !== 'red';
              return (
                <button
                  key={r}
                  onClick={() => setReadiness(r)}
                  disabled={forced}
                  title={forced ? 'Disabled — symptom check forces RED today' : undefined}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold text-white transition-opacity ${READINESS_INFO[r].cls} ${readiness === r ? 'opacity-100 ring-2 ring-offset-1 ring-gray-400' : 'opacity-40'} ${forced ? 'cursor-not-allowed' : ''}`}
                >
                  {READINESS_INFO[r].label}
                </button>
              );
            })}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {READINESS_INFO[readiness].desc}
            {readiness === 'red' && pickedReadiness !== 'red' && (
              <span className="ml-1 text-red-700 dark:text-red-300">(forced by symptom check)</span>
            )}
          </div>
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

        {/* "Train a different day's workout" override badge — shown only when
            the user has actively overridden the natural schedule. */}
        {isOverridden && (
          <div className="mt-3 text-xs rounded-lg px-3 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
            <span>
              Override active — running <strong>{dayKeyOverride?.toUpperCase()}</strong>'s
              workout. Scheduled today: <strong>{naturalDayKey ? naturalDayKey.toUpperCase() : 'REST'}</strong>.
            </span>
            <button
              onClick={clearDayOverride}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 dark:bg-amber-800/40 hover:bg-amber-200 dark:hover:bg-amber-700/50 font-medium"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        )}
      </div>

      {/* Day-picker card — lets the user swap workouts on a training day too. */}
      <DayPickerCard
        date={selectedDate}
        currentKey={session.day.key}
        naturalKey={naturalDayKey}
        onPick={setDayOverride}
        onReset={isOverridden ? clearDayOverride : null}
        intro="Switch to a different day's workout for today:"
      />

      {/* H-02: acute-symptom screen lives BETWEEN the session header and the
          warm-up so the user must scroll past it. Persists into the session log
          and is read back by effectiveReadiness on every render. */}
      <RedFlagChecklist value={redFlags} onChange={setRedFlags} />

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
                    {'prerequisiteUnmet' in ex && ex.prerequisiteUnmet && (
                      <span className="ml-2 text-xs font-semibold text-amber-600">substitute</span>
                    )}
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {ex.adjustedSets} × {ex.repsSpec.replace(/^×\s*/, '')}{ex.adjustedSets !== ex.sets ? ' (reduced — yellow)' : ''} · {ex.equipment} · rest {ex.rest}{ex.rir ? ` · RIR ${ex.rir}` : ''}
                  </div>
                  {'prerequisiteUnmet' in ex && ex.prerequisiteUnmet && (
                    <div className="text-xs text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Prerequisite not met: {ex.prerequisiteUnmet}.
                    </div>
                  )}
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

      {/* `key={key}` re-mounts the card on date change so its internal input
          state resets without a useEffect (M-02). */}
      <BodyweightCard key={key} bw={bw} date={key} onSaved={refresh} />
    </div>
  );
};

// ─── Day-picker card ──────────────────────────────────────────────────────────
//
// Lets the user override which day's workout to run on a given date. Pulls
// the day list from the resolved phase so labels stay in sync with the
// program data (Phase 1 "baseline" labels differ from Phase 2 etc.).

interface DayPickerProps {
  date: Date;
  /** The day currently being rendered (null = rest day, no override yet). */
  currentKey: DayKey | null;
  /** The date's natural day-of-week key (null = Wed/Fri/Sun rest day). */
  naturalKey: DayKey | null;
  onPick: (k: DayKey) => void;
  /** When non-null, render a "Reset to schedule" link. */
  onReset: (() => void) | null;
  intro: string;
}

const DayPickerCard = ({ date, currentKey, naturalKey, onPick, onReset, intro }: DayPickerProps) => {
  // Resolve which phase's day labels to show. If the date is before program
  // start (no week), fall back to Phase 1 labels so the picker still works.
  const weekNum = getTrainingData().programStartDate
    ? PHASES.find(p => p.weeks.includes(1))?.weeks[0] && undefined // satisfy lint
    : undefined;
  void weekNum;
  // Pick the phase from the natural date when possible.
  let phase = PHASES[0];
  try {
    // Use a runtime week-num lookup via getWeekNum if start is set
    const td = getTrainingData();
    if (td.programStartDate) {
      const dStr = format(date, 'yyyy-MM-dd');
      const s = new Date(td.programStartDate + 'T00:00:00');
      const dow = (s.getDay() + 6) % 7;
      s.setDate(s.getDate() - dow);
      const d = new Date(dStr + 'T00:00:00');
      const diff = Math.floor((d.getTime() - s.getTime()) / 86400000);
      if (diff >= 0) {
        const wk = Math.min(Math.floor(diff / 7) + 1, 16);
        phase = getPhaseForWeek(wk);
      }
    }
  } catch { /* fall back to phase 1 */ }

  const days = phase.days; // [{ key, label, ... }]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Workout for {format(date, 'EEE d MMM')}
        </h3>
        {onReset && (
          <button
            onClick={onReset}
            className="text-xs text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset to schedule
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{intro}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {days.map(d => {
          const isCurrent = d.key === currentKey;
          const isNatural = d.key === naturalKey;
          return (
            <button
              key={d.key}
              onClick={() => onPick(d.key)}
              className={`px-3 py-2 rounded-lg text-left text-xs border transition-colors ${
                isCurrent
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              <div className="font-bold uppercase tracking-wide text-[11px] flex items-center gap-1">
                {d.key}
                {isNatural && (
                  <span className={`text-[9px] font-medium px-1 rounded ${isCurrent ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'}`}>
                    today
                  </span>
                )}
              </div>
              <div className="mt-0.5 leading-tight opacity-90">{d.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface BwProps {
  bw: { date: string; weight: number | '' } | null;
  date: string;
  onSaved: () => void;
}

const BodyweightCard = ({ bw, date, onSaved }: BwProps) => {
  const [bwInput, setBwInput] = useState('');
  const [warning, setWarning] = useState<string | null>(null);

  const handleLog = () => {
    setWarning(null);
    const v = parseFloat(bwInput);
    if (Number.isNaN(v) || v <= 0) {
      setWarning('Enter a positive number in kg.');
      return;
    }
    // L-04: clamp to a sane physiological range to catch typos like "810" vs "81.0"
    if (v < BODYWEIGHT_MIN_KG || v > BODYWEIGHT_MAX_KG) {
      setWarning(`Bodyweight ${v} kg looks like a typo — must be between ${BODYWEIGHT_MIN_KG} and ${BODYWEIGHT_MAX_KG} kg.`);
      return;
    }
    addBodyMetric({ date, weight: v });
    setBwInput('');
    onSaved();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
      <h3 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        <Scale className="w-5 h-5" /> Bodyweight
        {bw && <span className="text-sm font-normal text-gray-500 dark:text-gray-400">last: {bw.weight} kg ({bw.date})</span>}
      </h3>
      <div className="flex gap-2">
        <input
          type="number" step="0.1" placeholder="kg"
          min={BODYWEIGHT_MIN_KG} max={BODYWEIGHT_MAX_KG}
          value={bwInput}
          onChange={(e) => setBwInput(e.target.value)}
          className="w-28 border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
        <button
          onClick={handleLog}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Log
        </button>
      </div>
      {warning && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {warning}
        </p>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Weekly trend matters, not the daily number.</p>
    </div>
  );
};

export default Train;
