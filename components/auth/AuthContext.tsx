'use client'

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  staffId: string;
  name: string;
  role: string;
  school: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void; // now accepts a user object
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('tereco_user');
    const sessionToken = localStorage.getItem('tereco_session');
    if (storedUser && sessionToken) {
      try {
        const parsed = JSON.parse(storedUser);
        const tokenAge = Date.now() - parseInt(sessionToken);
        if (tokenAge < 24 * 60 * 60 * 1000) {
          setUser(parsed);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('tereco_user');
          localStorage.removeItem('tereco_session');
        }
      } catch {
        localStorage.removeItem('tereco_user');
        localStorage.removeItem('tereco_session');
      }
    }
  }, []);

  const login = (user: User) => {
    setUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('tereco_user', JSON.stringify(user));
    localStorage.setItem('tereco_session', Date.now().toString());
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('tereco_user');
    localStorage.removeItem('tereco_session');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};