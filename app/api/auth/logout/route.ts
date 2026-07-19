import { successResponse } from '@/lib/apiResponse';
import { ADMIN_SESSION_COOKIE } from '@/lib/adminAuth';

export async function POST() {
  const response = successResponse();
  response.cookies.set(ADMIN_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
