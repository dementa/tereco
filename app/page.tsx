'use client'

import React, { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'

import { AuthProvider, useAuth } from '@/components/auth/AuthContext'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { SplashScreen } from '@/components/splash/SplashScreen'
import { FormsHome } from '@/components/forms/FormsHome'
import { DailyLessonWizard } from '@/components/forms/DailyLessonWizard'
import PortalSelector from '@/components/auth/PortalSelector'

type Screen =
  | 'splash'
  | 'portal'
  | 'login'
  | 'home'
  | 'wizard'

type Portal = 'admin' | 'staff' | 'student'

const AppContent: React.FC = () => {
  const { isAuthenticated, logout } = useAuth()

  const [screen, setScreen] = useState<Screen>('splash')
  const [portal, setPortal] = useState<Portal | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setScreen('portal')
    }, 4500)

    return () => clearTimeout(timer)
  }, [])

  const handlePortalSelect = (selected: Portal) => {
    setPortal(selected)

    if (selected === 'student') {
      window.location.href = '/assessment'
      return
    }

    if (isAuthenticated) {
      setScreen('home')
    } else {
      setScreen('login')
    }
  }

  const handleLogin = () => {
    setScreen('home')
  }

  const handleLogout = () => {
    logout()
    setPortal(null)
    setScreen('portal')
  }

  const handleSelectForm = () => {
    setScreen('wizard')
  }

  const handleWizardBack = () => {
    setScreen('home')
  }

  return (
    <AnimatePresence mode="wait">
      {screen === 'splash' && (
        <SplashScreen
          key="splash"
          onComplete={() => setScreen('portal')}
        />
      )}

      {screen === 'portal' && (
        <PortalSelector
          key="portal"
          onSelect={handlePortalSelect}
        />
      )}

      {screen === 'login' && (
        <LoginScreen
          key="login"
          onLogin={handleLogin}
        />
      )}

      {screen === 'home' && (
        <FormsHome
          key="home"
          onSelectForm={handleSelectForm}
          onLogout={handleLogout}
        />
      )}

      {screen === 'wizard' && (
        <DailyLessonWizard
          key="wizard"
          onBack={handleWizardBack}
        />
      )}
    </AnimatePresence>
  )
}

const HomePage: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default HomePage