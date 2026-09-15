/* The consent a user gave on the signup form, held across a Google sign-in.

   Web stashes it in localStorage because its OAuth leaves the page. The
   phone's Google sign-in (googleSignIn.native.js) happens in-process, so
   memory is enough: set before the sign-in, taken once by ConsentGate when
   the session arrives. On the browser build the page does leave, the value
   is lost, and the gate simply asks — nothing is ever assumed. */
let pending = null

export function setPendingConsent(consent) { pending = consent || null }
export function hasPendingConsent() { return !!pending }
export function clearPendingConsent() { pending = null }
export function takePendingConsent() {
  const value = pending
  pending = null
  return value
}
