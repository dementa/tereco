import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Question } from '@/lib/assessments';

/**
 * The marking key: correct answers for objective questions, and the author's
 * model answer for hand-marked ones.
 *
 * Never reaches learners — the route serving this refuses while an assessment
 * is still open, because a key in circulation destroys the assessment.
 */
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#12333F' },
  banner: { backgroundColor: '#C26565', color: '#FFFFFF', padding: 6, marginBottom: 12, textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  header: { borderBottomWidth: 1.5, borderBottomColor: '#02465B', paddingBottom: 8, marginBottom: 12 },
  org: { fontSize: 7, color: '#5A7D8A', letterSpacing: 1.2 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  meta: { fontSize: 8, color: '#5A7D8A', marginTop: 3 },

  question: { marginBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#E8EFF3', paddingBottom: 8 },
  questionHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  questionText: { fontSize: 10, flexGrow: 1, fontFamily: 'Helvetica-Bold' },
  marks: { fontSize: 8, color: '#5A7D8A' },
  label: { fontSize: 7, color: '#5A7D8A', letterSpacing: 0.6, marginTop: 5 },
  answer: { fontSize: 10, color: '#1F7A54', marginTop: 1 },
  model: { fontSize: 9, marginTop: 1, lineHeight: 1.35 },
  discretion: { fontSize: 9, marginTop: 1, color: '#9BB3BD', fontStyle: 'italic' },
  option: { fontSize: 8, color: '#5A7D8A', marginTop: 1, marginLeft: 8 },

  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, fontSize: 7, color: '#9BB3BD', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#E8EFF3', paddingTop: 5 },
});

export interface AnswerKeyProps {
  assessmentTitle: string;
  assessmentSystemId: string;
  academicYear: string | null;
  questions: Question[];
  generatedFor: string;
}

const TYPE_LABEL: Record<string, string> = {
  mcq: 'Multiple choice',
  checkbox: 'Multiple choice (several answers)',
  true_false: 'True / false',
  fill: 'Fill in the blank',
  short: 'Short answer',
  long: 'Long answer',
  matching: 'Matching',
  dragdrop: 'Drag and drop',
};

export function AnswerKeyDocument({
  assessmentTitle,
  assessmentSystemId,
  academicYear,
  questions,
  generatedFor,
}: AnswerKeyProps) {
  const totalMarks = questions.reduce((sum, q) => sum + q.maxScore, 0);

  return (
    <Document title={`${assessmentSystemId} — answer key`} author="TERECO" subject="Answer key">
      <Page size="A4" style={styles.page}>
        <Text style={styles.banner} fixed>
          CONFIDENTIAL — MARKING KEY. NOT FOR LEARNERS.
        </Text>

        <View style={styles.header}>
          <Text style={styles.org}>TERECO</Text>
          <Text style={styles.title}>{assessmentTitle} — Answer key</Text>
          <Text style={styles.meta}>
            {assessmentSystemId}
            {academicYear ? ` · ${academicYear}` : ''} · {questions.length} questions · {totalMarks} marks
          </Text>
        </View>

        {questions.map((q) => {
          const objective = q.correctAnswer !== undefined && q.correctAnswer !== '';
          return (
            <View key={q.id} style={styles.question} wrap={false}>
              <View style={styles.questionHead}>
                <Text style={styles.questionText}>
                  {q.position}. {q.questionText}
                </Text>
                <Text style={styles.marks}>
                  [{q.maxScore}] {TYPE_LABEL[q.questionType] ?? q.questionType}
                </Text>
              </View>

              {q.options.length > 0 &&
                q.options.map((opt, i) => (
                  <Text key={i} style={styles.option}>
                    • {opt}
                  </Text>
                ))}

              {objective && (
                <>
                  <Text style={styles.label}>CORRECT ANSWER</Text>
                  {/* Checkbox answers are stored pipe-delimited; show them as a list. */}
                  <Text style={styles.answer}>
                    {q.questionType === 'checkbox'
                      ? q.correctAnswer!.split('|').map((a) => a.trim()).filter(Boolean).join(', ')
                      : q.correctAnswer}
                  </Text>
                </>
              )}

              {!objective && (
                <>
                  <Text style={styles.label}>MARKING GUIDANCE</Text>
                  {q.modelAnswer ? (
                    <Text style={styles.model}>{q.modelAnswer}</Text>
                  ) : (
                    // Saying so beats printing an empty line the marker cannot
                    // interpret.
                    <Text style={styles.discretion}>
                      No model answer was provided — marker&apos;s discretion, {q.maxScore}{' '}
                      {q.maxScore === 1 ? 'mark' : 'marks'} available.
                    </Text>
                  )}
                </>
              )}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>
            {assessmentSystemId} · Issued to {generatedFor} · Confidential
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
