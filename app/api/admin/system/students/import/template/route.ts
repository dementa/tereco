import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSuperAdmin } from "@/lib/auth/session";
import { listSchoolsDirectory } from "@/lib/entities/classes";
import { errorResponse } from "@/lib/apiResponse";

// No school column: the school is chosen in the UI and applies to the whole
// file, so a spreadsheet can never bring a school into existence.
const COLUMNS = ["first_name", "middle_name", "last_name", "class", "stream", "date_of_birth", "email"];

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const directory = await listSchoolsDirectory();

    const workbook = new ExcelJS.Workbook();

    const studentsSheet = workbook.addWorksheet("Students");
    studentsSheet.addRow(COLUMNS);
    studentsSheet.getRow(1).font = { bold: true };
    studentsSheet.addRow([
      "Jane", "", "Doe",
      directory[0]?.classes[0]?.displayName ?? "P.1",
      directory[0]?.classes[0]?.hasStreams ? (directory[0].classes[0].streams[0]?.name ?? "A") : "",
      "2015-06-01",
      "",
    ]);
    studentsSheet.columns.forEach((col) => { col.width = 18; });

    const referenceSheet = workbook.addWorksheet("Reference");
    referenceSheet.addRow(["School", "Class", "Has streams", "Streams"]);
    referenceSheet.getRow(1).font = { bold: true };
    for (const school of directory) {
      if (school.classes.length === 0) {
        referenceSheet.addRow([school.name, "(no classes configured yet)", "", ""]);
        continue;
      }
      for (const cls of school.classes) {
        referenceSheet.addRow([school.name, cls.displayName, cls.hasStreams ? "yes" : "no", cls.streams.map((s) => s.name).join(", ")]);
      }
    }
    referenceSheet.columns.forEach((col) => { col.width = 26; });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="student-import-template.xlsx"',
      },
    });
  } catch (error) {
    console.error("Error generating import template:", error);
    return errorResponse("Failed to generate template", 500);
  }
}
