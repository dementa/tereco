'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AlertCircle, Trash2, Plus, Save, X } from 'lucide-react';

interface Question {
  questionId: string;
  questionText: string;
  questionType: 'mcq' | 'checkbox' | 'fill' | 'matching' | 'dragdrop' | 'short' | 'long';
  options: string[];
  correctAnswer?: string;
  maxScore: number;
  config?: unknown;
}

interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number;
  startTime?: string;
  targetType: string;
  targetValue: string;
  questionsSheet?: string; // deprecated
}

export default function EditAssessmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params.id;

  // Assessment metadata state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(30);
  const [startTime, setStartTime] = useState('');
  const [targetType, setTargetType] = useState<'general' | 'class' | 'school+class'>('general');
  const [targetValue, setTargetValue] = useState('');

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState<Partial<Question>>({
    questionType: 'mcq',
    options: [],
    maxScore: 1,
  });

  // Fetch assessment data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/admin/assessments/${assessmentId}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (data.success) {
          const a = data.data;
          setAssessment(a);
          setTitle(a.title);
          setDescription(a.description || '');
          setTimeLimit(a.timeLimit);
          setStartTime(a.startTime || '');
          setTargetType(a.targetType);
          setTargetValue(a.targetValue || '');
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to load assessment');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [assessmentId]);

  // Fetch questions
  useEffect(() => {
    async function fetchQuestions() {
      try {
        const res = await fetch(`/api/admin/assessments/${assessmentId}/questions`);
        if (!res.ok) throw new Error('Failed to fetch questions');
        const data = await res.json();
        if (data.success) {
          setQuestions(data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingQuestions(false);
      }
    }
    fetchQuestions();
  }, [assessmentId]);

  // ─── Metadata save ────────────────────────────────────────
  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { title, description, timeLimit, startTime: startTime || undefined, targetType, targetValue: targetValue || undefined };
      const res = await fetch(`/api/admin/assessments/${assessmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alert('Assessment updated');
      } else {
        alert(data.message || 'Update failed');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Save all questions ──────────────────────────────────
  const handleSaveQuestions = async () => {
    // Normalize options (trim each, drop empties) and correct answers before
    // validating/sending so multi-word options keep their internal spaces.
    const normalized: Question[] = questions.map((q) => ({
      ...q,
      options: q.options.map((o) => o.trim()).filter(Boolean),
      correctAnswer: q.correctAnswer?.trim(),
    }));

    // ── Validate before sending ──
    const errors: string[] = [];
    for (const q of normalized) {
      if (!q.questionId.trim()) errors.push(`Question ID is required (${q.questionText || 'new question'}).`);
      if (!q.questionText.trim()) errors.push(`Question text is required for ${q.questionId || 'new question'}.`);
      if (['mcq', 'checkbox', 'matching', 'dragdrop'].includes(q.questionType)) {
        if (q.options.length === 0) errors.push(`Options are required for ${q.questionType} question "${q.questionId}".`);
      }
      if (['mcq', 'checkbox', 'fill'].includes(q.questionType)) {
        if (!q.correctAnswer?.trim()) errors.push(`Correct answer is required for ${q.questionType} question "${q.questionId}".`);
      }
    }

    if (errors.length > 0) {
      alert(`Validation errors:\n${errors.join('\n')}`);
      return;
    }

    try {
      setQuestions(normalized);
      const res = await fetch(`/api/admin/assessments/${assessmentId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: normalized }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Questions saved successfully!');
      } else {
        // Show detailed validation errors from server
        if (data.errors && Array.isArray(data.errors)) {
          const serverErrors = data.errors
            .map((e: { path?: unknown; message?: string }) => `${Array.isArray(e.path) ? e.path.join('.') : e.path}: ${e.message}`)
            .join('\n');
          alert(`Server validation failed:\n${serverErrors}`);
        } else {
          alert(data.message || 'Failed to save questions');
        }
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
  };

  // ─── Question CRUD helpers ──────────────────────────────
  const addQuestion = () => {
    const newId = `Q${questions.length + 1}`;
    setQuestions([
      ...questions,
      {
        questionId: newId,
        questionText: '',
        questionType: 'mcq',
        options: [],
        correctAnswer: '',
        maxScore: 1,
      },
    ]);
    setEditingQuestionId(newId);
  };

  const updateQuestion = (index: number, field: keyof Question, value: Question[keyof Question]) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const deleteQuestion = (index: number) => {
    if (window.confirm('Delete this question?')) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  // ─── Render question editor ──────────────────────────────
  const renderQuestionEditor = (q: Question, index: number) => {
    const isEditing = editingQuestionId === q.questionId;
    const isNew = q.questionId.startsWith('Q') && q.questionText === '' && !q.options.length;

    return (
      <div key={index} className="border border-[#02465B]/10 rounded-xl p-4 mb-4 relative">
        {!isEditing && !isNew ? (
          // Read-only view
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="font-medium text-[#011E28]">{q.questionId}: {q.questionText}</p>
              <p className="text-xs text-[#5A7A85]">
                {q.questionType} • {q.options.length} options • {q.maxScore} marks
                {q.correctAnswer && ` • Answer: ${q.correctAnswer}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingQuestionId(q.questionId)}>
                Edit
              </Button>
              <Button variant="outline" className="text-[#C0392B]" onClick={() => deleteQuestion(index)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          // Edit mode
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Question ID"
                value={q.questionId}
                onChange={(e) => updateQuestion(index, 'questionId', e.target.value)}
                required
              />
              <Input
                label="Question Text"
                value={q.questionText}
                onChange={(e) => updateQuestion(index, 'questionText', e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Type"
                options={[
                  { value: 'mcq', label: 'Multiple Choice' },
                  { value: 'checkbox', label: 'Checkbox' },
                  { value: 'fill', label: 'Fill in the Blank' },
                  { value: 'matching', label: 'Matching' },
                  { value: 'dragdrop', label: 'Drag and Drop' },
                  { value: 'short', label: 'Short Answer' },
                  { value: 'long', label: 'Long Answer' },
                ]}
                value={q.questionType}
                onChange={(e) => updateQuestion(index, 'questionType', e.target.value as Question['questionType'])}
                required
              />
              <Input
                label="Max Score"
                type="number"
                value={q.maxScore}
                onChange={(e) => updateQuestion(index, 'maxScore', parseFloat(e.target.value) || 1)}
                required
              />
            </div>
            {['mcq', 'checkbox', 'matching', 'dragdrop'].includes(q.questionType) && (
              <div>
                <label className="text-xs font-medium text-[#5A7A85]">Options (comma separated)</label>
                <Input
                  value={q.options.join(', ')}
                  onChange={(e) => updateQuestion(index, 'options', e.target.value.split(','))}
                  placeholder="e.g. A, B, C, D"
                />
              </div>
            )}
            {['mcq', 'checkbox', 'fill'].includes(q.questionType) && (
              <Input
                label="Correct Answer"
                value={q.correctAnswer || ''}
                onChange={(e) => updateQuestion(index, 'correctAnswer', e.target.value)}
              />
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingQuestionId(null)}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button variant="primary" onClick={() => setEditingQuestionId(null)}>
                <Save className="w-4 h-4 mr-1" /> Done
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-[#5A7A85]">Loading assessment...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5FDFF] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-[#C0392B] mx-auto mb-4" />
          <p className="text-[#C0392B]">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/admin/assessments')}>
            Back to List
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5FDFF] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-[#011E28] mb-6">Edit Assessment</h1>

        {/* Metadata Form */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-[#011E28] mb-4">Metadata</h2>
          <form onSubmit={handleSaveMetadata} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input label="Time Limit (minutes)" type="number" value={timeLimit} onChange={(e) => setTimeLimit(parseInt(e.target.value) || 0)} required />
              <Input label="Start Time (optional)" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <Select
                label="Target Type"
                options={[
                  { value: 'general', label: 'General' },
                  { value: 'class', label: 'Class' },
                  { value: 'school+class', label: 'School + Class' },
                ]}
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as 'general' | 'class' | 'school+class')}
                required
              />
              {targetType !== 'general' && (
                <Input
                  label="Target Value"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder={targetType === 'class' ? 'e.g., Form 3A' : 'e.g., Nairobi Academy|Form 4A'}
                  required
                />
              )}
            </div>
            <Button type="submit" isLoading={saving}>Save Metadata</Button>
          </form>
        </Card>

        {/* Questions Manager */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-[#011E28]">Questions</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={addQuestion}>
                <Plus className="w-4 h-4 mr-1" /> Add Question
              </Button>
              <Button variant="primary" onClick={handleSaveQuestions}>
                <Save className="w-4 h-4 mr-1" /> Save All
              </Button>
            </div>
          </div>
          {loadingQuestions ? (
            <p className="text-[#5A7A85]">Loading questions...</p>
          ) : questions.length === 0 ? (
            <p className="text-[#5A7A85]">No questions yet. Add one above.</p>
          ) : (
            <div className="space-y-2">
              {questions.map((q, idx) => renderQuestionEditor(q, idx))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}