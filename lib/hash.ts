import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext passcode.
 */
export async function hashPasscode(plaintext: string): Promise<string> {
  return await bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Compare a plaintext passcode with a stored hash.
 */
export async function verifyPasscode(plaintext: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plaintext, hash);
}