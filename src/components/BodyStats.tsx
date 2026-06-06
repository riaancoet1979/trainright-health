import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { Trash2, Edit3, Scale, TrendingDown, TrendingUp, Minus, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getBodyStats,
  saveBodyStatEntry,
  deleteBodyStatEntry,
} from '../utils/storage';
import type { BodyStatEntry } from '../types';

// ─── Tiny inline SVG line-chart ───────────────────────────────────────────────

interface ChartPoint {
  label: string;
  value: number;
}

interface MiniLineChartProps {
  points: ChartPoint[];
  color: string;
  unit: string;
  height?: number;
}

const MiniLineChart = ({ points, color, unit, height = 120 }: MiniLineChartProps) => {
  if (points.length === 0) return null;

  const W = 320;
  const H = height;
  const PAD = { top: 10, right: 8, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = points.map(p => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  // Pad the y-axis for a single point so the dot doesn't sit on the bottom line
  const range = maxVal - minVal || Math.max(1, Math.abs(maxVal) * 0.1);

  // Center the single point on the chart instead of dividing by zero
  const toX = (i: number) => points.length === 1
    ? PAD.left + innerW / 2
    : PAD.left + (i / (points.length - 1)) * innerW;
  const toY = (v: number) => PAD.top + innerH - ((v - minVal) / range) * innerH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`)
    .join(' ');

  // Show every nth label to avoid crowding
  const labelStep = Math.ceil(points.length / 5);

  // Y-axis labels (3 ticks)
  const yTicks = [minVal, minVal + range / 2, maxVal];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {/* Grid lines */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={toY(tick).toFixed(1)}
            x2={W - PAD.right} y2={toY(tick).toFixed(1)}
            stroke="currentColor" strokeOpacity="0.1" strokeWidth="1"
          />
          <text
            x={PAD.left - 4} y={Number(toY(tick).toFixed(1)) + 4}
            textAnchor="end" fontSize="9" fill="currentColor" opacity="0.5"
          >
            {tick % 1 === 0 ? tick : tick.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path
        d={`${pathD} L ${toX(points.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`}
        fill={color} fillOpacity="0.08"
      />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={toX(i).toFixed(1)} cy={toY(p.value).toFixed(1)} r="3" fill={color} />
      ))}

      {/* X-axis labels */}
      {points.map((p, i) =>
        i % labelStep === 0 || i === points.length - 1 ? (
          <text
            key={i}
            x={toX(i).toFixed(1)} y={H - 4}
            textAnchor="middle" fontSize="8.5" fill="currentColor" opacity="0.55"
          >
            {p.label}
          </text>
        ) : null
      )}

      {/* Unit label */}
      <text x={PAD.left} y={PAD.top - 2} fontSize="8" fill={color} opacity="0.8">{unit}</text>
    </svg>
  );
};

// ─── Trend badge ──────────────────────────────────────────────────────────────

const TrendBadge = ({ first, last, unit }: { first: number; last: number; unit: string }) => {
  const diff = last - first;
  if (Math.abs(diff) < 0.01) return <span className="text-gray-500 flex items-center gap-1 text-xs"><Minus className="w-3 h-3" /> No change</span>;
  const positive = diff > 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${positive ? 'text-red-500' : 'text-green-500'}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{diff.toFixed(1)} {unit}
    </span>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  weight: '',
  bodyFat: '',
  waist: '',
  chest: '',
  hips: '',
  leftArm: '',
  rightArm: '',
  neck: '',
  thighL: '',
  thighR: '',
  shoulderWidth: '',
  notes: '',
};

type FormState = typeof EMPTY_FORM;

const BodyStats = () => {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick(t => t + 1), []);

  const entries = useMemo(() => getBodyStats(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [activeChart, setActiveChart] = useState<'weight' | 'bodyFat' | 'measurements'>('weight');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setField = (key: keyof FormState, value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setPrefilled(false);
  };

  /**
   * Return the most recent recorded value for a measurement key, scanning back
   * through all entries (newest first). Lets us pre-fill the new-entry form
   * even if the user's last few entries only logged weight — measurements
   * change slowly enough that the most recent value is the right default.
   */
  const lastValue = useCallback((key: keyof BodyStatEntry): number | undefined => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const v = entries[i][key];
      if (typeof v === 'number') return v;
    }
    return undefined;
  }, [entries]);

  /** Open the form for a new entry, pre-filling measurement fields with the
   *  most recent recorded values so it's a one-tap update of "what changed". */
  const openNewEntry = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const fromLast = (key: keyof BodyStatEntry): string => {
      const v = lastValue(key);
      return v !== undefined ? String(v) : '';
    };
    setForm({
      date: today,
      // Weight + body-fat change every weigh-in — leave blank to force fresh input.
      weight: '',
      bodyFat: '',
      // Tape measurements change slowly — pre-fill from last recorded value.
      waist:         fromLast('waist'),
      chest:         fromLast('chest'),
      hips:          fromLast('hips'),
      leftArm:       fromLast('leftArm'),
      rightArm:      fromLast('rightArm'),
      neck:          fromLast('neck'),
      thighL:        fromLast('thighL'),
      thighR:        fromLast('thighR'),
      shoulderWidth: fromLast('shoulderWidth'),
      notes: '',
    });
    setEditingId(null);
    setShowForm(true);
    setPrefilled(entries.length > 0);
  };

  const clearForm = () => {
    setForm({ ...EMPTY_FORM, date: form.date });
    setPrefilled(false);
  };

  const handleSave = () => {
    const id = editingId ?? `body-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: BodyStatEntry = {
      id,
      date: form.date,
      ...(form.weight !== '' && { weight: parseFloat(form.weight) }),
      ...(form.bodyFat !== '' && { bodyFat: parseFloat(form.bodyFat) }),
      ...(form.waist !== '' && { waist: parseFloat(form.waist) }),
      ...(form.chest !== '' && { chest: parseFloat(form.chest) }),
      ...(form.hips !== '' && { hips: parseFloat(form.hips) }),
      ...(form.leftArm !== '' && { leftArm: parseFloat(form.leftArm) }),
      ...(form.rightArm !== '' && { rightArm: parseFloat(form.rightArm) }),
      ...(form.neck !== '' && { neck: parseFloat(form.neck) }),
      ...(form.thighL !== '' && { thighL: parseFloat(form.thighL) }),
      ...(form.thighR !== '' && { thighR: parseFloat(form.thighR) }),
      ...(form.shoulderWidth !== '' && { shoulderWidth: parseFloat(form.shoulderWidth) }),
      ...(form.notes.trim() !== '' && { notes: form.notes.trim() }),
    };
    saveBodyStatEntry(entry);
    resetForm();
    bump();
  };

  const handleEdit = (e: BodyStatEntry) => {
    setForm({
      date: e.date,
      weight: e.weight !== undefined ? String(e.weight) : '',
      bodyFat: e.bodyFat !== undefined ? String(e.bodyFat) : '',
      waist: e.waist !== undefined ? String(e.waist) : '',
      chest: e.chest !== undefined ? String(e.chest) : '',
      hips: e.hips !== undefined ? String(e.hips) : '',
      leftArm: e.leftArm !== undefined ? String(e.leftArm) : '',
      rightArm: e.rightArm !== undefined ? String(e.rightArm) : '',
      neck: e.neck !== undefined ? String(e.neck) : '',
      thighL: e.thighL !== undefined ? String(e.thighL) : '',
      thighR: e.thighR !== undefined ? String(e.thighR) : '',
      shoulderWidth: e.shoulderWidth !== undefined ? String(e.shoulderWidth) : '',
      notes: e.notes ?? '',
    });
    setEditingId(e.id);
    setShowForm(true);
    setPrefilled(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this entry?')) return;
    deleteBodyStatEntry(id);
    bump();
  };

  // Chart data helpers
  const weightPoints: ChartPoint[] = entries
    .filter(e => e.weight !== undefined)
    .map(e => ({ label: format(new Date(e.date + 'T00:00:00'), 'dd MMM'), value: e.weight! }));

  const bodyFatPoints: ChartPoint[] = entries
    .filter(e => e.bodyFat !== undefined)
    .map(e => ({ label: format(new Date(e.date + 'T00:00:00'), 'dd MMM'), value: e.bodyFat! }));

  const mkPoints = (key: keyof BodyStatEntry) =>
    entries
      .filter(e => e[key] !== undefined && typeof e[key] === 'number')
      .map(e => ({ label: format(new Date(e.date + 'T00:00:00'), 'dd MMM'), value: e[key] as number }));

  const waistPoints         = mkPoints('waist');
  const chestPoints         = mkPoints('chest');
  const hipsPoints          = mkPoints('hips');
  const leftArmPoints       = mkPoints('leftArm');
  const rightArmPoints      = mkPoints('rightArm');
  const neckPoints          = mkPoints('neck');
  const thighLPoints        = mkPoints('thighL');
  const thighRPoints        = mkPoints('thighR');
  const shoulderWidthPoints = mkPoints('shoulderWidth');

  // Latest entry for summary card
  const latest = entries.length > 0 ? entries[entries.length - 1] : null;
  const first = entries.length > 1 ? entries[0] : null;

  return (
    <div className="space-y-4 pb-4">
      {/* ── Header + log button ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Scale className="w-5 h-5" /> Body Stats
          </h3>
          <button
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                openNewEntry();
              }
            }}
            className="btn-primary px-4 py-2 text-sm"
          >
            {showForm && !editingId ? 'Cancel' : '+ Log Entry'}
          </button>
        </div>

        {/* Latest snapshot */}
        {latest && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {latest.weight !== undefined && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                <div className="text-xs text-gray-500 mb-1">Weight</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{latest.weight} <span className="text-sm font-normal">kg</span></div>
                {first?.weight !== undefined && <TrendBadge first={first.weight} last={latest.weight} unit="kg" />}
              </div>
            )}
            {latest.bodyFat !== undefined && (
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800">
                <div className="text-xs text-gray-500 mb-1">Body Fat</div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{latest.bodyFat} <span className="text-sm font-normal">%</span></div>
                {first?.bodyFat !== undefined && <TrendBadge first={first.bodyFat} last={latest.bodyFat} unit="%" />}
              </div>
            )}
            {latest.waist !== undefined && (
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800">
                <div className="text-xs text-gray-500 mb-1">Waist</div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{latest.waist} <span className="text-sm font-normal">cm</span></div>
                {first?.waist !== undefined && <TrendBadge first={first.waist} last={latest.waist} unit="cm" />}
              </div>
            )}
            {latest.chest !== undefined && (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
                <div className="text-xs text-gray-500 mb-1">Chest</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{latest.chest} <span className="text-sm font-normal">cm</span></div>
                {first?.chest !== undefined && <TrendBadge first={first.chest} last={latest.chest} unit="cm" />}
              </div>
            )}
          </div>
        )}

        {entries.length === 0 && !showForm && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No entries yet. Tap <strong>+ Log Entry</strong> to get started.
          </p>
        )}
      </div>

      {/* ── Entry form ── */}
      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-base">{editingId ? 'Edit Entry' : 'Log Body Stats'}</h4>
            {prefilled && (
              <button
                onClick={clearForm}
                className="text-xs text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200"
              >
                Clear pre-fill
              </button>
            )}
          </div>
          {prefilled && (
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              Measurements pre-filled from your last entry — adjust only what changed.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input type="date" value={form.date}
              onChange={e => setField('date', e.target.value)}
              className="input-field" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Weight (kg)</label>
              <input type="number" step="0.1" min="0" placeholder="e.g. 82.5"
                value={form.weight} onChange={e => setField('weight', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Body Fat (%)</label>
              <input type="number" step="0.1" min="0" max="60" placeholder="e.g. 18.5"
                value={form.bodyFat} onChange={e => setField('bodyFat', e.target.value)}
                className="input-field" />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Measurements (cm)</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Waist</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.waist} onChange={e => setField('waist', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Chest</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.chest} onChange={e => setField('chest', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hips</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.hips} onChange={e => setField('hips', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Neck</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.neck} onChange={e => setField('neck', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Left Arm</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.leftArm} onChange={e => setField('leftArm', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Right Arm</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.rightArm} onChange={e => setField('rightArm', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Left Thigh</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.thighL} onChange={e => setField('thighL', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Right Thigh</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.thighR} onChange={e => setField('thighR', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Shoulder Width</label>
              <input type="number" step="0.5" min="0" placeholder="cm"
                value={form.shoulderWidth} onChange={e => setField('shoulderWidth', e.target.value)}
                className="input-field" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea rows={2} placeholder="e.g. Morning weight, post workout..."
              value={form.notes} onChange={e => setField('notes', e.target.value)}
              className="input-field resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} className="btn-primary flex-1">
              {editingId ? 'Update Entry' : 'Save Entry'}
            </button>
            <button onClick={resetForm} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Progress charts ── */}
      {entries.length >= 1 && (
        <div className="card">
          <h4 className="font-semibold mb-3">Progress Charts</h4>

          {/* Tab switcher — measurements tab is always available so the user
              sees a chart per section even with a single entry. */}
          <div className="flex gap-2 mb-4">
            {[
              { key: 'weight' as const,       label: 'Weight',       show: weightPoints.length >= 1 },
              { key: 'bodyFat' as const,      label: 'Body Fat',     show: bodyFatPoints.length >= 1 },
              { key: 'measurements' as const, label: 'Measurements', show: [waistPoints, chestPoints, hipsPoints, leftArmPoints, rightArmPoints, neckPoints, thighLPoints, thighRPoints, shoulderWidthPoints].some(p => p.length >= 1) },
            ]
              .filter(t => t.show)
              .map(t => (
                <button key={t.key}
                  onClick={() => setActiveChart(t.key)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    activeChart === t.key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
          </div>

          {activeChart === 'weight' && weightPoints.length >= 1 && (
            <div>
              <MiniLineChart points={weightPoints} color="#3b82f6" unit="kg" height={130} />
              <div className="flex justify-between text-xs text-gray-500 mt-1 px-8">
                <span>{weightPoints[0].value} kg</span>
                <span className="font-medium">Latest: {weightPoints[weightPoints.length - 1].value} kg</span>
              </div>
              {weightPoints.length === 1 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
                  Log another entry to see the trend.
                </p>
              )}
            </div>
          )}

          {activeChart === 'bodyFat' && bodyFatPoints.length >= 1 && (
            <div>
              <MiniLineChart points={bodyFatPoints} color="#f97316" unit="%" height={130} />
              <div className="flex justify-between text-xs text-gray-500 mt-1 px-8">
                <span>{bodyFatPoints[0].value}%</span>
                <span className="font-medium">Latest: {bodyFatPoints[bodyFatPoints.length - 1].value}%</span>
              </div>
              {bodyFatPoints.length === 1 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
                  Log another entry to see the trend.
                </p>
              )}
            </div>
          )}

          {activeChart === 'measurements' && (
            <div className="space-y-4">
              {[
                { points: waistPoints,         label: 'Waist',          color: '#9333ea', textClass: 'text-purple-600 dark:text-purple-400' },
                { points: chestPoints,         label: 'Chest',          color: '#16a34a', textClass: 'text-green-600 dark:text-green-400' },
                { points: hipsPoints,          label: 'Hips',           color: '#db2777', textClass: 'text-pink-600 dark:text-pink-400' },
                { points: shoulderWidthPoints, label: 'Shoulder Width', color: '#0ea5e9', textClass: 'text-sky-600 dark:text-sky-400' },
                { points: leftArmPoints,       label: 'Left Arm',       color: '#2563eb', textClass: 'text-blue-600 dark:text-blue-400' },
                { points: rightArmPoints,      label: 'Right Arm',      color: '#7c3aed', textClass: 'text-violet-600 dark:text-violet-400' },
                { points: thighLPoints,        label: 'Left Thigh',     color: '#ca8a04', textClass: 'text-yellow-600 dark:text-yellow-400' },
                { points: thighRPoints,        label: 'Right Thigh',    color: '#ea580c', textClass: 'text-orange-600 dark:text-orange-400' },
                { points: neckPoints,          label: 'Neck',           color: '#0891b2', textClass: 'text-cyan-600 dark:text-cyan-400' },
              ].filter(m => m.points.length >= 1).map(m => {
                const first = m.points[0];
                const last  = m.points[m.points.length - 1];
                return (
                  <div key={m.label}>
                    <div className="flex items-baseline justify-between mb-1">
                      <p className={`text-xs font-medium ${m.textClass}`}>{m.label}</p>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {last.value} cm{m.points.length >= 2 && ` · Δ ${(last.value - first.value).toFixed(1)} cm`}
                      </span>
                    </div>
                    <MiniLineChart points={m.points} color={m.color} unit="cm" height={100} />
                    {m.points.length === 1 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
                        1 entry on {first.label} — log another to see a trend line.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── History list ──
          Each row is collapsible: tap the header to see every stat recorded
          on that date in a properly formatted detail panel (weight, body fat,
          all six measurements, notes). The compact summary stays on screen
          when collapsed so the user can scan dates quickly. */}
      {entries.length > 0 && (
        <div className="card">
          <h4 className="font-semibold mb-3">History ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Tap a date to see every stat from that day.</p>
          <ul className="space-y-2">
            {[...entries].reverse().map(e => {
              const isOpen = expandedId === e.id;
              const detail: Array<{ label: string; value: string; color: string }> = [];
              if (e.weight        !== undefined) detail.push({ label: 'Weight',         value: `${e.weight} kg`,         color: 'text-blue-600 dark:text-blue-400' });
              if (e.bodyFat       !== undefined) detail.push({ label: 'Body Fat',       value: `${e.bodyFat} %`,         color: 'text-orange-600 dark:text-orange-400' });
              if (e.waist         !== undefined) detail.push({ label: 'Waist',          value: `${e.waist} cm`,          color: 'text-purple-600 dark:text-purple-400' });
              if (e.chest         !== undefined) detail.push({ label: 'Chest',          value: `${e.chest} cm`,          color: 'text-green-600 dark:text-green-400' });
              if (e.hips          !== undefined) detail.push({ label: 'Hips',           value: `${e.hips} cm`,           color: 'text-pink-600 dark:text-pink-400' });
              if (e.shoulderWidth !== undefined) detail.push({ label: 'Shoulder Width', value: `${e.shoulderWidth} cm`,  color: 'text-sky-600 dark:text-sky-400' });
              if (e.leftArm       !== undefined) detail.push({ label: 'Left Arm',       value: `${e.leftArm} cm`,        color: 'text-blue-600 dark:text-blue-400' });
              if (e.rightArm      !== undefined) detail.push({ label: 'Right Arm',      value: `${e.rightArm} cm`,       color: 'text-violet-600 dark:text-violet-400' });
              if (e.thighL        !== undefined) detail.push({ label: 'Left Thigh',     value: `${e.thighL} cm`,         color: 'text-yellow-600 dark:text-yellow-400' });
              if (e.thighR        !== undefined) detail.push({ label: 'Right Thigh',    value: `${e.thighR} cm`,         color: 'text-orange-600 dark:text-orange-400' });
              if (e.neck          !== undefined) detail.push({ label: 'Neck',           value: `${e.neck} cm`,           color: 'text-cyan-600 dark:text-cyan-400' });

              return (
                <li key={e.id}
                  className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* Header row — clickable to expand */}
                  <div className="flex items-start justify-between p-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : e.id)}
                      className="flex-1 min-w-0 text-left"
                      aria-expanded={isOpen}
                      aria-controls={`bodystat-detail-${e.id}`}
                    >
                      <div className="font-medium text-sm flex items-center gap-1">
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-gray-400" />
                          : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        {format(new Date(e.date + 'T00:00:00'), 'EEE, d MMM yyyy')}
                        <span className="ml-2 text-xs text-gray-400 font-normal">
                          {detail.length} stat{detail.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {!isOpen && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {e.weight !== undefined && <span>⚖️ {e.weight} kg</span>}
                          {e.bodyFat !== undefined && <span>🔥 {e.bodyFat}% BF</span>}
                          {e.waist !== undefined && <span>Waist {e.waist} cm</span>}
                          {e.chest !== undefined && <span>Chest {e.chest} cm</span>}
                          {e.hips !== undefined && <span>Hips {e.hips} cm</span>}
                          {e.shoulderWidth !== undefined && <span>Sh {e.shoulderWidth} cm</span>}
                          {e.leftArm !== undefined && <span>L.Arm {e.leftArm} cm</span>}
                          {e.rightArm !== undefined && <span>R.Arm {e.rightArm} cm</span>}
                          {e.thighL !== undefined && <span>L.Thigh {e.thighL} cm</span>}
                          {e.thighR !== undefined && <span>R.Thigh {e.thighR} cm</span>}
                          {e.neck !== undefined && <span>Neck {e.neck} cm</span>}
                        </div>
                      )}
                    </button>
                    <div className="flex gap-2 ml-3 flex-shrink-0">
                      <button onClick={() => handleEdit(e)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" aria-label="Edit entry">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="text-red-500 hover:text-red-700" aria-label="Delete entry">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Detail panel — every stat recorded that day */}
                  {isOpen && (
                    <div id={`bodystat-detail-${e.id}`} className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-700">
                      {detail.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No stats recorded on this date.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                          {detail.map(d => (
                            <div key={d.label} className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2">
                              <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{d.label}</div>
                              <div className={`text-base font-semibold ${d.color}`}>{d.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {e.notes && (
                        <div className="mt-3 text-xs text-gray-600 dark:text-gray-300 italic border-l-2 border-gray-300 dark:border-gray-600 pl-2">
                          "{e.notes}"
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BodyStats;
