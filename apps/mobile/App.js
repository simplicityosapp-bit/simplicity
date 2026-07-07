import { useState, useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import i18n, { setupI18n } from './src/lib/i18n'
import { AuthProvider, useAuth } from './src/lib/auth'
import { DrawerProvider, useDrawer } from './src/lib/drawer'
import { FormOptionsProvider } from './src/lib/formOptions'
import { PreferencesProvider } from './src/lib/preferences'
import LoginScreen from './src/screens/LoginScreen'
import AppNavigator, { navigationRef } from './src/navigation/AppNavigator'
import Drawer from './src/components/Drawer'

// Init the shared i18n engine once, before the first render.
setupI18n()

// The "עוד" drawer, rendered as an App-level overlay ABOVE the navigator so it
// floats over every screen (incl. pushed stack screens). Plain state, no Modal.
function DrawerHost() {
  const { open, setOpen } = useDrawer()
  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      onNavigate={(screen) => navigationRef.isReady() && navigationRef.navigate(screen)}
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
      <FormOptionsProvider>
        <View style={styles.fill} key={lang}>
          <AppNavigator />
          <DrawerHost />
        </View>
      </FormOptionsProvider>
    </PreferencesProvider>
  )
}

export default function App() {
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
