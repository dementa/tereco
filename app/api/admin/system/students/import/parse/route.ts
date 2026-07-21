import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, successResponse } from "@/lib/apiResponse";
import type { ImportRow } from "@/lib/entities/students-import";

const HEADER_TO_FIELD: Record<string, keyof ImportRow> = {
  first_name: "firstName",
  middle_name: "middleName",
  last_name: "lastName",
  class: "class",
  stream: "stream",
  date_of_birth: "dateOfBirth",
  email: "email",
};

/**
 * Parses an uploaded .xlsx into structured rows — no accounts are created
 * here. Kept server-side (not in the browser bundle) since exceljs is a
 * Node-oriented library; the client then chunks the returned rows into
 * sequential POST /api/admin/system/students/import calls.
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return errorResponse("No file uploaded", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    // exceljs's types predate Node's newer generic Buffer<ArrayBufferLike> — same buffer, compatible at runtime.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.getWorksheet("Students") ?? workbook.worksheets[0];
    if (!sheet) return errorResponse("No sheet found in the uploaded file", 400);

    const headerRow = sheet.getRow(1);
    const columnFields: (keyof ImportRow | null)[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = String(cell.value ?? "").trim().toLowerCase();
      columnFields[colNumber] = HEADER_TO_FIELD[header] ?? null;
    });

    if (!columnFields.includes("firstName") || !columnFields.includes("lastName")) {
      return errorResponse(
        "The file doesn't look like the template — missing first_name/last_name columns. Download the template and use its headers.",
        400
      );
    }

    const rows: { row: number; data: ImportRow }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const data: Partial<ImportRow> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const field = columnFields[colNumber];
        if (!field) return;
        let value: unknown = cell.value;
        if (value && typeof value === "object" && "result" in value) value = (value as { result: unknown }).result;
        if (value instanceof Date) {
          data[field] = value.toISOString().slice(0, 10);
        } else if (value !== null && value !== undefined) {
          data[field] = String(value).trim();
        }
      });
      // Skip fully blank rows
      if (!data.firstName && !data.lastName && !data.class) return;
      rows.push({ row: rowNumber, data: data as ImportRow });
    });

    if (rows.length === 0) return errorResponse("No data rows found in the uploaded file", 400);

    return successResponse({ data: rows });
  } catch (error) {
    console.error("Error parsing import file:", error);
    return errorResponse("Failed to parse the uploaded file — is it a valid .xlsx?", 400);
  }
}
