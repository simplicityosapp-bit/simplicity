import { Component } from 'react'
import { hasReloadGuard, markReloadGuard } from '../lib/lazyWithRetry'
import { Box, Txt, Btn } from './ui'

/* Last-line safety net. Without this, ANY error thrown while rendering a
   screen — a lazy chunk that slipped past lazyWithRetry, or a runtime bug in
   a screen — unmounts the whole React tree and leaves a blank page. Here we
   keep the brand on screen instead: a chunk error triggers one self-healing
   reload; anything else shows the pulsing-heart splash + a manual reload.

   `resetKey` (the current pathname) clears the error on navigation, so a
   one-off runtime error on screen A doesn't trap the user when they move to
   screen B. */

function isChunkError(error) {
  const msg = (error && (error.message || String(error))) || ''
  return /loading (css )?chunk|dynamically imported module|importing a module script failed|chunkloaderror/i.test(msg)
}

export default class ErrorBoundary extends Component {
  state = { error: null, lastKey: undefined }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    // Navigated to a different route → drop a stale error and try again.
    if (props.resetKey !== state.lastKey) {
      return { error: null, lastKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error) {
    // A chunk error reaching the boundary means the lazy retry already gave
    // up. Spend the shared one-reload budget to recover; if it's spent,
    // fall through to the branded retry UI below.
    if (isChunkError(error) && !hasReloadGuard()) {
      markReloadGuard()
      window.location.reload()
    }
  }

  render() {
    if (this.state.error) {
      return (
        <Box className="splash" role="alert">
          <Box className="splash-logo-wrap">
            <img className="splash-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
            <img className="splash-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
          </Box>
          <Txt as="p" className="splash-label">משהו השתבש. ננסה שוב?</Txt>
          <Btn type="button" className="splash-retry" onClick={() => window.location.reload()}>
            רענון
          </Btn>
        </Box>
      )
    }
    return this.props.children
  }
}
