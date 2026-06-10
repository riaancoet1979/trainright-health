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

export type ConfirmVariant = 'primary' | 'secondary' | 'danger';

export interface ConfirmChoice<T = unknown> {
  label: string;
  value: T;
  variant?: ConfirmVariant;
}

export interface ConfirmOptions<T = boolean> {
  title?: string;
  message: string;
  /** When omitted, dialog is a yes/no with `confirmLabel` + `cancelLabel`. */
  choices?: ReadonlyArray<ConfirmChoice<T>>;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style of the primary confirm button when no `choices` are provided. */
  confirmVariant?: ConfirmVariant;
}

type PendingState =
  | { kind: 'yesno'; opts: ConfirmOptions<boolean>; resolve: (v: boolean) => void }
  | { kind: 'choice'; opts: ConfirmOptions<unknown>; resolve: (v: unknown) => void };

interface ConfirmContextValue {
  confirm(messageOrOptions: string | ConfirmOptions<boolean>): Promise<boolean>;
  confirmChoice<T>(options: ConfirmOptions<T>): Promise<T | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const VARIANT_CLASS: Record<ConfirmVariant, string> = {
  primary:   'bg-primary-600 hover:bg-primary-700 text-white',
  secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100',
  danger:    'bg-red-600 hover:bg-red-700 text-white',
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const confirm = useCallback((arg: string | ConfirmOptions<boolean>): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const opts: ConfirmOptions<boolean> = typeof arg === 'string' ? { message: arg } : arg;
      setPending({ kind: 'yesno', opts, resolve });
    });
  }, []);

  const confirmChoice = useCallback(<T,>(opts: ConfirmOptions<T>): Promise<T | null> => {
    return new Promise<T | null>((resolve) => {
      setPending({
        kind: 'choice',
        opts: opts as ConfirmOptions<unknown>,
        resolve: (v) => resolve(v as T | null),
      });
    });
  }, []);

  const settle = useCallback((value: boolean | unknown) => {
    if (!pending) return;
    if (pending.kind === 'yesno') {
      pending.resolve(Boolean(value));
    } else {
      pending.resolve(value);
    }
    setPending(null);
  }, [pending]);

  // ESC closes with cancel; trap focus loosely by autofocusing the dialog
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(pending.kind === 'yesno' ? false : null);
      }
    };
    window.addEventListener('keydown', onKey);
    // initial focus on the dialog
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, settle]);

  const value = useMemo(() => ({ confirm, confirmChoice }), [confirm, confirmChoice]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            // click outside cancels
            if (e.target === e.currentTarget) settle(pending.kind === 'yesno' ? false : null);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={pending.opts.title ? 'confirm-title' : undefined}
            aria-describedby="confirm-message"
            tabIndex={-1}
            className="w-full max-w-md rounded-lg bg-white p-5 text-gray-900 shadow-xl outline-none dark:bg-gray-800 dark:text-gray-100"
          >
            {pending.opts.title && (
              <h2 id="confirm-title" className="mb-2 text-lg font-semibold">
                {pending.opts.title}
              </h2>
            )}
            <p id="confirm-message" className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
              {pending.opts.message}
            </p>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {pending.kind === 'yesno' ? (
                <>
                  <button
                    type="button"
                    onClick={() => settle(false)}
                    className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors ${VARIANT_CLASS.secondary}`}
                  >
                    {pending.opts.cancelLabel ?? 'Cancel'}
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => settle(true)}
                    className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${VARIANT_CLASS[pending.opts.confirmVariant ?? 'primary']}`}
                  >
                    {pending.opts.confirmLabel ?? 'OK'}
                  </button>
                </>
              ) : (
                (pending.opts.choices ?? []).map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    autoFocus={i === 0}
                    onClick={() => settle(c.value)}
                    className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${VARIANT_CLASS[c.variant ?? 'primary']}`}
                  >
                    {c.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return ctx;
}
