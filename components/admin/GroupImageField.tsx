'use client';

import { Input } from '@/components/ui/Input';
import { QuestionImage } from './QuestionImage';
import { composeHeading } from '@/lib/questionGrouping';

interface GroupImageFieldProps {
  assessmentId: string;
  /** The group's anchor question's position — same keying QuestionImage already uses. */
  anchorPosition: number;
  imageUrl?: string;
  imagePublicId?: string;
  title?: string;
  /** The group's current computed codes, e.g. ['13', '14'] or ['22a', '22b'] — for the live heading preview. */
  memberCodes: string[];
  disabled?: boolean;
  onImageChange: (url: string | null, publicId: string | null) => void;
  onTitleChange: (title: string) => void;
}

/**
 * One shared reference image for a whole question group (a "related" pair
 * sharing a diagram, or a lettered "sub" run) — wraps the existing
 * QuestionImage uploader (unchanged, still keyed by position) with a title
 * prompt and a live preview of the sentence that will actually print, so the
 * author never hand-writes "Use the diagram below to answer questions 13 and
 * 14." themselves.
 */
export function GroupImageField({
  assessmentId,
  anchorPosition,
  imageUrl,
  imagePublicId,
  title,
  memberCodes,
  disabled = false,
  onImageChange,
  onTitleChange,
}: GroupImageFieldProps) {
  return (
    <div className="space-y-2">
      <QuestionImage
        assessmentId={assessmentId}
        position={anchorPosition}
        value={imageUrl}
        disabled={disabled}
        onChange={onImageChange}
      />
      {imageUrl && (
        <>
          <Input
            label="Image title (e.g. &quot;The sketch map of Africa&quot;)"
            value={title ?? ''}
            disabled={disabled}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="What the diagram/image shows"
          />
          {title?.trim() && (
            <p className="text-xs text-[#666666] italic">
              {composeHeading(title.trim(), memberCodes)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
