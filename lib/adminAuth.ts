import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Guards admin-only API routes.
 *
 * Requires the caller to present the shared admin token via either the
 * `Authorization: Bearer <token>` header or an `x-admin-token` header, matched
 * against the `ADMIN_API_TOKEN` environment variable.
 *
 * Fails closed: if `ADMIN_API_TOKEN` is not configured the request is rejected.
 *
 * Returns `null` when the request is authorized, otherwise a `NextResponse`
 * that the caller should return immediately.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_API_TOKEN;

  if (!expected) {
    console.error('ADMIN_API_TOKEN is not configured; denying admin request.');
    return NextResponse.json(
      { success: false, message: 'Server not configured for admin access' },
      { status: 500 }
    );
  }

  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : undefined;
  const provided = bearer ?? request.headers.get('x-admin-token') ?? '';

  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Constant-time string comparison. Hashing first keeps the compared buffers the
 * same length so `timingSafeEqual` never throws and length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
