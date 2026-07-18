'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, Lock, Eye, EyeOff, AlertCircle, GraduationCap, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from './AuthContext';

export const LoginScreen: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const router = useRouter();
  const { login } = useAuth();
  const [staffId, setStaffId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLocked && lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer(prev => {
          if (prev <= 1) {
            setIsLocked(false);
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLocked, lockoutTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isLocked) {
      setError(`Account is locked. Please wait ${Math.ceil(lockoutTimer / 60)} minutes.`);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staffId.trim(), passcode }),
      });
      const data = await response.json();
      if (data.success) {
        login(data.user);
        onLogin();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 3) {
          setIsLocked(true);
          setLockoutTimer(900);
          setError('Account locked for 15 minutes due to multiple failed attempts.');
        } else {
          setError(data.message || `Invalid credentials. ${3 - newAttempts} attempts remaining.`);
        }
      }
    } catch (err) {
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
        {/* Logo — free-standing, no container */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-primary-900">
            TERECO
          </h1>
          <p className="text-sm text-text-muted mt-2">Assessments &amp; lesson records</p>
        </div>

        {/* Quick actions — student entry needs no sign-in */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push('/assessment')}
            className="group w-full flex items-center gap-3 rounded-xl border-2 border-primary-200 bg-bg-card px-4 py-3 text-left transition-all hover:border-primary-700 hover:bg-primary-700/5 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary-700/20"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-700/10 text-primary-700">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-primary-900">Take an Assessment</span>
              <span className="block text-xs text-text-muted">For students — no sign-in required</span>
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-primary-100" />
          <span className="text-xs uppercase tracking-wide text-text-faint">Staff sign-in</span>
          <span className="h-px flex-1 bg-primary-100" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="staffId" className="text-xs font-medium text-text-secondary tracking-wide">
              Staff ID
            </label>
            <div className="relative mt-2">
              <User className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                id="staffId"
                type="text"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full border-0 border-b border-primary-200 bg-transparent pl-6 pr-2 py-2 text-sm text-text-primary transition-colors duration-200 focus:border-primary-700 focus:outline-none focus:ring-0"
                placeholder="e.g. TCH-2026-001"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label htmlFor="passcode" className="text-xs font-medium text-text-secondary tracking-wide">
              Passcode
            </label>
            <div className="relative mt-2">
              <Lock className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                id="passcode"
                type={showPassword ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full border-0 border-b border-primary-200 bg-transparent pl-6 pr-8 py-2 text-sm text-text-primary transition-colors duration-200 focus:border-primary-700 focus:outline-none focus:ring-0"
                placeholder="Enter your passcode"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-text-faint hover:text-primary-700 transition-colors"
                aria-label={showPassword ? 'Hide passcode' : 'Show passcode'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 text-sm text-error"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}

          <div className="flex items-center justify-between text-sm pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-text-muted">
              <input type="checkbox" className="rounded border-primary-200 text-primary-700 focus:ring-primary-700/20 w-4 h-4" />
              Remember me
            </label>
            <button type="button" className="text-text-muted hover:text-primary-700 transition-colors font-medium">
              Forgot passcode?
            </button>
          </div>

          <Button
            variant="primary"
            className="w-full justify-center text-base py-3"
            type="submit"
            isLoading={isLoading}
            disabled={isLocked}
          >
            {isLocked ? `Locked (${Math.ceil(lockoutTimer / 60)}m)` : 'Sign In'}
          </Button>
        </form>

        <p className="text-xs text-text-faint text-center mt-8">
          Authorized personnel only. Multiple failed attempts will lock your account.
        </p>
      </motion.div>
    </div>
  );
};