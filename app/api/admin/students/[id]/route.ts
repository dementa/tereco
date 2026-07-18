import { NextRequest, NextResponse } from 'next/server';
import { deleteStudent } from '@/lib/students';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteStudent(id);
    return NextResponse.json({ success: true, message: 'Student deleted' });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
