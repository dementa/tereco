'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  staffId: string;
  name: string;
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

  // Session lives server-side (real Supabase Auth cookies, set by
  // /api/auth/login) — this just rehydrates React state from it on load.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
        setMustChangePassword(!!data.user.mustChangePassword);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setMustChangePassword(false);
      }
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      setMustChangePassword(false);
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
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
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
