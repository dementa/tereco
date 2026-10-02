'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, Download, Share2, WifiOff } from 'lucide-react';
import { SaveForOfflineButton } from '@/components/library/SaveForOfflineButton';
import {
  LibraryItemSkeleton,
  LibraryItemView,
  relatedTo,
  type ViewItem,
} from '@/components/library/public/LibraryItemView';
import { usePublicLibrary } from '@/components/library/public/usePublicLibrary';
import { getSaved, toDetailItem } from '@/lib/library-offline-store';

/**
 * One public Library item on the web. Reads /api/library/public/[id]; with no
 * network, the copy saved on this device. The look is LibraryItemView, shared
 * with the desktop app; this adds the web's own actions — download, share,
 * save for offline.
 */
export function PublicItemDetail() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ViewItem | null>(null);
  const [error, setError] = useState('');
  const [offlineCopy, setOfflineCopy] = useState(false);
  const library = usePublicLibrary();

  useEffect(() => {
    fetch(`/api/library/public/${id}`)
      .then((r) => r.json())
      .then((res) => (res.success ? setItem(res.data) : setError(res.message || 'Could not load this item.')))
      .catch(async () => {
        const saved = await getSaved(id).catch(() => null);
        if (!saved) return setError("You're offline and this item isn't saved on this device.");
        setItem({ ...toDetailItem(saved), createdAt: new Date(saved.savedAt).toISOString() });
        setOfflineCopy(true);
      });
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-semibold text-text-primary">{error}</h1>
        <Link href="/library" className="mt-4 inline-block font-medium text-primary-700 hover:underline">
          Back to the library
        </Link>
      </div>
    );
  }

  if (!item) return <LibraryItemSkeleton />;

  return (
    <LibraryItemView
      item={item}
      showDate={!offlineCopy}
      related={relatedTo(item, library.items)}
      savedIds={library.savedIds}
      banner={
        offlineCopy && (
          <p className="mb-6 flex items-center gap-2 rounded-xl bg-accent-lighter px-4 py-2.5 text-sm text-text-secondary ring-1 ring-accent">
            <WifiOff className="h-4 w-4 shrink-0 text-accent-dark" aria-hidden /> You&apos;re offline — this is the copy
            saved on this device.
          </p>
        )
      }
      actions={
        <>
          {item.downloadAvailable && item.downloadUrl && (
            <a
              href={item.downloadUrl}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-white px-5 text-sm font-semibold text-text-primary hover:border-primary-200 hover:text-primary-700"
            >
              <Download className="h-4 w-4" aria-hidden /> Download PDF
            </a>
          )}
          <ShareButton title={item.title} />
        </>
      }
      aside={
        <>
          <p className="mb-3 text-sm font-semibold text-text-primary">Use it without internet</p>
          <SaveForOfflineButton contentId={item.id} />
        </>
      }
    />
  );
}

/** The phone's own share sheet where there is one; copy the link everywhere else. */
function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-white px-5 text-sm font-semibold text-text-primary hover:border-primary-200 hover:text-primary-700"
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
