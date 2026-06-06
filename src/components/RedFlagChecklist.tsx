import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { RedFlagState } from '../types/training';
import { hasActiveRedFlag } from '../utils/training';

interface Props {
  value: RedFlagState | undefined;
  onChange: (next: RedFlagState) => void;
}

const QUESTIONS: Array<{ key: keyof RedFlagState; label: string }> = [
  { key: 'chestPain',       label: 'Chest pain, tightness, or pressure today' },
  { key: 'dizziness',       label: 'Dizziness, light-headedness, or fainting' },
  { key: 'breathlessness',  label: 'Unusual breathlessness at rest' },
  { key: 'illness',         label: 'Fever, vomiting, or active illness' },
];

/**
 * Acute-symptom screen shown on every Train day above the readiness pickers.
 * Any "yes" forces RED readiness (handled by effectiveReadiness in training.ts)
 * and surfaces a clinician-referral banner. The "clinician override" toggle
 * keeps the answers visible so the user has a record but allows them to
 * proceed when a clinician has cleared them — RED stays in effect either way
 * to keep the day conservative.
 */
const RedFlagChecklist = ({ value, onChange }: Props) => {
  const state: RedFlagState = value ?? {};
  const triggered = hasActiveRedFlag(state);
  const anyChecked = Boolean(
    state.chestPain || state.dizziness || state.breathlessness || state.illness,
  );

  const set = (k: keyof RedFlagState, v: boolean) => {
    onChange({ ...state, [k]: v });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow border-l-4 border-amber-500 dark:border-amber-400">
      <h3 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        Safety check — anything happening today?
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Tick any that apply. Any "yes" makes today a RED day until you've spoken
        to a clinician. This screen is not medical advice — when in doubt, seek help.
      </p>
      <div className="space-y-1.5">
        {QUESTIONS.map((q) => (
          <label key={q.key} className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(state[q.key])}
              onChange={(e) => set(q.key, e.target.checked)}
              className="mt-0.5"
            />
            <span>{q.label}</span>
          </label>
        ))}
      </div>

      {triggered && (
        <div className="mt-3 rounded-lg p-3 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4" /> Today is a RED day.
          </div>
          <p className="mt-1">
            Don't train through these symptoms. Chest pain, dizziness, fainting,
            unusual breathlessness, or active illness all need clinical
            evaluation first. The session has been replaced with a rest message.
          </p>
          <label className="flex items-start gap-2 mt-2 text-xs">
            <input
              type="checkbox"
              checked={Boolean(state.clinicianOverride)}
              onChange={(e) => set('clinicianOverride', e.target.checked)}
              className="mt-0.5"
            />
            <span>
              A clinician has cleared me to train today. (RED still applies — opt
              in to the day's session manually below if you choose to proceed.)
            </span>
          </label>
        </div>
      )}

      {anyChecked && !triggered && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Clinician-override is in effect — symptoms remain on record.
        </p>
      )}
    </div>
  );
};

export default RedFlagChecklist;
