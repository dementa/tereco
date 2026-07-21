import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { MarkedScript } from '@/lib/assessments';

/**
 * One learner's marked paper: what they answered, what was correct, and the
 * marks awarded.
 *
 * Written to stand on its own as a record a family keeps — so it names the
 * school, the paper, the year and the date sat, not just a percentage.
 */
const styles = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 46, paddingHorizontal: 42, fontSize: 9.5, fontFamily: 'Helvetica', color: '#12333F' },

  header: { borderBottomWidth: 1.5, borderBottomColor: '#02465B', paddingBottom: 9, marginBottom: 12 },
  org: { fontSize: 7, color: '#5A7D8A', letterSpacing: 1.2 },
  school: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 5 },
  meta: { fontSize: 8, color: '#5A7D8A', marginTop: 3 },

  scoreRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  scoreBox: { flexGrow: 1, padding: 9, backgroundColor: '#F1F6F8', borderRadius: 4 },
  scoreLabel: { fontSize: 7, color: '#5A7D8A', letterSpacing: 0.6 },
  scoreValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 2 },

  q: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#E8EFF3' },
  qHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  qText: { fontSize: 9.5, flexGrow: 1, fontFamily: 'Helvetica-Bold', lineHeight: 1.35 },
  awarded: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },

  label: { fontSize: 7, color: '#5A7D8A', letterSpacing: 0.6, marginTop: 5 },
  given: { fontSize: 9.5, marginTop: 1, lineHeight: 1.35 },
  blank: { fontSize: 9.5, marginTop: 1, color: '#9BB3BD', fontStyle: 'italic' },
  correct: { fontSize: 9.5, marginTop: 1, color: '#1F7A54' },
  guidance: { fontSize: 8.5, marginTop: 1, color: '#5A7D8A', lineHeight: 1.35 },

  verdict: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  vCorrect: { color: '#1F7A54' },
  vPartial: { color: '#C4952A' },
  vWrong: { color: '#C26565' },
  vUnmarked: { color: '#9BB3BD' },

  footer: { position: 'absolute', bottom: 20, left: 42, right: 42, fontSize: 7, color: '#9BB3BD', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#E8EFF3', paddingTop: 5 },
});

const VERDICT_STYLE = {
  correct: styles.vCorrect,
  partial: styles.vPartial,
  wrong: styles.vWrong,
  unmarked: styles.vUnmarked,
};

const VERDICT_LABEL = {
  correct: 'CORRECT',
  partial: 'PARTLY CORRECT',
  wrong: 'NOT CORRECT',
  unmarked: 'NOT YET MARKED',
};

function formatAnswer(value: string, type: string): string {
  if (!value.trim()) return '';
  // Checkbox answers are stored pipe-delimited.
  return type === 'checkbox'
    ? value.split('|').map((v) => v.trim()).filter(Boolean).join(', ')
    : value;
}

/**
 * One learner's script as a single page-set. Extracted so the whole-class
 * bundle renders exactly the same document per child rather than a second,
 * drifting copy of this layout.
 */
function ScriptPages({ script }: { script: MarkedScript }) {
  return (
    <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.org}>TERECO</Text>
          <Text style={styles.school}>{script.school || 'TERECO Programme'}</Text>
          <Text style={styles.title}>{script.assessmentTitle}</Text>
          <Text style={styles.meta}>
            {script.studentName}
            {script.studentSystemId ? ` · ${script.studentSystemId}` : ''}
            {script.className ? ` · ${script.className}` : ''} · Sat{' '}
            {new Date(script.submittedAt).toLocaleDateString('en-GB')}
          </Text>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>
              {script.totalScore ?? '—'} / {script.maxScore}
            </Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>PERCENTAGE</Text>
            <Text style={styles.scoreValue}>
              {script.percentage === null ? '—' : `${script.percentage}%`}
            </Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>QUESTIONS CORRECT</Text>
            <Text style={styles.scoreValue}>
              {script.answers.filter((a) => a.verdict === 'correct').length} of{' '}
              {script.answers.length}
            </Text>
          </View>
        </View>

        {script.answers.map((a) => {
          const given = formatAnswer(a.givenAnswer, a.questionType);
          const objective = a.correctAnswer !== undefined && a.correctAnswer !== '';
          return (
            <View key={a.questionId} style={styles.q} wrap={false}>
              <View style={styles.qHead}>
                <Text style={styles.qText}>
                  {a.position}. {a.questionText}
                </Text>
                <Text style={styles.awarded}>
                  {a.score ?? '—'} / {a.maxScore}
                </Text>
              </View>

              <Text style={styles.label}>YOUR ANSWER</Text>
              {given ? (
                <Text style={styles.given}>{given}</Text>
              ) : (
                // An unanswered question is a fact worth stating plainly.
                <Text style={styles.blank}>No answer given</Text>
              )}

              {/* The expected answer is only meaningful once marks are settled;
                  showing it against an unmarked question invites arguing with a
                  score that has not been given yet. */}
              {a.verdict !== 'unmarked' && objective && a.verdict !== 'correct' && (
                <>
                  <Text style={styles.label}>CORRECT ANSWER</Text>
                  <Text style={styles.correct}>
                    {formatAnswer(a.correctAnswer!, a.questionType)}
                  </Text>
                </>
              )}

              {a.verdict !== 'unmarked' && !objective && a.modelAnswer && (
                <>
                  <Text style={styles.label}>WHAT WAS EXPECTED</Text>
                  <Text style={styles.guidance}>{a.modelAnswer}</Text>
                </>
              )}

              <Text style={[styles.verdict, VERDICT_STYLE[a.verdict]]}>
                {VERDICT_LABEL[a.verdict]}
              </Text>
            </View>
          );
        })}

      <View style={styles.footer} fixed>
        <Text>
          {script.assessmentSystemId} · {script.studentName} · Issued by TERECO
        </Text>
        {/* Numbering runs across the whole document, so in a class bundle this
            counts the printed stack rather than restarting per learner. The
            learner's name sits alongside it, which is what actually identifies
            a loose page. */}
        <Text render={({ pageNumber }) => `Page ${pageNumber}`} />
      </View>
    </Page>
  );
}

export function MarkedScriptDocument({ script }: { script: MarkedScript }) {
  return (
    <Document
      title={`${script.assessmentSystemId} — ${script.studentName}`}
      author="TERECO"
      subject="Marked script"
    >
      <ScriptPages script={script} />
    </Document>
  );
}

/** Every learner's script in one file, each starting on a fresh page. */
export function MarkedScriptsDocument({
  scripts,
  assessmentTitle,
  assessmentSystemId,
}: {
  scripts: MarkedScript[];
  assessmentTitle: string;
  assessmentSystemId: string;
}) {
  return (
    <Document
      title={`${assessmentSystemId} — ${assessmentTitle} scripts`}
      author="TERECO"
      subject="Marked scripts"
    >
      {scripts.map((script) => (
        <ScriptPages key={script.studentSystemId ?? script.studentName} script={script} />
      ))}
    </Document>
  );
}
