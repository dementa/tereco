'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicLibraryItem } from '@/lib/library-public';
import {
  isOfflineSupported,
  listSaved,
  onSavedChange,
  refreshSaved,
  toDetailItem,
  type SavedLibraryItem,
} from '@/lib/library-offline-store';

export type PublicItem = PublicLibraryItem;

function savedToItem(saved: SavedLibraryItem): PublicItem {
  return { ...toDetailItem(saved), createdAt: new Date(saved.savedAt).toISOString() };
}

/**
 * The public catalog plus this device's offline state, for every public
 * Library screen.
 *
 * Online: the list from /api/library/public (the service worker also keeps a
 * copy). Offline, or when the request fails: exactly the items saved on this
 * device, since anything else would be a card that cannot open. Saved copies
 * are brought up to date in the background while online.
 */
export function usePublicLibrary() {
  const [remote, setRemote] = useState<PublicItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<SavedLibraryItem[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    fetch('/api/library/public')
      .then((r) => r.json())
      .then((res) => (res.success ? setRemote(res.data) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!isOfflineSupported()) return;
    const read = () => void listSaved().then(setSaved).catch(() => {});
    const onNetwork = () => setOnline(navigator.onLine);
    read();
    onNetwork();
    void refreshSaved().catch(() => {});
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
    const stop = onSavedChange(read);
    return () => {
      stop();
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
    };
  }, []);

  const offline = !online || (failed && saved.length > 0);
  const items = useMemo(
    () => (offline ? saved.map(savedToItem) : (remote ?? [])),
    [offline, saved, remote]
  );
  const savedIds = useMemo(() => new Set(saved.map((i) => i.id)), [saved]);

  return {
    items,
    savedIds,
    offline,
    loading: remote === null && !failed && !offline,
    error: failed && !offline,
  };
}
