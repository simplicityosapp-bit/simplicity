import { Suspense, useEffect, useRef, useState } from 'react'
import {
  BrowserRouter, Routes, Route, Navigate, useLocation,
} from 'react-router-dom'

import { ROUTES, ADMIN_EMAIL } from './lib/routes'
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
import ErrorBoundary from './components/ErrorBoundary'
import lazyWithRetry from './lib/lazyWithRetry'
import FeedbackModal from './modals/FeedbackModal'
import UndoToast from './components/UndoToast'
import Toast from './components/Toast'
import AccountDeletionPending from './components/AccountDeletionPending'
import { CryptoProvider, useCrypto } from './context/CryptoContext'
import EncryptionMigrator from './components/EncryptionMigrator'
import ConsentSync from './components/ConsentSync'
import PolicyUpdateModal from './components/legal/PolicyUpdateModal'
import LegalPage from './components/legal/LegalPage'
import { needsReacceptance, readPendingConsent, clearPendingConsent, consentRowsFromMetadata } from './lib/legal'
import { recordConsent } from './lib/api/consentLog'
import { supabase } from './lib/supabase'

/* Screens are code-split: each becomes its own chunk loaded on first
   navigation, so the initial bundle is just the shell + the first screen
   rather than all 15. A logged-out user never downloads the app screens. */
const OnboardingScreen = lazyWithRetry(() => import('./screens/onboarding'))
const HomeScreen = lazyWithRetry(() => import('./screens/home'))
const ClientsScreen = lazyWithRetry(() => import('./screens/clients'))
const FinanceScreen = lazyWithRetry(() => import('./screens/finance'))
const TasksScreen = lazyWithRetry(() => import('./screens/tasks'))
const LeadsScreen = lazyWithRetry(() => import('./screens/leads'))
const CalendarScreen = lazyWithRetry(() => import('./screens/calendar'))
const GoalsScreen = lazyWithRetry(() => import('./screens/goals'))
const MoonGlanceScreen = lazyWithRetry(() => import('./screens/moon-glance'))
const SettingsScreen = lazyWithRetry(() => import('./screens/settings'))
const ReportsScreen = lazyWithRetry(() => import('./screens/reports'))
const ProjectsScreen = lazyWithRetry(() => import('./screens/projects'))
const ProjectDetailScreen = lazyWithRetry(() => import('./screens/project-detail'))
const TrashScreen = lazyWithRetry(() => import('./screens/trash'))
const InsightsScreen = lazyWithRetry(() => import('./screens/insights'))
const ConnectionsScreen = lazyWithRetry(() => import('./screens/connections'))
/* Owner-only admin console — its own route tree + chrome, gated below. */
const AdminApp = lazyWithRetry(() => import('./screens/admin'))
/* Public marketing landing — served at "/" to logged-out visitors (and
   crawlers) instead of bouncing them to /login. Lazy so it never weighs
   down the authenticated app bundle; a logged-in "/" still renders Home. */
const LandingScreen = lazyWithRetry(() => import('./screens/landing'))

import LoginScreen from './screens/auth/LoginScreen'
import SignupScreen from './screens/auth/SignupScreen'
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen'
import UpdatePasswordScreen from './screens/auth/UpdatePasswordScreen'
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
  const { user } = useAuth()
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

  /* Account-deletion gate. If a deletion is scheduled, lock the whole app
     behind the grace-period screen (countdown + cancel) — regardless of
     onboarding state. Data isn't deleted yet, so canceling there clears
     the flag and returns the user to normal use. */
  const deletionPending = !!prefs?.accountDeletion?.scheduled_for

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

  /* Admin console gate. A separate world, checked BEFORE the onboarding /
     deletion guards so the owner can always reach it. The email check here
     is only UX — the `admin` edge function re-verifies server-side. Anyone
     who isn't the owner is bounced home with no error, no explanation. */
  const isAdminRoute =
    location.pathname === ROUTES.ADMIN ||
    location.pathname.startsWith(ROUTES.ADMIN + '/')
  if (isAdminRoute) {
    const isOwner = (user?.email || '').toLowerCase() === ADMIN_EMAIL
    if (!isOwner) return <Navigate to={ROUTES.HOME} replace />
    return (
      <div className="app" data-screen="admin">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<ScreenFallback />}>
            <AdminApp />
          </Suspense>
        </ErrorBoundary>
      </div>
    )
  }

  if (deletionPending) {
    return (
      <div className="app" data-screen="account-deletion">
        <PrefsApplier />
        <AccountDeletionPending />
      </div>
    )
  }
  if (!obDone) {
    return (
      <div className="app" data-screen="onboarding">
        <PrefsApplier />
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<ScreenFallback />}>
            <Routes>
              <Route path={ROUTES.ONBOARDING} element={<OnboardingScreen />} />
              <Route path="*" element={<Navigate to={ROUTES.ONBOARDING} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
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
      <ErrorBoundary resetKey={location.pathname}>
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
            <Route path={ROUTES.CONNECTIONS} element={<ConnectionsScreen />} />
            <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>

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
      <Toast />
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

/* Holds the app behind the field-encryption key. It derives from the user id
   in a few ms; until it's ready we show the splash so no screen reads
   ciphertext or writes plaintext. See docs/ENCRYPTION_PLAN.md. */
function CryptoGate({ children }) {
  const { isReady, error, retry } = useCrypto()
  if (error) {
    return (
      <div className="app" data-screen="crypto-error">
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <p style={{ maxWidth: 360, lineHeight: 1.7, margin: 0 }}>
            {error === 'secure-context'
              ? 'לא ניתן להפעיל הצפנה בחיבור הזה. ודא/י שאת/ה בכתובת מאובטחת (https) ונסה/י שוב.'
              : 'אירעה שגיאה בהפעלת ההצפנה. נסה/י שוב, ואם זה חוזר — רענן/י את הדף.'}
          </p>
          <button type="button" onClick={retry}>נסה/י שוב</button>
        </div>
      </div>
    )
  }
  if (!isReady) return <LoadingSplash />
  return children
}

/* Gates the app on legal consent. Writes a Google signup's stashed consent to
   user_metadata on the OAuth return, and forces the policy re-acceptance modal
   for users whose accepted version is stale (or who never accepted). */
function ConsentGate({ children }) {
  const { user } = useAuth()
  const [pendingDone, setPendingDone] = useState(() => !readPendingConsent())
  const tried = useRef(false)

  useEffect(() => {
    if (!user || tried.current) return
    const pending = readPendingConsent()
    if (!pending) { setPendingDone(true); return }
    tried.current = true
    ;(async () => {
      /* Durable legal record from the stash (incl. the marketing choice).
         Best-effort + SEPARATE so it never blocks the gating write below; if it
         fails (e.g. before migration 0029 exists) ConsentSync backfills it from
         the metadata written below. */
      try { await recordConsent(consentRowsFromMetadata(pending, 'google_oauth')) } catch { /* retried elsewhere */ }
      try {
        if (needsReacceptance(user)) {
          await supabase.auth.updateUser({ data: { ...pending } })
        }
        clearPendingConsent() // only on success — a failed write keeps the stash for a retry
      } catch {
        tried.current = false // keep the stash; retry on the next render/load
      } finally {
        setPendingDone(true)
      }
    })()
  }, [user])

  if (!pendingDone) return <LoadingSplash />
  if (user && needsReacceptance(user)) return <PolicyUpdateModal />
  return children
}

/* Public, login-free routes — served before the auth gate so logged-out
   users (and crawlers) reach them with no splash and no app shell. */
function PublicRoute() {
  const { pathname } = useLocation()
  if (pathname === ROUTES.PRIVACY) return <Navigate to={`${ROUTES.LEGAL}?tab=privacy`} replace />
  if (pathname === ROUTES.TERMS) return <Navigate to={`${ROUTES.LEGAL}?tab=terms`} replace />
  if (pathname === ROUTES.LEGAL) return <LegalPage />
  return null
}

const PUBLIC_PATHS = new Set([ROUTES.LEGAL, ROUTES.PRIVACY, ROUTES.TERMS])

function Root() {
  const { session, loading, recovery } = useAuth()
  const { pathname } = useLocation()
  if (PUBLIC_PATHS.has(pathname)) return <PublicRoute />
  if (loading || (!session && urlHasOAuthCallback())) {
    return <LoadingSplash />
  }
  /* Password-recovery completion: show the set-new-password screen instead of
     dropping the user into the app. Triggered EITHER by the PASSWORD_RECOVERY
     auth event (robust — fires wherever the recovery link lands, even if the
     redirect URL isn't allowlisted and it lands on '/') OR by the /update-password
     path (also a change-password entry for a signed-in user). Without a session
     the recovery link is needed, so bounce to login. */
  if (recovery || pathname === ROUTES.UPDATE_PASSWORD) {
    return session ? <UpdatePasswordScreen /> : <Navigate to={ROUTES.LOGIN} replace />
  }
  /* Logged-out visitor on the bare "/" lands on the public marketing page
     (the front door for Google + first-time visitors). Every other logged-out
     path still falls through to the AuthGate (login / signup / reset). */
  if (!session) {
    if (pathname === ROUTES.HOME) {
      return (
        <Suspense fallback={<LoadingSplash />}>
          <LandingScreen />
        </Suspense>
      )
    }
    return <AuthGate />
  }
  return (
    <ConsentGate>
      <CryptoProvider>
        <CryptoGate>
          <UserPreferencesProvider>
            <EncryptionMigrator />
            <ConsentSync />
            <AppShell />
          </UserPreferencesProvider>
        </CryptoGate>
      </CryptoProvider>
    </ConsentGate>
  )
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
