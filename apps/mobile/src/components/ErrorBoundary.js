import { Component } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { Pressable } from './Pressable'
import { reloadApp } from '../lib/appReload'
import { themed } from '../theme/themed'

// Last-resort boundary: a render-phase crash otherwise white-screens a release
// build (no redbox off-Metro). Here we paint the actual error + stack on screen
// so a device failure is diagnosable from a screenshot, not a guess.
//
// It also has to offer a way out. The screen used to be the stack and nothing
// else: whoever hit it could read what broke and then had to kill the app
// themselves, which on a phone is a thing many people do not know how to do —
// so a single render crash read as "the app is gone". reloadApp() is the same
// call the account wipe uses and it works in a release build.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    return (
      <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
        <Text style={styles.h}>App error</Text>
        <Text style={styles.msg}>{String(error?.message || error)}</Text>
        {error?.stack ? <Text style={styles.stack}>{String(error.stack).slice(0, 1500)}</Text> : null}
        {info?.componentStack ? <Text style={styles.stack}>{String(info.componentStack).slice(0, 1000)}</Text> : null}
        <Pressable style={styles.retry} onPress={() => reloadApp()}>
          {/* Untranslated on purpose, like the heading above it. This screen
              renders AFTER something in the graph has already thrown, and i18n
              is one of the things that can have been what threw — a last-resort
              boundary that reaches for the engine can crash inside itself, and
              then there is nothing left to show anyone. */}
          <Text style={styles.retryText}>Restart</Text>
        </Pressable>
      </ScrollView>
    )
  }
}

const styles = themed((c, t) => ({
  wrap: { flex: 1, backgroundColor: '#1a1512' },
  content: { padding: 20, paddingTop: 60, gap: 12 },
  h: { color: '#ff8a65', fontSize: 20, fontWeight: '700' },
  msg: { color: '#fff', fontSize: 15 },
  stack: { color: '#c9b8a8', fontSize: 11, fontFamily: 'monospace' },
  retry: { marginTop: 20, alignSelf: 'flex-start', backgroundColor: '#C97B5E', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
}))
