'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/ui/ToastProvider';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { AudienceTargetEditor, type LibraryTarget, type SchoolOption } from '@/components/library/AudienceTargetEditor';

const CONTENT_TYPES = [
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'notes', label: 'Notes' },
  { value: 'support_file', label: 'Support file' },
  { value: 'audiobook', label: 'Audiobook' },
  { value: 'past_paper', label: 'Past paper (downloadable)' },
  { value: 'presentation', label: 'Presentation' },
] as const;

type ContentType = (typeof CONTENT_TYPES)[number]['value'];

const FORMAT_HINTS: Record<ContentType, string> = {
  video: '.mp4, .webm — up to 500MB',
  document: '.pdf, .doc, .docx — up to 50MB',
  notes: '.pdf, .doc, .docx — up to 20MB',
  support_file: '.pdf, .doc, .docx, .xls, .xlsx, .zip — up to 50MB',
  audiobook: '.mp3, .m4a — up to 300MB',
  past_paper: '.pdf — up to 30MB',
  presentation: '.pdf, .ppt, .pptx — up to 100MB',
};

function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Shared by /staff/library/new and /school-admin/library/new. Two steps on
 * one page: (1) upload + metadata creates the draft, (2) once created, an
 * inline audience editor lets the uploader narrow beyond the auto-inserted
 * whole-school row before submitting for super-admin approval.
 */
export function LibraryUploadForm({ myUploadsHref }: { myUploadsHref: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState<ContentType>('document');
  const [learningArea, setLearningArea] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [createdId, setCreatedId] = useState<string | null>(null);
  const [targets, setTargets] = useState<LibraryTarget[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [savingTargets, setSavingTargets] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isSchoolScoped = user?.role === 'staff' || user?.role === 'school_admin';

  useEffect(() => {
    if (!createdId) return;
    async function loadDirectory() {
      if (user?.role === 'school_admin') {
        const res = await fetch('/api/school-admin/classes').then((r) => r.json());
        if (res.success) {
          setSchools([{ id: user.schoolId ?? '', name: 'My school', classes: res.data }]);
        }
      } else {
        const res = await fetch('/api/directory/schools').then((r) => r.json());
        if (res.success) setSchools(res.data);
      }
      const targetsRes = await fetch(`/api/library/content/${createdId}/targets`).then((r) => r.json());
      if (targetsRes.success) setTargets(targetsRes.data);
    }
    loadDirectory();
  }, [createdId, user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    const format = extensionOf(file.name);
    setUploading(true);
    try {
      const id = crypto.randomUUID();

      const sigRes = await fetch('/api/library/uploads/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, contentType, format, bytes: file.size }),
      }).then((r) => r.json());
      if (!sigRes.success) throw new Error(sigRes.message);
      const upload = sigRes.data;

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', upload.apiKey);
      form.append('timestamp', String(upload.timestamp));
      form.append('signature', upload.signature);
      form.append('public_id', upload.publicId);
      form.append('overwrite', 'true');
      form.append('invalidate', 'true');
      if (upload.type) form.append('type', upload.type);

      const cloudinaryRes = await fetch(upload.uploadUrl, { method: 'POST', body: form });
      if (!cloudinaryRes.ok) throw new Error('The upload to Cloudinary failed — try again.');

      const attachRes = await fetch('/api/library/uploads/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title, description, contentType, format, learningArea: learningArea || undefined }),
      }).then((r) => r.json());
      if (!attachRes.success) throw new Error(attachRes.message);

      toast.success('Draft created — set the audience below, then submit for approval.');
      setCreatedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function saveTargets(next: LibraryTarget[]) {
    if (!createdId) return;
    setTargets(next);
    setSavingTargets(true);
    try {
      const res = await fetch(`/api/library/content/${createdId}/targets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: next }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the audience.');
    } finally {
      setSavingTargets(false);
    }
  }

  async function handleSubmitForApproval() {
    if (!createdId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/library/content/${createdId}/submit`, { method: 'POST' }).then((r) => r.json());
      if (!res.success) throw new Error(res.message);
      toast.success('Submitted for approval.');
      router.push(myUploadsHref);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit for approval.');
    } finally {
      setSubmitting(false);
    }
  }

  if (createdId) {
    return (
      <Card className="max-w-2xl space-y-4">
        <div>
          <h2 className="font-semibold text-primary-900">Set the audience</h2>
          <p className="text-sm text-text-muted mt-1">
            {isSchoolScoped
              ? "This is scoped to your school by default — narrow it to a grade or class if it's not meant for everyone."
              : 'Choose who this is visible to, or leave it open to everyone.'}
          </p>
        </div>
        <AudienceTargetEditor
          targets={targets}
          onChange={saveTargets}
          schools={schools}
          locked={isSchoolScoped}
          ownSchoolId={user?.schoolId ?? undefined}
        />
        {savingTargets && <p className="text-xs text-text-muted">Saving…</p>}
        <Button onClick={handleSubmitForApproval} isLoading={submitting}>
          Submit for approval
        </Button>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleCreate} className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted tracking-wide">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border-2 border-[#D1E0E8] bg-white px-4 py-2.5 text-sm focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/10"
          />
        </div>
        <Select
          label="Content type"
          value={contentType}
          onChange={(e) => setContentType(e.target.value as ContentType)}
          options={CONTENT_TYPES as unknown as { value: string; label: string }[]}
        />
        <Input
          label="Subject (optional)"
          value={learningArea}
          onChange={(e) => setLearningArea(e.target.value)}
          placeholder="e.g. Mathematics"
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted tracking-wide">File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-xl file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700"
          />
          <p className="text-xs text-text-muted">{FORMAT_HINTS[contentType]}</p>
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <Button type="submit" isLoading={uploading}>
          Upload
        </Button>
      </form>
    </Card>
  );
}
