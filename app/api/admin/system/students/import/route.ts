import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { processImportRow, ImportRow } from "@/lib/entities/students-import";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export const maxDuration = 60;

// Every field defaults to "" rather than being required — a blank cell in
// one row must never fail the whole chunk. "First name is required" etc. is
// enforced per-row, independently, inside processImportRow, which reports a
// clean per-row error instead of a hard reject that would also discard every
// other (valid) row riding in the same chunk.
const RowDataSchema = z.object({
  firstName: z.string().optional().default(""),
  middleName: z.string().optional().default(""),
  lastName: z.string().optional().default(""),
  class: z.string().optional().default(""),
  stream: z.string().optional().default(""),
  dateOfBirth: z.string().optional().default(""),
  email: z.string().optional().default(""),
});

const RowSchema = z.object({
  row: z.number().int().min(1),
  data: RowDataSchema,
});

const RequestSchema = z.object({
  // Chosen once in the UI and applied to every row: the file cannot name a
  // school, so it cannot create one.
  schoolId: z.string().uuid("Choose the school these students belong to"),
  allowCreateStructure: z.boolean().optional().default(false),
  rows: z.array(RowSchema).min(1).max(100),
});

/**
 * Processes one chunk of bulk-imported student rows, sequentially (not
 * concurrently) — see lib/entities/students-import.ts for why: avoids two
 * rows racing to auto-create the same new class/stream within this request.
 * The client is responsible for chunking and submitting chunks one after
 * another, not in parallel, for the same reason across requests.
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { rows, schoolId, allowCreateStructure } = RequestSchema.parse(body);
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const results = [];
    for (const { row, data } of rows) {
      const result = await processImportRow(data as ImportRow, row, {
        schoolId,
        allowCreateStructure,
        createdBy: profile.id,
      });
      results.push(result);
    }

    return successResponse({ data: results });
  } catch (error) {
    return handleApiError(error, "Import failed");
  }
}
