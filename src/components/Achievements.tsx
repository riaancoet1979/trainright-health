import { useState, useEffect } from 'react';
import { getAchievements, clearAchievements, exportFitnessData, resetAllFitnessData } from '../utils/storage';

const Achievements = () => {
  const [items, setItems] = useState(getAchievements());

  useEffect(() => {
    setItems(getAchievements());
  }, []);

  const handleClear = () => {
    if (!confirm('Clear all achievements?')) return;
    clearAchievements();
    setItems([]);
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

  const handleReset = () => {
    if (!confirm('Reset all fitness data? This cannot be undone.')) return;
    resetAllFitnessData();
    // small refresh
    setItems(getAchievements());
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
