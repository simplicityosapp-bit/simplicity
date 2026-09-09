import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { translateAuthError } from './authErrors'
import { stashReturnPath } from '../lib/authReturn'

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
   Supabase (Auth → Providers). `onBeforeAuth` runs just before the OAuth
   redirect (used to stash consent so it can be written to user_metadata on
   return). `guard` is asked first and can refuse the click: it returns false
   to stop before anything is stashed or sent, having said why in the caller's
   own words. That is what a caller wants instead of `disabled` whenever the
   reason is something the visitor can fix — a greyed-out button states a
   verdict and withholds the reason. `disabled` remains for the cases where
   there is nothing to explain.

   `label` comes from the caller's own t(). It used to carry a hardcoded
   Hebrew default, and the login screen took that default — so on a screen
   with a language switcher at the foot of it, the one control that never
   translated was the one a visitor who does not read Hebrew would reach for
   first. auth:googleLogin had been sitting there in all four locales,
   unread. */
export default function GoogleButton({ onError, label, disabled = false, guard, onBeforeAuth }) {
  const [busy, setBusy] = useState(false)
  /* AuthGate leaves the page the visitor was headed for on the location, and
     the signed-in catch-all reads it back. That survives a password sign-in,
     which never navigates — but not this button, which leaves the page and
     returns at the origin with the router state gone. This is the last moment
     the path exists, so it goes somewhere that survives the round trip. Here
     rather than in the two screens: this button is what loses it, so this
     button is what saves it, and neither caller has to remember. */
  const { state } = useLocation()

  const click = async () => {
    if (disabled || busy) return
    /* Before the return path is stashed and before consent is written down:
       a refused click must leave no trace of having been half-taken. */
    if (guard && !guard()) return
    stashReturnPath(state?.from)
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
