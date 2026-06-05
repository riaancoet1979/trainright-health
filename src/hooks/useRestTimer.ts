import { useEffect, useRef, useState } from 'react';

const useRestTimer = (defaultSeconds = 120) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(defaultSeconds);
  const [running, setRunning] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      timerRef.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            setRunning(false);
            if (timerRef.current) window.clearInterval(timerRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [running]);

  const start = (secs?: number) => {
    setSecondsLeft(secs ?? defaultSeconds);
    setRunning(true);
  };

  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const reset = (secs?: number) => {
    setRunning(false);
    setSecondsLeft(secs ?? defaultSeconds);
  };

  return { secondsLeft, running, start, pause, resume, reset };
};

export default useRestTimer;
