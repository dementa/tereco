'use client';

import React, { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, User } from 'lucide-react';

interface ImageUploadProps {
  kind: 'profile' | 'school';
  entityId: string;
  /** Current image, if any. */
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  /** Rendered size in px. Photos are square. */
  size?: number;
  disabled?: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Identity photo / logo upload.
 *
 * The file goes straight from the browser to Cloudinary using a signature this
 * app issues; it never passes through our server. What comes back is not
 * trusted either — the server re-reads the asset from Cloudinary before saving
 * the URL, so a tampered client response cannot repoint someone's photo.
 */
export function ImageUpload({
  kind,
  entityId,
  value,
  onChange,
  label = 'Photo',
  size = 96,
  disabled = false,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Shown immediately so the user sees their choice while the upload runs.
  const [preview, setPreview] = useState<string | null>(null);

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

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setBusy(true);

    try {
      const signRes = await fetch('/api/admin/system/uploads/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, entityId }),
      });
      const signed = await signRes.json();
      if (!signed.success) throw new Error(signed.message ?? 'Could not prepare the upload.');

      const { cloudName, apiKey, timestamp, signature, publicId, uploadUrl } = signed.data;

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
        throw new Error(detail?.error?.message ?? `Cloudinary rejected the upload (${cloudName}).`);
      }

      // Confirm and persist server-side; the response URL is read from
      // Cloudinary there, not taken from this request.
      const attachRes = await fetch('/api/admin/system/uploads/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, entityId }),
      });
      const attached = await attachRes.json();
      if (!attached.success) throw new Error(attached.message ?? 'Could not save the image.');

      onChange(attached.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      setPreview(null);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(objectUrl);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/system/uploads/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, entityId, remove: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? 'Could not remove the image.');
      setPreview(null);
      onChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the image.');
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? value;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-[#5A7D8A] tracking-wide">{label}</span>

      <div className="flex items-center gap-3">
        <div
          className="relative rounded-2xl overflow-hidden bg-[#F1F6F8] border-2 border-[#D1E0E8] shrink-0 flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {shown ? (
            // Cloudinary is an external host, so next/image would need remote
            // patterns configured; a plain img keeps this component drop-in.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="w-full h-full object-cover" />
          ) : kind === 'profile' ? (
            <User className="w-1/3 h-1/3 text-[#9BB3BD]" aria-hidden />
          ) : (
            <Camera className="w-1/3 h-1/3 text-[#9BB3BD]" aria-hidden />
          )}

          {busy && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-[#02465B] animate-spin" aria-hidden />
              <span className="sr-only">Uploading</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            id={`upload-${kind}-${entityId}`}
            disabled={disabled || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <label
            htmlFor={`upload-${kind}-${entityId}`}
            className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-[#D1E0E8] bg-white px-3 py-2 text-sm font-medium text-[#02465B] transition-colors ${
              disabled || busy
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer hover:border-[#02465B]/40'
            }`}
          >
            <Camera className="w-4 h-4" aria-hidden />
            {shown ? 'Replace' : 'Upload'}
          </label>

          {shown && !busy && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 text-xs text-[#C26565] hover:text-[#A34C4C]"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              Remove
            </button>
          )}

          <span className="text-xs text-[#9BB3BD]">JPEG, PNG or WebP · max 5MB</span>
        </div>
      </div>

      {error && (
        <p className="text-xs text-[#C26565]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
