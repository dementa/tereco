import { NextRequest, NextResponse } from 'next/server';
import {
  getUsersFromSheet,
  ensureUsersSheet,
} from "@/lib/googleSheets";
import { verifyPasscode } from '@/lib/hash';

export async function POST(request: NextRequest) {
  try {
    // Ensure the Users sheet exists (optional, but good practice)
    // This function doesn't need parameters - it handles authentication internally
    await ensureUsersSheet();

    const { staffId, passcode } = await request.json();
    if (!staffId || !passcode) {
      return NextResponse.json(
        { success: false, message: 'Missing credentials' },
        { status: 400 }
      );
    }

    // Fetch all users from sheet
    // This function doesn't need parameters - it handles authentication internally
    const users = await getUsersFromSheet();

    // Check if user exists
    const user = users[staffId];
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify the provided passcode against the stored hash
    const isValid = await verifyPasscode(passcode, user.passcode);

    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Success: return user data (without the hash)
    const { passcode: _, ...safeUser } = user; // '_' unused
    return NextResponse.json({
      success: true,
      user: { id: staffId, staffId, ...safeUser },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}