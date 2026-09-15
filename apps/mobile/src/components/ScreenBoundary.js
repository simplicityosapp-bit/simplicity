import { Component } from 'react'
import { View } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { Text } from './Text'
import { Pressable } from './Pressable'
import i18n from '../lib/i18n'
import { themed } from '../theme/themed'

/* ════════════════════════════════════════════════════════════════
   SCREEN BOUNDARY — one screen's crash stays that screen's.
   ════════════════════════════════════════════════════════════════
   Until now the only boundary sat around the whole app, so a render bug
   in, say, Reports replaced EVERYTHING with a dark page of stack trace and
   a restart button. Web catches per route and keeps the rest of the app
   usable; this does the same per navigator screen.

   What the user sees is a sentence, "try again" (remounts the screen) and
   "home". No stack: that is for a developer, and __DEV__ still gets the
   message. The app-level ErrorBoundary stays as the last resort — it keeps
   its diagnostics, because reaching it means even this failed.

   Strings go through i18n with a Hebrew fallback, inside a try: the shell
   rendered, so the engine is normally fine, but a boundary must not be the
   thing that throws.
   ════════════════════════════════════════════════════════════════ */

const tr = (k, fb) => {
  try { return i18n.t(`common:screenError.${k}`, { defaultValue: fb }) } catch { return fb }
}

export default class ScreenBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  retry = () => { this.setState({ error: null }) }

  home = () => {
    this.setState({ error: null })
    try { this.props.navigation?.navigate('Main', { screen: 'Home' }) } catch { /* nothing to go back to */ }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <AlertTriangle size={34} strokeWidth={1.5} color={styles.icon.color} />
        <Text style={styles.title}>{tr('title', 'משהו השתבש במסך הזה')}</Text>
        <Text style={styles.body}>{tr('body', 'שאר האפליקציה עובדת. אפשר לנסות שוב או לחזור לבית.')}</Text>
        {typeof __DEV__ !== 'undefined' && __DEV__ ? <Text style={styles.dev}>{String(error?.message || error)}</Text> : null}
        <View style={styles.actions}>
          <Pressable style={styles.primary} onPress={this.retry} accessibilityRole="button">
            <Text style={styles.primaryText}>{tr('retry', 'לנסות שוב')}</Text>
          </Pressable>
          {this.props.navigation ? (
            <Pressable style={styles.secondary} onPress={this.home} accessibilityRole="button">
              <Text style={styles.secondaryText}>{tr('home', 'לבית')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }
}

/* Wrap a navigator screen. Built once per screen at module level so the
   component identity is stable across renders. */
export function withScreenBoundary(Screen) {
  function Guarded(props) {
    return (
      <ScreenBoundary navigation={props.navigation}>
        <Screen {...props} />
      </ScreenBoundary>
    )
  }
  Guarded.displayName = `ScreenBoundary(${Screen.displayName || Screen.name || 'Screen'})`
  return Guarded
}

const styles = themed((c) => ({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10, backgroundColor: c.bg },
  icon: { color: c.amberWarn },
  title: { fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' },
  body: { fontSize: 14, color: c.textSub, textAlign: 'center', lineHeight: 20 },
  dev: { fontSize: 11, color: c.textFaint, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primary: { backgroundColor: c.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  primaryText: { color: c.onBrand, fontSize: 15, fontWeight: '600' },
  secondary: { borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingVertical: 12, paddingHorizontal: 22 },
  secondaryText: { color: c.text, fontSize: 15, fontWeight: '500' },
}))
