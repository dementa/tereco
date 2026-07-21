'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  isRead: boolean;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Notification bell with unread count.
 *
 * Polls rather than holding a realtime subscription: this is a low-frequency
 * feed (lessons filed, results released) and a 60-second poll costs one cheap
 * query, where a socket per signed-in user would cost a connection each.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
        setUnread(data.unread);
      }
    } catch {
      // Silent: a notification feed failing must never interrupt the page.
    }
  }, []);

  useEffect(() => {
    // Kicked off asynchronously so nothing is set synchronously in the effect
    // body; the first fetch resolves on its own microtask.
    void (async () => {
      await load();
    })();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Close when clicking outside the panel.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function markAll() {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setItems((current) => current.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
  }

  async function openItem(n: Notification) {
    if (!n.isRead) {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n.id] }),
      });
      setItems((current) => current.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative p-2 rounded-xl text-[#02465B] hover:bg-[#F1F6F8] transition-colors"
      >
        <Bell className="w-5 h-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C26565] text-white text-[10px] font-medium flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] overflow-y-auto rounded-2xl border border-[#E8EFF3] bg-white shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F6F8] sticky top-0 bg-white">
            <span className="font-medium text-[#12333F]">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="inline-flex items-center gap-1 text-xs text-[#02465B] hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden />
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#5A7D8A]">Nothing yet.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void openItem(n)}
                className={`w-full text-left px-4 py-3 border-b border-[#F1F6F8] last:border-0 hover:bg-[#F8FBFC] transition-colors ${
                  n.isRead ? '' : 'bg-[#F1F6F8]/60'
                }`}
              >
                <span className="flex items-start gap-2">
                  {!n.isRead && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#02465B] mt-1.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#12333F]">{n.title}</span>
                    {n.body && <span className="block text-xs text-[#5A7D8A] mt-0.5">{n.body}</span>}
                    <span className="block text-[10px] text-[#9BB3BD] mt-1">{timeAgo(n.createdAt)}</span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
