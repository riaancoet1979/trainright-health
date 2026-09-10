import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Rest timer between sets.
 *
 * WALL-CLOCK, not tick-counting. The previous implementation decremented a
 * counter on a 1-second setInterval, which browsers throttle or suspend the
 * moment the phone locks or the tab is backgrounded — i.e. exactly what
 * happens while you are resting between sets. It stalled and under-reported.
 * This version stores the target END TIME and derives the remaining seconds
 * from Date.now(), so locking the screen makes no difference: the interval
 * only repaints, and a repaint after a gap shows the correct value.
 *
 * `start(secs)` takes the exercise's own prescribed rest. Callers pass
 * `ProgramExercise.restSeconds`, so a 90-second isolation rest and a
 * 3-minute squat rest are actually different instead of everything using
 * one global default.
 */
const useRestTimer = (defaultSeconds = 120) => {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number>(defaultSeconds);
  const [secondsLeft, setSecondsLeft] = useState<number>(defaultSeconds);
  const [running, setRunning] = useState<boolean>(false);
  /** Seconds remaining when paused — resume rebuilds an end time from this. */
  const pausedLeft = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const clear = () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    if (!running || endAt === null) { clear(); return; }

    const paint = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) { setRunning(false); clear(); }
    };
    paint();
    intervalRef.current = window.setInterval(paint, 250);

    // Repaint the moment the tab comes back, so a locked screen never leaves
    // a stale number on display.
    const onVisible = () => { if (!document.hidden) paint(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clear();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, endAt]);

  const start = useCallback((secs?: number) => {
    const s = secs ?? defaultSeconds;
    pausedLeft.current = null;
    setTotalSeconds(s);
    setSecondsLeft(s);
    setEndAt(Date.now() + s * 1000);
    setRunning(true);
  }, [defaultSeconds]);

  const pause = useCallback(() => {
    setEndAt((prev) => {
      if (prev !== null) {
        const left = Math.max(0, Math.ceil((prev - Date.now()) / 1000));
        pausedLeft.current = left;
        setSecondsLeft(left);
      }
      return prev;
    });
    setRunning(false);
  }, []);

  const resume = useCallback(() => {
    const left = pausedLeft.current ?? secondsLeft;
    if (left <= 0) return;
    pausedLeft.current = null;
    setEndAt(Date.now() + left * 1000);
    setRunning(true);
  }, [secondsLeft]);

  const reset = useCallback((secs?: number) => {
    const s = secs ?? defaultSeconds;
    pausedLeft.current = null;
    setRunning(false);
    setEndAt(null);
    setTotalSeconds(s);
    setSecondsLeft(s);
  }, [defaultSeconds]);

  /** Extend a running (or just-finished) rest by n seconds. */
  const extend = useCallback((secs = 30) => {
    setTotalSeconds((t) => t + secs);
    setEndAt((prev) => {
      const base = prev !== null && prev > Date.now() ? prev : Date.now();
      return base + secs * 1000;
    });
    setRunning(true);
  }, []);

  return { secondsLeft, totalSeconds, running, start, pause, resume, reset, extend };
};

export default useRestTimer;
