import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireRole } from "@/lib/auth/session";
import { errorResponse } from "@/lib/apiResponse";
import { GenericTableDocument } from "@/lib/pdf/GenericTableDocument";

// @react-pdf/renderer needs real Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";

interface ExportPayload {
  filename?: string;
  title?: string;
  headers: string[];
  rows: (string | number | null)[][];
}

/**
 * Generic "export what's on screen" endpoint for any DataTable — the client
 * sends the already-filtered/sorted rows it's already fetched and authorized
 * to see, this just formats them as a PDF, server-side, for a byte-identical
 * document across recipients (same reasoning as ResultsDocument).
 */
export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["super_admin", "admin", "staff", "school_admin"]);
  if (denied) return denied;

  try {
    const body: ExportPayload = await request.json();
    if (!Array.isArray(body.headers) || !Array.isArray(body.rows)) {
      return errorResponse("Malformed export request", 400);
    }

    const buffer = await renderToBuffer(
      GenericTableDocument({
        title: body.title || "Export",
        headers: body.headers,
        rows: body.rows,
        generatedAt: new Date().toISOString(),
      })
    );

    const filename = `${body.filename || "export"}.pdf`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating table PDF export:", error);
    return errorResponse("Failed to generate the PDF", 500);
  }
}
