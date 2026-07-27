/**
 * Client-side triggers for the DataTable export button. CSV is built here
 * directly (a few string ops, no library needed); Excel and PDF are handed
 * off to /api/export — both exceljs and @react-pdf/renderer are Node-oriented
 * and are deliberately kept server-side rather than bundled into every page.
 */

export type ExportCell = string | number | null | undefined;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: ExportCell): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportToCsv(filename: string, headers: string[], rows: ExportCell[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  // Leading BOM so Excel opens UTF-8 CSVs (accented names, etc.) without mangling them.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

async function requestFile(url: string, body: Record<string, unknown>, fallbackName: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Export failed. Please try again.");
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  triggerDownload(blob, match ? match[1] : fallbackName);
}

export function exportToExcel(filename: string, headers: string[], rows: ExportCell[][]): Promise<void> {
  return requestFile("/api/export/excel", { filename, headers, rows }, `${filename}.xlsx`);
}

export function exportToPdf(filename: string, title: string, headers: string[], rows: ExportCell[][]): Promise<void> {
  return requestFile("/api/export/pdf", { filename, title, headers, rows }, `${filename}.pdf`);
}
