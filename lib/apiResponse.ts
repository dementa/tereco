import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Shared helpers for building consistent API JSON responses.
 *
 * Every route in this app returns a `{ success: boolean, ... }` envelope, so
 * these helpers centralise that shape (and the repeated Zod error handling)
 * instead of hand-rolling `NextResponse.json(...)` in each handler.
 */

type Extra = Record<string, unknown>;

/**
 * Build a success response: `{ success: true, ...payload }`.
 */
export function successResponse(payload: Extra = {}, status = 200) {
  return NextResponse.json({ success: true, ...payload }, { status });
}

/**
 * Build an error response: `{ success: false, message, ...extra }`.
 */
export function errorResponse(message: string, status = 500, extra: Extra = {}) {
  return NextResponse.json({ success: false, message, ...extra }, { status });
}

/**
 * Format a ZodError into the `{ path, message }[]` shape used across routes.
 */
export function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/**
 * Throw this (instead of a plain Error) when the message is specific,
 * actionable, and safe to show the caller verbatim — e.g. "an account with
 * this email already exists." handleApiError surfaces it as-is; every other
 * thrown error still falls back to a generic message so internal failure
 * details never leak to the client.
 */
export class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

/**
 * Convert a thrown value into an appropriate error response.
 *
 * - `ZodError` -> 400 with formatted validation issues.
 * - `UserFacingError` -> its own message and status, verbatim.
 * - Anything else -> `fallbackStatus` with the generic `fallbackMessage`.
 *
 * The generic branch deliberately never surfaces the raw error message to
 * the client, so internal failure details are not leaked.
 */
export function handleApiError(
  error: unknown,
  fallbackMessage = "An unexpected server error occurred.",
  fallbackStatus = 500,
  validationMessage = "Validation failed."
) {
  if (error instanceof z.ZodError) {
    // Name the offending fields in the message itself. Every route already
    // returned this detail in `errors`, and no page has ever displayed it —
    // so a rejected form said only "Validation failed", which tells the person
    // filling it in nothing about which box to fix. Folding the detail into
    // `message` makes every existing caller useful without touching any page.
    //
    // Zod issues describe the caller's own submitted fields, so there is
    // nothing internal to leak here.
    const issues = formatZodIssues(error);
    const detail = issues
      .map((i) => (i.path ? `${i.path} — ${i.message}` : i.message))
      .join("; ");

    return errorResponse(detail ? `${validationMessage} ${detail}` : validationMessage, 400, {
      errors: issues,
    });
  }

  if (error instanceof UserFacingError) {
    return errorResponse(error.message, error.status);
  }

  return errorResponse(fallbackMessage, fallbackStatus);
}
