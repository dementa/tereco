'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';

interface QuestionImageProps {
  assessmentId: string;
  /** The question's position in the paper — see below for why, not its id. */
  position: number;
  value?: string;
  disabled?: boolean;
  onChange: (url: string | null, publicId: string | null) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Reference image for a question — "identify the part shown above".
 *
 * Keyed on the assessment and the question's POSITION, not the question's id:
 * saving a paper deletes and re-inserts every question, so ids change on every
 * save and an id-keyed image would be orphaned as soon as the paper was edited.
 *
 * The URL is not written to a row here. It is carried in the paper's save
 * payload, because that save is what replaces the questions.
 */
export function QuestionImage({
  assessmentId,
  position,
  value,
  disabled = false,
  onChange,
}: QuestionImageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setError('');
    if (!ACCEPTED.includes(file.type)) {
      setError('Use a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.`);
      return;
    }

    setBusy(true);
    try {
      const signRes = await fetch('/api/admin/system/uploads/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'question', entityId: assessmentId, slot: position }),
      });
      const signed = await signRes.json();
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

      const uploadRes = await fetch(uploadUrl, { method: 'POST', body: form });
      if (!uploadRes.ok) {
        const detail = await uploadRes.json().catch(() => null);
        throw new Error(detail?.error?.message ?? 'Cloudinary rejected the upload.');
      }

      // The server re-reads the asset from Cloudinary rather than trusting
      // whatever this request reports.
      const confirmRes = await fetch('/api/admin/system/uploads/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'question', entityId: assessmentId, slot: position }),
      });
      const confirmed = await confirmRes.json();
      if (!confirmed.success) throw new Error(confirmed.message ?? 'Could not save the image.');

      onChange(confirmed.data.url, confirmed.data.publicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch('/api/admin/system/uploads/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'question',
          entityId: assessmentId,
          slot: position,
          remove: true,
        }),
      });
      onChange(null, null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="w-20 h-16 rounded object-contain bg-[#F1F6F8] border border-[#E8EFF3] shrink-0"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs text-[#C26565] hover:text-[#A34C4C]"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              Remove image
            </button>
          )}
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            id={`qimg-${assessmentId}-${position}`}
            className="sr-only"
            disabled={disabled || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <label
            htmlFor={`qimg-${assessmentId}-${position}`}
            className={`inline-flex items-center gap-1.5 text-xs ${
              disabled || busy
                ? 'text-[#9BB3BD] cursor-not-allowed'
                : 'text-[#02465B] hover:underline cursor-pointer'
            }`}
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="w-3.5 h-3.5" aria-hidden />
            )}
            {busy ? 'Uploading…' : 'Add reference image'}
          </label>
        </>
      )}
      {error && (
        <span className="text-xs text-[#C26565]" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
