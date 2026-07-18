import { ensureSheet, getSheets } from './googleSheets';

const { sheets, spreadsheetId } = getSheets();

// ─── Types ────────────────────────────────────────────────

export interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number; // minutes
  startTime?: string; // ISO datetime
  targetType: 'general' | 'class' | 'school+class';
  targetValue: string; // e.g., 'Form 3A' or 'Nairobi Academy|Form 3A'
  questionsSheet: string;
}

export interface StudentResponse {
  studentName: string;
  school: string;
  class: string;
  assessmentId: string;
  questionId: string;
  answer: string;
  timestamp: string;
  timeSpent: number; // seconds
  score?: number;
}

export interface Question {
  questionId: string;
  questionText: string;
  questionType: 'mcq' | 'checkbox' | 'fill' | 'matching' | 'dragdrop' | 'short' | 'long';
  options: string[]; // parsed from comma-separated string
  correctAnswer?: string; // optional; for mcq/checkbox/fill
  maxScore: number;
  config?: any; // parsed JSON
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Get all assessments, optionally filtered by school and class.
 */
// export async function getAssessments(
//   school?: string,
//   className?: string
// ): Promise<Assessment[]> {
//   try {
//     const response = await sheets.spreadsheets.values.get({
//       spreadsheetId,
//       range: 'Assessments!A:H',
//     });
//     const rows = response.data.values || [];
//     console.log('Raw rows from Assessments:', rows);
//     if (rows.length < 2) return [];

//     const headers = rows[0];
//     const idIdx = headers.indexOf('id');
//     const titleIdx = headers.indexOf('title');
//     const descIdx = headers.indexOf('description');
//     const timeIdx = headers.indexOf('timeLimit');
//     const startIdx = headers.indexOf('startTime');
//     const typeIdx = headers.indexOf('targetType');
//     const targetIdx = headers.indexOf('targetValue');
//     const sheetIdx = headers.indexOf('questionsSheet');

//     const assessments: Assessment[] = [];

//     for (let i = 1; i < rows.length; i++) {
//       const row = rows[i];
//       const assessment: Assessment = {
//         id: row[idIdx] || '',
//         title: row[titleIdx] || '',
//         description: row[descIdx] || '',
//         timeLimit: parseInt(row[timeIdx]) || 0,
//         startTime: row[startIdx] || undefined,
//         targetType: (row[typeIdx] as any) || 'general',
//         targetValue: row[targetIdx] || '',
//         questionsSheet: row[sheetIdx] || '',
//       };

//       // Apply filters
//       if (school && className) {
//         if (assessment.targetType === 'general') {
//           // include
//         } else if (assessment.targetType === 'class') {
//           if (assessment.targetValue !== className) continue;
//         } else if (assessment.targetType === 'school+class') {
//           const [s, c] = assessment.targetValue.split('|');
//           if (s !== school || c !== className) continue;
//         }
//       } else if (school && !className) {
//         if (assessment.targetType === 'class') continue;
//         if (assessment.targetType === 'school+class') {
//           const [s] = assessment.targetValue.split('|');
//           if (s !== school) continue;
//         }
//       }
//       // else: no filters – include all

//       assessments.push(assessment);
//     }
//     return assessments;
//   } catch (error) {
//     console.error('Error fetching assessments:', error);
//     return [];
//   }
// }
export async function getAssessments(
  school?: string,
  className?: string
): Promise<Assessment[]> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!A:I', // now includes the deleted column (I)
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const idIdx = headers.indexOf('id');
    const titleIdx = headers.indexOf('title');
    const descIdx = headers.indexOf('description');
    const timeIdx = headers.indexOf('timeLimit');
    const startIdx = headers.indexOf('startTime');
    const typeIdx = headers.indexOf('targetType');
    const targetIdx = headers.indexOf('targetValue');
    const sheetIdx = headers.indexOf('questionsSheet');
    const deletedIdx = headers.indexOf('deleted'); // new column

    const assessments: Assessment[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip deleted rows
      if (deletedIdx !== -1 && row[deletedIdx]?.toUpperCase() === 'TRUE') continue;

      // Skip rows without an ID (empty rows)
      if (!row[idIdx] || row[idIdx].trim() === '') continue;

      const assessment: Assessment = {
        id: row[idIdx] || '',
        title: row[titleIdx] || '',
        description: row[descIdx] || '',
        timeLimit: parseInt(row[timeIdx]) || 0,
        startTime: row[startIdx] || undefined,
        targetType: (row[typeIdx] as any) || 'general',
        targetValue: row[targetIdx] || '',
        questionsSheet: row[sheetIdx] || '',
      };

      // Apply filters
      if (school && className) {
        if (assessment.targetType === 'general') {
          // include
        } else if (assessment.targetType === 'class') {
          if (assessment.targetValue !== className) continue;
        } else if (assessment.targetType === 'school+class') {
          const [s, c] = assessment.targetValue.split('|');
          if (s !== school || c !== className) continue;
        }
      } else if (school && !className) {
        if (assessment.targetType === 'class') continue;
        if (assessment.targetType === 'school+class') {
          const [s] = assessment.targetValue.split('|');
          if (s !== school) continue;
        }
      }
      // else: no filters – include all

      assessments.push(assessment);
    }
    return assessments;
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return [];
  }
}



/**
 * Save student responses to the "Responses" sheet.
 */
export async function saveResponses(responses: StudentResponse[]) {
  try {
    const rows = responses.map(r => [
      r.studentName,
      r.school,
      r.class,
      r.assessmentId,
      r.questionId,
      r.answer,
      r.timestamp,
      r.timeSpent,
      r.score !== undefined ? r.score : '',
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Responses!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
  } catch (error) {
    console.error('Error saving responses:', error);
    throw new Error('Failed to save assessment responses');
  }
}

/**
 * Get a single assessment by its ID.
 */
export async function getAssessmentById(id: string): Promise<Assessment | null> {
  try {
    const all = await getAssessments();
    return all.find(a => a.id === id) || null;
  } catch (error) {
    console.error('Error fetching assessment by ID:', error);
    return null;
  }
}

export async function ensureAssessmentsSheet() {
  await ensureSheet(sheets, spreadsheetId, 'Assessments', [
    'id',
    'title',
    'description',
    'timeLimit',
    'startTime',
    'targetType',
    'targetValue',
    'questionsSheet',
  ]);
}

// Add this function to lib/assessment-sheets.ts
async function ensureAssessmentsSheetHasDeletedColumn() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assessments!1:1',
    });
    const header = response.data.values?.[0] || [];
    if (!header.includes('deleted')) {
      // Append the column
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Assessments!I1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['deleted']] },
      });
      // Set default value for all existing rows
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Assessments!I2:I',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['FALSE']] },
      });
    }
  } catch (error) {
    console.error('Error ensuring deleted column:', error);
  }
}

/**
 * Get questions for a specific assessment.
 */
export async function getQuestions(assessmentId: string): Promise<Question[]> {

  
  try {
    await ensureQuestionsSheet();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Questions!A:H',
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const assessmentIdx = headers.indexOf('assessmentId');
    const qIdIdx = headers.indexOf('questionId');
    const textIdx = headers.indexOf('questionText');
    const typeIdx = headers.indexOf('type');
    const optsIdx = headers.indexOf('options');
    const correctIdx = headers.indexOf('correctAnswer');
    const maxScoreIdx = headers.indexOf('maxScore');
    const configIdx = headers.indexOf('config');

    const questions: Question[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[assessmentIdx] !== assessmentId) continue;
      const optionsStr = row[optsIdx] || '';
      const options = optionsStr ? optionsStr.split(',').map((s: any) => s.trim()) : [];
      let config: any = undefined;
      if (row[configIdx]) {
        try { config = JSON.parse(row[configIdx]); } catch {}
      }
      questions.push({
        questionId: row[qIdIdx] || '',
        questionText: row[textIdx] || '',
        questionType: (row[typeIdx] as any) || 'short',
        options,
        correctAnswer: row[correctIdx] || undefined,
        maxScore: parseFloat(row[maxScoreIdx]) || 1,
        config,
      });
    }
    return questions;
  } catch (error) {
    console.error('Error fetching questions:', error);
    return [];
  }
}

export async function saveQuestions(assessmentId: string, questions: Question[]) {

  await ensureQuestionsSheet();
  // Delete existing ones
  await deleteQuestionsForAssessment(assessmentId);
  if (!questions.length) return;
  
  const rows = questions.map(q => [
    assessmentId,
    q.questionId,
    q.questionText,
    q.questionType,
    q.options.join(','),
    q.correctAnswer || '',
    q.maxScore,
    q.config ? JSON.stringify(q.config) : '',
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Questions!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

export async function deleteQuestionsForAssessment(assessmentId: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Questions!A:H',
  });
  const rows = response.data.values || [];
  if (rows.length < 2) return;
  const headers = rows[0];
  const assessmentIdx = headers.indexOf('assessmentId');
  const newRows = [headers];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][assessmentIdx] !== assessmentId) {
      newRows.push(rows[i]);
    }
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Questions!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: newRows },
  });
}

/**
 * Minimal question shape needed to serialise a per-assessment questions sheet.
 */
export interface QuestionSheetRow {
  questionId: string;
  questionText: string;
  questionType: string;
  options?: string[];
  correctAnswer?: string;
}

/**
 * (Re)create a per-assessment questions sheet and write the given questions.
 *
 * If a sheet with `sheetName` already exists it is deleted first, so the sheet
 * always reflects exactly the provided questions. Shared by the admin create
 * and update routes.
 */
export async function writeAssessmentQuestionsSheet(
  sheetName: string,
  questions: QuestionSheetRow[]
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(
    s => s.properties?.title === sheetName
  );
  if (existing?.properties?.sheetId != null) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: existing.properties.sheetId } }],
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });

  const rows = questions.map(q => [
    q.questionId,
    q.questionText,
    q.questionType,
    (q.options || []).join(','),
    q.correctAnswer || '',
  ]);
  rows.unshift(['questionId', 'questionText', 'type', 'options', 'correctAnswer']);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

export async function ensureQuestionsSheet() {
  await ensureSheet(sheets, spreadsheetId, 'Questions', [
    'assessmentId',
    'questionId',
    'questionText',
    'type',
    'options',
    'correctAnswer',
    'maxScore',
    'config',
  ]);
}