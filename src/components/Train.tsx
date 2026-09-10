import { useState, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Dumbbell, CheckCircle2, Circle, AlertTriangle, Scale, Play, CalendarDays, RotateCcw, X, Sparkles, BookOpen, Timer, ChevronDown } from 'lucide-react';
import type { Readiness, RedFlagState, DayKey } from '../types/training';
import {
  getSessionForDate, getSessionLog, updateSessionLog, adjustForReadiness,
  applyPrerequisites, effectiveReadiness,
  getLastExerciseLog, getLastExerciseNote, setProgramStartDate, getTrainingData, addBodyMetric,
  latestBodyweight, getTargetsForDate, dateKey, getDayKeyForDate,
  getNextRotationDayKey, getSpacingGuards, DAY_KEY_TO_LETTER, getWeekNum,
} from '../utils/training';
import {
  WARMUP, SESSION_NOTE, PROGRAM_NAME, PHASES, getPhaseForWeek,
  PROGRAM_NOTES, WEEKLY_VOLUME, VOLUME_NOTE, SWAPS,
} from '../data/program';
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
      <div className="space-y-4">
        <StalenessBanner />
        <CoachNotesBanner />
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
        <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
          <Dumbbell className="w-6 h-6" /> {PROGRAM_NAME}
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          16-week hypertrophy block. 5 days/week — Push, Pull, Legs, Upper,
          Lower — with every muscle trained twice. Three accumulation blocks
          and three deloads (weeks 6, 12 and 16). Pick your start date; it
          snaps to that week's Monday.
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

  // Rotation suggestion: which session would A->B->C->D order pick next?
  const suggestedNextDayKey = getNextRotationDayKey(selectedDate);

  // ── Rest day ──
  if (!session) {
    return (
      <div className="space-y-4">
        <StalenessBanner />
        <CoachNotesBanner />
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

        {/* Recovery-focused coach card on the rest day — sleep / steps /
            yesterday-protein insights still apply, and the rotation suggestion
            tells the user what's queued up next. */}
        <CoachDaily date={selectedDate} />
        <NextSessionPreviewCard date={selectedDate} dayKey={suggestedNextDayKey} />

        {/* Want to train anyway? Let the user pick a workout to do today. */}
        <DayPickerCard
          date={selectedDate}
          currentKey={null}
          naturalKey={naturalDayKey}
          suggestedKey={suggestedNextDayKey}
          onPick={setDayOverride}
          onReset={null}
          intro="Want to train today instead? Pick a workout — it logs against today's date."
        />

        <BodyweightCard key={key} bw={bw} date={key} onSaved={refresh} />
        <ProgramNotesCard />
      </div>
    );
  }

  // Spacing guards (warnings, not blocks) — surface back-to-back B/C, 3rd
  // consecutive day, ≥4 sessions in last 7 days. Computed from the planned
  // session (override-aware via session.day.key).
  const spacingGuards = getSpacingGuards(selectedDate, session.day.key);

  // H-03: gate exercises by their prerequisite (e.g. strict pull-up needs band
  // pull-up at top of range × 2). gated[] preserves all original entries; any
  // unmet prereq swaps the exercise for its fallback regression and tags
  // `prerequisiteUnmet` so the UI explains why.
  const gated = applyPrerequisites(session.day.exercises, selectedDate);
  const adjusted = adjustForReadiness(gated, readiness, shoulderPain);
  const active = adjusted.filter((e) => !e.skipped);
  const skipped = adjusted.filter((e) => e.skipped);

  const exLog = (exId: string) => log?.exercises[exId];

  const updateSet = (exId: string, setIdx: number, field: 'weight' | 'reps' | 'rir', value: string) => {
    updateSessionLog(selectedDate, (l) => {
      if (!l.exercises[exId]) l.exercises[exId] = { sets: [] };
      const sets = l.exercises[exId].sets;
      while (sets.length <= setIdx) sets.push({ weight: '', reps: '', done: false });
      sets[setIdx][field] = value;
    });
    refresh();
  };

  /** Tick a set. `restSeconds` is the exercise's OWN prescribed rest — the
   *  timer starts from that rather than one global default. */
  const toggleDone = (exId: string, setIdx: number, restSeconds?: number) => {
    let nowDone = false;
    updateSessionLog(selectedDate, (l) => {
      if (!l.exercises[exId]) l.exercises[exId] = { sets: [] };
      const sets = l.exercises[exId].sets;
      while (sets.length <= setIdx) sets.push({ weight: '', reps: '', done: false });
      sets[setIdx].done = !sets[setIdx].done;
      nowDone = sets[setIdx].done;
    });
    if (nowDone) restTimer.start(restSeconds);
    refresh();
  };

  /** Per-exercise note. The field and its sync path already existed; nothing
   *  had ever written to it because there was no input. */
  const saveExerciseNote = (exId: string, note: string) => {
    updateSessionLog(selectedDate, (l) => {
      if (!l.exercises[exId]) l.exercises[exId] = { sets: [] };
      if (note.trim()) l.exercises[exId].note = note;
      else delete l.exercises[exId].note;
    });
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
      <StalenessBanner />
      <CoachNotesBanner />
      {/* Spacing guards — coach-style warnings near the top so the user sees
          them before working through readiness/symptoms. */}
      {spacingGuards.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-200">
          <div className="font-semibold flex items-center gap-1 mb-1">
            <AlertTriangle className="w-4 h-4" /> Spacing notes
          </div>
          <ul className="list-disc ml-5 space-y-0.5">
            {spacingGuards.map((g) => <li key={g.kind}>{g.message}</li>)}
          </ul>
        </div>
      )}
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
        suggestedKey={suggestedNextDayKey}
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
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{SESSION_NOTE}</p>
        <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc ml-5 space-y-0.5">
          {WARMUP.map((w) => <li key={w}>{w}</li>)}
        </ul>
      </div>

      {/* Rest timer — wall-clock, so locking the phone mid-rest does not
          stall it. Starts from each exercise's own prescribed rest. */}
      {restTimer.running && (
        <div className="fixed bottom-24 right-4 left-4 sm:left-auto bg-primary-600 text-white rounded-xl px-4 py-3 shadow-lg z-20 flex items-center gap-3">
          <Timer className="w-5 h-5 flex-shrink-0" aria-hidden />
          <span className="font-bold text-lg tabular-nums">
            {Math.floor(restTimer.secondsLeft / 60)}:{String(restTimer.secondsLeft % 60).padStart(2, '0')}
          </span>
          <span className="text-xs opacity-80 flex-1 truncate">rest</span>
          <button
            onClick={() => restTimer.extend(30)}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded px-2 py-1"
          >
            +30s
          </button>
          <button
            onClick={restTimer.pause}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded px-2 py-1"
          >
            Pause
          </button>
          <button
            onClick={() => restTimer.reset()}
            aria-label="Dismiss rest timer"
            className="text-white/80 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
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
          const lastNote = last ? getLastExerciseNote(ex.id, selectedDate) : null;
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
                        className="flex-1 min-w-0 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder={lastSet?.weight || (ex.timed ? '—' : 'kg')}
                        value={s?.weight ?? ''}
                        aria-label={`Set ${i + 1} weight`}
                        onChange={(e) => updateSet(ex.id, i, 'weight', e.target.value)}
                      />
                      <input
                        className="w-16 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder={lastSet?.reps || (ex.timed ? 'sec' : 'reps')}
                        value={s?.reps ?? ''}
                        aria-label={`Set ${i + 1} reps`}
                        onChange={(e) => updateSet(ex.id, i, 'reps', e.target.value)}
                      />
                      {/* Actual RIR felt on the set — distinct from the
                          prescription shown in the header. */}
                      <input
                        className="w-14 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder={lastSet?.rir || 'RIR'}
                        value={s?.rir ?? ''}
                        aria-label={`Set ${i + 1} reps in reserve`}
                        title="Reps in reserve — how many more you could have done"
                        onChange={(e) => updateSet(ex.id, i, 'rir', e.target.value)}
                      />
                      <button
                        onClick={() => toggleDone(ex.id, i, ex.restSeconds)}
                        aria-label="toggle set done"
                      >
                        {s?.done
                          ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                          : <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Per-exercise note — how it felt, form, what to change next
                  time. Saves as you type; the previous session's note is
                  shown above it for comparison. */}
              <ExerciseNote
                key={`${key}-${ex.id}`}
                exId={ex.id}
                initial={elog?.note ?? ''}
                lastNote={lastNote}
                onSave={saveExerciseNote}
              />
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
        <SessionNote
          key={key}
          initial={log?.notes ?? ''}
          onSave={saveNotes}
        />
      </div>

      <ProgramNotesCard />

      {/* `key={key}` re-mounts the card on date change so its internal input
          state resets without a useEffect (M-02). */}
      <BodyweightCard key={key} bw={bw} date={key} onSaved={refresh} />
    </div>
  );
};


// ─── Autosaving note field ────────────────────────────────────────────────────
//
// Replaces the old uncontrolled `defaultValue` + `onBlur` textarea, which lost
// text if the app was swiped closed with the keyboard still up, and which
// wrote its stale DOM value back over any note pulled from another device.
//
// This version is controlled, debounces a save while you type, and flushes on
// pagehide / tab-hide so backgrounding the app can never drop the last edit.
interface AutoNoteProps {
  initial: string;
  onSave: (value: string) => void;
  placeholder: string;
  minHeight: string;
  label?: string;
}

const AutoNote = ({ initial, onSave, placeholder, minHeight, label }: AutoNoteProps) => {
  const [value, setValue] = useState(initial);
  const latest = useRef(initial);
  const savedRef = useRef(initial);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (latest.current === savedRef.current) return;
    savedRef.current = latest.current;
    onSave(latest.current);
  }, [onSave]);

  useEffect(() => {
    const onHide = () => { if (document.hidden) flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      flush(); // unmount (date change, navigation) also commits
    };
  }, [flush]);

  const onChange = (next: string) => {
    setValue(next);
    latest.current = next;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 600);
  };

  return (
    <textarea
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onBlur={flush}
      placeholder={placeholder}
      className={`w-full border rounded-lg px-3 py-2 text-sm ${minHeight} dark:bg-gray-700 dark:text-white dark:border-gray-600`}
    />
  );
};

const SessionNote = ({ initial, onSave }: { initial: string; onSave: (v: string) => void }) => (
  <AutoNote
    initial={initial}
    onSave={onSave}
    label="Session notes"
    placeholder="How did the session go? Sleep, energy, anything to carry into next week."
    minHeight="min-h-[70px]"
  />
);

// ─── Per-exercise note ───────────────────────────────────────────────────────
interface ExerciseNoteProps {
  exId: string;
  initial: string;
  lastNote: { date: string; note: string } | null;
  onSave: (exId: string, value: string) => void;
}

const ExerciseNote = ({ exId, initial, lastNote, onSave }: ExerciseNoteProps) => {
  const save = useCallback((v: string) => onSave(exId, v), [onSave, exId]);
  return (
    <div className="mt-3">
      <AutoNote
        initial={initial}
        onSave={save}
        label="Exercise notes"
        placeholder="Notes — how it felt, form, niggles, what to change next time"
        minHeight="min-h-[38px]"
      />
      {lastNote && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">
          {lastNote.date}: “{lastNote.note}”
        </div>
      )}
    </div>
  );
};

// ─── Programme notes ─────────────────────────────────────────────────────────
//
// The reasoning behind the programme — rest periods, RIR, double progression,
// the pull-up cluster rule, the weekly volume audit and the swap list. Kept in
// the app rather than in a chat log so it is here in eight weeks' time when
// you wonder why laterals get 90 seconds.
const ProgramNotesCard = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 p-5 text-left"
      >
        <BookOpen className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" aria-hidden />
        <span className="font-bold text-gray-900 dark:text-white flex-1">Programme notes</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          {PROGRAM_NOTES.map((n) => (
            <div key={n.id}>
              <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-1">{n.title}</h4>
              <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{n.body}</p>
            </div>
          ))}

          <div>
            <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-2">
              Weekly volume, checked
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[320px]">
                <thead>
                  <tr className="text-left text-gray-400 dark:text-gray-500">
                    <th className="font-medium py-1 pr-3">Muscle</th>
                    <th className="font-medium py-1 pr-3">Direct</th>
                    <th className="font-medium py-1 pr-3">+ indirect</th>
                    <th className="font-medium py-1">Target</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-300">
                  {WEEKLY_VOLUME.map((v) => (
                    <tr key={v.muscle} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-1 pr-3 font-medium">{v.muscle}</td>
                      <td className="py-1 pr-3 tabular-nums">{v.direct}</td>
                      <td className="py-1 pr-3 tabular-nums">{v.fractional}</td>
                      <td className="py-1 tabular-nums text-gray-500 dark:text-gray-400">
                        {v.targetLow}–{v.targetHigh}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">{VOLUME_NOTE}</p>
          </div>

          <div>
            <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-2">
              Swaps — if a lift bothers a joint or stalls twice
            </h4>
            <dl className="space-y-1.5">
              {SWAPS.map((sw) => (
                <div key={sw.from} className="text-[13px]">
                  <dt className="font-medium text-gray-800 dark:text-gray-200">{sw.from}</dt>
                  <dd className="text-gray-600 dark:text-gray-400">{sw.to}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
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
  /** The day the A->B->C->D rotation would pick next (highlight in the picker). */
  suggestedKey?: DayKey | null;
  onPick: (k: DayKey) => void;
  /** When non-null, render a "Reset to schedule" link. */
  onReset: (() => void) | null;
  intro: string;
}

const DayPickerCard = ({ date, currentKey, naturalKey, suggestedKey, onPick, onReset, intro }: DayPickerProps) => {
  // Which phase's day labels to show. Before program start (no week) fall back
  // to the first phase so the picker still works. Uses the shared getWeekNum
  // rather than re-deriving the week inline, which this file used to do in
  // three separate places.
  const wk = getWeekNum(date);
  const phase = wk === null ? PHASES[0] : getPhaseForWeek(Math.min(wk, 16));
  const days = phase.days;

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {days.map(d => {
          const isCurrent = d.key === currentKey;
          const isNatural = d.key === naturalKey;
          const isSuggested = suggestedKey ? d.key === suggestedKey : false;
          return (
            <button
              key={d.key}
              onClick={() => onPick(d.key)}
              className={`px-3 py-2 rounded-lg text-left text-xs border transition-colors ${
                isCurrent
                  ? 'bg-primary-600 text-white border-primary-600'
                  : isSuggested
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-gray-800 dark:text-gray-100 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              <div className="font-bold uppercase tracking-wide text-[11px] flex items-center gap-1 flex-wrap">
                <span>{DAY_KEY_TO_LETTER[d.key]}</span>
                {isNatural && (
                  <span className={`text-[9px] font-medium px-1 rounded ${isCurrent ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'}`}>
                    today
                  </span>
                )}
                {isSuggested && !isCurrent && (
                  <span className="text-[9px] font-medium px-1 rounded bg-emerald-200 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-100">
                    next
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

// ─── Next-session preview (rest-day card) ─────────────────────────────────────
//
// Tells the user what the A->B->C->D rotation will pick next so a rest day
// still feels intentional. Looks up the suggested day's exercises from the
// resolved phase so the label tracks Phase 2/3/4 changes.

interface NextSessionPreviewProps {
  date: Date;
  dayKey: DayKey;
}

const NextSessionPreviewCard = ({ date, dayKey }: NextSessionPreviewProps) => {
  // Resolve the phase for the next session by looking 1 day ahead — guarantees
  // the natural day-of-week matches what the rotation would pick anyway.
  const ahead = new Date(dateKey(date) + 'T00:00:00');
  ahead.setDate(ahead.getDate() + 1);
  const wkAhead = getWeekNum(ahead);
  if (wkAhead === null) return null;
  const phase = getPhaseForWeek(Math.min(wkAhead, 16));
  const day = phase.days.find((d) => d.key === dayKey);
  if (!day) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
      <h3 className="font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        <CalendarDays className="w-5 h-5" /> Next session
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Rotation queues up <strong>{day.label}</strong>. {day.goal}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        Today: walk, sleep, protein ≥ 160 g. The session log is ready when you are.
      </p>
    </div>
  );
};

// ─── Coach notes banner (Week 2) ──────────────────────────────────────────────
//
// Dismissible explainer for the rotation model + safety guards. Dismissal is
// stored in localStorage so it doesn't reappear after a reload. The key is
// versioned (v2) so future programming-change rollouts can re-show the banner
// by bumping the suffix.
const COACH_NOTES_KEY = 'health_coach_notes_v3_dismissed';

const CoachNotesBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(localStorage.getItem(COACH_NOTES_KEY) === '1');
  }, []);
  if (dismissed) return null;
  const dismiss = () => {
    localStorage.setItem(COACH_NOTES_KEY, '1');
    setDismissed(true);
  };
  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-sm text-emerald-900 dark:text-emerald-100">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
        <div className="flex-1">
          <div className="font-semibold mb-1">Coach notes — Garage Block 16</div>
          <ul className="list-disc ml-4 space-y-0.5 text-[13px]">
            <li>Five sessions rotate <strong>Push → Pull → Legs → Upper → Lower</strong>, not by weekday. The picker highlights what's next.</li>
            <li>Every muscle twice a week. Rest days sit after Legs and after Lower — that spacing is the plan, not a gap.</li>
            <li>Log <strong>weight × reps × RIR</strong> for every set. Double progression is guesswork without last week's numbers.</li>
            <li>Ticking a set starts that exercise's own rest timer. Nothing past 90 s adds growth on isolation work.</li>
            <li>Pull-ups are clusters — <strong>never to failure</strong> inside a block. Retest a max in weeks 6, 12 and 16.</li>
            <li>Protein ≥ 160 g daily, including rest days.</li>
          </ul>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss coach notes"
          className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ─── Staleness banner ────────────────────────────────────────────────────────
//
// Surfaces a visible warning at the top of the Train tab when the Garmin/Apple
// sync hasn't run in >48h. Readiness suggestions rely on recent sleep & RHR,
// so stale data degrades the recommendation quality silently — this banner
// makes that degradation explicit.
const StalenessBanner = () => {
  if (!isHealthDataStale()) return null;
  const label = lastSyncLabel();
  return (
    <div
      role="status"
      className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2"
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
      <div>
        <strong>Garmin sync is stale</strong> — last synced {label}.
        Readiness suggestions may not reflect current sleep/RHR.
      </div>
    </div>
  );
};

export default Train;
