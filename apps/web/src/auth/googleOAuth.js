import { supabase } from '../lib/supabase'
import { translateAuthError } from './authErrors'
import { stashReturnPath } from '../lib/authReturn'

/* ════════════════════════════════════════════════════════════════
   START GOOGLE OAUTH — the redirect, separate from the button.
   ════════════════════════════════════════════════════════════════
   A caller may need to interrupt the click, ask something, and then continue
   where the click left off — the signup screen does exactly that with its
   consent dialog — and when it continues it must arrive at the same three
   steps in the same order (stash the return path, write the consent down,
   send the browser to Google) rather than at a re-implementation of them.

   Lives outside GoogleButton.jsx because a component file may only export
   components if react-refresh is to keep working — the same reason
   lib/modalLock.js sits outside Modal.jsx.

   Returns true once the redirect is under way, in which case nothing after it
   will run; false when it failed and the caller should let go of whatever
   busy state it was holding.
   ════════════════════════════════════════════════════════════════ */
export async function startGoogleOAuth({ from, onBeforeAuth, onError }) {
  stashReturnPath(from)
  if (onBeforeAuth) onBeforeAuth()
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      if (onError) onError(translateAuthError(error.message))
      return false
    }
    return true
  } catch (e) {
    if (onError) onError(translateAuthError(e?.message))
    return false
  }
}
