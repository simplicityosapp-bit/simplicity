import { Component } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'

// Last-resort boundary: a render-phase crash otherwise white-screens a release
// build (no redbox off-Metro). Here we paint the actual error + stack on screen
// so a device failure is diagnosable from a screenshot, not a guess.
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
      </ScrollView>
    )
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#1a1512' },
  content: { padding: 20, paddingTop: 60, gap: 12 },
  h: { color: '#ff8a65', fontSize: 20, fontWeight: '700' },
  msg: { color: '#fff', fontSize: 15 },
  stack: { color: '#c9b8a8', fontSize: 11, fontFamily: 'monospace' },
})
