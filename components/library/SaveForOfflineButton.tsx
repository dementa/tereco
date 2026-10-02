'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, CloudDownload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  fetchOfflineCatalog,
  getSaved,
  isOfflineSupported,
  onSavedChange,
  removeItem,
  saveItem,
  type SaveProgress,
} from '@/lib/library-offline-store';

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * "Save for offline" on a public Library item: downloads its file(s) and
 * quizzes onto this device (lib/library-offline-store.ts) so it opens with
 * the network off. Hidden where the browser has no service worker or storage.
 */
const noSubscribe = () => () => {};

export function SaveForOfflineButton({ contentId }: { contentId: string }) {
  const supported = useSyncExternalStore(noSubscribe, isOfflineSupported, () => false);
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOfflineSupported()) return;
    const read = () => void getSaved(contentId).then((item) => setSaved(item !== null)).catch(() => {});
    read();
    return onSavedChange(read);
  }, [contentId]);

  if (!supported) return null;

  async function save() {
    setError('');
    setProgress({ loaded: 0, total: null });
    try {
      const item = (await fetchOfflineCatalog()).find((i) => i.id === contentId);
      // Formats that only preview through Microsoft's online viewer (doc,
      // ppt, xls…) or not at all (zip) are not in the offline catalog.
      if (!item) throw new Error("This item can't be opened offline, so it can't be saved.");
      await saveItem(item, setProgress);
    } catch (e) {
      const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
      setError(
        quota
          ? 'Not enough storage on this device. Remove some saved items and try again.'
          : e instanceof Error
            ? e.message
            : 'Could not save this item.'
      );
    } finally {
      setProgress(null);
    }
  }

  if (progress) {
    const pct = progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;
    return (
      <div className="space-y-1.5" role="status">
        <p className="text-sm text-text-secondary">
          Saving for offline… {pct !== null ? `${pct}%` : formatBytes(progress.loaded)}
        </p>
        <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
          <div className="h-full bg-primary-700 transition-[width]" style={{ width: `${pct ?? 15}%` }} />
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700">
          <CheckCircle2 className="w-4 h-4" aria-hidden /> Saved on this device
        </span>
        <Button inline variant="ghost" onClick={() => void removeItem(contentId)}>
          <Trash2 className="w-4 h-4" aria-hidden /> Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button inline variant="outline" onClick={() => void save()}>
        <CloudDownload className="w-4 h-4" aria-hidden /> Save for offline
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
