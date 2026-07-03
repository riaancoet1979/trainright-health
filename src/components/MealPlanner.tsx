import { useMemo, useState } from 'react';
import { Plus, Check, Star, X, Calculator } from 'lucide-react';
import type { FoodItem, FoodEntry } from '../types';
import {
  getAllFoods,
  getStaples,
  isStaple,
  toggleStaple,
  addCustomFood,
  addFoodEntry,
  getMealSplit,
} from '../utils/storage';
import {
  buildMealPlans,
  type Macros,
  type MealType,
  type MealPlan,
  type PlannerFood,
  type AllocatedFood,
} from '../utils/mealPlanner';

interface MealPlannerProps {
  selectedDate: Date;
  /** Macros still needed for the day (targets − consumed, floored at 0). */
  remaining: Macros;
  onAdded: () => void;
}

const ALL_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

// Collapse the raw food-database categories into the owner's friendly groups.
// Anything unmapped passes through as-is so no food is ever hidden.
const CATEGORY_GROUP: Record<string, string> = {
  Protein: 'Protein',
  Legumes: 'Protein',
  Vegetables: 'Vegetables',
  Grains: 'Carbs',
  Cereals: 'Carbs',
  'SA Traditional': 'Carbs',
  Dairy: 'Dairy',
  Fats: 'Fats',
  Oils: 'Fats',
  Nuts: 'Fats',
  Spreads: 'Fats',
  Fruits: 'Fruit',
  Snacks: 'Snacks',
  Condiments: 'Snacks',
};
const GROUP_ORDER = ['Protein', 'Vegetables', 'Carbs', 'Dairy', 'Fats', 'Fruit', 'Snacks'];

const groupOf = (food: FoodItem): string =>
  (food.category && CATEGORY_GROUP[food.category]) || food.category || 'Other';

const orderGroups = (groups: string[]): string[] => {
  const known = GROUP_ORDER.filter((g) => groups.includes(g));
  const extras = groups.filter((g) => !GROUP_ORDER.includes(g)).sort();
  return [...known, ...extras];
};

const toPlannerFood = (f: FoodItem): PlannerFood => ({
  id: f.id,
  name: f.name,
  calories: f.calories,
  protein: f.protein,
  carbs: f.carbs,
  fats: f.fats,
  servingType: f.servingType,
  averageWeight: f.averageWeight,
});

const portionLabel = (item: AllocatedFood): string =>
  item.pieceCount != null
    ? `${item.pieceCount} piece${item.pieceCount === 1 ? '' : 's'} (${item.grams}g)`
    : `${item.grams}g`;

const MealPlanner = ({ selectedDate, remaining, onAdded }: MealPlannerProps) => {
  const allFoods = useMemo(() => getAllFoods(), []);
  const mealSplit = useMemo(() => getMealSplit(), []);

  const foodsById = useMemo(() => {
    const m = new Map<string, FoodItem>();
    allFoods.forEach((f) => m.set(f.id, f));
    return m;
  }, [allFoods]);

  // Candidate foods: staples pre-loaded, plus any the user adds this session.
  const [candidateIds, setCandidateIds] = useState<string[]>(() =>
    getStaples().filter((id) => foodsById.has(id)),
  );
  const [onHand, setOnHand] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    getStaples().forEach((id) => {
      if (foodsById.has(id)) init[id] = true;
    });
    return init;
  });
  const [meals, setMeals] = useState<MealType[]>(['dinner', 'snack']);
  const [plans, setPlans] = useState<MealPlan[] | null>(null);
  const [addedKeys, setAddedKeys] = useState<Record<string, boolean>>({});
  const [, setStapleVersion] = useState(0);

  // Category → food dropdowns.
  const groups = useMemo(() => {
    const set = new Set<string>();
    allFoods.forEach((f) => set.add(groupOf(f)));
    return orderGroups(Array.from(set));
  }, [allFoods]);
  const [pickGroup, setPickGroup] = useState<string>('');
  const [pickFoodId, setPickFoodId] = useState<string>('');
  const foodsInGroup = useMemo(
    () =>
      pickGroup
        ? allFoods.filter((f) => groupOf(f) === pickGroup).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [pickGroup, allFoods],
  );

  const candidateFoods = useMemo(
    () => candidateIds.map((id) => foodsById.get(id)).filter((f): f is FoodItem => Boolean(f)),
    [candidateIds, foodsById],
  );

  // Candidates grouped by display category for the on-hand list.
  const candidatesByGroup = useMemo(() => {
    const map = new Map<string, FoodItem[]>();
    candidateFoods.forEach((f) => {
      const g = groupOf(f);
      const arr = map.get(g) ?? [];
      arr.push(f);
      map.set(g, arr);
    });
    return orderGroups(Array.from(map.keys())).map((g) => [g, map.get(g)!] as const);
  }, [candidateFoods]);

  const onHandPlannerFoods = useMemo(
    () => candidateFoods.filter((f) => onHand[f.id]).map(toPlannerFood),
    [candidateFoods, onHand],
  );

  const addCandidate = (food: FoodItem) => {
    setCandidateIds((ids) => (ids.includes(food.id) ? ids : [...ids, food.id]));
    setOnHand((h) => ({ ...h, [food.id]: true }));
    setPlans(null);
  };

  const removeCandidate = (id: string) => {
    setCandidateIds((ids) => ids.filter((x) => x !== id));
    setOnHand((h) => {
      const next = { ...h };
      delete next[id];
      return next;
    });
    setPlans(null);
  };

  const toggleMeal = (meal: MealType) => {
    setMeals((cur) => (cur.includes(meal) ? cur.filter((m) => m !== meal) : [...cur, meal]));
    setPlans(null);
  };

  const calculate = () => {
    setPlans(buildMealPlans({ foods: onHandPlannerFoods, remaining, meals, mealSplit }));
    setAddedKeys({});
  };

  const handleAdd = (meal: MealType, item: AllocatedFood, key: string) => {
    const food = item.food;
    const entry: FoodEntry = {
      id: `${Date.now()}-${Math.random()}`,
      foodId: food.id,
      foodName: food.name,
      portion: item.grams,
      calories: item.macros.calories,
      protein: item.macros.protein,
      carbs: item.macros.carbs,
      fats: item.macros.fats,
      mealType: meal,
      timestamp: new Date().toISOString(),
      servingType: food.servingType,
      pieceCount: food.servingType === 'piece' ? item.pieceCount : undefined,
    };
    addFoodEntry(selectedDate, entry);
    setAddedKeys((k) => ({ ...k, [key]: true }));
    onAdded();
  };

  const orderedMeals = ALL_MEALS.filter((m) => meals.includes(m));

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Pick the foods you have on hand, choose which meals to plan, then Calculate. The planner
        solves gram portions that balance your remaining macros across those meals.
      </p>

      {/* Remaining summary */}
      <div className="grid grid-cols-4 gap-2 text-xs text-center">
        <RemainingChip label="cal" value={Math.round(remaining.calories)} />
        <RemainingChip label="P" value={`${remaining.protein.toFixed(0)}g`} />
        <RemainingChip label="C" value={`${remaining.carbs.toFixed(0)}g`} />
        <RemainingChip label="F" value={`${remaining.fats.toFixed(0)}g`} />
      </div>

      {/* Meals to plan */}
      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
          Meals to plan
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_MEALS.map((meal) => {
            const active = meals.includes(meal);
            return (
              <button
                key={meal}
                onClick={() => toggleMeal(meal)}
                aria-pressed={active}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {MEAL_LABEL[meal]} ({mealSplit[meal] || 0}%)
              </button>
            );
          })}
        </div>
      </div>

      {/* Category → food picker */}
      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
          Add a food
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={pickGroup}
            onChange={(e) => {
              setPickGroup(e.target.value);
              setPickFoodId('');
            }}
            aria-label="Food category"
            className="border rounded px-2 py-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
          >
            <option value="">Category…</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={pickFoodId}
            onChange={(e) => setPickFoodId(e.target.value)}
            disabled={!pickGroup}
            aria-label="Food"
            className="border rounded px-2 py-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-50 flex-1 min-w-[10rem]"
          >
            <option value="">{pickGroup ? 'Choose a food…' : 'Pick a category first'}</option>
            {foodsInGroup.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const f = foodsById.get(pickFoodId);
              if (f) {
                addCandidate(f);
                setPickFoodId('');
              }
            }}
            disabled={!pickFoodId}
            className="px-3 py-2 rounded bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        <AddAdHocFood onAdded={addCandidate} />
      </div>

      {/* On-hand candidates */}
      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
          On-hand foods
        </p>
        {candidateFoods.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No candidate foods yet — add some above.
          </p>
        ) : (
          <div className="space-y-3">
            {candidatesByGroup.map(([group, items]) => (
              <div key={group}>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{group}</p>
                <div className="space-y-1">
                  {items.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 p-2 rounded border border-gray-200 dark:border-gray-700"
                    >
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(onHand[f.id])}
                          onChange={() => {
                            setOnHand((h) => ({ ...h, [f.id]: !h[f.id] }));
                            setPlans(null);
                          }}
                          className="w-4 h-4 flex-shrink-0"
                        />
                        <span className="text-sm truncate">{f.name}</span>
                      </label>
                      <button
                        onClick={() => {
                          toggleStaple(f.id);
                          setStapleVersion((v) => v + 1);
                        }}
                        title={isStaple(f.id) ? 'Remove from staples' : 'Keep as a staple'}
                        aria-label={isStaple(f.id) ? 'Remove from staples' : 'Keep as a staple'}
                        className={`p-1 rounded flex-shrink-0 ${
                          isStaple(f.id) ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'
                        }`}
                      >
                        <Star className="w-4 h-4" fill={isStaple(f.id) ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => removeCandidate(f.id)}
                        title="Remove from this session"
                        aria-label="Remove from this session"
                        className="p-1 rounded text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calculate */}
      <button
        onClick={calculate}
        disabled={onHandPlannerFoods.length === 0 || meals.length === 0}
        className="w-full px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2"
      >
        <Calculator className="w-4 h-4" /> Calculate portions
      </button>
      {onHandPlannerFoods.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-3">
          Tick at least one on-hand food to calculate.
        </p>
      )}

      {/* Solved plans */}
      {plans && (
        <div className="space-y-4">
          {orderedMeals.map((meal) => {
            const plan = plans.find((p) => p.meal === meal);
            if (!plan) return null;
            return (
              <div key={meal} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{MEAL_LABEL[meal]}</h4>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(plan.totals.calories)} / {Math.round(plan.target.calories)} cal
                  </span>
                </div>
                {plan.items.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    No useful portion for this meal from the selected foods.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2 mb-2">
                      {plan.items.map((item, idx) => {
                        const key = `${meal}-${item.food.id}-${idx}`;
                        const added = addedKeys[key];
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-2 p-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                Have {portionLabel(item)} of {item.food.name}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {Math.round(item.macros.calories)}cal •{' '}
                                {item.macros.protein.toFixed(1)}g P •{' '}
                                {item.macros.carbs.toFixed(1)}g C • {item.macros.fats.toFixed(1)}g F
                              </p>
                            </div>
                            <button
                              onClick={() => handleAdd(meal, item, key)}
                              disabled={added}
                              className={`ml-2 px-3 py-1 rounded text-white text-sm font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
                                added ? 'bg-green-600 cursor-default' : 'bg-primary-600 hover:bg-primary-700'
                              }`}
                            >
                              {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              {added ? 'Added' : 'Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Lands at {Math.round(plan.pctOfTarget.calories)}% cal •{' '}
                      {Math.round(plan.pctOfTarget.protein)}% P •{' '}
                      {Math.round(plan.pctOfTarget.carbs)}% C • {Math.round(plan.pctOfTarget.fats)}% F
                      of this meal's share
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RemainingChip = ({ label, value }: { label: string; value: string | number }) => (
  <div className="p-2 rounded bg-gray-50 dark:bg-gray-800">
    <span className="font-bold">{value}</span>
    <span className="text-gray-500 dark:text-gray-400"> {label}</span>
  </div>
);

// ── Quick "add a food not listed" — persists via addCustomFood so it's reusable ──
const AddAdHocFood = ({ onAdded }: { onAdded: (food: FoodItem) => void }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'Protein',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
  });

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    const created = addCustomFood({
      name,
      category: form.category,
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fats: Number(form.fats) || 0,
    });
    onAdded(created);
    setForm({ name: '', category: form.category, calories: '', protein: '', carbs: '', fats: '' });
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-sm text-primary-600 dark:text-primary-400 font-medium"
      >
        + Add a food not listed
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 rounded border border-gray-200 dark:border-gray-700 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          placeholder="Food name"
          className="flex-1 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
        <select
          value={form.category}
          onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
          aria-label="Category"
          className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
        >
          {GROUP_ORDER.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
          <input
            key={k}
            type="number"
            value={form[k]}
            onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))}
            placeholder={k === 'calories' ? 'kcal' : `${k[0].toUpperCase()}${k.slice(1)} g`}
            title={`${k} per 100g`}
            className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
          />
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Macros per 100 g.</p>
      <div className="flex gap-2">
        <button
          onClick={save}
          className="px-3 py-1 rounded bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
        >
          Save &amp; add
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default MealPlanner;
