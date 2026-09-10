import { useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'

/* Android's back gesture/button, for overlays that are NOT a <Modal>.
   ────────────────────────────────────────────────────────────────
   A <Modal> gets back for free: Android routes the press to the dialog and
   RN turns it into `onRequestClose`. Everything this app draws as a plain
   App-level overlay instead — the "עוד" drawer above all — got nothing, so
   back went straight past it to the navigator underneath: the drawer stayed
   on screen while the screen behind it popped, and on Home it closed the app
   with the menu still open.

   `enabled` is the open flag, so the subscription exists only while the
   overlay is up. Handlers fire last-registered-first, and the navigator
   registers its own at mount — this one subscribes later (when the overlay
   opens), so it wins, and returning true stops the press there.

   The callback is held in a ref so an inline arrow at the call site doesn't
   re-subscribe on every render, which would keep moving this handler to the
   front of a queue it is already at the front of.

   Inert where there is no hardware back — iOS has none, and react-native-web
   hands back a stub subscription. Neither needs a guard. */
export function useBackHandler(enabled, onBack) {
  const cb = useRef(onBack)
  useEffect(() => { cb.current = onBack }, [onBack])

  useEffect(() => {
    if (!enabled) return undefined
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cb.current?.()
      return true
    })
    return () => { sub?.remove?.() }
  }, [enabled])
}

export default useBackHandler
