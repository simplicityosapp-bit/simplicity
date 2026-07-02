import { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { setupI18n } from './src/lib/i18n'
import { supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import HomePlaceholder from './src/screens/HomePlaceholder'

// Init the shared i18n engine once, before the first render.
setupI18n()

export default function App() {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState(null)

  useEffect(() => {
    // Restore any persisted session, then react to sign-in / sign-out.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97B5E" />
        <StatusBar style="auto" />
      </View>
    )
  }

  return (
    <>
      {session ? <HomePlaceholder session={session} /> : <LoginScreen />}
      <StatusBar style="auto" />
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbf7f2' },
})
