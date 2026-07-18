import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  const from = vi.fn(() => builder);
  return {
    from,
    builder,
    setResult: (r: { data: unknown; error: unknown }) => { result = r; },
  };
});

vi.mock('./supabase', () => ({ getSupabaseAdmin: () => ({ from: h.from }) }));

import { getUsers } from './users';

beforeEach(() => {
  vi.clearAllMocks();
  h.setResult({ data: null, error: null });
});

describe('getUsers', () => {
  it('queries the users table with the expected columns', async () => {
    h.setResult({ data: [], error: null });
    await getUsers();
    expect(h.from).toHaveBeenCalledWith('users');
    expect(h.builder.select).toHaveBeenCalledWith('staff_id, passcode_hash, name, role, school');
  });

  it('maps rows keyed by staff id and drops the plaintext column', async () => {
    h.setResult({
      data: [{ staff_id: 'S1', passcode_hash: 'hash1', name: 'Alice', role: 'teacher', school: 'Green' }],
      error: null,
    });
    const users = await getUsers();
    expect(users).toEqual({
      S1: { passcode: 'hash1', name: 'Alice', role: 'teacher', school: 'Green' },
    });
  });

  it('defaults missing optional fields to empty strings', async () => {
    h.setResult({
      data: [{ staff_id: 'S1', passcode_hash: 'hash1', name: null, role: null, school: null }],
      error: null,
    });
    const users = await getUsers();
    expect(users.S1).toEqual({ passcode: 'hash1', name: '', role: '', school: '' });
  });

  it('skips rows missing a staff id or passcode hash', async () => {
    h.setResult({
      data: [
        { staff_id: '', passcode_hash: 'h', name: 'x', role: 'r', school: 's' },
        { staff_id: 'S2', passcode_hash: '', name: 'x', role: 'r', school: 's' },
        { staff_id: 'S3', passcode_hash: 'h3', name: 'ok', role: 'r', school: 's' },
      ],
      error: null,
    });
    const users = await getUsers();
    expect(Object.keys(users)).toEqual(['S3']);
  });

  it('returns an empty object when the query errors', async () => {
    h.setResult({ data: null, error: { message: 'boom' } });
    await expect(getUsers()).resolves.toEqual({});
  });

  it('returns an empty object when data is null', async () => {
    h.setResult({ data: null, error: null });
    await expect(getUsers()).resolves.toEqual({});
  });
});
