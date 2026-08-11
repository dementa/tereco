import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import type { SyncStatus as Status } from './tereco-bridge';

/**
 * The five states from issue #33, in one strip.
 *
 * The rule underneath all of them: never let a learner or a teacher believe
 * work has been lost. Even the failure state leads with the fact that the
 * submissions are still on this computer, because the person reading it has no
 * way to check and every reason to panic.
 */
export function SyncStatus({ pollMs = 5000 }: { pollMs?: number }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [retrying, setRetrying] = useState(false);

  const read = useCallback(async () => {
    if (!window.tereco) return;
    try {
      setStatus(await window.tereco.syncStatus());
    } catch {
      // The strip is a readout, not a workflow. If the database cannot be read
      // the paper screens will say so far more usefully than this line can.
    }
  }, []);

  useEffect(() => {
    // Kicked off inside an async closure so nothing is set synchronously in the
    // effect body — same shape as AuthContext, and the reason is the same: a
    // cascading render on mount is avoidable noise.
    void (async () => {
      await read();
    })();

    const timer = setInterval(() => void read(), pollMs);
    return () => clearInterval(timer);
  }, [read, pollMs]);

  const retry = async () => {
    if (!window.tereco) return;
    setRetrying(true);
    try {
      setStatus(await window.tereco.retrySync());
    } finally {
      setRetrying(false);
    }
  };

  if (!status) return null;

  const { state, pending, total, lastError } = status;

  // Nothing has ever been queued on this machine. A green "all synchronised"
  // here would be noise, not reassurance.
  if (total === 0 && pending === 0) return null;

  if (state === 'syncing') {
    return (
      <Strip tone="busy" icon={<Loader2 className="h-4 w-4 animate-spin" aria-hidden />}>
        Synchronizing… {total - pending} / {total} submissions uploaded
      </Strip>
    );
  }

  if (pending === 0) {
    return (
      <Strip tone="done" icon={<CheckCircle className="h-4 w-4" aria-hidden />}>
        Synchronization complete. {total} / {total} submissions uploaded.
      </Strip>
    );
  }

  if (lastError) {
    return (
      <Strip
        tone="problem"
        icon={<AlertCircle className="h-4 w-4" aria-hidden />}
        action={
          <Button inline variant="outline" onClick={retry} isLoading={retrying}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Retry
          </Button>
        }
      >
        <span className="font-medium">
          {pending} {pending === 1 ? 'submission' : 'submissions'} could not be uploaded.
        </span>{' '}
        Your work is still safely stored on this computer.
      </Strip>
    );
  }

  return (
    <Strip
      tone="waiting"
      icon={<AlertCircle className="h-4 w-4" aria-hidden />}
      action={
        <Button inline variant="outline" onClick={retry} isLoading={retrying}>
          Sync now
        </Button>
      }
    >
      {pending} {pending === 1 ? 'assessment is' : 'assessments are'} waiting to sync. They are
      saved on this computer.
    </Strip>
  );
}

const TONES = {
  busy: 'border-neutral-200 bg-neutral-50 text-neutral-700',
  done: 'border-primary-200 bg-primary-50 text-primary-800',
  waiting: 'border-amber-200 bg-amber-50 text-amber-900',
  problem: 'border-red-200 bg-red-50 text-red-900',
} as const;

function Strip({
  tone,
  icon,
  action,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      // Announced politely: a learner mid-paper should not have focus yanked
      // away because a background upload finished.
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}
