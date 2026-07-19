import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const ADMIN_SESSION_COOKIE = 'tereco_admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // matches AuthContext's client-side session window
export const ADMIN_SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

/**
 * Guards admin-only API routes.
 *
 * Authorizes either:
 *  - the httpOnly `tereco_admin_session` cookie set by /api/auth/login on
 *    admin sign-in (an HMAC-signed, expiring token — never exposes
 *    ADMIN_API_TOKEN itself to the browser), or
 *  - the shared `ADMIN_API_TOKEN` presented directly via `Authorization:
 *    Bearer <token>` / `x-admin-token` (for scripts/curl access).
 *
 * Fails closed: if `ADMIN_API_TOKEN` is not configured the request is rejected.
 *
 * Returns `null` when the request is authorized, otherwise a `NextResponse`
 * that the caller should return immediately.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const secret = process.env.ADMIN_API_TOKEN;

  if (!secret) {
    console.error('ADMIN_API_TOKEN is not configured; denying admin request.');
    return NextResponse.json(
      { success: false, message: 'Server not configured for admin access' },
      { status: 500 }
    );
  }

  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (session && verifySessionToken(session, secret)) {
    return null;
  }

  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : undefined;
  const provided = bearer ?? request.headers.get('x-admin-token') ?? '';

  if (provided && safeEqual(provided, secret)) {
    return null;
  }

  return NextResponse.json(
    { success: false, message: 'Unauthorized' },
    { status: 401 }
  );
}

/**
 * Issue a signed, expiring session token for an authenticated admin, to be
 * set as the `tereco_admin_session` httpOnly cookie by the login route.
 */
export function createAdminSessionToken(staffId: string): string {
  const secret = process.env.ADMIN_API_TOKEN;
  if (!secret) throw new Error('ADMIN_API_TOKEN is not configured');

  const payload = Buffer.from(
    JSON.stringify({ staffId, exp: Date.now() + SESSION_TTL_MS })
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string, secret: string): boolean {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
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
