import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { setupI18n } from './src/lib/i18n'
import { AuthProvider, useAuth } from './src/lib/auth'
import LoginScreen from './src/screens/LoginScreen'
import AppNavigator from './src/navigation/AppNavigator'

// Init the shared i18n engine once, before the first render.
setupI18n()

function Root() {
  const { session, ready } = useAuth()
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97B5E" />
      </View>
    )
  }
  return session ? <AppNavigator /> : <LoginScreen />
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbf7f2' },
})
