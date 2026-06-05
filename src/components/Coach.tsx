import { useMemo, useState } from 'react';
import { Brain, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { dailyInsights, weeklyReview } from '../utils/coach';
import type { Insight } from '../utils/coach';

const LEVEL_CLS: Record<Insight['level'], string> = {
  good: 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  warn: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  action: 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const InsightRow = ({ i }: { i: Insight }) => (
  <div className={`text-sm rounded-lg px-3 py-2 ${LEVEL_CLS[i.level]}`}>{i.text}</div>
);

/** Compact daily card for the Train tab. */
export const CoachDaily = ({ date }: { date: Date }) => {
  const insights = useMemo(() => dailyInsights(date), [date]);
  if (insights.length === 0) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
      <h3 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        <Brain className="w-5 h-5" /> Coach — today
      </h3>
      <div className="space-y-1.5">
        {insights.map((i, idx) => <InsightRow key={idx} i={i} />)}
      </div>
    </div>
  );
};

/** Full weekly review for the Analytics tab. */
export const CoachWeekly = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const review = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return weeklyReview(d);
  }, [weekOffset]);

  const stat = (label: string, value: string) => (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-center">
      <div className="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Brain className="w-5 h-5" /> Coach — weekly review
        </h3>
        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
          <button onClick={() => setWeekOffset((w) => w - 1)} aria-label="previous week"><ChevronLeft className="w-5 h-5" /></button>
          <span>
            Wk of {format(new Date(review.weekStart + 'T00:00:00'), 'd MMM')}
            {review.weekNum ? ` (program wk ${review.weekNum})` : ''}
          </span>
          <button onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} aria-label="next week"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {stat('Sessions', `${review.sessionsCompleted}/${review.sessionsPlanned}`)}
        {stat('Sleep avg', review.avgSleep !== null ? `${review.avgSleep}h` : '—')}
        {stat('Steps avg', review.avgSteps !== null ? review.avgSteps.toLocaleString() : '—')}
        {stat('Protein avg', review.avgProtein !== null ? `${review.avgProtein}g` : '—')}
        {stat('Kcal avg', review.avgCalories !== null ? `${review.avgCalories}` : '—')}
        {stat('Weight Δ', review.weightChangeKg !== null ? `${review.weightChangeKg > 0 ? '+' : ''}${review.weightChangeKg}kg` : '—')}
      </div>

      <div className="space-y-1.5">
        {review.recommendations.map((i, idx) => <InsightRow key={idx} i={i} />)}
      </div>

      {review.exerciseRecs.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-2 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Ready to progress
          </h4>
          <ul className="space-y-1">
            {review.exerciseRecs.map((r) => (
              <li key={r.exerciseName} className="text-sm text-gray-700 dark:text-gray-300">
                <strong>{r.exerciseName}</strong> — {r.reason}. <span className="text-primary-600 dark:text-primary-400">{r.how}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        Rule-based suggestions from your logged data — final calls stay with you (and your coach in Claude for the judgment work).
      </p>
    </div>
  );
};
