'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Save, Trash2 } from 'lucide-react';
import { GroupImageField } from '@/components/admin/GroupImageField';
import {
  computeCodes,
  groupQuestions,
  formatQuestionLabel,
  isStemParent,
  scanSubRun,
  type QuestionConfig,
} from '@/lib/questionGrouping';

type QuestionType = 'mcq' | 'checkbox' | 'true_false' | 'fill' | 'matching' | 'dragdrop' | 'short' | 'long';

const NEEDS_OPTIONS: QuestionType[] = ['mcq', 'checkbox'];
const HAND_MARKED: QuestionType[] = ['short', 'long', 'matching', 'dragdrop'];
const TRUE_FALSE_OPTIONS = ['True', 'False'];
const CHECKBOX_SEP = '|';

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple choice (one answer)' },
  { value: 'checkbox', label: 'Multiple choice (several answers)' },
  { value: 'true_false', label: 'True or false' },
  { value: 'fill', label: 'Fill in the blank' },
  { value: 'short', label: 'Short answer (marked by hand)' },
  { value: 'long', label: 'Long answer (marked by hand)' },
];

/** Short form for the collapsed row's badge — QUESTION_TYPES' labels are too long to fit there. */
const TYPE_SHORT_LABEL: Record<QuestionType, string> = {
  mcq: 'MCQ',
  checkbox: 'Checkbox',
  true_false: 'True/False',
  fill: 'Fill blank',
  matching: 'Matching',
  dragdrop: 'Drag & drop',
  short: 'Short answer',
  long: 'Long answer',
};

/** Fixed set of sections a paper can use — matches the section Select's own options. */
const SECTION_TABS: { value: string; label: string }[] = [
  { value: '', label: 'No section' },
  { value: 'A', label: 'Section A' },
  { value: 'B', label: 'Section B' },
  { value: 'C', label: 'Section C' },
];

interface Question {
  id?: string;
  position: number;
  code: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer?: string;
  modelAnswer?: string;
  imageUrl?: string;
  imagePublicId?: string;
  maxScore: number;
  config?: QuestionConfig;
}

function blankQuestion(position: number, config?: QuestionConfig): Question {
  return {
    // The server never reads this back off the payload — saveQuestions
    // always deletes and re-inserts the whole paper, minting real ids
    // server-side — so this only exists to give the row a STABLE React key.
    id: crypto.randomUUID(),
    position,
    code: '',
    questionText: '',
    questionType: 'mcq',
    options: ['', ''],
    correctAnswer: '',
    maxScore: 1,
    config,
  };
}

interface QuestionsEditorProps {
  systemId: string;
  apiBase: string;
  /** Where "All assessments" / back navigation goes for this role. */
  detailHref: string;
}

/**
 * Question authoring — its own page rather than a tab on the assessment
 * detail page, since it's a heavier, more focused workflow than the other
 * setup fields (Details/Collaborators/Audience, see AssessmentSetupPanel).
 */
export function QuestionsEditor({ systemId, apiBase, detailHref }: QuestionsEditorProps) {
  const router = useRouter();
  const toast = useToast();

  const [title, setTitle] = useState('');
  // The internal uuid — distinct from the systemId (ASS####) prop, and what
  // GroupImageField/the upload routes actually require (entityId is a uuid).
  const [assessmentUuid, setAssessmentUuid] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [resultsCount, setResultsCount] = useState(0);
  const [activeSection, setActiveSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, resultsRes] = await Promise.all([
        fetch(`${apiBase}/${systemId}`).then((r) => r.json()),
        fetch(`${apiBase}/${systemId}/results`).then((r) => r.json()),
      ]);
      if (detail.success) {
        setTitle(detail.data.title ?? '');
        setAssessmentUuid(detail.data.id ?? '');
        const loadedQuestions: Question[] = detail.data.questions ?? [];
        setQuestions(loadedQuestions);
        // Land on whichever section the paper already ends with, so the
        // very first "Add question" continues it instead of silently
        // starting a fresh "No section" block underneath it.
        setActiveSection(loadedQuestions[loadedQuestions.length - 1]?.config?.section ?? '');
      } else {
        toast.error(detail.message ?? 'Failed to load assessment.');
      }
      if (resultsRes.success) setResultsCount(resultsRes.data.results.length);
    } catch {
      toast.error('Network error while loading the assessment.');
    } finally {
      setLoading(false);
    }
  }, [apiBase, systemId, toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  // Once anyone has sat the paper, the questions are frozen: rewriting them
  // under existing answers would invalidate every score already recorded.
  const locked = resultsCount > 0;

  const codes = useMemo(() => computeCodes(questions), [questions]);
  const displayQuestions = useMemo(
    () => questions.map((q, i) => ({ ...q, code: codes[i], globalIndex: i })),
    [questions, codes]
  );
  const groups = useMemo(() => groupQuestions(displayQuestions), [displayQuestions]);

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach((q) => {
      const key = q.config?.section ?? '';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [questions]);
  const visibleGroups = useMemo(
    () => groups.filter((g) => (g.section ?? '') === activeSection),
    [groups, activeSection]
  );

  const [newlyAddedIndex, setNewlyAddedIndex] = useState<number | null>(null);
  const newlyAddedRef = useRef<HTMLDivElement | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addQuestion() {
    // Tagged with whichever section tab is active, and inserted right after
    // that section's last existing question — never at the bare end of the
    // array — so adding to an earlier section never splits it by landing
    // after a later section and breaking the contiguous-block invariant
    // sections rely on. Only falls back to the very end when this section
    // has no questions yet (starting a brand new section).
    const section = activeSection || undefined;
    let insertAt = questions.length;
    for (let i = questions.length - 1; i >= 0; i--) {
      if ((questions[i].config?.section ?? '') === activeSection) {
        insertAt = i + 1;
        break;
      }
    }
    const newQuestion = blankQuestion(0, section ? { section } : undefined);
    setQuestions((q) =>
      [...q.slice(0, insertAt), newQuestion, ...q.slice(insertAt)].map((item, i) => ({
        ...item,
        position: i + 1,
      }))
    );
    setNewlyAddedIndex(insertAt);
    setExpanded((prev) => new Set(prev).add(newQuestion.id!));
  }

  /**
   * "13, 14 share a diagram" — each keeps its own full number. Creates (or
   * reuses) a group on the target question and inserts a new sibling at the
   * run's END, mirroring addSubQuestion — otherwise clicking this on any
   * member but the last splices the new question into the middle of the
   * group instead of appending after it.
   */
  function addRelatedQuestion(index: number) {
    const target = questions[index];
    const groupId = target.config?.groupId ?? crypto.randomUUID();
    const section = target.config?.section;
    const updated = questions.map((q, i) =>
      i === index ? { ...q, config: { ...q.config, groupId, groupKind: 'relative' as const, section } } : q
    );
    let insertAt = index + 1;
    while (insertAt < updated.length && updated[insertAt].config?.groupId === groupId) insertAt++;
    const newQuestion = blankQuestion(0, { groupId, groupKind: 'relative', section });
    const next = [...updated.slice(0, insertAt), newQuestion, ...updated.slice(insertAt)].map((q, i) => ({
      ...q,
      position: i + 1,
    }));
    setQuestions(next);
    setNewlyAddedIndex(insertAt);
    setExpanded((prev) => new Set(prev).add(newQuestion.id!));
  }

  /**
   * "22 becomes 22a, 22b, 22c" — the whole run consumes one paper number.
   * A later click on any member of an existing run appends the new sibling
   * at the run's END, so a third click always adds the next letter
   * regardless of which member's button was pressed — including past any
   * roman-numeral run nested under an earlier letter (scanSubRun skips over
   * it rather than stopping there; see lib/questionGrouping.ts).
   */
  function addSubQuestion(index: number) {
    const target = questions[index];
    const groupId = target.config?.groupId ?? crypto.randomUUID();
    const section = target.config?.section;
    const updated = questions.map((q, i) =>
      i === index ? { ...q, config: { ...q.config, groupId, groupKind: 'sub' as const, section } } : q
    );
    const { end: insertAt } = scanSubRun(updated, groupId, index);
    const newQuestion = blankQuestion(0, { groupId, groupKind: 'sub', section });
    const next = [...updated.slice(0, insertAt), newQuestion, ...updated.slice(insertAt)].map((q, i) => ({
      ...q,
      position: i + 1,
    }));
    setQuestions(next);
    setNewlyAddedIndex(insertAt);
    setExpanded((prev) => new Set(prev).add(newQuestion.id!));
  }

  /**
   * "(b) becomes (b) (i), (b) (ii)" — offered on any lettered part, and
   * always appends at the nested run's own end (so a second click adds the
   * next roman numeral rather than splitting the run). The lettered part
   * becomes a stem/prompt only the moment it gains its first child — its own
   * type/marks/answer stop applying (isStemParent, lib/questionGrouping.ts),
   * so its maxScore is zeroed here rather than leaving a stale value that
   * validateQuestions would then reject with no field left to fix it from.
   */
  function addSubSubQuestion(index: number) {
    const target = questions[index];
    const next1 = questions[index + 1];
    const alreadyHasChildren = next1?.config?.groupKind === 'subsub';
    const groupId = alreadyHasChildren ? next1.config!.groupId! : crypto.randomUUID();
    const section = target.config?.section;
    const base = alreadyHasChildren
      ? questions
      : questions.map((q, i) => (i === index ? { ...q, maxScore: 0 } : q));
    let insertAt = index + 1;
    while (insertAt < base.length && base[insertAt].config?.groupId === groupId) insertAt++;
    const newQuestion = blankQuestion(0, { groupId, groupKind: 'subsub', section });
    const next = [...base.slice(0, insertAt), newQuestion, ...base.slice(insertAt)].map((q, i) => ({
      ...q,
      position: i + 1,
    }));
    setQuestions(next);
    setNewlyAddedIndex(insertAt);
    setExpanded((prev) => new Set(prev).add(newQuestion.id!));
  }

  useEffect(() => {
    if (newlyAddedIndex === null) return;
    newlyAddedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [newlyAddedIndex]);

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions((current) => current.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function removeQuestion(index: number) {
    setQuestions((current) => {
      const removed = current[index];

      // Roman sub-parts have nowhere to nest without their lettered anchor —
      // removing "(b)" takes "(b) (i)"/"(b) (ii)" with it, rather than
      // leaving them to renumber under whichever letter now precedes them.
      let end = index + 1;
      if (removed.config?.groupKind === 'sub' && current[end]?.config?.groupKind === 'subsub') {
        const nestedId = current[end].config!.groupId;
        while (end < current.length && current[end].config?.groupId === nestedId) end++;
      }
      let next = current.filter((_, i) => i < index || i >= end);

      // If the removed question was a group's anchor holding the shared
      // image/title, migrate it to the new first remaining member — or the
      // shared stimulus silently disappears.
      const groupId = removed.config?.groupId;
      if (groupId && (removed.imageUrl || removed.config?.groupImageTitle)) {
        const firstRemainingIdx = next.findIndex((q) => q.config?.groupId === groupId);
        if (firstRemainingIdx !== -1) {
          next = next.map((q, i) =>
            i === firstRemainingIdx
              ? {
                  ...q,
                  imageUrl: removed.imageUrl,
                  imagePublicId: removed.imagePublicId,
                  config: { ...q.config, groupImageTitle: removed.config?.groupImageTitle },
                }
              : q
          );
        }
      }

      // A group that's shrunk to one member demotes back to a plain
      // standalone question, keeping only its section (if any) — otherwise
      // it'd render as a stray "22a" with no siblings.
      const counts = new Map<string, number>();
      next.forEach((q) => {
        const gid = q.config?.groupId;
        if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1);
      });
      next = next.map((q) => {
        const gid = q.config?.groupId;
        if (gid && counts.get(gid) === 1) {
          return { ...q, config: q.config?.section ? { section: q.config.section } : undefined };
        }
        return q;
      });

      // A 'sub' member demoted above may have been the anchor a 'subsub' run
      // was nesting under — that run is now orphaned (its parent's code no
      // longer has a letter to append a roman numeral to), so it collapses
      // to plain standalone questions too, same as any group whose structure
      // fell out from under it.
      const invalid = new Set<number>();
      for (let i = 0; i < next.length; i++) {
        const cfg = next[i].config;
        const isRunStart = cfg?.groupKind === 'subsub' && next[i - 1]?.config?.groupId !== cfg.groupId;
        if (isRunStart && next[i - 1]?.config?.groupKind !== 'sub') {
          const gid = cfg!.groupId;
          for (let j = i; j < next.length && next[j].config?.groupId === gid; j++) invalid.add(j);
        }
      }
      if (invalid.size > 0) {
        next = next.map((q, i) =>
          invalid.has(i) ? { ...q, config: q.config?.section ? { section: q.config.section } : undefined } : q
        );
      }

      return next.map((q, i) => ({ ...q, position: i + 1 }));
    });
  }

  async function saveQuestions() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/${systemId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map((q) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: NEEDS_OPTIONS.includes(q.questionType)
              ? q.options.filter((o) => o.trim())
              : q.questionType === 'true_false'
                ? TRUE_FALSE_OPTIONS
                : [],
            correctAnswer: q.correctAnswer || undefined,
            modelAnswer: HAND_MARKED.includes(q.questionType) ? q.modelAnswer || undefined : undefined,
            imageUrl: q.imageUrl || undefined,
            imagePublicId: q.imagePublicId || undefined,
            maxScore: Number(q.maxScore),
            config: q.config ?? undefined,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Questions saved.');
        await load();
      } else {
        toast.error(data.message ?? 'Failed to save questions.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push(`${detailHref}/${systemId}`)}
        className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#02465B]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        {title || systemId}
      </button>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-primary-900">Questions</h2>
          {!locked && (
            <Button variant="outline" onClick={addQuestion}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden />
              Add question
            </Button>
          )}
        </div>

        {locked && (
          <p className="text-xs text-[#C26565] mb-3">
            {resultsCount} student{resultsCount === 1 ? ' has' : 's have'} already sat this paper, so
            the questions are locked — editing them would invalidate the scores already recorded
            against them.
          </p>
        )}

        {/* Each tab is its own section: switching tabs both filters the list
            below and decides what "Add question" tags the new row with, so
            building a section end-to-end never touches the section field by
            hand past the first question. */}
        <div className="flex gap-1 mb-4 border-b border-[#EAEAEA] overflow-x-auto">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveSection(tab.value)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeSection === tab.value
                  ? 'border-[#02465B] text-[#02465B]'
                  : 'border-transparent text-[#666666] hover:text-[#02465B]'
              }`}
            >
              {tab.label}
              {sectionCounts[tab.value] ? (
                <span className="ml-1.5 text-xs text-[#A3A3A3]">({sectionCounts[tab.value]})</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {visibleGroups.length === 0 && (
            <p className="text-sm text-text-muted">
              No questions in {SECTION_TABS.find((t) => t.value === activeSection)?.label} yet.
            </p>
          )}

          {visibleGroups.map((group) => {
            const anchor = group.members[0];
            return (
              <div key={anchor.id} className="space-y-2">
                <div className="rounded-xl border-2 border-[#EAEAEA] p-3 space-y-3">
                  <GroupImageField
                    assessmentId={assessmentUuid}
                    anchorPosition={anchor.position}
                    // group.groupImageUrl is only ever set for a true
                    // multi-question group (see groupQuestions in
                    // lib/questionGrouping.ts) — for an ordinary standalone
                    // question it's always undefined, which hid the image
                    // right after uploading it. Falls back to the anchor's
                    // own imageUrl, which for a single-member group IS this
                    // question's image.
                    imageUrl={group.groupImageUrl ?? anchor.imageUrl}
                    imagePublicId={anchor.imagePublicId}
                    title={anchor.config?.groupImageTitle}
                    memberCodes={group.members.map((m) => m.code)}
                    disabled={locked}
                    onImageChange={(url, publicId) =>
                      updateQuestion(anchor.globalIndex, {
                        imageUrl: url ?? undefined,
                        imagePublicId: publicId ?? undefined,
                      })
                    }
                    onTitleChange={(title) =>
                      updateQuestion(anchor.globalIndex, {
                        config: { ...anchor.config, groupImageTitle: title },
                      })
                    }
                  />

                  {group.members.map((q, mi) => {
                    const isOpen = expanded.has(q.id!);
                    const stem = isStemParent(questions, q.globalIndex);
                    return (
                      <div
                        key={q.id}
                        ref={q.globalIndex === newlyAddedIndex ? newlyAddedRef : undefined}
                        className="space-y-2 pt-2 border-t border-[#EAEAEA] first:border-t-0 first:pt-0"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(q.id!)}
                            aria-label={isOpen ? `Collapse ${q.code}` : `Expand ${q.code}`}
                            className="shrink-0 text-[#666666]"
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <span className="text-xs font-medium text-[#666666] w-12 shrink-0">
                            {formatQuestionLabel(q.code, mi === 0)}
                          </span>
                          {isOpen ? (
                            <input
                              type="text"
                              value={q.questionText}
                              disabled={locked}
                              onChange={(e) => updateQuestion(q.globalIndex, { questionText: e.target.value })}
                              placeholder="Question text"
                              aria-label={`${q.code} text`}
                              className="flex-1 rounded-lg border-2 border-[#E5E5E5] px-3 py-1.5 text-sm disabled:bg-[#FAFAFA] focus:border-[#02465B] focus:outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(q.id!)}
                              className="flex-1 min-w-0 flex items-center gap-2 text-left"
                            >
                              <span className="truncate text-sm text-primary-900">
                                {q.questionText.trim() || (
                                  <span className="italic text-text-muted">Untitled question</span>
                                )}
                              </span>
                              <span className="shrink-0 text-[10px] text-text-muted">
                                {stem
                                  ? 'Stem — scored on the parts below'
                                  : `${TYPE_SHORT_LABEL[q.questionType]} · ${q.maxScore} mark${q.maxScore === 1 ? '' : 's'}`}
                              </span>
                            </button>
                          )}
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => removeQuestion(q.globalIndex)}
                              aria-label={`Remove ${q.code}`}
                              className="shrink-0 text-[#C26565] hover:text-[#A34C4C]"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden />
                            </button>
                          )}
                        </div>

                        {isOpen && (
                          <>
                            {stem ? (
                              <p className="text-xs text-text-muted">
                                This is the shared prompt for the roman-numeral parts below it — it has
                                no type, marks, or answer of its own.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <Select
                                  label="Type"
                                  options={QUESTION_TYPES}
                                  value={q.questionType}
                                  disabled={locked}
                                  onChange={(e) =>
                                    updateQuestion(q.globalIndex, {
                                      questionType: e.target.value as QuestionType,
                                      options: NEEDS_OPTIONS.includes(e.target.value as QuestionType)
                                        ? q.options.length
                                          ? q.options
                                          : ['', '']
                                        : [],
                                    })
                                  }
                                />
                                <Input
                                  label="Marks"
                                  type="number"
                                  min={1}
                                  step="0.5"
                                  value={q.maxScore}
                                  disabled={locked}
                                  onChange={(e) => updateQuestion(q.globalIndex, { maxScore: Number(e.target.value) })}
                                />
                                {/* Chosen from the options, never typed: a typo here scores
                                    every learner zero on this question and nothing surfaces it
                                    until someone reads the marks. The database rejects it too. */}
                                {(q.questionType === 'mcq' || q.questionType === 'true_false') && (
                                  <Select
                                    label="Correct answer"
                                    options={[
                                      { value: '', label: 'Choose the correct option' },
                                      ...(q.questionType === 'true_false' ? TRUE_FALSE_OPTIONS : q.options)
                                        .filter((o) => o.trim())
                                        .map((o) => ({ value: o, label: o })),
                                    ]}
                                    value={q.correctAnswer ?? ''}
                                    disabled={locked}
                                    onChange={(e) => updateQuestion(q.globalIndex, { correctAnswer: e.target.value })}
                                  />
                                )}
                                {q.questionType === 'fill' && (
                                  <Input
                                    label="Correct answer"
                                    value={q.correctAnswer ?? ''}
                                    disabled={locked}
                                    onChange={(e) => updateQuestion(q.globalIndex, { correctAnswer: e.target.value })}
                                  />
                                )}
                              </div>
                            )}

                            {!stem && NEEDS_OPTIONS.includes(q.questionType) && (
                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-[#666666]">
                                  Choices
                                  {q.questionType === 'checkbox' && ' — tick every correct one'}
                                </span>
                                {q.options.map((option, oi) => (
                                  <div key={oi} className="flex gap-2 items-center">
                                    {q.questionType === 'checkbox' && (
                                      <input
                                        type="checkbox"
                                        disabled={locked || !option.trim()}
                                        aria-label={`Mark choice ${oi + 1} correct`}
                                        checked={(q.correctAnswer ?? '')
                                          .split(CHECKBOX_SEP)
                                          .map((a) => a.trim())
                                          .includes(option.trim())}
                                        onChange={(e) => {
                                          const chosen = (q.correctAnswer ?? '')
                                            .split(CHECKBOX_SEP)
                                            .map((a) => a.trim())
                                            .filter(Boolean);
                                          const next = e.target.checked
                                            ? [...chosen, option.trim()]
                                            : chosen.filter((a) => a !== option.trim());
                                          updateQuestion(q.globalIndex, { correctAnswer: next.join(CHECKBOX_SEP) });
                                        }}
                                        className="rounded border-[#E5E5E5] shrink-0"
                                      />
                                    )}
                                    <input
                                      type="text"
                                      value={option}
                                      disabled={locked}
                                      onChange={(e) => {
                                        const previous = q.options[oi];
                                        const options = q.options.map((o, i) => (i === oi ? e.target.value : o));
                                        // Carry the correct answer across the rename, or it
                                        // silently stops matching any option.
                                        let correctAnswer = q.correctAnswer;
                                        if (q.questionType === 'checkbox') {
                                          correctAnswer = (q.correctAnswer ?? '')
                                            .split(CHECKBOX_SEP)
                                            .map((a) => (a.trim() === previous.trim() ? e.target.value : a.trim()))
                                            .filter(Boolean)
                                            .join(CHECKBOX_SEP);
                                        } else if (q.correctAnswer && q.correctAnswer === previous) {
                                          correctAnswer = e.target.value;
                                        }
                                        updateQuestion(q.globalIndex, { options, correctAnswer });
                                      }}
                                      placeholder={`Choice ${oi + 1}`}
                                      aria-label={`${q.code} choice ${oi + 1}`}
                                      className="flex-1 rounded-lg border-2 border-[#E5E5E5] px-3 py-1.5 text-sm disabled:bg-[#FAFAFA] focus:border-[#02465B] focus:outline-none"
                                    />
                                    {!locked && q.options.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          // Drop the removed choice from the correct answer
                                          // too. Leaving it behind points the answer at a
                                          // choice that no longer exists, which the database
                                          // rejects — and the whole save fails on a question
                                          // that looks fine on screen.
                                          const removed = q.options[oi].trim();
                                          const correctAnswer = (q.correctAnswer ?? '')
                                            .split(CHECKBOX_SEP)
                                            .map((a) => a.trim())
                                            .filter((a) => a && a !== removed)
                                            .join(CHECKBOX_SEP);
                                          updateQuestion(q.globalIndex, {
                                            options: q.options.filter((_, i) => i !== oi),
                                            correctAnswer,
                                          });
                                        }}
                                        aria-label={`Remove choice ${oi + 1}`}
                                        className="text-[#C26565]"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {!locked && (
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(q.globalIndex, { options: [...q.options, ''] })}
                                    className="text-xs text-[#02465B] hover:underline"
                                  >
                                    + Add choice
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Without this the answer key is blank for exactly the questions
                                a human marker needs help with. Optional, so a paper can still
                                be written quickly. */}
                            {!stem && HAND_MARKED.includes(q.questionType) && (
                              <div className="space-y-1.5">
                                <label htmlFor={`model-${q.globalIndex}`} className="text-xs font-medium text-[#666666]">
                                  Model answer / mark split (optional — printed on the answer key)
                                </label>
                                <textarea
                                  id={`model-${q.globalIndex}`}
                                  rows={2}
                                  value={q.modelAnswer ?? ''}
                                  disabled={locked}
                                  onChange={(e) => updateQuestion(q.globalIndex, { modelAnswer: e.target.value })}
                                  placeholder="e.g. Mouse (1 mark). Used to move the pointer or select items (1 mark)."
                                  className="w-full rounded-lg border-2 border-[#E5E5E5] px-3 py-1.5 text-sm disabled:bg-[#FAFAFA] focus:border-[#02465B] focus:outline-none"
                                />
                              </div>
                            )}

                            {!locked && (
                              <div className="flex gap-3 pl-10">
                                {q.config?.groupKind !== 'sub' && q.config?.groupKind !== 'subsub' && (
                                  <button
                                    type="button"
                                    onClick={() => addRelatedQuestion(q.globalIndex)}
                                    className="text-xs text-[#02465B] hover:underline"
                                  >
                                    + Related question
                                  </button>
                                )}
                                {q.config?.groupKind !== 'relative' && q.config?.groupKind !== 'subsub' && (
                                  <button
                                    type="button"
                                    onClick={() => addSubQuestion(q.globalIndex)}
                                    className="text-xs text-[#02465B] hover:underline"
                                  >
                                    + Sub-part
                                  </button>
                                )}
                                {q.config?.groupKind === 'sub' && (
                                  <button
                                    type="button"
                                    onClick={() => addSubSubQuestion(q.globalIndex)}
                                    className="text-xs text-[#02465B] hover:underline"
                                  >
                                    + Roman sub-part
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {!locked && questions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {/* Same action as the button above the list — placed here too so
                adding several questions in a row never means scrolling back
                up to the top of a long paper. */}
            <Button variant="outline" onClick={addQuestion}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden />
              Add question
            </Button>
            <Button onClick={() => void saveQuestions()} isLoading={saving}>
              <Save className="w-4 h-4 mr-1.5" aria-hidden />
              Save questions
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
