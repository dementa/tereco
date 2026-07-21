import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Question } from '@/lib/assessments';

/**
 * A printable question paper that can be answered with a pen.
 *
 * Every question type carries its own answer affordance on the page — ruled
 * lines to write on, boxes to tick, letters to circle — because a learner
 * working offline has no interface to fall back on. Questions flow so a page
 * holds as many as fit.
 */
const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontSize: 10, fontFamily: 'Helvetica', color: '#12333F' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1.5, borderBottomColor: '#02465B', paddingBottom: 10, marginBottom: 12 },
  logo: { width: 46, height: 46, objectFit: 'contain' },
  headerText: { flexGrow: 1 },
  schoolName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  org: { fontSize: 7, color: '#5A7D8A', letterSpacing: 1.2, marginTop: 1 },
  paperTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  meta: { fontSize: 8, color: '#5A7D8A' },

  candidate: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  candidateField: { flexGrow: 1, borderBottomWidth: 0.75, borderBottomColor: '#12333F', paddingBottom: 2 },
  candidateLabel: { fontSize: 7, color: '#5A7D8A' },

  instructionsBox: { borderWidth: 0.75, borderColor: '#02465B', backgroundColor: '#F1F6F8', padding: 8, marginBottom: 14 },
  instructionsTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  instruction: { fontSize: 8, marginBottom: 1.5, lineHeight: 1.35 },

  question: { marginBottom: 12 },
  questionHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  questionText: { fontSize: 10, flexGrow: 1, lineHeight: 1.35 },
  marks: { fontSize: 8, color: '#5A7D8A' },
  questionImage: { maxWidth: 200, maxHeight: 130, objectFit: 'contain', marginTop: 6, marginBottom: 2 },

  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginLeft: 8 },
  circleLetter: { width: 15, height: 15, borderWidth: 0.75, borderColor: '#12333F', borderRadius: 8, textAlign: 'center', fontSize: 8, paddingTop: 3 },
  tickBox: { width: 11, height: 11, borderWidth: 0.75, borderColor: '#12333F' },
  optionText: { fontSize: 9, flexShrink: 1 },

  answerLine: { borderBottomWidth: 0.5, borderBottomColor: '#9BB3BD', height: 15, marginTop: 6 },
  inlineBlank: { borderBottomWidth: 0.5, borderBottomColor: '#12333F', width: 150, height: 13, marginTop: 6, marginLeft: 8 },

  footer: { position: 'absolute', bottom: 22, left: 44, right: 44, fontSize: 7, color: '#9BB3BD', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#E8EFF3', paddingTop: 5 },
});

const LETTERS = 'ABCDEFGH';

/** How many ruled lines a written answer gets, scaled to the marks available. */
function linesFor(q: Question): number {
  if (q.questionType === 'long') return Math.min(12, Math.max(5, Math.round(q.maxScore * 2)));
  if (q.questionType === 'short') return Math.min(5, Math.max(2, Math.round(q.maxScore)));
  return 0;
}

function defaultInstructions(totalMarks: number, questionCount: number, minutes: number): string[] {
  return [
    `Answer ALL ${questionCount} questions. The paper carries ${totalMarks} marks and lasts ${minutes} minutes.`,
    'Write your name, class and student ID in the spaces at the top of this page before you begin.',
    'Use a pen. Write your answers in the space provided under each question.',
    'For multiple-choice questions, draw a circle around the letter of your chosen answer.',
    'Where boxes are shown, tick every box that applies — some questions have more than one correct answer.',
    'Marks for each question are shown in brackets on the right.',
    'When you have finished, hand this paper to your teacher, or photograph or scan every page and upload it to TERECO before the closing time.',
    'Make sure every page is included and that your writing is clear in the photograph.',
  ];
}

export interface QuestionPaperProps {
  assessmentTitle: string;
  assessmentSystemId: string;
  /** Null renders TERECO branding — used when the paper serves several schools. */
  schoolName: string | null;
  schoolLogoUrl: string | null;
  academicYear: string | null;
  timeLimitMinutes: number;
  instructions: string;
  questions: Question[];
}

export function QuestionPaperDocument({
  assessmentTitle,
  assessmentSystemId,
  schoolName,
  schoolLogoUrl,
  academicYear,
  timeLimitMinutes,
  instructions,
  questions,
}: QuestionPaperProps) {
  const totalMarks = questions.reduce((sum, q) => sum + q.maxScore, 0);
  const lines = instructions.trim()
    ? instructions.split('\n').filter((l) => l.trim())
    : defaultInstructions(totalMarks, questions.length, timeLimitMinutes);

  return (
    <Document title={`${assessmentSystemId} — ${assessmentTitle}`} author="TERECO" subject="Question paper">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          {schoolLogoUrl ? <Image style={styles.logo} src={schoolLogoUrl} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.org}>TERECO</Text>
            <Text style={styles.schoolName}>{schoolName ?? 'TERECO Programme'}</Text>
            <Text style={styles.paperTitle}>{assessmentTitle}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>Paper: {assessmentSystemId}</Text>
              {academicYear ? <Text style={styles.meta}>Academic year: {academicYear}</Text> : null}
              <Text style={styles.meta}>Time: {timeLimitMinutes} minutes</Text>
              <Text style={styles.meta}>Total marks: {totalMarks}</Text>
            </View>
          </View>
        </View>

        <View style={styles.candidate}>
          <View style={[styles.candidateField, { flexGrow: 2 }]}>
            <Text style={styles.candidateLabel}>NAME</Text>
            <Text> </Text>
          </View>
          <View style={styles.candidateField}>
            <Text style={styles.candidateLabel}>CLASS</Text>
            <Text> </Text>
          </View>
          <View style={styles.candidateField}>
            <Text style={styles.candidateLabel}>STUDENT ID</Text>
            <Text> </Text>
          </View>
        </View>

        <View style={styles.instructionsBox}>
          <Text style={styles.instructionsTitle}>INSTRUCTIONS — READ BEFORE YOU START</Text>
          {lines.map((line, i) => (
            <Text key={i} style={styles.instruction}>
              {i + 1}. {line}
            </Text>
          ))}
        </View>

        {questions.map((q) => (
          // wrap={false} keeps a question and its answer space on one page —
          // a split question is unanswerable on paper.
          <View key={q.id} style={styles.question} wrap={false}>
            <View style={styles.questionHead}>
              <Text style={styles.questionText}>
                {q.position}. {q.questionText}
              </Text>
              <Text style={styles.marks}>
                [{q.maxScore} {q.maxScore === 1 ? 'mark' : 'marks'}]
              </Text>
            </View>

            {q.imageUrl ? <Image style={styles.questionImage} src={q.imageUrl} /> : null}

            {/* One answer per question: circle a letter. */}
            {(q.questionType === 'mcq' || q.questionType === 'true_false') &&
              q.options.map((opt, i) => (
                <View key={i} style={styles.optionRow}>
                  <Text style={styles.circleLetter}>{LETTERS[i]}</Text>
                  <Text style={styles.optionText}>{opt}</Text>
                </View>
              ))}

            {/* Several answers possible: tick every box that applies. */}
            {q.questionType === 'checkbox' &&
              q.options.map((opt, i) => (
                <View key={i} style={styles.optionRow}>
                  <View style={styles.tickBox} />
                  <Text style={styles.optionText}>{opt}</Text>
                </View>
              ))}

            {q.questionType === 'fill' && <View style={styles.inlineBlank} />}

            {Array.from({ length: linesFor(q) }).map((_, i) => (
              <View key={i} style={styles.answerLine} />
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>
            {assessmentSystemId} · {schoolName ?? 'TERECO'} · END OF PAPER
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
