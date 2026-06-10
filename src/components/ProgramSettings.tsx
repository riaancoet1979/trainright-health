import { useState, useRef } from 'react';
import { Download, Upload, RotateCcw, Dumbbell } from 'lucide-react';
import type { DayTypeTargets } from '../types/training';
import {
  getDayTypeTargets, saveDayTypeTargets, getTrainingData,
  setProgramStartDate, importTrainRightBackup, exportAllData, importAllData,
} from '../utils/training';
import { mergeGarminData } from '../utils/health';
import { DEFAULT_DAY_TYPE_TARGETS, LEAN_GAIN_TARGETS } from '../data/program';

interface Props { onSaved: () => void }

const ProgramSettings = ({ onSaved }: Props) => {
  const [targets, setTargets] = useState<DayTypeTargets>(getDayTypeTargets());
  const [msg, setMsg] = useState('');
  const data = getTrainingData();
  const [startDate, setStartDate] = useState(data.programStartDate ?? '');
  const fullBackupRef = useRef<HTMLInputElement>(null);
  const garminRef = useRef<HTMLInputElement>(null);
  const oldTrainRightRef = useRef<HTMLInputElement>(null);

  const upd = (
    type: 'training' | 'rest',
    field: keyof DayTypeTargets['training'],
    value: string,
  ) => {
    setTargets((t) => ({ ...t, [type]: { ...t[type], [field]: Number(value) || 0 } }));
  };

  const save = () => {
    saveDayTypeTargets(targets);
    if (startDate) setProgramStartDate(startDate);
    setMsg('Saved.');
    onSaved();
  };

  const applyPreset = (p: DayTypeTargets, name: string) => {
    setTargets(p);
    saveDayTypeTargets(p);
    setMsg(`${name} preset applied.`);
    onSaved();
  };

  const download = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    handler: (text: string) => string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setMsg(handler(String(reader.result)));
        onSaved();
      } catch (err) {
        setMsg(`Import failed: ${err instanceof Error ? err.message : 'invalid file'}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const row = (type: 'training' | 'rest', label: string) => (
    <div className="grid grid-cols-5 gap-2 items-center text-sm">
      <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {(['dailyCalories', 'dailyProtein', 'dailyCarbs', 'dailyFats'] as const).map((f) => (
        <input
          key={f}
          type="number"
          value={targets[type][f]}
          onChange={(ev) => upd(type, f, ev.target.value)}
          className="border rounded px-2 py-1 dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
      ))}
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow mb-6">
      <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Dumbbell className="w-5 h-5" /> Program & nutrition targets
      </h3>

      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Program start date</label>
        <input
          type="date" value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span /><span>kcal</span><span>Protein g</span><span>Carbs g</span><span>Fat g</span>
      </div>
      <div className="space-y-2">
        {row('training', 'Training day')}
        {row('rest', 'Rest day')}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={save} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
        <button onClick={() => applyPreset(DEFAULT_DAY_TYPE_TARGETS, 'Fat-loss')} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm">
          <RotateCcw className="w-4 h-4 inline mr-1" />Fat-loss preset
        </button>
        <button onClick={() => applyPreset(LEAN_GAIN_TARGETS, 'Lean-gain')} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm">
          Lean-gain preset
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Switch to Lean-gain around week 9 if body fat is ~15–16% and training is progressing.
      </p>

      <hr className="my-4 border-gray-200 dark:border-gray-700" />

      <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">Data migration & backup</h4>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => download(exportAllData(), `trainright-health-backup-${new Date().toISOString().slice(0, 10)}.json`)}
          className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm"
        >
          <Download className="w-4 h-4 inline mr-1" />Export all data
        </button>

        {/* Full backup import */}
        <button
          onClick={() => fullBackupRef.current?.click()}
          className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm cursor-pointer"
        >
          <Upload className="w-4 h-4 inline mr-1" />Import full backup
        </button>
        <input ref={fullBackupRef} type="file" accept=".json" style={{display:'none'}}
          onChange={(e) => handleFile(e, (t) => {
            const keys = importAllData(t);
            return keys.length > 0 ? `✅ Imported ${keys.length} data section(s). Reload to see changes.` : '⚠️ No recognised data found in file.';
          })} />

        {/* Garmin import */}
        <button
          onClick={() => garminRef.current?.click()}
          className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm cursor-pointer"
        >
          <Upload className="w-4 h-4 inline mr-1" />Import Garmin JSON
        </button>
        <input ref={garminRef} type="file" accept=".json" style={{display:'none'}}
          onChange={(e) => handleFile(e, (t) => `Merged ${mergeGarminData(JSON.parse(t))} days of Garmin data.`)} />

        {/* Old TrainRight import */}
        <button
          onClick={() => oldTrainRightRef.current?.click()}
          className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm cursor-pointer"
        >
          <Upload className="w-4 h-4 inline mr-1" />Import old TrainRight (trainright_v1)
        </button>
        <input ref={oldTrainRightRef} type="file" accept=".json,.txt" style={{display:'none'}}
          onChange={(e) => handleFile(e, (t) => {
            const r = importTrainRightBackup(t);
            return `Imported ${r.sessionsImported} sessions, ${r.metricsImported} body metrics.`;
          })} />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Old TrainRight: open the old app → browser console → <code>copy(localStorage.getItem('trainright_v1'))</code> → paste into a .json file → import here.
        Old nutrition app: its export file imports via "Import full backup".
      </p>

      {msg && <div className="mt-3 text-sm font-medium text-primary-600 dark:text-primary-400">{msg}</div>}
    </div>
  );
};

export default ProgramSettings;
