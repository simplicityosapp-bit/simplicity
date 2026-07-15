import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { translateAuthError } from './authErrors'

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18A13.6 13.6 0 0 1 10.97 24c0-1.45.25-2.86.72-4.18v-5.7H4.34A22 22 0 0 0 2 24c0 3.55.85 6.9 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  )
}

/* Shared "Sign in with Google" button. Needs the Google provider enabled in
   Supabase (Auth → Providers). `disabled` gates the button (signup consent);
   `onBeforeAuth` runs just before the OAuth redirect (used to stash consent
   so it can be written to user_metadata on return). */
export default function GoogleButton({ onError, label = 'התחברות עם Google', disabled = false, onBeforeAuth }) {
  const [busy, setBusy] = useState(false)
  const click = async () => {
    if (disabled || busy) return
    if (onBeforeAuth) onBeforeAuth()
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      /* Success → a full-page redirect follows; keep `busy` latched so the
         button can't fire a second signInWithOAuth (+ re-run onBeforeAuth)
         during the slow window before the browser navigates away. */
      if (error) {
        setBusy(false)
        if (onError) onError(translateAuthError(error.message))
      }
    } catch (e) {
      setBusy(false)
      if (onError) onError(translateAuthError(e?.message))
    }
  }
  return (
    <button type="button" className="auth-btn-google" onClick={click} disabled={disabled || busy}>
      <GoogleG />
      <span>{label}</span>
    </button>
  )
}
