import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { getUserSettings, getDailyEntry, saveUserSettings, getAllDailyEntries } from '../utils/storage';
import { weeklyPushupCompletionRate, steps7DayAverage } from '../utils/fitness';

const LAST_SHOWN_KEY = 'pushup_reminders_last_shown';
const CHECK_INTERVAL_MS = 30 * 1000; // 30s
const DAILY_SETS_GOAL = 5;
const DAILY_REPS_GOAL = 100;
const ADAPT_LAST_KEY = 'pushup_reminders_last_adapt';
const WEEKLY_SUMMARY_KEY = 'pushup_weekly_summary_shown';

function getLastShownMap(): Record<string, number> {
  try {
    const v = localStorage.getItem(LAST_SHOWN_KEY);
    return v ? JSON.parse(v) : {};
  } catch (e) {
    return {};
  }
}

function setLastShown(key: string) {
  const m = getLastShownMap();
  m[key] = Date.now();
  localStorage.setItem(LAST_SHOWN_KEY, JSON.stringify(m));
}

export default function usePushupReminders() {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Register service worker (best-effort)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const check = async () => {
      const settings = getUserSettings();
      const rem = settings.pushupReminders;
      if (!rem || !rem.enabled) return;

      // Request permission if needed (guard if Notification API unavailable)
      const notifAvailable = typeof Notification !== 'undefined';
      if (notifAvailable) {
        if (Notification.permission === 'default') {
          try {
            await Notification.requestPermission();
          } catch (e) {}
        }
        if (Notification.permission !== 'granted') return;
      } else {
        // No Notification API available, skip notifications
        return;
      }

      const now = new Date();
      const day = now.getDay(); // 0=Sun,6=Sat
      const isWeekend = day === 0 || day === 6;
      if (!rem.weekend && isWeekend) return;

      const todayStr = format(now, 'yyyy-MM-dd');

      // For each configured time, check if it's time to notify
      for (const time of rem.times) {
        const [hh, mm] = time.split(':').map((s) => parseInt(s, 10));
        const target = new Date(now);
        target.setHours(hh, mm, 0, 0);

        // Only notify if current time is within 60s of target or passed but not shown
        const diff = now.getTime() - target.getTime();
        if (diff < 0 || diff > 60 * 1000) continue;

        const key = `${todayStr}|${time}`;
        const lastShown = getLastShownMap()[key];
        if (lastShown) continue; // already shown

        // Check if goal already completed
        const entry = getDailyEntry(now);
        const pushupsReps = entry.fitness?.pushups?.totalReps || 0;
        const pushupsSets = entry.fitness?.pushups?.setsCompleted || 0;
        if (pushupsReps >= DAILY_REPS_GOAL || pushupsSets >= DAILY_SETS_GOAL) {
          // mark as shown so we don't repeatedly check this time
          setLastShown(key);
          continue;
        }

        // Show notification via service worker registration
        const body = `Time for pushup set #${Math.min(pushupsSets + 1, DAILY_SETS_GOAL)}!`;
          try {
            const reg = await navigator.serviceWorker.ready;
            // cast options to any to support 'actions' across typings
            reg.showNotification('Pushup Reminder', {
              body,
              tag: `pushup-${todayStr}-${time}`,
              data: { time, date: todayStr },
              actions: [
                { action: 'snooze-15', title: 'Snooze 15m' },
                { action: 'snooze-30', title: 'Snooze 30m' },
                { action: 'snooze-60', title: 'Snooze 1h' },
                { action: 'open', title: 'Open' },
              ],
            } as any);
          } catch (e) {
          // fallback: in-page notification
          try {
            new Notification('Pushup Reminder', { body });
          } catch (e) {}
        }

        setLastShown(key);
      }

      // Adaptive reminders: run once per day
      try {
        const lastAdapt = localStorage.getItem(ADAPT_LAST_KEY);
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        if (lastAdapt !== todayStr) {
          const all = getAllDailyEntries();
          const rate = weeklyPushupCompletionRate(all);
          const stepsAvg = steps7DayAverage(all);

          let changed = false;
          const newRem = { enabled: rem.enabled, times: rem.times ? [...rem.times] : [], weekend: rem.weekend ?? true };

          if (rate >= 80) {
            // reduce to a single evening reminder
            if (JSON.stringify(newRem.times) !== JSON.stringify(['20:00'])) {
              newRem.times = ['20:00'];
              changed = true;
            }
          } else if (rate <= 30) {
            // ensure an extra midday reminder at 13:00
            const timesArr = newRem.times;
            if (!timesArr.includes('13:00')) {
              newRem.times = [...new Set([...timesArr, '13:00'])].sort();
              changed = true;
            }
          }

          if (changed) {
            saveUserSettings({ ...settings, pushupReminders: { enabled: newRem.enabled, times: newRem.times, weekend: newRem.weekend } });
            // notify user of the change
            try {
              const reg = await navigator.serviceWorker.ready;
              reg.showNotification('Pushup Reminders Updated', {
                body: `Reminders adjusted based on recent activity (pushup completion: ${rate}%, steps avg: ${stepsAvg}).`,
              });
            } catch (e) {}
          }

          localStorage.setItem(ADAPT_LAST_KEY, todayStr);
        }
      } catch (e) {
        // ignore adaptation errors
      }

      // Weekly summary scheduling (best-effort while app is open)
      try {
        const last = localStorage.getItem(WEEKLY_SUMMARY_KEY);
        const now = new Date();
        // show a weekly summary on Sundays at 20:00 if not shown yet this week
        const sunday = new Date(now);
        sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
        sunday.setHours(20, 0, 0, 0);
        const key = `${format(sunday, 'yyyy-ww')}`;
        if (now >= sunday && last !== key) {
          const all = getAllDailyEntries();
          const rate = weeklyPushupCompletionRate(all);
          const stepsAvg = steps7DayAverage(all);
          try {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification('Weekly Fitness Summary', {
              body: `Pushup completion: ${rate}%. Steps avg: ${stepsAvg}/day. Check Analytics for details.`,
            });
          } catch (e) {}
          localStorage.setItem(WEEKLY_SUMMARY_KEY, key);
        }
      } catch (e) {}
    };

    // Handle snooze param if app opened from notification click
    const urlParams = new URLSearchParams(window.location.search);
    const snooze = urlParams.get('snooze');
    if (snooze) {
      const mins = parseInt(snooze, 10) || 15;
      const t = setTimeout(async () => {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('Pushup Reminder (Snooze)', {
          body: `Time for your snoozed pushup set!`,
        });
      }, mins * 60 * 1000);
      // Clean up param to avoid re-trigger
      urlParams.delete('snooze');
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', newUrl + window.location.hash);
      return () => clearTimeout(t);
    }

    // Start interval
    check();
    intervalRef.current = window.setInterval(check, CHECK_INTERVAL_MS);

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'nutrition_tracker_user_settings') {
        // Re-run immediately to pick up settings changes
        check();
      }
    };
    window.addEventListener('storage', onStorage);

    const onSettingsUpdated = () => check();
    window.addEventListener('settings-updated', onSettingsUpdated);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('settings-updated', onSettingsUpdated);
    };
  }, []);
}
