import { useEffect, useState } from 'react';
import { RefreshCw, Link2, Unlink, AlertTriangle } from 'lucide-react';
import { bootstrapDevice } from '../sync/client';
import { isPaired, clearDeviceToken } from '../sync/config';
import { syncNow, subscribeStatus, queueFullUpload, forceFullResync, type SyncStatus } from '../sync/engine';
import { listQuarantined, discardQuarantined, retryAllQuarantined } from '../sync/outbox';
import type { OutboxItem } from '../sync/types';

const SyncSettings = () => {
  const [paired, setPaired] = useState(isPaired());
  const [code, setCode] = useState('');
  const [label, setLabel] = useState(() => (
    /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'Phone' : 'PC'
  ));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [held, setHeld] = useState<OutboxItem[]>([]);

  useEffect(() => subscribeStatus(setStatus), []);

  useEffect(() => {
    void listQuarantined().then(setHeld);
  }, [status?.lastSyncedAt, status?.pending, status?.state]);

  const pair = async () => {
    setBusy(true);
    setError(null);
    const result = await bootstrapDevice(code.trim(), label.trim() || 'Device');
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCode('');
    setPaired(true);
    // A device that already holds data must upload it, or the first pull would
    // make the server's empty state look authoritative.
    await queueFullUpload();
    void syncNow();
  };

  const unpair = () => {
    clearDeviceToken();
    setPaired(false);
  };

  const refreshHeld = () => { void listQuarantined().then(setHeld); };

  if (!paired) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Link2 className="w-4 h-4" /> Sync across devices
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pair this device to share your data with your other devices. You will need the pairing
          code set on the server.
        </p>

        <label className="block text-sm">
          <span className="text-gray-700 dark:text-gray-300">This device is called</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            aria-label="Device name"
            className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-700 dark:text-gray-300">Pairing code</span>
          <input
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-label="Pairing code"
            className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={() => void pair()}
          disabled={busy || !code.trim()}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Pairing...' : 'Pair this device'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <RefreshCw className="w-4 h-4" /> Sync
      </h3>

      <dl className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <div className="flex justify-between">
          <dt>Status</dt>
          <dd data-testid="sync-state" className="text-gray-900 dark:text-gray-100">
            {status?.state ?? 'idle'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Waiting to send</dt>
          <dd data-testid="sync-pending" className="text-gray-900 dark:text-gray-100">
            {status?.pending ?? 0}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Last synced</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleTimeString() : 'never'}
          </dd>
        </div>
      </dl>

      {status?.lastError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{status.lastError}</p>
      )}

      {held.length > 0 && (
        <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {held.length} change{held.length === 1 ? '' : 's'} could not be sent
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {held.slice(0, 10).map((item) => (
              <li key={item.seq} className="flex justify-between gap-2">
                <span>{item.mutation.domain}: {item.lastError}</span>
                <button
                  onClick={() => { void discardQuarantined(item.seq!).then(refreshHeld); }}
                  className="underline shrink-0"
                >
                  discard
                </button>
              </li>
            ))}
            {held.length > 10 && <li>...and {held.length - 10} more</li>}
          </ul>
          <button
            onClick={() => { void retryAllQuarantined().then(() => { refreshHeld(); void syncNow(); }); }}
            className="mt-2 w-full rounded bg-amber-600 px-3 py-1.5 text-xs text-white"
          >
            Retry all
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void syncNow()}
          className="flex-1 rounded bg-blue-600 px-4 py-2 text-white"
        >
          Sync now
        </button>
        <button
          onClick={unpair}
          className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300 flex items-center gap-1"
        >
          <Unlink className="w-4 h-4" /> Unpair
        </button>
      </div>

      <button
        onClick={() => void forceFullResync()}
        className="w-full rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300"
      >
        Force full re-sync
      </button>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Re-downloads your whole history from the server. Safe to run any time — use it if this
        device looks out of step with your others.
      </p>
    </div>
  );
};

export default SyncSettings;
