import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BrowserRouter, Routes, Route, Navigate, useLocation,
} from 'react-router-dom'

import { ROUTES } from './lib/routes'
import { screenKeyFromPath } from './lib/nav'
import { useTheme } from './hooks/useTheme'
import { useUserPreferences } from './hooks/useUserPreferences'
import UserPreferencesProvider from './components/UserPreferencesProvider'
import AuthProvider from './auth/AuthProvider'
import { useAuth } from './auth/AuthContext'
import BottomNav from './components/BottomNav'
import MenuDrawer from './components/MenuDrawer'
import Sidebar from './components/Sidebar'
import PrefsApplier from './components/PrefsApplier'
import ScreenTour from './components/ScreenTour'
import LoadingSplash from './components/LoadingSplash'
import FeedbackModal from './modals/FeedbackModal'
import UndoToast from './components/UndoToast'

/* Screens are code-split: each becomes its own chunk loaded on first
   navigation, so the initial bundle is just the shell + the first screen
   rather than all 15. A logged-out user never downloads the app screens. */
const OnboardingScreen = lazy(() => import('./screens/onboarding'))
const HomeScreen = lazy(() => import('./screens/home'))
const ClientsScreen = lazy(() => import('./screens/clients'))
const FinanceScreen = lazy(() => import('./screens/finance'))
const TasksScreen = lazy(() => import('./screens/tasks'))
const LeadsScreen = lazy(() => import('./screens/leads'))
const CalendarScreen = lazy(() => import('./screens/calendar'))
const GoalsScreen = lazy(() => import('./screens/goals'))
const MoonGlanceScreen = lazy(() => import('./screens/moon-glance'))
const SettingsScreen = lazy(() => import('./screens/settings'))
const ReportsScreen = lazy(() => import('./screens/reports'))
const ProjectsScreen = lazy(() => import('./screens/projects'))
const ProjectDetailScreen = lazy(() => import('./screens/project-detail'))
const TrashScreen = lazy(() => import('./screens/trash'))
const InsightsScreen = lazy(() => import('./screens/insights'))

import LoginScreen from './screens/auth/LoginScreen'
import SignupScreen from './screens/auth/SignupScreen'
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen'
import './screens/auth/AuthScreen.css'

/* Lightweight fallback while a screen chunk loads. Lives INSIDE the shell
   so the sidebar / bottom-nav stay put — only the content area waits. The
   `.screen` class keeps the page padding + background so it doesn't flash. */
function ScreenFallback() {
  return <LoadingSplash transparent />
}

function AppShell() {
  const location = useLocation()
  const screen = screenKeyFromPath(location.pathname)
  const { isDark, toggleTheme } = useTheme()
  const { prefs, update: updatePrefs, loading: prefsLoading } = useUserPreferences()
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  /* Toggle theme on the local hook (fast) AND persist to prefs. */
  const handleToggleTheme = () => {
    toggleTheme()
    updatePrefs({ design: { theme: isDark ? 'light' : 'dark' } })
  }

  /* Onboarding guard. While prefs are loading we render nothing — the
     prefs blob arrives in a few ms and we don't want to flicker the
     wrong screen. Once loaded, if the user hasn't completed or skipped
     the wizard, force /onboarding (chrome hidden). They can still log
     out, but every other route bounces to the wizard. */
  const ob = prefs?.onboarding
  const obDone = !!(ob?.completed_at || ob?.skipped_at)

  /* Warm the most-visited screen chunks during idle time once the first
     screen is up, so navigating to them is instant instead of showing the
     lazy fallback. Initial load stays small (these run AFTER paint, only
     when the browser is idle). Prefetch failures are silent (offline). */
  useEffect(() => {
    if (prefsLoading || !obDone) return undefined
    const prefetch = () => {
      import('./screens/clients').catch(() => {})
      import('./screens/finance').catch(() => {})
      import('./screens/tasks').catch(() => {})
      import('./screens/calendar').catch(() => {})
      import('./screens/leads').catch(() => {})
      import('./screens/goals').catch(() => {})
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 2500 })
      return () => window.cancelIdleCallback?.(id)
    }
    const id = setTimeout(prefetch, 1500)
    return () => clearTimeout(id)
  }, [prefsLoading, obDone])

  if (prefsLoading) return <LoadingSplash />
  if (!obDone) {
    return (
      <div className="app" data-screen="onboarding">
        <PrefsApplier />
        <Suspense fallback={<ScreenFallback />}>
          <Routes>
            <Route path={ROUTES.ONBOARDING} element={<OnboardingScreen />} />
            <Route path="*" element={<Navigate to={ROUTES.ONBOARDING} replace />} />
          </Routes>
        </Suspense>
      </div>
    )
  }

  return (
    <div className="app" data-screen={screen}>
      <PrefsApplier />
      <Sidebar
        screen={screen}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onOpenFeedback={() => setFeedbackOpen(true)}
      />
      <Suspense fallback={<ScreenFallback />}>
        <Routes>
          <Route path={ROUTES.HOME} element={<HomeScreen onOpenFeedback={() => setFeedbackOpen(true)} />} />
          <Route path={ROUTES.CLIENTS} element={<ClientsScreen />} />
          <Route path={ROUTES.CLIENT} element={<ClientsScreen />} />
          <Route path={ROUTES.FINANCE} element={<FinanceScreen />} />
          <Route path={ROUTES.TASKS} element={<TasksScreen />} />
          <Route path={ROUTES.LEADS} element={<LeadsScreen />} />
          <Route path={ROUTES.CALENDAR} element={<CalendarScreen />} />
          <Route path={ROUTES.GOALS} element={<GoalsScreen />} />
          <Route path={ROUTES.MOON_GLANCE} element={<MoonGlanceScreen />} />
          <Route path={ROUTES.SETTINGS} element={<SettingsScreen />} />
          <Route path={ROUTES.REPORTS} element={<ReportsScreen />} />
          <Route path={ROUTES.PROJECTS} element={<ProjectsScreen />} />
          <Route path={ROUTES.PROJECT} element={<ProjectDetailScreen />} />
          <Route path={ROUTES.TRASH} element={<TrashScreen />} />
          <Route path={ROUTES.INSIGHTS} element={<InsightsScreen />} />
          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Routes>
      </Suspense>

      <BottomNav onOpenMenu={() => setMenuOpen(true)} />
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        screen={screen}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onOpenFeedback={() => setFeedbackOpen(true)}
      />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <ScreenTour screenKey={screen} />
      <UndoToast />
    </div>
  )
}

function AuthGate() {
  return (
    <Routes>
      <Route path={ROUTES.LOGIN} element={<LoginScreen />} />
      <Route path={ROUTES.SIGNUP} element={<SignupScreen />} />
      <Route path={ROUTES.RESET_PASSWORD} element={<ResetPasswordScreen />} />
      <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
    </Routes>
  )
}

/* When the user returns from an OAuth provider (e.g. Google), the URL
   carries the auth code/token. If we render <AuthGate/> and let the
   router redirect "/" → "/login", the redirect strips the query string
   before the Supabase client can exchange the code for a session —
   producing an infinite login loop. While that exchange is in flight,
   show the splash. */
function urlHasOAuthCallback() {
  if (typeof window === 'undefined') return false
  return (
    window.location.search.includes('code=') ||
    window.location.hash.includes('access_token=')
  )
}

function Root() {
  const { session, loading } = useAuth()
  if (loading || (!session && urlHasOAuthCallback())) {
    return <LoadingSplash />
  }
  return session ? (
    <UserPreferencesProvider>
      <AppShell />
    </UserPreferencesProvider>
  ) : <AuthGate />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  )
}
