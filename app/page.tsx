'use client'

import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from '@/components/auth/AuthContext';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { SplashScreen } from '@/components/splash/SplashScreen';
import { FormsHome } from '@/components/forms/FormsHome';
import { DailyLessonWizard } from '@/components/forms/DailyLessonWizard';

type Screen = 'splash' | 'login' | 'home' | 'wizard';

const AppContent: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const [screen, setScreen] = useState<Screen>('splash');

  useEffect(() => {
    const timer = setTimeout(() => {
      setScreen(isAuthenticated ? 'home' : 'login');
    }, 4500);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const handleLogin = () => setScreen('home');
  const handleLogout = () => {
    logout();
    setScreen('login');
  };
  const handleSelectForm = () => setScreen('wizard');
  const handleWizardBack = () => setScreen('home');

  return (
    <AnimatePresence mode="wait">
      {screen === 'splash' && <SplashScreen key="splash" onComplete={() => setScreen(isAuthenticated ? 'home' : 'login')} />}
      {screen === 'login' && <LoginScreen key="login" onLogin={handleLogin} />}
      {screen === 'home' && (
        <FormsHome key="home" onSelectForm={handleSelectForm} onLogout={handleLogout} />
      )}
      {screen === 'wizard' && <DailyLessonWizard key="wizard" onBack={handleWizardBack} />}
    </AnimatePresence>
  );
};

const HomePage: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default HomePage;