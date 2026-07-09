import { useState, useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { fontAssets } from './src/lib/fonts'
import i18n, { setupI18n } from './src/lib/i18n'
import { AuthProvider, useAuth } from './src/lib/auth'
import { DrawerProvider, useDrawer } from './src/lib/drawer'
import { FormOptionsProvider } from './src/lib/formOptions'
import { PreferencesProvider, usePreferences } from './src/lib/preferences'
import { isDeletionPending } from './src/lib/account'
import LoginScreen from './src/screens/LoginScreen'
import PendingDeletionScreen from './src/screens/PendingDeletionScreen'
import AppNavigator, { navigationRef } from './src/navigation/AppNavigator'
import BottomBar from './src/components/BottomBar'
import Drawer from './src/components/Drawer'

// Init the shared i18n engine once, before the first render.
setupI18n()

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
      <AuthedApp lang={lang} />
    </PreferencesProvider>
  )
}

// Inside PreferencesProvider so it can read prefs: while an account-deletion
// request is within its grace window, gate the whole app to the pending screen.
function AuthedApp({ lang }) {
  const { prefs } = usePreferences()
  if (isDeletionPending(prefs)) return <PendingDeletionScreen />
  return (
    <FormOptionsProvider>
      <View style={styles.fill} key={lang}>
        <AppNavigator />
        <BottomBar />
        <DrawerHost />
      </View>
    </FormOptionsProvider>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets)
  if (!fontsLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97B5E" />
      </View>
    )
  }
  return (
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
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbf7f2' },
})
