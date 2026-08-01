/**
 * Renders a marking guide/model answer with one bullet per line.
 *
 * Authors write these one marking point per line ("Mouse (1 mark)\nUsed to
 * move the pointer (1 mark)"), but a plain paragraph collapses every line
 * break, printing it as one unreadable run-on sentence. A guide with no line
 * breaks still renders as a plain line — a lone bullet would just be noise.
 */
export function MarkingGuidance({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return <p className="text-sm text-[#666666]">{lines[0] ?? text}</p>;
  }

  return (
    <ul className="text-sm text-[#666666] list-disc pl-4 space-y-0.5">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}
