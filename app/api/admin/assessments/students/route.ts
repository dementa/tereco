import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errorResponse, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';

// GET ?identifier= — resolves a student's System ID or email to an id and
// display name, for the assessment "Audience" picker. Same identifier
// resolution as login and the collaborator picker (see
// app/api/admin/assessments/[id]/collaborators/route.ts).
//
// GET ?ids=a,b,c — the reverse lookup, resolving already-targeted student ids
// back to display names so existing targets can render as more than a UUID.
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin', 'staff']);
  if (denied) return denied;

  const admin = getSupabaseAdmin();
  const ids = request.nextUrl.searchParams.get('ids');
  if (ids !== null) {
    const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (idList.length === 0) return successResponse({ data: [] });

    const { data } = await admin
      .from('profiles')
      .select('id, first_name, last_name, system_id')
      .in('id', idList)
      .eq('role', 'student');

    return successResponse({
      data: (data ?? []).map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        systemId: c.system_id,
      })),
    });
  }

  const identifier = request.nextUrl.searchParams.get('identifier')?.trim();
  if (!identifier) return errorResponse('Provide a System ID or email', 400);

  const query = admin
    .from('profiles')
    .select('id, first_name, last_name, system_id, role, is_active')
    .eq('is_active', true);
  const { data: candidate } = identifier.includes('@')
    ? await query.eq('email', identifier).maybeSingle()
    : await query.eq('system_id', identifier).maybeSingle();

  if (!candidate) {
    return errorResponse('No active account found for that System ID or email.', 404);
  }
  if (candidate.role !== 'student') {
    return errorResponse('That account is not a student.', 400);
  }

  return successResponse({
    data: {
      id: candidate.id,
      name: `${candidate.first_name} ${candidate.last_name}`.trim(),
      systemId: candidate.system_id,
    },
  });
}
