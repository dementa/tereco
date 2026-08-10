'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

import { endSession, loadIdentity } from '@/lib/auth/identity';

export interface User {
  id: string;
  staffId: string;
  name: string;
  /** Always sent by /api/auth/login and /api/auth/me; optional only because
      older callers construct a User without it. */
  email?: string;
  role: string;
  school: string;
  schoolId?: string | null;
  className?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  mustChangePassword: boolean;
  login: (user: User & { mustChangePassword?: boolean }) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  // In a browser the session lives server-side (real Supabase Auth cookies, set
  // by /api/auth/login) and this rehydrates React state from it on load. In
  // TERECO Collect there is no network to ask, so the identity comes from the
  // local database instead — see lib/auth/identity.ts.
  const refresh = useCallback(async () => {
    try {
      const { user: nextUser, mustChangePassword: mustChange } = await loadIdentity();
      setUser(nextUser);
      setIsAuthenticated(nextUser !== null);
      setMustChangePassword(mustChange);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Kicked off asynchronously so no state is set synchronously in the effect
    // body — `loading` already starts true and is cleared when the request
    // settles.
    void (async () => {
      if (!controller.signal.aborted) await refresh();
    })();
    return () => controller.abort();
  }, [refresh]);

  const login = (loggedInUser: User & { mustChangePassword?: boolean }) => {
    setUser(loggedInUser);
    setIsAuthenticated(true);
    setMustChangePassword(!!loggedInUser.mustChangePassword);
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setMustChangePassword(false);
    void endSession();
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, mustChangePassword, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
