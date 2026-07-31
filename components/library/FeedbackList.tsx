'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

interface Feedback {
  id: string;
  submittedByName: string;
  rating: number | null;
  comment: string | null;
  createdAt: string;
}

/** Restricted server-side to the content's creator and admin/super_admin. */
export function FeedbackList({ contentId }: { contentId: string }) {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/library/content/${contentId}/feedback`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setItems(res.data);
      })
      .finally(() => setLoading(false));
  }, [contentId]);

  if (loading) return <p className="text-sm text-text-muted">Loading feedback…</p>;
  if (items.length === 0) return <p className="text-sm text-text-muted">No feedback yet.</p>;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="border-b border-primary-100 pb-2 last:border-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-primary-900">{item.submittedByName}</p>
            {item.rating && (
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`w-3.5 h-3.5 ${n <= item.rating! ? 'fill-accent-dark text-accent-dark' : 'text-text-faint'}`} />
                ))}
              </div>
            )}
          </div>
          {item.comment && <p className="text-sm text-text-secondary mt-1">{item.comment}</p>}
        </div>
      ))}
    </div>
  );
}
