import { NextResponse } from 'next/server';
import { getLessons } from '@/lib/lessons';

export async function GET() {
  try {
    const lessons = await getLessons();
    return NextResponse.json({ success: true, data: lessons });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch lessons' },
      { status: 500 }
    );
  }
}
