'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCheck } from 'lucide-react';

interface Notification {
  id: number;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  isRead: boolean;
}

export default function ParentNotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
        setUnread(data.unread);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (n.link) router.push(n.link);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-primary-900 mb-1">Notifications</h1>
          <p className="text-sm text-text-muted">Announcements and updates about your children.</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" onClick={() => void markAll()}>
            <CheckCheck className="w-4 h-4 mr-1.5" aria-hidden />
            Mark all read
          </Button>
        )}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing yet.</p>
        ) : (
          <div className="divide-y divide-[#FAFAFA]">
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void openItem(n)}
                className={`w-full text-left px-2 py-3 hover:bg-[#FAFAFA] transition-colors ${
                  n.isRead ? '' : 'bg-[#FAFAFA]/60'
                }`}
              >
                <span className="flex items-start gap-2">
                  {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#02465B] mt-1.5 shrink-0" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#12333F]">{n.title}</span>
                    {n.body && <span className="block text-xs text-[#666666] mt-0.5">{n.body}</span>}
                    <span className="block text-[10px] text-[#A3A3A3] mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
