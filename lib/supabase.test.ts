import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn((url: string, key: string) => ({ __url: url, __key: key })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

import { getSupabaseAdmin } from './supabase';

const URL_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  URL_KEYS.forEach(k => delete process.env[k]);
});

afterEach(() => {
  URL_KEYS.forEach(k => delete process.env[k]);
});

describe('getSupabaseAdmin', () => {
  it('throws when the URL is missing', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    expect(() => getSupabaseAdmin()).toThrow(/environment variables are missing/i);
  });

  it('throws when the service-role key is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    expect(() => getSupabaseAdmin()).toThrow(/environment variables are missing/i);
  });

  it('creates a client with session persistence disabled', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    getSupabaseAdmin();
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://x.supabase.co',
      'service-key',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  });

  it('falls back to SUPABASE_URL when NEXT_PUBLIC_SUPABASE_URL is unset', () => {
    process.env.SUPABASE_URL = 'https://fallback.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    getSupabaseAdmin();
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://fallback.supabase.co',
      'service-key',
      expect.anything()
    );
  });
});
