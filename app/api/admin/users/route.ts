import { NextRequest, NextResponse } from 'next/server';
import { listUsers, createUser } from '@/lib/users';
import { z } from 'zod';

export async function GET() {
  try {
    const users = await listUsers();
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('Error listing users:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to list users' },
      { status: 500 }
    );
  }
}

const CreateUserSchema = z.object({
  staffId: z.string().min(1, 'Staff ID is required'),
  passcode: z.string().min(1, 'Passcode is required'),
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  school: z.string().min(1, 'School is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CreateUserSchema.parse(body);
    const user = await createUser(validated);
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Create failed' },
      { status: 500 }
    );
  }
}
