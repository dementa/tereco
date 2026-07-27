import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * A generic tabular export for any DataTable on the console — same visual
 * language as the purpose-built documents (ResultsDocument etc.) but with
 * evenly-distributed columns since the caller's column count varies.
 */
const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 8, fontFamily: 'Helvetica', color: '#12333F' },
  header: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#02465B', paddingBottom: 8 },
  org: { fontSize: 8, color: '#5A7D8A', letterSpacing: 1 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  meta: { fontSize: 8, color: '#5A7D8A', marginTop: 4 },
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
  cell: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
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

export interface GenericTableDocumentProps {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  generatedAt: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function GenericTableDocument({ title, headers, rows, generatedAt }: GenericTableDocumentProps) {
  return (
    <Document title={title} author="TERECO">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.org}>TERECO</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>
            {rows.length} record{rows.length === 1 ? '' : 's'}
          </Text>
        </View>

        <View style={styles.tableHeader} fixed>
          {headers.map((header, i) => (
            <Text key={i} style={styles.cell}>{header}</Text>
          ))}
        </View>

        {rows.length === 0 ? (
          <View style={styles.row}>
            <Text>No data to export.</Text>
          </View>
        ) : (
          rows.map((row, ri) => (
            <View key={ri} style={ri % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row} wrap={false}>
              {row.map((cell, ci) => (
                <Text key={ci} style={styles.cell}>
                  {cell === null || cell === undefined || cell === '' ? '—' : String(cell)}
                </Text>
              ))}
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>Generated {formatDateTime(generatedAt)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
