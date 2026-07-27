import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/session";
import { errorResponse } from "@/lib/apiResponse";

// exceljs is Node-oriented, so it's kept server-side (same reasoning as the
// student-import parser) rather than bundled into every page using DataTable.
export const runtime = "nodejs";

interface ExportPayload {
  filename?: string;
  headers: string[];
  rows: (string | number | null)[][];
}

/**
 * Generic "export what's on screen" endpoint for any DataTable — the client
 * sends the already-filtered/sorted rows it's already fetched and authorized
 * to see, this just formats them as an .xlsx file.
 */
export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["super_admin", "admin", "staff"]);
  if (denied) return denied;

  try {
    const body: ExportPayload = await request.json();
    if (!Array.isArray(body.headers) || !Array.isArray(body.rows)) {
      return errorResponse("Malformed export request", 400);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(body.headers).font = { bold: true };
    body.rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column) => {
      column.width = 22;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${body.filename || "export"}.xlsx`;

    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating Excel export:", error);
    return errorResponse("Failed to generate the Excel file", 500);
  }
}
