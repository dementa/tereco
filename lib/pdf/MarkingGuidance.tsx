import { Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

/**
 * Renders a marking guide/model answer with one bullet per line, mirroring
 * the web marking/results views (components/MarkingGuidance.tsx). Authors
 * write these one marking point per line — a single <Text> would still show
 * each line correctly (react-pdf's layout engine respects '\n'), but nothing
 * marked the points as separate, discrete items the way a printed answer key
 * needs to.
 */
export function PdfMarkingGuidance({ text, style }: { text: string; style: Style }) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return <Text style={style}>{lines[0] ?? text}</Text>;
  }

  return (
    <View>
      {lines.map((line, i) => (
        <Text key={i} style={style}>
          • {line}
        </Text>
      ))}
    </View>
  );
}
