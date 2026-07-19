'use client'

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth, type User as AuthUser } from './AuthContext';

export const LoginScreen: React.FC<{ onLogin: (user: AuthUser & { mustChangePassword?: boolean }) => void }> = ({ onLogin }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo — free-standing, no container */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-primary-900">
            TERECO
          </h1>
          <p className="text-sm text-text-muted mt-2">Sign in to submit lesson records</p>
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