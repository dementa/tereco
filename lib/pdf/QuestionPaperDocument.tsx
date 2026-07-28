import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Question } from '@/lib/assessments';
import { groupQuestions, formatQuestionLabel, isStemParent } from '@/lib/questionGrouping';

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
  // The full letterhead (logo, school name, paper title, the time/marks meta
  // row) only ever needs stating once. Repeating it on every page reads as
  // the paper introducing itself over and over; a continuing page just needs
  // enough to identify a stray sheet, not the whole cover block again.
  continuationHeader: { borderBottomWidth: 0.75, borderBottomColor: '#02465B', paddingBottom: 6, marginBottom: 12 },
  continuationHeaderText: { fontSize: 8, color: '#5A7D8A', letterSpacing: 0.3 },
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

  sectionHeader: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#02465B', marginTop: 10, marginBottom: 6, textTransform: 'uppercase' },
  groupHeading: { fontSize: 9, fontStyle: 'italic', color: '#5A7D8A', marginBottom: 4 },
  groupImage: { maxWidth: 220, maxHeight: 140, objectFit: 'contain', marginBottom: 6 },
  group: { marginBottom: 12 },

  question: { marginBottom: 12 },
  questionHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  questionText: { fontSize: 10, flexGrow: 1, lineHeight: 1.35 },
  marks: { fontSize: 8, color: '#5A7D8A' },
  questionImage: { maxWidth: 200, maxHeight: 130, objectFit: 'contain', marginTop: 6, marginBottom: 2 },

  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, marginLeft: 10 },
  // The letter is printed PLAIN, with room around it, because the learner is
  // the one who draws the circle. Drawing it here would leave them nowhere to
  // mark and every option looking already chosen.
  optionLetter: { width: 16, textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold' },
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
        <View
          fixed
          render={({ pageNumber }) =>
            pageNumber === 1 ? (
              <View style={styles.header}>
                {schoolLogoUrl ? <Image style={styles.logo} src={schoolLogoUrl} /> : null}
                <View style={styles.headerText}>
                  <Text style={styles.org}>TERECO</Text>
                  <Text style={styles.schoolName}>{schoolName?.toUpperCase() ?? 'TERECO Programme'}</Text>
                  <Text style={styles.paperTitle}>{assessmentTitle}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>Paper: {assessmentSystemId}</Text>
                    {academicYear ? <Text style={styles.meta}>Academic year: {academicYear}</Text> : null}
                    <Text style={styles.meta}>Time: {timeLimitMinutes} minutes</Text>
                    <Text style={styles.meta}>Total marks: {totalMarks}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.continuationHeader}>
                <Text style={styles.continuationHeaderText}>
                  {assessmentSystemId} · {schoolName ?? 'TERECO Programme'} · {assessmentTitle}
                </Text>
              </View>
            )
          }
        />

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

        {groupQuestions(questions).map((group, gi) => (
          <View key={gi} style={styles.group}>
            {group.sectionChanged && group.section && (
              <Text style={styles.sectionHeader}>SECTION {group.section}</Text>
            )}

            {group.groupImageUrl && (
              // wrap={false} so the shared diagram never lands on its own
              // page, separated from the heading that introduces it. The
              // image must print whenever it exists — an author who never
              // typed the optional caption still uploaded a diagram the
              // paper needs. Heading prints first — it reads "Use the
              // diagram below...", so the diagram has to follow it, not
              // precede it.
              <View wrap={false}>
                {group.groupHeading && <Text style={styles.groupHeading}>{group.groupHeading}</Text>}
                <Image style={styles.groupImage} src={group.groupImageUrl} />
              </View>
            )}

            {group.members.map((q, mi) => {
              // The anchor's image is already shown as the group's shared
              // diagram above — printing it again per-question would
              // duplicate it under every member's own number.
              const showOwnImage = q.imageUrl && q.imageUrl !== group.groupImageUrl;
              // A lettered part with roman-numeral children is a stem/prompt
              // only ("Identify the parts labelled:") — it carries no marks
              // and no answer space of its own; its roman children print
              // those. See isStemParent, lib/questionGrouping.ts.
              const stem = isStemParent(
                questions,
                questions.findIndex((x) => x.id === q.id)
              );
              return (
                // wrap={false} keeps a question and its answer space on one
                // page — a split question is unanswerable on paper.
                <View key={q.id} style={styles.question} wrap={false}>
                  <View style={styles.questionHead}>
                    <Text style={styles.questionText}>
                      {formatQuestionLabel(q.code, mi === 0)} {q.questionText}
                    </Text>
                    {!stem && (
                      <Text style={styles.marks}>
                        [{q.maxScore} {q.maxScore === 1 ? 'mark' : 'marks'}]
                      </Text>
                    )}
                  </View>

                  {/* A true shared stimulus already printed its caption above,
                      next to the group's own image — this is the standalone
                      case, where the description belongs with the picture it's
                      actually describing. Printed before the image, same as
                      the shared-stimulus case: the text reads "diagram below". */}
                  {showOwnImage && !group.groupImageUrl && group.groupHeading && (
                    <Text style={styles.groupHeading}>{group.groupHeading}</Text>
                  )}
                  {showOwnImage && <Image style={styles.questionImage} src={q.imageUrl} />}

                  {!stem && (
                    <>
                      {/* One answer per question: the learner circles the letter. */}
                      {(q.questionType === 'mcq' || q.questionType === 'true_false') &&
                        q.options.map((opt, i) => (
                          <View key={i} style={styles.optionRow}>
                            <Text style={styles.optionLetter}>{LETTERS[i]}</Text>
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
                    </>
                  )}
                </View>
              );
            })}
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
