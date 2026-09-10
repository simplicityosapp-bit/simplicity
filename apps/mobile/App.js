import { useState, useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { fontAssets } from './src/lib/fonts'
import i18n, { setupI18n, whenI18nReady } from './src/lib/i18n'
import { getThemeMode, subscribeTheme } from './src/theme/theme'
import { AuthProvider, useAuth } from './src/lib/auth'
import { DrawerProvider, useDrawer } from './src/lib/drawer'
import { FormOptionsProvider } from './src/lib/formOptions'
import { BottomBarProvider } from './src/lib/bottomBar'
import { PreferencesProvider, usePreferences } from './src/lib/preferences'
import { isDeletionPending } from './src/lib/account'
import { useOnboarding, shouldOnboard } from './src/lib/onboarding'
import OnboardingScreen from './src/screens/onboarding'
import LoginScreen from './src/screens/LoginScreen'
import PendingDeletionScreen from './src/screens/PendingDeletionScreen'
import AppNavigator, { navigationRef } from './src/navigation/AppNavigator'
import BottomBar from './src/components/BottomBar'
import UndoToast from './src/components/UndoToast'
import Drawer from './src/components/Drawer'
import ErrorBoundary from './src/components/ErrorBoundary'

// Init the shared i18n engine once, before the first render. Guarded so a setup
// throw can't take down app startup before anything renders (release builds have
// no redbox — an uncaught error here would be a silent instant-close).
try {
  setupI18n()
} catch (e) {
  // eslint-disable-next-line no-console
  if (typeof console !== 'undefined') console.warn('[i18n] setup failed', e?.message)
}

// The "עוד" drawer, rendered as an App-level overlay ABOVE the navigator so it
// floats over every screen (incl. pushed stack screens). Plain state, no Modal.
// The 4 primary tabs live nested under the "Main" route, so navigate to them via
// {screen} (a bare navigate('Home') from the root ref doesn't resolve a nested
// tab); everything else is a root stack route.
const TAB_ROUTES = ['Clients', 'Tasks', 'Home', 'Finance']
function DrawerHost() {
  const { open, setOpen } = useDrawer()
  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      onNavigate={(screen) => {
        if (!navigationRef.isReady()) return
        if (TAB_ROUTES.includes(screen)) navigationRef.navigate('Main', { screen })
        else navigationRef.navigate(screen)
      }}
      activeScreen={navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined}
    />
  )
}

function Root() {
  const { session, ready } = useAuth()
  // Screens call i18n.t() directly (not via a re-rendering hook), so an in-place
  // language switch wouldn't repaint them. Remount the nav subtree on
  // languageChanged so the WHOLE app repaints in the new language (a Hebrew↔LTR
  // direction flip still needs an app reload — RN I18nManager limit). Providers
  // stay mounted above the key, so prefs/session/drawer state survives.
  const [lang, setLang] = useState(i18n.language)
  useEffect(() => {
    const onChange = (l) => setLang(l || i18n.language)
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [])

  /* Same idea for the palette, and the same reason: screens read `colors`
     and their themed() sheets during render, not through a hook, so an
     in-place swap repaints nothing on its own. This subscription is what
     turns setThemeMode into something visible — and it is why changing
     theme no longer restarts the app. Held as state rather than a key so
     the switch does NOT remount: the user stays on the screen they were
     on, which was the whole point of doing this. */
  const [themeMode, setThemeModeState] = useState(getThemeMode)
  useEffect(() => subscribeTheme(setThemeModeState), [])

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97B5E" />
      </View>
    )
  }
  if (!session) return <LoginScreen key={lang} />
  return (
    <PreferencesProvider>
      <AuthedApp lang={lang} themeMode={themeMode} />
    </PreferencesProvider>
  )
}

// Inside PreferencesProvider so it can read prefs: while an account-deletion
// request is within its grace window, gate the whole app to the pending screen.
//
// `themeMode` is deliberately unread. Screens pick the palette up by
// re-rendering, which Root already causes — but passing it makes the
// dependency real, so wrapping this in React.memo later cannot silently stop
// theme switches from reaching the app. Deleting it would look like a tidy-up
// and would be a trap.
function AuthedApp({ lang, themeMode }) { // eslint-disable-line no-unused-vars
  const { prefs, status } = usePreferences()
  const ob = useOnboarding()
  if (isDeletionPending(prefs)) return <PendingDeletionScreen />

  // Onboarding guard. Sits BELOW the deletion gate — an account on its way
  // out has no business being introduced to the app — and above everything
  // else, because the flow creates the project, client and goal the rest of
  // the app then shows.
  //
  // While preferences are still loading we show the startup spinner rather
  // than guess: prefs arrive as {}, and reading that as "never onboarded"
  // would march an existing user back through the flow on every cold start.
  // shouldOnboard() also lets the user through when the read FAILED — we
  // know nothing then, and trapping someone who finished months ago is a
  // worse failure than the free-tier cap going unapplied for one session.
  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97B5E" />
      </View>
    )
  }
  if (shouldOnboard(ob)) return <OnboardingScreen key={lang} />

  return (
    <FormOptionsProvider>
      {/* Outside the language key so the bar's measured height survives a
          remount instead of falling back to the guess for a frame. */}
      <BottomBarProvider>
        <View style={styles.fill} key={lang}>
          <AppNavigator />
          <BottomBar />
          <DrawerHost />
          {/* Mounted once for the whole session, like web's. It renders nothing
              until an action registers itself, and sits above the tab bar so it
              never covers the nav. */}
          <UndoToast />
        </View>
      </BottomBarProvider>
    </FormOptionsProvider>
  )
}

/* Wait for the chosen language before the first paint. Only Hebrew ships with
   the engine, so on a non-Hebrew device i18next answers from the Hebrew
   fallback until the real bundle lands a tick later — the first screen would
   paint in Hebrew and then swap. That first screen is now the onboarding
   welcome.

   Raced against a short timeout for the same reason the font gate tolerates a
   rejected font: a bundle that never arrives should cost a moment, not the
   whole app. Falling through early just means the old behaviour — Hebrew,
   then a swap — rather than a screen that never comes. */
const I18N_WAIT_MS = 2000

function useI18nReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const done = () => { if (alive) setReady(true) }
    const timer = setTimeout(done, I18N_WAIT_MS)
    whenI18nReady().then(done, done).finally(() => clearTimeout(timer))
    return () => { alive = false; clearTimeout(timer) }
  }, [])
  return ready
}

export default function App() {
  // Don't brick the app on a font that a device rejects: if useFonts errors
  // (e.g. Android's stricter TTF parser refusing an asset), proceed with the
  // system fallback instead of hanging on the spinner forever.
  const [fontsLoaded, fontError] = useFonts(fontAssets)
  const langReady = useI18nReady()
  if (!langReady || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97B5E" />
      </View>
    )
  }
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.fill}>
        <SafeAreaProvider>
          <AuthProvider>
            <DrawerProvider>
              <Root />
              <StatusBar style="auto" />
            </DrawerProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbf7f2' },
})
