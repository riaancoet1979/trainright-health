import { useState, useRef } from 'react';
import { Settings as SettingsIcon, Save, Moon, Sun, Plus, Edit2, Trash2, Download, Upload, X, AlertTriangle } from 'lucide-react';
import { getUserSettings, saveUserSettings, getCustomFoods, addCustomFood, updateCustomFood, deleteCustomFood, exportCustomFoods, importCustomFoods, isFoodNameDuplicate, exportFitnessData, importFitnessData, resetAllFitnessData } from '../utils/storage';
import type { FoodItem } from '../types';
import { useTheme } from '../contexts/useTheme';
import { useConfirm, useToast } from './ui';

interface SettingsProps {
  onSettingsSaved: () => void;
}

const Settings = ({ onSettingsSaved }: SettingsProps) => {
  const { theme, toggleTheme } = useTheme();
  const { confirm, confirmChoice } = useConfirm();
  const { showToast } = useToast();
  const [settings, setSettings] = useState(getUserSettings());
  const [customFoods, setCustomFoods] = useState<FoodItem[]>(getCustomFoods());
  const [dailyCaloriesInput, setDailyCaloriesInput] = useState<string>(String(getUserSettings().targets.dailyCalories));
  const [dailyProteinInput, setDailyProteinInput] = useState<string>(String(getUserSettings().targets.dailyProtein));
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fitnessImportRef = useRef<HTMLInputElement>(null);

  // Food form state
  const [foodForm, setFoodForm] = useState({
    name: '',
    category: '',
    brand: '',
    servingType: 'weight' as 'weight' | 'piece',
    averageWeight: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    saveUserSettings(settings);
    onSettingsSaved();
    // Notify other parts of the app (and reminders hook) that settings changed
    try {
      window.dispatchEvent(new Event('settings-updated'));
    } catch (e) {}
  };

  // M-02: the previous useEffect that mirrored settings → input state was a
  // setState-in-effect pattern (eslint react-hooks/set-state-in-effect) that
  // also created a redundant render. The settings are owned by this component
  // and only changed through `setSettings` (which also rewrites the inputs
  // directly via the handlers below); no external code mutates the targets in
  // a way Settings.tsx needs to react to. Removing the effect keeps the input
  // values in sync without the extra render cycle.

  const handleCaloriesInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // allow empty string during editing
    if (raw === '') {
      setDailyCaloriesInput('');
      return;
    }
    // only digits allowed
    const cleaned = raw.replace(/[^0-9]/g, '');
    setDailyCaloriesInput(cleaned);
    if (cleaned !== '') {
      const n = Math.max(0, parseInt(cleaned, 10) || 0);
      const newSettings = { ...settings, targets: { ...settings.targets, dailyCalories: n } };
      setSettings(newSettings);
      saveUserSettings(newSettings);
      try { window.dispatchEvent(new Event('settings-updated')); } catch (e) {}
    }
  };

  const handleProteinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setDailyProteinInput('');
      return;
    }
    const cleaned = raw.replace(/[^0-9]/g, '');
    setDailyProteinInput(cleaned);
    if (cleaned !== '') {
      const n = Math.max(0, parseInt(cleaned, 10) || 0);
      const newSettings = { ...settings, targets: { ...settings.targets, dailyProtein: n } };
      setSettings(newSettings);
      saveUserSettings(newSettings);
      try { window.dispatchEvent(new Event('settings-updated')); } catch (e) {}
    }
  };

  // Custom Food Management Functions
  const resetFoodForm = () => {
    setFoodForm({
      name: '',
      category: '',
      brand: '',
      servingType: 'weight',
      averageWeight: '',
      calories: '',
      protein: '',
      carbs: '',
      fats: '',
    });
    setFormErrors({});
    setEditingFood(null);
  };

  const openAddFoodModal = () => {
    resetFoodForm();
    setShowFoodModal(true);
  };

  const openEditFoodModal = (food: FoodItem) => {
    setEditingFood(food);
    setFoodForm({
      name: food.name,
      category: food.category || '',
      brand: food.brand || '',
      servingType: food.servingType || 'weight',
      averageWeight: food.averageWeight?.toString() || '',
      calories: food.calories.toString(),
      protein: food.protein.toString(),
      carbs: food.carbs.toString(),
      fats: food.fats.toString(),
    });
    setFormErrors({});
    setShowFoodModal(true);
  };

  const validateFoodForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Name validation
    if (!foodForm.name.trim() || foodForm.name.length < 3) {
      errors.name = 'Name must be at least 3 characters';
    } else if (foodForm.name.length > 100) {
      errors.name = 'Name must be less than 100 characters';
    } else if (isFoodNameDuplicate(foodForm.name, editingFood?.id)) {
      errors.name = 'A food with this name already exists';
    }

    // Nutrition validation
    const calories = parseFloat(foodForm.calories);
    if (isNaN(calories) || calories < 0 || calories > 9999) {
      errors.calories = 'Calories must be between 0 and 9999';
    }

    const protein = parseFloat(foodForm.protein);
    if (isNaN(protein) || protein < 0 || protein > 999.9) {
      errors.protein = 'Protein must be between 0 and 999.9';
    }

    const carbs = parseFloat(foodForm.carbs);
    if (isNaN(carbs) || carbs < 0 || carbs > 999.9) {
      errors.carbs = 'Carbs must be between 0 and 999.9';
    }

    const fats = parseFloat(foodForm.fats);
    if (isNaN(fats) || fats < 0 || fats > 999.9) {
      errors.fats = 'Fats must be between 0 and 999.9';
    }

    // Average weight validation for piece-based foods
    if (foodForm.servingType === 'piece') {
      const avgWeight = parseFloat(foodForm.averageWeight);
      if (isNaN(avgWeight) || avgWeight < 1 || avgWeight > 9999) {
        errors.averageWeight = 'Average weight must be between 1 and 9999';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getNutritionWarning = (): string | null => {
    const calories = parseFloat(foodForm.calories);
    const protein = parseFloat(foodForm.protein);
    const carbs = parseFloat(foodForm.carbs);
    const fats = parseFloat(foodForm.fats);

    if (isNaN(calories) || isNaN(protein) || isNaN(carbs) || isNaN(fats)) {
      return null;
    }

    const calculatedCalories = protein * 4 + carbs * 4 + fats * 9;
    const difference = Math.abs(calories - calculatedCalories);
    const percentDiff = (difference / calories) * 100;

    if (percentDiff > 20) {
      return 'Calorie total may not match macros. This is OK for foods with fiber or other components.';
    }

    return null;
  };

  const handleSaveFood = () => {
    if (!validateFoodForm()) return;

    const foodData = {
      name: foodForm.name.trim(),
      category: foodForm.category.trim() || undefined,
      brand: foodForm.brand.trim() || undefined,
      servingType: foodForm.servingType,
      averageWeight: foodForm.servingType === 'piece' ? parseFloat(foodForm.averageWeight) : undefined,
      calories: parseFloat(foodForm.calories),
      protein: parseFloat(foodForm.protein),
      carbs: parseFloat(foodForm.carbs),
      fats: parseFloat(foodForm.fats),
    };

    if (editingFood) {
      updateCustomFood(editingFood.id, foodData);
    } else {
      addCustomFood(foodData);
    }

    setCustomFoods(getCustomFoods());
    setShowFoodModal(false);
    resetFoodForm();
  };

  const handleDeleteFood = async (id: string) => {
    const ok = await confirm({
      message: 'Are you sure you want to delete this custom food?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    });
    if (ok) {
      deleteCustomFood(id);
      setCustomFoods(getCustomFoods());
      showToast('Custom food deleted', { kind: 'success' });
    }
  };

  const handleExport = () => {
    const json = exportCustomFoods();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `nutrition-tracker-custom-foods-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;

      const mode = await confirmChoice<'merge' | 'replace' | null>({
        title: 'Import custom foods',
        message:
          'How should we apply this import?\n\n' +
          'Merge: keep existing foods and add the imported ones.\n' +
          'Replace: delete existing foods, then add the imported ones.',
        choices: [
          { label: 'Merge', value: 'merge', variant: 'primary' },
          { label: 'Replace', value: 'replace', variant: 'danger' },
          { label: 'Cancel', value: null, variant: 'secondary' },
        ],
      });
      if (mode === null) return;

      const result = importCustomFoods(content, mode);

      if (result.success) {
        setCustomFoods(getCustomFoods());
        showToast(
          `Imported ${result.count} custom food${result.count !== 1 ? 's' : ''}.`,
          { kind: 'success' },
        );
      } else {
        showToast(`Import failed: ${result.error}`, { kind: 'error' });
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredCustomFoods = customFoods.filter(
    (food) =>
      food.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      food.category?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
        <SettingsIcon className="w-6 h-6" />
        Settings
      </h3>

      {/* Theme Toggle */}
      <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">Theme</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Switch between light and dark mode
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-3 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
      </div>

        {/* Fitness Settings */}
        <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">Fitness</h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">Rest timer (minutes)</label>
              <input
                type="number"
                min={0}
                value={Math.round((settings.restTimerSeconds || 120) / 60)}
                onChange={(e) => setSettings({ ...settings, restTimerSeconds: Math.max(0, parseInt(e.target.value || '0') || 0) * 60 })}
                className="input-field w-32"
              />
              <p className="text-xs text-gray-500 mt-1">Default rest time between sets (used for the rest timer)</p>
            </div>

          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={() => {
                try {
                  const data = exportFitnessData();
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `fitness-data-${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  showToast('Export failed', { kind: 'error' });
                }
              }}
              className="btn-secondary px-3"
            >
              Export Fitness Data
            </button>

            <button
              onClick={() => fitnessImportRef.current?.click()}
              className="btn-secondary px-3"
            >
              Import Fitness Backup
            </button>
            <input
              ref={fitnessImportRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const content = ev.target?.result as string;
                  const mode = await confirmChoice<'merge' | 'replace' | null>({
                    title: 'Restore fitness backup',
                    message:
                      'How should we apply this restore?\n\n' +
                      'Merge: keep existing fitness data and overlay imported days.\n' +
                      'Replace: overwrite all existing fitness data.',
                    choices: [
                      { label: 'Merge', value: 'merge', variant: 'primary' },
                      { label: 'Replace', value: 'replace', variant: 'danger' },
                      { label: 'Cancel', value: null, variant: 'secondary' },
                    ],
                  });
                  if (mode === null) return;
                  const result = importFitnessData(content, mode);
                  if (result.success) {
                    showToast(
                      `Restored ${result.count} day${result.count !== 1 ? 's' : ''} of fitness data.`,
                      { kind: 'success' },
                    );
                  } else {
                    showToast(`Restore failed: ${result.error}`, { kind: 'error' });
                  }
                };
                reader.readAsText(file);
                if (fitnessImportRef.current) fitnessImportRef.current.value = '';
              }}
            />

            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset fitness data?',
                  message: 'This cannot be undone.',
                  confirmLabel: 'Reset',
                  confirmVariant: 'danger',
                });
                if (!ok) return;
                resetAllFitnessData();
                showToast('Fitness data reset', { kind: 'success' });
              }}
              className="btn-secondary px-3 text-red-600"
            >
              Reset Fitness Data
            </button>
          </div>
          </div>
        </div>

      {/* Daily Targets */}
      <div className="mb-6">
        <h4 className="font-semibold mb-4">Daily Targets</h4>

        <div className="space-y-4">
          {/* Calories Target */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Daily Calories Target
            </label>
            <input
              type="number"
              value={dailyCaloriesInput}
              onChange={handleCaloriesInputChange}
              onBlur={() => {
                if (dailyCaloriesInput === '') setDailyCaloriesInput(String(settings.targets.dailyCalories));
              }}
              className="input-field"
              min="0"
              step="50"
            />
          </div>

          {/* Protein Target */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Daily Protein Target (grams)
            </label>
            <input
              type="number"
              value={dailyProteinInput}
              onChange={handleProteinInputChange}
              onBlur={() => {
                if (dailyProteinInput === '') setDailyProteinInput(String(settings.targets.dailyProtein));
              }}
              className="input-field"
              min="0"
              step="5"
            />
          </div>

          {/* Carbs Target */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Daily Carbs Target (grams)
            </label>
            <input
              type="number"
              value={settings.targets.dailyCarbs}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  targets: {
                    ...settings.targets,
                    dailyCarbs: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="input-field"
              min="0"
              step="5"
            />
          </div>

          {/* Fats Target */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Daily Fats Target (grams)
            </label>
            <input
              type="number"
              value={settings.targets.dailyFats}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  targets: {
                    ...settings.targets,
                    dailyFats: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="input-field"
              min="0"
              step="5"
            />
          </div>
        </div>
      </div>

      {/* Macro Percentages Info */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h5 className="font-semibold mb-2 text-sm">Current Macro Split</h5>
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span>Protein:</span>
            <span className="font-medium">
              {Math.round(
                ((settings.targets.dailyProtein * 4) / settings.targets.dailyCalories) * 100
              )}
              %
            </span>
          </div>
          <div className="flex justify-between">
            <span>Carbs:</span>
            <span className="font-medium">
              {Math.round(
                ((settings.targets.dailyCarbs * 4) / settings.targets.dailyCalories) * 100
              )}
              %
            </span>
          </div>
          <div className="flex justify-between">
            <span>Fats:</span>
            <span className="font-medium">
              {Math.round(
                ((settings.targets.dailyFats * 9) / settings.targets.dailyCalories) * 100
              )}
              %
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
          Based on 4 cal/g for protein & carbs, 9 cal/g for fats
        </p>
      </div>

      {/* Pushup Reminders */}
      <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold">Pushup Reminders</h4>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Enable Reminders</div>
            </div>
            <input
              type="checkbox"
              checked={settings.pushupReminders?.enabled || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  pushupReminders: {
                    ...(settings.pushupReminders || { times: ['08:00', '11:00', '14:00', '17:00', '20:00'], weekend: true }),
                    enabled: e.target.checked,
                  },
                })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Reminder times</label>
            <div className="flex gap-2 mb-2">
              {(settings.pushupReminders?.times || []).map((t) => (
                <div key={t} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1">
                  <div className="text-sm">{t}</div>
                  <button
                    onClick={() => setSettings({
                        ...settings,
                        pushupReminders: { ...(settings.pushupReminders || { times: [], weekend: true, enabled: false }), times: (settings.pushupReminders?.times || []).filter(x => x !== t), enabled: settings.pushupReminders?.enabled ?? false }
                      })}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input type="time" id="newReminderTime" className="input-field" />
              <button
                onClick={() => {
                  const el = document.getElementById('newReminderTime') as HTMLInputElement | null;
                  if (!el || !el.value) return;
                  const t = el.value;
                  const existing = settings.pushupReminders?.times || [];
                  if (!existing.includes(t)) {
                    setSettings({
                      ...settings,
                      pushupReminders: { ...(settings.pushupReminders || { times: [], weekend: true, enabled: false }), times: [...existing, t].sort(), enabled: settings.pushupReminders?.enabled ?? false },
                    });
                    el.value = '';
                  }
                }}
                className="btn-secondary px-3"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Include weekends</div>
            </div>
            <input
              type="checkbox"
              checked={settings.pushupReminders?.weekend ?? true}
              onChange={(e) => setSettings({
                ...settings,
                pushupReminders: { ...(settings.pushupReminders || { times: [], weekend: true, enabled: false }), weekend: e.target.checked, enabled: settings.pushupReminders?.enabled ?? false }
              })}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if ('Notification' in window) {
                  await Notification.requestPermission();
                  showToast(`Notification permission: ${Notification.permission}`, {
                    kind: Notification.permission === 'granted' ? 'success' : 'info',
                  });
                } else {
                  showToast('Notifications are not supported in this browser', {
                    kind: 'warning',
                  });
                }
              }}
              className="btn-primary px-3"
            >
              Request notification permission
            </button>
            <div className="text-sm text-gray-500">Current permission: {typeof Notification === 'undefined' ? 'unavailable' : Notification.permission}</div>
          </div>
        </div>
      </div>

      {/* Custom Foods Management */}
      <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold">Manage Custom Foods</h4>
          <button
            onClick={openAddFoodModal}
            className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </div>

        {/* Import/Export Buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleExport}
            disabled={customFoods.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export ({customFoods.length})
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {/* Search Filter */}
        {customFoods.length > 0 && (
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search custom foods..."
            className="input-field mb-3"
          />
        )}

        {/* Custom Foods List */}
        {customFoods.length > 0 ? (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredCustomFoods.map((food) => (
              <div
                key={food.id}
                className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="font-medium">{food.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {food.calories} cal • {food.protein}g P • {food.carbs}g C • {food.fats}g F
                    {food.category && ` • ${food.category}`}
                    {food.servingType === 'piece' && ` • ${food.averageWeight}g/piece`}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => openEditFoodModal(food)}
                    className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteFood(food.id)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {filteredCustomFoods.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                No custom foods match your search
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">
            No custom foods yet. Click "Add New" to create one!
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        <Save className="w-5 h-5" />
        Save Settings
      </button>

      {/* Custom Food Modal */}
      {showFoodModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">
                {editingFood ? 'Edit Custom Food' : 'Add Custom Food'}
              </h3>
              <button
                onClick={() => {
                  setShowFoodModal(false);
                  resetFoodForm();
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Food Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={foodForm.name}
                  onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })}
                  className={`input-field ${formErrors.name ? 'border-red-500' : ''}`}
                  placeholder="e.g., Homemade Protein Shake"
                />
                {formErrors.name && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Category and Brand */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <input
                    type="text"
                    value={foodForm.category}
                    onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })}
                    className="input-field"
                    placeholder="e.g., Protein"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Brand</label>
                  <input
                    type="text"
                    value={foodForm.brand}
                    onChange={(e) => setFoodForm({ ...foodForm, brand: e.target.value })}
                    className="input-field"
                    placeholder="e.g., Homemade"
                  />
                </div>
              </div>

              {/* Serving Type */}
              <div>
                <label className="block text-sm font-medium mb-2">Serving Type</label>
                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setFoodForm({ ...foodForm, servingType: 'weight' })}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      foodForm.servingType === 'weight'
                        ? 'bg-white dark:bg-gray-700 shadow-sm'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Weight (per 100g)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFoodForm({ ...foodForm, servingType: 'piece' })}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      foodForm.servingType === 'piece'
                        ? 'bg-white dark:bg-gray-700 shadow-sm'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Piece-Based
                  </button>
                </div>
              </div>

              {/* Average Weight (for piece-based foods) */}
              {foodForm.servingType === 'piece' && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Average Weight per Piece (grams) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={foodForm.averageWeight}
                    onChange={(e) => setFoodForm({ ...foodForm, averageWeight: e.target.value })}
                    className={`input-field ${formErrors.averageWeight ? 'border-red-500' : ''}`}
                    placeholder="e.g., 50"
                    min="1"
                    step="1"
                  />
                  {formErrors.averageWeight && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.averageWeight}</p>
                  )}
                </div>
              )}

              {/* Nutrition Info */}
              <div>
                <h4 className="font-semibold mb-3">Nutrition per 100g</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Calories <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={foodForm.calories}
                      onChange={(e) => setFoodForm({ ...foodForm, calories: e.target.value })}
                      className={`input-field ${formErrors.calories ? 'border-red-500' : ''}`}
                      placeholder="0"
                      min="0"
                      step="1"
                    />
                    {formErrors.calories && (
                      <p className="text-red-500 text-sm mt-1">{formErrors.calories}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Protein (g) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={foodForm.protein}
                      onChange={(e) => setFoodForm({ ...foodForm, protein: e.target.value })}
                      className={`input-field ${formErrors.protein ? 'border-red-500' : ''}`}
                      placeholder="0"
                      min="0"
                      step="0.1"
                    />
                    {formErrors.protein && (
                      <p className="text-red-500 text-sm mt-1">{formErrors.protein}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Carbs (g) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={foodForm.carbs}
                      onChange={(e) => setFoodForm({ ...foodForm, carbs: e.target.value })}
                      className={`input-field ${formErrors.carbs ? 'border-red-500' : ''}`}
                      placeholder="0"
                      min="0"
                      step="0.1"
                    />
                    {formErrors.carbs && (
                      <p className="text-red-500 text-sm mt-1">{formErrors.carbs}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Fats (g) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={foodForm.fats}
                      onChange={(e) => setFoodForm({ ...foodForm, fats: e.target.value })}
                      className={`input-field ${formErrors.fats ? 'border-red-500' : ''}`}
                      placeholder="0"
                      min="0"
                      step="0.1"
                    />
                    {formErrors.fats && (
                      <p className="text-red-500 text-sm mt-1">{formErrors.fats}</p>
                    )}
                  </div>
                </div>


                {/* Nutrition Warning */}
                {getNutritionWarning() && (
                  <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      {getNutritionWarning()}
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowFoodModal(false);
                    resetFoodForm();
                  }}
                  className="flex-1 py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFood}
                  className="flex-1 py-2 px-4 bg-primary-600 text-white hover:bg-primary-700 rounded-lg font-medium transition-colors"
                >
                  {editingFood ? 'Update' : 'Add'} Food
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
