'use client'

import React, { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'

import { AuthProvider, useAuth, type User } from '@/components/auth/AuthContext'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { ChangePasswordScreen } from '@/components/auth/ChangePasswordScreen'
import { SplashScreen } from '@/components/splash/SplashScreen'
import { FormsHome } from '@/components/forms/FormsHome'
import { DailyLessonWizard } from '@/components/forms/DailyLessonWizard'
import PortalSelector from '@/components/auth/PortalSelector'

type Screen =
  | 'splash'
  | 'portal'
  | 'login'
  | 'change-password'
  | 'home'
  | 'wizard'

type Portal = 'admin' | 'staff' | 'student'

const SPLASH_SEEN_KEY = 'tereco_splash_seen'

// Super admin's job is account/entity management, not filling forms —
// send them straight into the console instead of the staff forms list.
const goToRoleHome = (role: string) => {
  if (role === 'super_admin') {
    window.location.href = '/admin/system'
    return true
  }
  return false
}

const AppContent: React.FC = () => {
  const { isAuthenticated, user, mustChangePassword, logout } = useAuth()

  const [screen, setScreen] = useState<Screen>('splash')
  const [portal, setPortal] = useState<Portal | null>(null)
  // Tracked locally (not read from context) so routing right after
  // login/password-change never races a not-yet-rendered context update.
  const [activeUser, setActiveUser] = useState<User | null>(null)

  // The splash is an introduction, not a toll. Someone coming back to change
  // role has already seen it, and sitting through 4.5s again every time would
  // make the way back feel worse than restarting the app.
  useEffect(() => {
    // Always through the timer, never set synchronously here: a state change
    // in the effect body triggers a cascading render (and the initial render
    // must stay 'splash' on both server and client, or hydration mismatches).
    const seen = sessionStorage.getItem(SPLASH_SEEN_KEY)
    const timer = setTimeout(() => {
      sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
      setScreen('portal')
    }, seen ? 0 : 4500)

    return () => clearTimeout(timer)
  }, [])

  const handlePortalSelect = (selected: Portal) => {
    setPortal(selected)

    if (selected === 'student') {
      window.location.href = '/assessment'
      return
    }

    if (isAuthenticated) {
      if (mustChangePassword) {
        setScreen('change-password')
      } else if (!goToRoleHome(user?.role ?? '')) {
        setScreen('home')
      }
    } else {
      setScreen('login')
    }
  }

  const handleLogin = (loggedInUser: User & { mustChangePassword?: boolean }) => {
    setActiveUser(loggedInUser)
    if (loggedInUser.mustChangePassword) {
      setScreen('change-password')
    } else if (!goToRoleHome(loggedInUser.role)) {
      setScreen('home')
    }
  }

  const handlePasswordChanged = () => {
    if (!goToRoleHome(activeUser?.role ?? '')) {
      setScreen('home')
    }
  }

  // portal -> login is a state change, so there is no history entry to go back
  // to. The way back has to be explicit.
  const handleBackToPortal = () => {
    setPortal(null)
    setScreen('portal')
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
          onComplete={() => {
            sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
            setScreen('portal')
          }}
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
          onBack={handleBackToPortal}
        />
      )}

      {screen === 'change-password' && (
        <ChangePasswordScreen
          key="change-password"
          onDone={handlePasswordChanged}
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