import { describe, it, expect } from 'vitest';
import { hashPasscode, verifyPasscode } from './hash';

describe('hash', () => {
  it('hashPasscode returns a bcrypt hash that differs from the plaintext', async () => {
    const hash = await hashPasscode('secret123');
    expect(hash).not.toBe('secret123');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('produces different hashes for the same input (random salt)', async () => {
    const a = await hashPasscode('samePass');
    const b = await hashPasscode('samePass');
    expect(a).not.toBe(b);
  });

  it('verifyPasscode returns true for a matching passcode', async () => {
    const hash = await hashPasscode('correct-horse');
    await expect(verifyPasscode('correct-horse', hash)).resolves.toBe(true);
  });

  it('verifyPasscode returns false for a non-matching passcode', async () => {
    const hash = await hashPasscode('correct-horse');
    await expect(verifyPasscode('wrong-passcode', hash)).resolves.toBe(false);
  });

  it('verifyPasscode is case-sensitive', async () => {
    const hash = await hashPasscode('CaseSensitive');
    await expect(verifyPasscode('casesensitive', hash)).resolves.toBe(false);
  });

  it('handles empty-string passcodes consistently', async () => {
    const hash = await hashPasscode('');
    await expect(verifyPasscode('', hash)).resolves.toBe(true);
    await expect(verifyPasscode('x', hash)).resolves.toBe(false);
  });
});
