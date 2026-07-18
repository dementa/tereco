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
 * Convert a thrown value into an appropriate error response.
 *
 * - `ZodError` -> 400 with formatted validation issues.
 * - Anything else -> `fallbackStatus` with the generic `fallbackMessage`.
 *
 * The non-validation branch deliberately never surfaces the raw error
 * message to the client, so internal failure details are not leaked.
 */
export function handleApiError(
  error: unknown,
  fallbackMessage = "An unexpected server error occurred.",
  fallbackStatus = 500,
  validationMessage = "Validation failed."
) {
  if (error instanceof z.ZodError) {
    return errorResponse(validationMessage, 400, {
      errors: formatZodIssues(error),
    });
  }

  return errorResponse(fallbackMessage, fallbackStatus);
}
