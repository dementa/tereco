import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { AssessmentResult } from '@/lib/assessments';

// Only the 14 standard PDF fonts are used, so nothing has to be fetched or
// bundled at render time — the document builds identically on any machine.
const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#12333F' },
  header: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#02465B', paddingBottom: 8 },
  org: { fontSize: 8, color: '#5A7D8A', letterSpacing: 1 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  meta: { fontSize: 8, color: '#5A7D8A', marginTop: 4 },
  summaryRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  summaryBox: { flexGrow: 1, padding: 8, backgroundColor: '#F1F6F8', borderRadius: 4 },
  summaryLabel: { fontSize: 7, color: '#5A7D8A', letterSpacing: 0.5 },
  summaryValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#02465B',
    color: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E8EFF3',
  },
  rowAlt: { backgroundColor: '#F8FBFC' },
  cellNo: { width: '5%' },
  cellId: { width: '14%' },
  cellName: { width: '25%' },
  cellSchool: { width: '22%' },
  cellClass: { width: '12%' },
  cellScore: { width: '11%', textAlign: 'right' },
  cellPct: { width: '11%', textAlign: 'right' },
  pending: { color: '#9BB3BD' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: '#9BB3BD',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#E8EFF3',
    paddingTop: 6,
  },
});

export interface ResultsDocumentProps {
  assessmentTitle: string;
  assessmentSystemId: string;
  results: AssessmentResult[];
  generatedAt: string;
  generatedBy: string;
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function ResultsDocument({
  assessmentTitle,
  assessmentSystemId,
  results,
  generatedAt,
  generatedBy,
}: ResultsDocumentProps) {
  const marked = results.filter((r) => r.percentage !== null);
  const average =
    marked.length > 0
      ? Math.round((marked.reduce((sum, r) => sum + (r.percentage ?? 0), 0) / marked.length) * 10) / 10
      : null;

  return (
    <Document
      title={`${assessmentSystemId} — ${assessmentTitle} results`}
      author="TERECO"
      subject="Assessment results"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.org}>TERECO</Text>
          <Text style={styles.title}>{assessmentTitle}</Text>
          <Text style={styles.meta}>
            {assessmentSystemId} · {results.length} submission{results.length === 1 ? '' : 's'}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>SUBMISSIONS</Text>
            <Text style={styles.summaryValue}>{results.length}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>FULLY MARKED</Text>
            <Text style={styles.summaryValue}>
              {marked.length} of {results.length}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>AVERAGE (MARKED ONLY)</Text>
            <Text style={styles.summaryValue}>{average === null ? '—' : `${average}%`}</Text>
          </View>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={styles.cellNo}>#</Text>
          <Text style={styles.cellId}>Student ID</Text>
          <Text style={styles.cellName}>Name</Text>
          <Text style={styles.cellSchool}>School</Text>
          <Text style={styles.cellClass}>Class</Text>
          <Text style={styles.cellScore}>Score</Text>
          <Text style={styles.cellPct}>%</Text>
        </View>

        {results.length === 0 ? (
          <View style={styles.row}>
            <Text>No submissions recorded for this assessment.</Text>
          </View>
        ) : (
          results.map((r, i) => (
            <View
              key={r.submissionId}
              style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row}
              wrap={false}
            >
              <Text style={styles.cellNo}>{i + 1}</Text>
              <Text style={styles.cellId}>{r.studentSystemId ?? '—'}</Text>
              <Text style={styles.cellName}>{r.studentName || '—'}</Text>
              <Text style={styles.cellSchool}>{r.school || '—'}</Text>
              <Text style={styles.cellClass}>{r.className || '—'}</Text>
              <Text style={styles.cellScore}>
                {r.totalScore === null ? '—' : `${r.totalScore} / ${r.maxScore ?? '—'}`}
              </Text>
              {/* An unmarked paper says so rather than showing a misleading number. */}
              <Text style={r.percentage === null ? [styles.cellPct, styles.pending] : styles.cellPct}>
                {r.percentage === null ? 'pending' : `${r.percentage}%`}
              </Text>
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>
            Generated {formatDateTime(generatedAt)} by {generatedBy}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
