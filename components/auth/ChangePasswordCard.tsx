'use client';

import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * Voluntary password change from inside a portal — distinct from
 * ChangePasswordScreen, which is the full-page forced reset on first login.
 * The current password is required here: this runs on a session that is
 * already open, so the form is the only thing standing between an unattended
 * screen and a stolen account.
 */
export function ChangePasswordCard() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current one.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        reset();
        toast.success('Password updated.');
      } else {
        setError(data.message ?? 'Failed to update password.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-bg-muted text-text-secondary flex items-center justify-center shrink-0">
          <KeyRound className="w-4.5 h-4.5" />
        </div>
        <h2 className="text-sm font-semibold text-primary-900">Change password</h2>
      </div>
      <p className="text-sm text-text-muted mb-5">
        You will stay signed in on this device. Any other device stays signed in until its
        session expires.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <Input
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
          autoComplete="new-password"
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          error={error}
        />

        <Button variant="primary" type="submit" isLoading={saving}>
          Update password
        </Button>
      </form>
    </Card>
  );
}
