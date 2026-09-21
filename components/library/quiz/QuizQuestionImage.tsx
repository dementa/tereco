'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * A question's optional image. The upload goes straight to Cloudinary with a
 * server-issued signature, then the server re-reads the asset (never trusting
 * the browser's word for the URL). The result is held in the editor's state and
 * saved with the quiz — not written to the row here.
 */
export function QuizQuestionImage({
  quizId,
  inputId,
  imageUrl,
  onChange,
}: {
  quizId: string;
  inputId: string;
  imageUrl: string | null;
  onChange: (url: string | null, publicId: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endpoint = `/api/library/quizzes/${quizId}/image`;

  async function upload(file: File) {
    setError('');
    if (!ACCEPTED.includes(file.type)) return setError('Use a JPEG, PNG or WebP image.');
    if (file.size > MAX_BYTES) return setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.`);

    setBusy(true);
    try {
      const signed = await fetch(endpoint, { method: 'POST' }).then((r) => r.json());
      if (!signed.success) throw new Error(signed.message ?? 'Could not prepare the upload.');
      const { apiKey, timestamp, signature, publicId, uploadUrl } = signed.data;

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', apiKey);
      form.append('timestamp', String(timestamp));
      form.append('signature', signature);
      form.append('public_id', publicId);
      form.append('overwrite', 'true');
      form.append('invalidate', 'true');
      const up = await fetch(uploadUrl, { method: 'POST', body: form });
      if (!up.ok) throw new Error((await up.json().catch(() => null))?.error?.message ?? 'Cloudinary rejected the upload.');

      const confirmed = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId }),
      }).then((r) => r.json());
      if (!confirmed.success) throw new Error(confirmed.message ?? 'Could not save the image.');
      onChange(confirmed.data.url, confirmed.data.publicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="w-24 h-16 rounded object-contain bg-[#FAFAFA] border border-[#EAEAEA] shrink-0" />
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="inline-flex items-center gap-1 text-xs text-[#C26565] hover:text-[#A34C4C] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden /> Remove image
          </button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <label
            htmlFor={inputId}
            className={`inline-flex items-center gap-1.5 text-xs ${busy ? 'text-[#A3A3A3] cursor-not-allowed' : 'text-[#02465B] hover:underline cursor-pointer'}`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ImagePlus className="w-3.5 h-3.5" aria-hidden />}
            {busy ? 'Uploading…' : 'Add an image'}
          </label>
        </>
      )}
      {error && <span role="alert" className="text-xs text-[#C26565]">{error}</span>}
    </div>
  );
}
