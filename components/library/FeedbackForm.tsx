'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * Private feedback only — visible to the content's uploader and admin/
 * super_admin, never to other people browsing the library (epic #11,
 * decision 6). This form itself has no way to see anyone else's feedback.
 */
export function FeedbackForm({ contentId }: { contentId: string }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/library/content/${contentId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: rating || undefined, comment: comment || undefined }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      setSubmitted(true);
      toast.success('Thanks for the feedback.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit feedback.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return <p className="text-sm text-text-muted">Feedback sent — only visible to the uploader and admins.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-muted tracking-wide">Leave feedback (private)</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star`}>
            <Star className={`w-5 h-5 ${n <= rating ? 'fill-accent-dark text-accent-dark' : 'text-text-muted'}`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Optional comment"
        className="w-full rounded-xl border-2 border-[#D1E0E8] bg-white px-4 py-2.5 text-sm focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/10"
      />
      <Button variant="outline" onClick={submit} isLoading={submitting} disabled={!rating && !comment}>
        Send feedback
      </Button>
    </div>
  );
}
