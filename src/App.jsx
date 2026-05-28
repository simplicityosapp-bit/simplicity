import { useState } from 'react'
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
import LoadingSplash from './components/LoadingSplash'

import HomeScreen from './screens/home'
import ClientsScreen from './screens/clients'
import FinanceScreen from './screens/finance'
import TasksScreen from './screens/tasks'
import LeadsScreen from './screens/leads'
import CalendarScreen from './screens/calendar'
import GoalsScreen from './screens/goals'
import MoonGlanceScreen from './screens/moon-glance'
import SettingsScreen from './screens/settings'
import ReportsScreen from './screens/reports'
import ProjectsScreen from './screens/projects'
import ProjectDetailScreen from './screens/project-detail'
import TrashScreen from './screens/trash'
import InsightsScreen from './screens/insights'

import LoginScreen from './screens/auth/LoginScreen'
import SignupScreen from './screens/auth/SignupScreen'
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen'
import './screens/auth/AuthScreen.css'

function AppShell() {
  const location = useLocation()
  const screen = screenKeyFromPath(location.pathname)
  const { isDark, toggleTheme } = useTheme()
  const { update: updatePrefs } = useUserPreferences()
  const [menuOpen, setMenuOpen] = useState(false)

  /* Toggle theme on the local hook (fast) AND persist to prefs. */
  const handleToggleTheme = () => {
    toggleTheme()
    updatePrefs({ design: { theme: isDark ? 'light' : 'dark' } })
  }

  return (
    <div className="app" data-screen={screen}>
      <PrefsApplier />
      <Sidebar screen={screen} isDark={isDark} onToggleTheme={handleToggleTheme} />
      <Routes>
        <Route path={ROUTES.HOME} element={<HomeScreen />} />
        <Route path={ROUTES.CLIENTS} element={<ClientsScreen />} />
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

      <BottomNav onOpenMenu={() => setMenuOpen(true)} />
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        screen={screen}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />
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
