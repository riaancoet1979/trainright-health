import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface ToastOptions {
  kind?: ToastKind;
  duration?: number;
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; icon: ReactNode }> = {
  info:    { bg: 'bg-slate-800 dark:bg-slate-900', border: 'border-slate-600',  icon: <Info className="w-4 h-4 text-slate-200" /> },
  success: { bg: 'bg-emerald-700 dark:bg-emerald-800', border: 'border-emerald-500', icon: <CheckCircle2 className="w-4 h-4 text-emerald-100" /> },
  error:   { bg: 'bg-red-700 dark:bg-red-800', border: 'border-red-500', icon: <XCircle className="w-4 h-4 text-red-100" /> },
  warning: { bg: 'bg-amber-700 dark:bg-amber-800', border: 'border-amber-500', icon: <AlertTriangle className="w-4 h-4 text-amber-100" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId++;
    const item: ToastItem = {
      id,
      message,
      kind: options.kind ?? 'info',
      duration: options.duration ?? 3500,
    };
    setToasts((t) => [...t, item]);
    if (item.duration > 0) {
      const handle = setTimeout(() => dismissToast(id), item.duration);
      timers.current.set(id, handle);
    }
    return id;
  }, [dismissToast]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => clearTimeout(h));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:top-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const s = KIND_STYLES[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' || t.kind === 'warning' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-lg border ${s.border} ${s.bg} px-3 py-2 text-sm text-white shadow-lg`}
            >
              <span className="mt-0.5 shrink-0">{s.icon}</span>
              <div className="grow whitespace-pre-line break-words">{t.message}</div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}
