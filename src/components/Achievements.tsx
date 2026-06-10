import { useState, useEffect } from 'react';
import { getAchievements, clearAchievements, exportFitnessData, resetAllFitnessData } from '../utils/storage';
import { useConfirm, useToast } from './ui';

const Achievements = () => {
  const [items, setItems] = useState(getAchievements());
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  useEffect(() => {
    setItems(getAchievements());
  }, []);

  const handleClear = async () => {
    if (!(await confirm('Clear all achievements?'))) return;
    clearAchievements();
    setItems([]);
    showToast('Achievements cleared', { kind: 'success' });
  };

  const handleExport = () => {
    const json = exportFitnessData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fitness-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = async () => {
    if (
      !(await confirm({
        title: 'Reset fitness data?',
        message: 'This cannot be undone.',
        confirmLabel: 'Reset',
        confirmVariant: 'danger',
      }))
    ) {
      return;
    }
    resetAllFitnessData();
    setItems(getAchievements());
    showToast('Fitness data reset', { kind: 'success' });
  };

  if (items.length === 0) return null;

  return (
    <div className="mt-4 p-3 rounded border bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Achievements</div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary px-3">Export</button>
          <button onClick={handleReset} className="btn-secondary px-3">Reset Fitness</button>
          <button onClick={handleClear} className="btn-secondary px-3 text-red-600">Clear</button>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="text-sm">
            <div className="font-medium">{a.name}</div>
            <div className="text-xs text-gray-500">{new Date(a.date).toLocaleString()}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Achievements;
