import { useEffect, useRef } from 'react'

/* ════════════════════════════════════════════════════════════════
   useStepCTA — publish a step's primary-button state to the shell.
   ════════════════════════════════════════════════════════════════
   The native mirror of apps/web/src/screens/onboarding/useStepCTA.js.
   Kept per-app rather than shared: it is glue between a step and its own
   shell's footer, and the two footers are different components. The rule
   it enforces is the same on both, and worth restating here.

   Every step used to do this by hand:

     useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) },
               [ ...every value onNext happens to close over... ])

   which made each step responsible for listing, in a dep array, every
   value its own handler reads. Miss one and the shell keeps calling a
   STALE onNext — the handler still sees the state from whenever the
   effect last ran. On web that shipped as a step whose "we did not
   recognise anything in this file" guard read an old parse, so a user who
   fixed the column mapping got the same rejection forever, with no way
   forward.

   Here the handler lives in a ref refreshed on EVERY render, and what the
   shell receives is a thin wrapper that always calls the latest one. The
   effect then only tracks what the shell actually RENDERS — all
   primitives — and no step can go stale again.
   ════════════════════════════════════════════════════════════════ */
export function useStepCTA(setCTA, { onNext, canAdvance, busy = false, hint = null, nextLabel } = {}) {
  /* Refreshed after EVERY render (no dep array). Effects run before the
     user can press, so the handler the shell reaches is always current. */
  const onNextRef = useRef(onNext)
  useEffect(() => { onNextRef.current = onNext })

  useEffect(() => {
    setCTA({
      onNext: (e) => onNextRef.current?.(e),
      canAdvance: !!canAdvance,
      busy: !!busy,
      hint: hint || null,
      nextLabel,
    })
  }, [setCTA, canAdvance, busy, hint, nextLabel])

  /* Clear on unmount only (deps are stable), so a step leaving the screen
     cannot hand its button state to the next one. Kept separate from the
     effect above — as its cleanup it would also fire on every dep change,
     churning the shell for nothing. */
  useEffect(() => () => setCTA(null), [setCTA])
}
