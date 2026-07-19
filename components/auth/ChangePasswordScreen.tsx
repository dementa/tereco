'use client'

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

/** Forced first-login reset — every system-generated account starts with must_change_password = true. */
export const ChangePasswordScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        onDone();
      } else {
        setError(data.message || 'Failed to update password.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-700 text-white flex items-center justify-center shadow-md">
            <KeyRound size={26} />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-primary-900">Set a new password</h1>
          <p className="text-sm text-text-muted mt-2">Your account was created with a temporary password. Choose your own to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          />

          {error && (
            <div className="flex items-start gap-2 text-sm text-error">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <Button variant="primary" className="w-full justify-center text-base py-3" type="submit" isLoading={isLoading}>
            Set password
          </Button>
        </form>
      </motion.div>
    </div>
  );
};
