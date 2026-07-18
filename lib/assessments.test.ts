import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  const from = vi.fn(() => builder);
  return {
    from,
    builder,
    setResult: (r: { data: unknown; error: unknown }) => { result = r; },
  };
});

vi.mock('./supabase', () => ({ getSupabaseAdmin: () => ({ from: h.from }) }));

import {
  getAssessments,
  getAssessmentById,
  createAssessment,
  updateAssessment,
  softDeleteAssessment,
  getQuestions,
  deleteQuestionsForAssessment,
  saveQuestions,
  saveResponses,
} from './assessments';

function assessmentRow(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    title: 'Title',
    description: 'Desc',
    time_limit: 30,
    start_time: null,
    target_type: 'general',
    target_value: '',
    questions_sheet: 'Q1',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.setResult({ data: null, error: null });
});

describe('getAssessments', () => {
  it('selects non-deleted assessments ordered by creation time', async () => {
    h.setResult({ data: [], error: null });
    await getAssessments();
    expect(h.from).toHaveBeenCalledWith('assessments');
    expect(h.builder.eq).toHaveBeenCalledWith('deleted', false);
    expect(h.builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('maps snake_case rows into the Assessment shape with defaults', async () => {
    h.setResult({
      data: [assessmentRow({ id: 'a1', title: null, time_limit: null, target_type: null })],
      error: null,
    });
    const [a] = await getAssessments();
    expect(a).toEqual({
      id: 'a1',
      title: '',
      description: 'Desc',
      timeLimit: 0,
      startTime: undefined,
      targetType: 'general',
      targetValue: '',
      questionsSheet: 'Q1',
    });
  });

  it('filters class-targeted assessments by class name', async () => {
    h.setResult({
      data: [
        assessmentRow({ id: 'g', target_type: 'general' }),
        assessmentRow({ id: 'match', target_type: 'class', target_value: 'Form 3A' }),
        assessmentRow({ id: 'nomatch', target_type: 'class', target_value: 'Form 3B' }),
      ],
      error: null,
    });
    const result = await getAssessments('AnySchool', 'Form 3A');
    expect(result.map(a => a.id).sort()).toEqual(['g', 'match']);
  });

  it('filters school+class assessments by both school and class', async () => {
    h.setResult({
      data: [
        assessmentRow({ id: 'ok', target_type: 'school+class', target_value: 'Nairobi Academy|Form 3A' }),
        assessmentRow({ id: 'badclass', target_type: 'school+class', target_value: 'Nairobi Academy|Form 3B' }),
        assessmentRow({ id: 'badschool', target_type: 'school+class', target_value: 'Other|Form 3A' }),
      ],
      error: null,
    });
    const result = await getAssessments('Nairobi Academy', 'Form 3A');
    expect(result.map(a => a.id)).toEqual(['ok']);
  });

  it('when only a school is given, excludes class-only and non-matching school+class', async () => {
    h.setResult({
      data: [
        assessmentRow({ id: 'general', target_type: 'general' }),
        assessmentRow({ id: 'classonly', target_type: 'class', target_value: 'Form 1' }),
        assessmentRow({ id: 'sc-ok', target_type: 'school+class', target_value: 'MySchool|Form 1' }),
        assessmentRow({ id: 'sc-bad', target_type: 'school+class', target_value: 'Elsewhere|Form 1' }),
      ],
      error: null,
    });
    const result = await getAssessments('MySchool');
    expect(result.map(a => a.id).sort()).toEqual(['general', 'sc-ok']);
  });

  it('returns an empty array when the query errors', async () => {
    h.setResult({ data: null, error: { message: 'boom' } });
    await expect(getAssessments()).resolves.toEqual([]);
  });
});

describe('getAssessmentById', () => {
  it('returns the mapped assessment when found', async () => {
    h.setResult({ data: assessmentRow({ id: 'a2', title: 'Two' }), error: null });
    const result = await getAssessmentById('a2');
    expect(h.builder.eq).toHaveBeenCalledWith('id', 'a2');
    expect(result).toMatchObject({ id: 'a2', title: 'Two' });
  });

  it('returns null when no row is found', async () => {
    h.setResult({ data: null, error: null });
    await expect(getAssessmentById('missing')).resolves.toBeNull();
  });

  it('returns null when the query errors', async () => {
    h.setResult({ data: null, error: { message: 'down' } });
    await expect(getAssessmentById('x')).resolves.toBeNull();
  });
});

describe('createAssessment', () => {
  it('inserts a row with snake_case fields and deleted=false', async () => {
    h.setResult({ data: null, error: null });
    await createAssessment({
      id: 'a1', title: 'T', timeLimit: 20, targetType: 'general', questionsSheet: 'Q1',
    });
    expect(h.builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'a1', title: 'T', time_limit: 20, target_type: 'general',
      questions_sheet: 'Q1', description: '', target_value: '', deleted: false,
    }));
  });

  it('throws with the supabase error message on failure', async () => {
    h.setResult({ data: null, error: { message: 'insert failed' } });
    await expect(
      createAssessment({ id: 'a1', title: 'T', timeLimit: 1, targetType: 'general', questionsSheet: 'Q' })
    ).rejects.toThrow('insert failed');
  });
});

describe('updateAssessment', () => {
  it('builds a partial patch mapping only provided fields', async () => {
    h.setResult({ data: null, error: null });
    await updateAssessment('a1', { title: 'New', timeLimit: 45 });
    expect(h.builder.update).toHaveBeenCalledWith({ title: 'New', time_limit: 45 });
    expect(h.builder.eq).toHaveBeenCalledWith('id', 'a1');
  });

  it('does nothing when no fields are provided', async () => {
    await updateAssessment('a1', {});
    expect(h.builder.update).not.toHaveBeenCalled();
  });

  it('throws with the supabase error message on failure', async () => {
    h.setResult({ data: null, error: { message: 'update failed' } });
    await expect(updateAssessment('a1', { title: 'x' })).rejects.toThrow('update failed');
  });
});

describe('softDeleteAssessment', () => {
  it('sets deleted=true for the given id', async () => {
    h.setResult({ data: null, error: null });
    await softDeleteAssessment('a1');
    expect(h.builder.update).toHaveBeenCalledWith({ deleted: true });
    expect(h.builder.eq).toHaveBeenCalledWith('id', 'a1');
  });

  it('throws with the supabase error message on failure', async () => {
    h.setResult({ data: null, error: { message: 'del failed' } });
    await expect(softDeleteAssessment('a1')).rejects.toThrow('del failed');
  });
});

describe('getQuestions', () => {
  it('maps question rows applying defaults', async () => {
    h.setResult({
      data: [
        { question_id: 'q1', question_text: 'T1', type: 'mcq', options: ['a', 'b'], correct_answer: 'a', max_score: 2, config: { shuffle: true } },
        { question_id: 'q2', question_text: 'T2', type: null, options: null, correct_answer: null, max_score: null, config: null },
      ],
      error: null,
    });
    const result = await getQuestions('a1');
    expect(h.builder.eq).toHaveBeenCalledWith('assessment_id', 'a1');
    expect(result[0]).toEqual({
      questionId: 'q1', questionText: 'T1', questionType: 'mcq',
      options: ['a', 'b'], correctAnswer: 'a', maxScore: 2, config: { shuffle: true },
    });
    expect(result[1]).toEqual({
      questionId: 'q2', questionText: 'T2', questionType: 'short',
      options: [], correctAnswer: undefined, maxScore: 1, config: undefined,
    });
  });

  it('returns an empty array when the query errors', async () => {
    h.setResult({ data: null, error: { message: 'boom' } });
    await expect(getQuestions('a1')).resolves.toEqual([]);
  });
});

describe('deleteQuestionsForAssessment', () => {
  it('deletes questions for the assessment', async () => {
    h.setResult({ data: null, error: null });
    await deleteQuestionsForAssessment('a1');
    expect(h.from).toHaveBeenCalledWith('questions');
    expect(h.builder.delete).toHaveBeenCalled();
    expect(h.builder.eq).toHaveBeenCalledWith('assessment_id', 'a1');
  });

  it('throws with the supabase error message on failure', async () => {
    h.setResult({ data: null, error: { message: 'del failed' } });
    await expect(deleteQuestionsForAssessment('a1')).rejects.toThrow('del failed');
  });
});

describe('saveQuestions', () => {
  it('deletes existing questions then does not insert when list is empty', async () => {
    h.setResult({ data: null, error: null });
    await saveQuestions('a1', []);
    expect(h.builder.delete).toHaveBeenCalled();
    expect(h.builder.insert).not.toHaveBeenCalled();
  });

  it('inserts snake_case question rows after clearing', async () => {
    h.setResult({ data: null, error: null });
    await saveQuestions('a1', [
      { questionId: 'q1', questionText: 'T', questionType: 'mcq', options: ['a', 'b'], correctAnswer: 'a', maxScore: 2, config: { x: 1 } },
      { questionId: 'q2', questionText: 'T2', questionType: 'short', options: [], maxScore: 1 },
    ]);
    const rows = (h.builder.insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>[];
    expect(rows[0]).toEqual({
      assessment_id: 'a1', question_id: 'q1', question_text: 'T', type: 'mcq',
      options: ['a', 'b'], correct_answer: 'a', max_score: 2, config: { x: 1 },
    });
    expect(rows[1]).toMatchObject({ question_id: 'q2', correct_answer: null, config: null, options: [] });
  });

  it('throws with the supabase error message when insert fails', async () => {
    h.setResult({ data: null, error: { message: 'insert failed' } });
    await expect(
      saveQuestions('a1', [{ questionId: 'q1', questionText: 'T', questionType: 'short', options: [], maxScore: 1 }])
    ).rejects.toThrow('insert failed');
  });
});

describe('saveResponses', () => {
  it('does nothing when there are no responses', async () => {
    await saveResponses([]);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('inserts mapped rows, converting an undefined score to null', async () => {
    h.setResult({ data: null, error: null });
    await saveResponses([
      { studentName: 'A', school: 'S', class: 'C', assessmentId: 'a1', questionId: 'q1', answer: 'x', timestamp: 't', timeSpent: 10, score: 1 },
      { studentName: 'B', school: 'S', class: 'C', assessmentId: 'a1', questionId: 'q2', answer: 'y', timestamp: 't', timeSpent: 20 },
    ]);
    const rows = (h.builder.insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>[];
    expect(rows[0]).toEqual({
      student_name: 'A', school: 'S', class: 'C', assessment_id: 'a1',
      question_id: 'q1', answer: 'x', submitted_at: 't', time_spent: 10, score: 1,
    });
    expect(rows[1].score).toBeNull();
  });

  it('throws a descriptive error when the insert fails', async () => {
    h.setResult({ data: null, error: { message: 'db down' } });
    await expect(
      saveResponses([{ studentName: 'A', school: 'S', class: 'C', assessmentId: 'a1', questionId: 'q1', answer: 'x', timestamp: 't', timeSpent: 1 }])
    ).rejects.toThrow(/Failed to save assessment responses/);
  });
});
