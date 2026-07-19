'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthContext';

/**
 * Student login — replaces the old open self-declared name/school/class
 * picker. A real account (system ID + password) is what makes the
 * one-submission-per-assessment guarantee actually enforceable.
 */
export function AssessmentEntry() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Invalid System ID or password.');
        return;
      }
      if (data.user.role !== 'student') {
        await fetch('/api/auth/logout', { method: 'POST' });
        setError('This portal is for students only.');
        return;
      }
      login(data.user);
      if (data.user.mustChangePassword) {
        router.push('/assessment/change-password');
      } else {
        router.push('/assessment/list');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-700 text-white flex items-center justify-center shadow-md mb-4">
            <GraduationCap size={26} />
          </div>
          <h1 className="text-2xl font-bold text-primary-900">Assessment Portal</h1>
          <p className="text-sm text-text-muted mt-1">Sign in with your student account to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Student System ID"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. TST-2026-0001"
            required
            autoComplete="username"
          />
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-[34px] text-text-faint hover:text-primary-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-error">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full justify-center" isLoading={loading}>
            Sign in
          </Button>
        </form>

        <p className="text-xs text-text-faint text-center mt-6">
          Don&apos;t have an account? Ask your teacher or school admin.
        </p>
      </Card>
    </div>
  );
}
