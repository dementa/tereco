import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const valuesGet = vi.fn();
  const valuesUpdate = vi.fn();
  const valuesAppend = vi.fn();
  const spreadsheetsGet = vi.fn();
  const batchUpdate = vi.fn();
  return { valuesGet, valuesUpdate, valuesAppend, spreadsheetsGet, batchUpdate };
});

vi.mock('./googleSheets', () => ({
  getSheets: () => ({
    spreadsheetId: 'SHEET_ID',
    sheets: {
      spreadsheets: {
        get: mocks.spreadsheetsGet,
        batchUpdate: mocks.batchUpdate,
        values: { get: mocks.valuesGet, update: mocks.valuesUpdate, append: mocks.valuesAppend },
      },
    },
  }),
}));

import {
  getAssessments,
  getAssessmentById,
  saveResponses,
  getQuestions,
  saveQuestions,
  deleteQuestionsForAssessment,
  ensureAssessmentsSheet,
  ensureQuestionsSheet,
} from './assessment-sheets';

const ASSESSMENT_HEADERS = [
  'id', 'title', 'description', 'timeLimit', 'startTime',
  'targetType', 'targetValue', 'questionsSheet', 'deleted',
];

function assessmentRow(over: Partial<Record<string, string>> = {}) {
  return [
    over.id ?? 'a1',
    over.title ?? 'Title',
    over.description ?? 'Desc',
    over.timeLimit ?? '30',
    over.startTime ?? '',
    over.targetType ?? 'general',
    over.targetValue ?? '',
    over.questionsSheet ?? 'Q1',
    over.deleted ?? 'FALSE',
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAssessments', () => {
  it('returns an empty array when there are no data rows', async () => {
    mocks.valuesGet.mockResolvedValue({ data: { values: [ASSESSMENT_HEADERS] } });
    await expect(getAssessments()).resolves.toEqual([]);
  });

  it('parses assessments and coerces timeLimit to a number', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: { values: [ASSESSMENT_HEADERS, assessmentRow({ id: 'a1', timeLimit: '45' })] },
    });
    const result = await getAssessments();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'a1', timeLimit: 45, targetType: 'general', questionsSheet: 'Q1' });
  });

  it('skips deleted rows and rows without an id', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          ASSESSMENT_HEADERS,
          assessmentRow({ id: 'keep' }),
          assessmentRow({ id: 'gone', deleted: 'true' }),
          assessmentRow({ id: '   ' }),
        ],
      },
    });
    const result = await getAssessments();
    expect(result.map(a => a.id)).toEqual(['keep']);
  });

  it('filters class-targeted assessments by class name', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          ASSESSMENT_HEADERS,
          assessmentRow({ id: 'g', targetType: 'general' }),
          assessmentRow({ id: 'match', targetType: 'class', targetValue: 'Form 3A' }),
          assessmentRow({ id: 'nomatch', targetType: 'class', targetValue: 'Form 3B' }),
        ],
      },
    });
    const result = await getAssessments('AnySchool', 'Form 3A');
    expect(result.map(a => a.id).sort()).toEqual(['g', 'match']);
  });

  it('filters school+class assessments by both school and class', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          ASSESSMENT_HEADERS,
          assessmentRow({ id: 'ok', targetType: 'school+class', targetValue: 'Nairobi Academy|Form 3A' }),
          assessmentRow({ id: 'badclass', targetType: 'school+class', targetValue: 'Nairobi Academy|Form 3B' }),
          assessmentRow({ id: 'badschool', targetType: 'school+class', targetValue: 'Other|Form 3A' }),
        ],
      },
    });
    const result = await getAssessments('Nairobi Academy', 'Form 3A');
    expect(result.map(a => a.id)).toEqual(['ok']);
  });

  it('when only a school is given, excludes class-only assessments and non-matching school+class', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          ASSESSMENT_HEADERS,
          assessmentRow({ id: 'general', targetType: 'general' }),
          assessmentRow({ id: 'classonly', targetType: 'class', targetValue: 'Form 1' }),
          assessmentRow({ id: 'sc-ok', targetType: 'school+class', targetValue: 'MySchool|Form 1' }),
          assessmentRow({ id: 'sc-bad', targetType: 'school+class', targetValue: 'Elsewhere|Form 1' }),
        ],
      },
    });
    const result = await getAssessments('MySchool');
    expect(result.map(a => a.id).sort()).toEqual(['general', 'sc-ok']);
  });

  it('returns an empty array when the API throws', async () => {
    mocks.valuesGet.mockRejectedValue(new Error('boom'));
    await expect(getAssessments()).resolves.toEqual([]);
  });
});

describe('getAssessmentById', () => {
  it('returns the matching assessment', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: { values: [ASSESSMENT_HEADERS, assessmentRow({ id: 'a1' }), assessmentRow({ id: 'a2' })] },
    });
    const result = await getAssessmentById('a2');
    expect(result?.id).toBe('a2');
  });

  it('returns null when no assessment matches', async () => {
    mocks.valuesGet.mockResolvedValue({ data: { values: [ASSESSMENT_HEADERS, assessmentRow({ id: 'a1' })] } });
    await expect(getAssessmentById('missing')).resolves.toBeNull();
  });
});

describe('saveResponses', () => {
  it('appends mapped rows, converting an undefined score to an empty string', async () => {
    mocks.valuesAppend.mockResolvedValue({});
    await saveResponses([
      { studentName: 'A', school: 'S', class: 'C', assessmentId: 'a1', questionId: 'q1', answer: 'x', timestamp: 't', timeSpent: 10, score: 1 },
      { studentName: 'B', school: 'S', class: 'C', assessmentId: 'a1', questionId: 'q2', answer: 'y', timestamp: 't', timeSpent: 20 },
    ]);
    const arg = mocks.valuesAppend.mock.calls[0][0];
    expect(arg.range).toBe('Responses!A:I');
    expect(arg.requestBody.values[0][8]).toBe(1);
    expect(arg.requestBody.values[1][8]).toBe('');
  });

  it('throws a descriptive error when the append fails', async () => {
    mocks.valuesAppend.mockRejectedValue(new Error('nope'));
    await expect(saveResponses([])).rejects.toThrow(/Failed to save assessment responses/);
  });
});

const QUESTION_HEADERS = [
  'assessmentId', 'questionId', 'questionText', 'type',
  'options', 'correctAnswer', 'maxScore', 'config',
];

describe('getQuestions', () => {
  beforeEach(() => {
    // Questions sheet exists so ensureQuestionsSheet() is a no-op.
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Questions' } }] } });
  });

  it('returns only the questions for the requested assessment', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          QUESTION_HEADERS,
          ['a1', 'q1', 'Text 1', 'mcq', 'x, y, z', 'x', '2', ''],
          ['a2', 'q2', 'Text 2', 'short', '', '', '', ''],
        ],
      },
    });
    const result = await getQuestions('a1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ questionId: 'q1', questionType: 'mcq', options: ['x', 'y', 'z'], correctAnswer: 'x', maxScore: 2 });
  });

  it('defaults type to short, maxScore to 1, and options to an empty array', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: { values: [QUESTION_HEADERS, ['a1', 'q1', 'Text', '', '', '', '', '']] },
    });
    const [q] = await getQuestions('a1');
    expect(q.questionType).toBe('short');
    expect(q.maxScore).toBe(1);
    expect(q.options).toEqual([]);
    expect(q.correctAnswer).toBeUndefined();
  });

  it('parses valid JSON config and ignores malformed config', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          QUESTION_HEADERS,
          ['a1', 'good', 'T', 'mcq', 'a', 'a', '1', '{"shuffle":true}'],
          ['a1', 'bad', 'T', 'mcq', 'a', 'a', '1', '{not json}'],
        ],
      },
    });
    const result = await getQuestions('a1');
    expect(result[0].config).toEqual({ shuffle: true });
    expect(result[1].config).toBeUndefined();
  });

  it('returns an empty array when the API throws', async () => {
    mocks.valuesGet.mockRejectedValue(new Error('boom'));
    await expect(getQuestions('a1')).resolves.toEqual([]);
  });
});

describe('saveQuestions', () => {
  beforeEach(() => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Questions' } }] } });
    // deleteQuestionsForAssessment reads existing rows first.
    mocks.valuesGet.mockResolvedValue({ data: { values: [QUESTION_HEADERS] } });
    mocks.valuesUpdate.mockResolvedValue({});
    mocks.valuesAppend.mockResolvedValue({});
  });

  it('does not append when there are no questions', async () => {
    await saveQuestions('a1', []);
    expect(mocks.valuesAppend).not.toHaveBeenCalled();
  });

  it('serializes options and config before appending', async () => {
    await saveQuestions('a1', [
      { questionId: 'q1', questionText: 'T', questionType: 'mcq', options: ['a', 'b'], correctAnswer: 'a', maxScore: 2, config: { x: 1 } },
    ]);
    const row = mocks.valuesAppend.mock.calls[0][0].requestBody.values[0];
    expect(row).toEqual(['a1', 'q1', 'T', 'mcq', 'a,b', 'a', 2, '{"x":1}']);
  });
});

describe('deleteQuestionsForAssessment', () => {
  it('rewrites the sheet keeping only rows for other assessments', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          QUESTION_HEADERS,
          ['a1', 'q1', 'T', 'mcq', '', '', '1', ''],
          ['a2', 'q2', 'T', 'mcq', '', '', '1', ''],
        ],
      },
    });
    mocks.valuesUpdate.mockResolvedValue({});
    await deleteQuestionsForAssessment('a1');
    const written = mocks.valuesUpdate.mock.calls[0][0].requestBody.values;
    expect(written).toEqual([QUESTION_HEADERS, ['a2', 'q2', 'T', 'mcq', '', '', '1', '']]);
  });

  it('does nothing when the sheet only has headers', async () => {
    mocks.valuesGet.mockResolvedValue({ data: { values: [QUESTION_HEADERS] } });
    await deleteQuestionsForAssessment('a1');
    expect(mocks.valuesUpdate).not.toHaveBeenCalled();
  });
});

describe('ensureAssessmentsSheet', () => {
  it('creates the sheet with headers when it does not exist', async () => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Other' } }] } });
    mocks.batchUpdate.mockResolvedValue({});
    mocks.valuesUpdate.mockResolvedValue({});
    await ensureAssessmentsSheet();
    expect(mocks.batchUpdate).toHaveBeenCalledTimes(1);
    const headers = mocks.valuesUpdate.mock.calls[0][0].requestBody.values[0];
    expect(headers).toContain('id');
    expect(headers).toContain('questionsSheet');
  });

  it('does nothing when the sheet already exists', async () => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Assessments' } }] } });
    await ensureAssessmentsSheet();
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
  });

  it('rethrows when the API fails', async () => {
    mocks.spreadsheetsGet.mockRejectedValue(new Error('boom'));
    await expect(ensureAssessmentsSheet()).rejects.toThrow('boom');
  });
});

describe('ensureQuestionsSheet', () => {
  it('creates the sheet with headers when it does not exist', async () => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [] } });
    mocks.batchUpdate.mockResolvedValue({});
    mocks.valuesUpdate.mockResolvedValue({});
    await ensureQuestionsSheet();
    expect(mocks.batchUpdate).toHaveBeenCalledTimes(1);
    const headers = mocks.valuesUpdate.mock.calls[0][0].requestBody.values[0];
    expect(headers).toContain('assessmentId');
    expect(headers).toContain('maxScore');
  });

  it('wraps errors with a descriptive message', async () => {
    mocks.spreadsheetsGet.mockRejectedValue(new Error('down'));
    await expect(ensureQuestionsSheet()).rejects.toThrow(/Failed to setup Questions sheet/);
  });
});
