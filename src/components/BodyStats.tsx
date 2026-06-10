import { useState, useMemo, useCallback, useRef } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Trash2, Edit3, Scale, TrendingDown, TrendingUp, Minus, ChevronDown, ChevronRight, Download } from 'lucide-react';
import {
  getBodyStats,
  saveBodyStatEntry,
  deleteBodyStatEntry,
  importBodyAssessment,
} from '../utils/storage';
import { INBODY_2026_05_26 } from '../data/inbodyScans';
import type { BodyStatEntry, SegmentalMeasurement } from '../types';
import { useConfirm, useToast } from './ui';

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

// ─── InBody detail-panel helpers ──────────────────────────────────────────────

const REGION_LABEL: Record<string, string> = {
  leftArm:  'Left Arm',
  rightArm: 'Right Arm',
  trunk:    'Trunk',
  leftLeg:  'Left Leg',
  rightLeg: 'Right Leg',
};

const CLASSIFICATION_TONE: Record<string, string> = {
  Normal: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Over:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  Under:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Low:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  High:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const SegmentalGrid = ({ items, kind }: { items: SegmentalMeasurement[]; kind: 'lean' | 'fat' }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-1">
    {items.map(seg => {
      const tone = seg.classification ? CLASSIFICATION_TONE[seg.classification] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      return (
        <div key={seg.region} className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {REGION_LABEL[seg.region] ?? seg.region}
          </div>
          <div className={`text-base font-semibold ${kind === 'lean' ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300'}`}>
            {seg.massKg} kg
          </div>
          {seg.refPercent !== undefined && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{seg.refPercent}% ref</div>
          )}
          {seg.classification && (
            <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${tone}`}>
              {seg.classification}
            </span>
          )}
        </div>
      );
    })}
  </div>
);

const StatTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2">
    <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
    <div className="text-base font-semibold text-gray-800 dark:text-gray-100">{value}</div>
  </div>
);

const fmtDate = (iso?: string, fmt = 'd MMM yyyy HH:mm'): string | null => {
  if (!iso) return null;
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return null;
  }
};

const isRichInBody = (e: BodyStatEntry): boolean =>
  e.source === 'inbody-270'
  || e.source === 'inbody-other'
  || e.totalBodyWaterL !== undefined
  || e.skeletalMuscleMassKg !== undefined
  || e.bodyFatMassKg !== undefined
  || e.inBodyScore !== undefined
  || (e.segmentalLean?.length ?? 0) > 0
  || (e.segmentalFat?.length ?? 0) > 0;

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
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick(t => t + 1), []);

  const entries = useMemo(() => getBodyStats(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

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
    // Scroll to charts so user sees their progress immediately
    setTimeout(() => chartsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
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

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        message: 'Delete this entry?',
        confirmLabel: 'Delete',
        confirmVariant: 'danger',
      }))
    ) {
      return;
    }
    deleteBodyStatEntry(id);
    bump();
    showToast('Entry deleted', { kind: 'success' });
  };

  /** Import the hard-coded 26 May 2026 InBody-270 scan. Idempotent: re-running
   *  enriches missing fields without overwriting user edits and never
   *  duplicates a previously-imported scan. */
  const handleImportInBody = () => {
    const r = importBodyAssessment(INBODY_2026_05_26);
    showToast(
      r.action === 'added'
        ? 'InBody scan added to 26 May 2026.'
        : r.action === 'enriched'
        ? `Enriched existing 26 May entry with ${r.enrichedFields?.length ?? 0} new fields.`
        : 'No change — scan is already up to date.',
      { kind: r.action === 'unchanged' ? 'info' : 'success' },
    );
    bump();
    setExpandedId(r.id);
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

  // ── InBody-derived chart series — unit varies per metric, so each series
  //    carries its own unit and renders inside the same loop as measurements. ──
  const skeletalMusclePoints  = mkPoints('skeletalMuscleMassKg');
  const bodyFatMassPoints     = mkPoints('bodyFatMassKg');
  const fatFreeMassPoints     = mkPoints('fatFreeMassKg');
  const totalBodyWaterPoints  = mkPoints('totalBodyWaterL');
  const inBodyScorePoints     = mkPoints('inBodyScore');
  const bmrPoints             = mkPoints('basalMetabolicRateKcal');
  const visceralFatPoints     = mkPoints('visceralFatLevel');
  const bmiPoints             = mkPoints('bmi');

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
          <div className="flex gap-2">
            <button
              onClick={handleImportInBody}
              className="btn-secondary px-3 py-2 text-xs flex items-center gap-1"
              title="Import the 26 May 2026 InBody scan"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">Import 26 May InBody</span>
              <span className="sm:hidden">Import InBody</span>
            </button>
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
        <div className="card space-y-6" ref={chartsRef}>
          <div>
            <h4 className="font-semibold mb-1">Progress Charts</h4>
            {entries.length >= 2 && first && latest && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {differenceInDays(
                  new Date(latest.date + 'T00:00:00'),
                  new Date(first.date + 'T00:00:00'),
                )}{' '}
                days tracked · {entries.length} entries
              </p>
            )}
          </div>

          {/* Weight */}
          {weightPoints.length >= 1 && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">⚖️ Weight</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>Start: {weightPoints[0].value} kg</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    Now: {weightPoints[weightPoints.length - 1].value} kg
                  </span>
                  {weightPoints.length >= 2 && (
                    <TrendBadge first={weightPoints[0].value} last={weightPoints[weightPoints.length - 1].value} unit="kg" />
                  )}
                </div>
              </div>
              <MiniLineChart points={weightPoints} color="#3b82f6" unit="kg" height={150} />
              {weightPoints.length === 1 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">Log another entry to see the trend line.</p>
              )}
            </div>
          )}

          {/* Body Fat */}
          {bodyFatPoints.length >= 1 && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">🔥 Body Fat</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>Start: {bodyFatPoints[0].value}%</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    Now: {bodyFatPoints[bodyFatPoints.length - 1].value}%
                  </span>
                  {bodyFatPoints.length >= 2 && (
                    <TrendBadge first={bodyFatPoints[0].value} last={bodyFatPoints[bodyFatPoints.length - 1].value} unit="%" />
                  )}
                </div>
              </div>
              <MiniLineChart points={bodyFatPoints} color="#f97316" unit="%" height={150} />
              {bodyFatPoints.length === 1 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">Log another entry to see the trend line.</p>
              )}
            </div>
          )}

          {/* Measurements + InBody-derived series — each series carries its
              own unit so kg / L / kcal can render side-by-side with cm. */}
          {[
            { points: waistPoints,         label: 'Waist',              unit: 'cm',         color: '#9333ea', textClass: 'text-purple-600 dark:text-purple-400' },
            { points: chestPoints,         label: 'Chest',              unit: 'cm',         color: '#16a34a', textClass: 'text-green-600 dark:text-green-400' },
            { points: hipsPoints,          label: 'Hips',               unit: 'cm',         color: '#db2777', textClass: 'text-pink-600 dark:text-pink-400' },
            { points: shoulderWidthPoints, label: 'Shoulder Width',     unit: 'cm',         color: '#0ea5e9', textClass: 'text-sky-600 dark:text-sky-400' },
            { points: leftArmPoints,       label: 'Left Arm',           unit: 'cm',         color: '#2563eb', textClass: 'text-blue-600 dark:text-blue-400' },
            { points: rightArmPoints,      label: 'Right Arm',          unit: 'cm',         color: '#7c3aed', textClass: 'text-violet-600 dark:text-violet-400' },
            { points: thighLPoints,        label: 'Left Thigh',         unit: 'cm',         color: '#ca8a04', textClass: 'text-yellow-600 dark:text-yellow-400' },
            { points: thighRPoints,        label: 'Right Thigh',        unit: 'cm',         color: '#ea580c', textClass: 'text-orange-600 dark:text-orange-400' },
            { points: neckPoints,          label: 'Neck',               unit: 'cm',         color: '#0891b2', textClass: 'text-cyan-600 dark:text-cyan-400' },
            // InBody-derived rich series — show only when ≥1 scan has supplied the metric.
            { points: skeletalMusclePoints,label: 'Skeletal Muscle',    unit: 'kg',         color: '#16a34a', textClass: 'text-green-600 dark:text-green-400' },
            { points: bodyFatMassPoints,   label: 'Body Fat Mass',      unit: 'kg',         color: '#ea580c', textClass: 'text-orange-600 dark:text-orange-400' },
            { points: fatFreeMassPoints,   label: 'Fat-Free Mass',      unit: 'kg',         color: '#0284c7', textClass: 'text-sky-600 dark:text-sky-400' },
            { points: totalBodyWaterPoints,label: 'Total Body Water',   unit: 'L',          color: '#06b6d4', textClass: 'text-cyan-600 dark:text-cyan-400' },
            { points: inBodyScorePoints,   label: 'InBody Score',       unit: '/100',       color: '#9333ea', textClass: 'text-purple-600 dark:text-purple-400' },
            { points: bmrPoints,           label: 'BMR',                unit: 'kcal/day',   color: '#dc2626', textClass: 'text-red-600 dark:text-red-400' },
            { points: visceralFatPoints,   label: 'Visceral Fat Level', unit: '',           color: '#a16207', textClass: 'text-yellow-700 dark:text-yellow-500' },
            { points: bmiPoints,           label: 'BMI',                unit: '',           color: '#525252', textClass: 'text-gray-700 dark:text-gray-300' },
          ].filter(m => m.points.length >= 1).map((m, idx) => {
            const firstPt = m.points[0];
            const lastPt  = m.points[m.points.length - 1];
            const valueSuffix = m.unit ? ` ${m.unit}` : '';
            return (
              <div key={m.label} className={idx === 0 ? 'pt-4 border-t border-gray-100 dark:border-gray-800' : ''}>
                <div className="flex items-baseline justify-between mb-1">
                  <p className={`text-sm font-semibold ${m.textClass}`}>{m.label}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {m.points.length >= 2 && <span>Start: {firstPt.value}{valueSuffix}</span>}
                    <span className="font-medium text-gray-700 dark:text-gray-200">{lastPt.value}{valueSuffix}</span>
                    {m.points.length >= 2 && (
                      <TrendBadge first={firstPt.value} last={lastPt.value} unit={m.unit} />
                    )}
                  </div>
                </div>
                <MiniLineChart points={m.points} color={m.color} unit={m.unit} height={110} />
                {m.points.length === 1 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
                    1 entry on {firstPt.label} — log another to see a trend line.
                  </p>
                )}
              </div>
            );
          })}
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
                      {/* Provenance strip — measured vs added date distinction */}
                      {isRichInBody(e) && (
                        <div className="mt-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 p-2 text-xs text-purple-900 dark:text-purple-200">
                          <div className="font-medium flex flex-wrap items-center gap-x-2">
                            <span>{e.sourceDevice ?? (e.source === 'inbody-270' ? 'InBody 270' : 'Body-composition scan')}</span>
                            {e.inBodyScore !== undefined && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-800/40 text-[11px]">
                                Score {e.inBodyScore}{e.inBodyScoreMax ? `/${e.inBodyScoreMax}` : ''}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] opacity-90">
                            {fmtDate(e.measuredAt) && <span>Measured: {fmtDate(e.measuredAt)}</span>}
                            {fmtDate(e.importedAt, 'd MMM yyyy') && <span>Added: {fmtDate(e.importedAt, 'd MMM yyyy')}</span>}
                          </div>
                        </div>
                      )}

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

                      {/* Body-composition card grid — InBody primary fields */}
                      {(e.totalBodyWaterL !== undefined || e.proteinMassKg !== undefined || e.mineralMassKg !== undefined
                        || e.bodyFatMassKg !== undefined || e.skeletalMuscleMassKg !== undefined
                        || e.fatFreeMassKg !== undefined || e.bmi !== undefined || e.smiKgM2 !== undefined) && (
                        <div className="mt-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-1">
                            Body Composition
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {e.totalBodyWaterL      !== undefined && <StatTile label="Total Body Water" value={`${e.totalBodyWaterL} L`} />}
                            {e.proteinMassKg        !== undefined && <StatTile label="Protein Mass"     value={`${e.proteinMassKg} kg`} />}
                            {e.mineralMassKg        !== undefined && <StatTile label="Mineral Mass"     value={`${e.mineralMassKg} kg`} />}
                            {e.bodyFatMassKg        !== undefined && <StatTile label="Body Fat Mass"    value={`${e.bodyFatMassKg} kg`} />}
                            {e.skeletalMuscleMassKg !== undefined && <StatTile label="Skeletal Muscle"  value={`${e.skeletalMuscleMassKg} kg`} />}
                            {e.fatFreeMassKg        !== undefined && <StatTile label="Fat-Free Mass"    value={`${e.fatFreeMassKg} kg`} />}
                            {e.bmi                  !== undefined && <StatTile label="BMI"              value={`${e.bmi}`} />}
                            {e.smiKgM2              !== undefined && <StatTile label="Skel. Muscle Idx" value={`${e.smiKgM2} kg/m²`} />}
                          </div>
                        </div>
                      )}

                      {/* Metabolic estimates — explicit device-estimate caveat */}
                      {(e.basalMetabolicRateKcal !== undefined || e.recommendedCalorieIntakeKcal !== undefined
                        || e.waistHipRatio !== undefined || e.visceralFatLevel !== undefined
                        || e.obesityDegreePercent !== undefined) && (
                        <div className="mt-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-1">
                            Metabolic Estimates
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {e.basalMetabolicRateKcal       !== undefined && <StatTile label="BMR"           value={`${e.basalMetabolicRateKcal} kcal/d`} />}
                            {e.recommendedCalorieIntakeKcal !== undefined && <StatTile label="Recom. Intake" value={`${e.recommendedCalorieIntakeKcal} kcal/d`} />}
                            {e.waistHipRatio                !== undefined && <StatTile label="Waist/Hip"     value={`${e.waistHipRatio}`} />}
                            {e.visceralFatLevel             !== undefined && <StatTile label="Visceral Fat"  value={`${e.visceralFatLevel}`} />}
                            {e.obesityDegreePercent         !== undefined && <StatTile label="Obesity Deg."  value={`${e.obesityDegreePercent}%`} />}
                          </div>
                          <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 italic">
                            Device estimate — not medical advice.
                          </p>
                        </div>
                      )}

                      {/* Device weight-control suggestion */}
                      {(e.targetWeightKg !== undefined || e.weightControlKg !== undefined
                        || e.fatControlKg !== undefined || e.muscleControlKg !== undefined) && (
                        <div className="mt-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-1">
                            Device Suggestion
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {e.targetWeightKg  !== undefined && <StatTile label="Target Weight" value={`${e.targetWeightKg} kg`} />}
                            {e.weightControlKg !== undefined && <StatTile label="Weight Δ"      value={`${e.weightControlKg > 0 ? '+' : ''}${e.weightControlKg} kg`} />}
                            {e.fatControlKg    !== undefined && <StatTile label="Fat Δ"         value={`${e.fatControlKg > 0 ? '+' : ''}${e.fatControlKg} kg`} />}
                            {e.muscleControlKg !== undefined && <StatTile label="Muscle Δ"     value={`${e.muscleControlKg > 0 ? '+' : ''}${e.muscleControlKg} kg`} />}
                          </div>
                          <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 italic">
                            InBody device estimate — not an automatic app target.
                          </p>
                        </div>
                      )}

                      {/* Segmental lean */}
                      {e.segmentalLean && e.segmentalLean.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-1">
                            Segmental Lean
                          </div>
                          <SegmentalGrid items={e.segmentalLean} kind="lean" />
                        </div>
                      )}

                      {/* Segmental fat */}
                      {e.segmentalFat && e.segmentalFat.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-1">
                            Segmental Fat
                          </div>
                          <SegmentalGrid items={e.segmentalFat} kind="fat" />
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
