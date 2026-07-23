'use client'

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Lock, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth, type User as AuthUser } from './AuthContext';

/**
 * `onBack` returns to the role picker. Without it this screen is a dead end:
 * portal -> login is a state change, not a navigation, so there is no history
 * entry for a browser Back to return to — and in the desktop app there is no
 * back button at all. Picking the wrong role meant restarting the app.
 */
export const LoginScreen: React.FC<{
  onLogin: (user: AuthUser & { mustChangePassword?: boolean }) => void;
  onBack?: () => void;
}> = ({ onLogin, onBack }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

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
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await response.json();
      if (data.success) {
        login(data.user);
        onLogin(data.user);
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

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage('');
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      const data = await response.json();
      // Deliberately the same message either way — the endpoint never reveals
      // whether the identifier matched an account.
      setForgotMessage(data.message || "If an account exists, we've sent a reset link.");
    } catch {
      setForgotMessage('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <button
            type="button"
            onClick={() => { setShowForgot(false); setForgotMessage(''); }}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Back to sign in
          </button>

          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold tracking-tight text-primary-900">Reset password</h1>
            <p className="text-sm text-text-muted mt-2">
              Enter your System ID or email and we&apos;ll send a reset link to the address on file.
            </p>
          </div>

          {forgotMessage ? (
            <p className="text-sm text-text-secondary text-center">{forgotMessage}</p>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-6">
              <div>
                <label htmlFor="forgot-identifier" className="text-xs font-medium text-text-secondary tracking-wide">
                  System ID or email
                </label>
                <div className="relative mt-2">
                  <User className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                  <input
                    id="forgot-identifier"
                    type="text"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    className="w-full border-0 border-b border-primary-200 bg-transparent pl-6 pr-2 py-2 text-sm text-text-primary transition-colors duration-200 focus:border-primary-700 focus:outline-none focus:ring-0"
                    placeholder="e.g. TSF-2026-0001"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>
              <Button
                variant="primary"
                className="w-full justify-center text-base py-3"
                type="submit"
                isLoading={forgotLoading}
              >
                Send reset link
              </Button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Choose a different role
          </button>
        )}

        {/* Logo — free-standing, no container */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-primary-900">
            TERECO
          </h1>
          <p className="text-sm text-text-muted mt-2">Sign in to your TERECO account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="identifier" className="text-xs font-medium text-text-secondary tracking-wide">
              System ID or email
            </label>
            <div className="relative mt-2">
              <User className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full border-0 border-b border-primary-200 bg-transparent pl-6 pr-2 py-2 text-sm text-text-primary transition-colors duration-200 focus:border-primary-700 focus:outline-none focus:ring-0"
                placeholder="e.g. TSF-2026-0001"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="text-xs font-medium text-text-secondary tracking-wide">
              Password
            </label>
            <div className="relative mt-2">
              <Lock className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-0 border-b border-primary-200 bg-transparent pl-6 pr-8 py-2 text-sm text-text-primary transition-colors duration-200 focus:border-primary-700 focus:outline-none focus:ring-0"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-text-faint hover:text-primary-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
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
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-text-muted hover:text-primary-700 transition-colors font-medium"
            >
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