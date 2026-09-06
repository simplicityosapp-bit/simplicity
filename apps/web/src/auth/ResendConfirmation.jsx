import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { translateAuthError } from './authErrors'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* Supabase rate-limits confirmation mail per address — one a minute by
   default. Counting the wait down out loud is the whole point of the control:
   a button that silently refuses looks like a button that does not work, and
   the person presses it again, and again, and then writes to support. */
const COOLDOWN_SECONDS = 60

/* "Send that confirmation email again." Shown in the two places a person gets
   stuck waiting for one: straight after signing up, and on the login screen
   when the answer is "confirm your email first" — which until now was a wall
   with no door in it, since nothing in the app could send another.

   Deliberately says nothing about whether the address is registered: Supabase
   answers this call the same way either way (email-enumeration protection),
   and so do we. */
export default function ResendConfirmation({ email, className = '' }) {
  const { t } = useT('auth')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(0)
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  const startCooldown = () => {
    setLeft(COOLDOWN_SECONDS)
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(timer.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  const send = async () => {
    if (busy || left > 0 || !email) return
    setBusy(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email })
      if (err) {
        setError(translateAuthError(err.message))
        /* A rate-limit answer still means the clock is running, so hold the
           button for the same minute rather than inviting another refusal. */
        startCooldown()
        return
      }
      setSent(true)
      startCooldown()
    } catch (e) {
      setError(translateAuthError(e?.message))
    } finally {
      setBusy(false)
    }
  }

  const label = busy
    ? t('resend.sending')
    : left > 0
      ? t('resend.wait', { seconds: left })
      : t('resend.button')

  return (
    <Box className={`auth-resend ${className}`.trim()}>
      <Btn
        type="button"
        className="auth-resend-btn"
        onClick={send}
        disabled={busy || left > 0 || !email}
      >
        <RefreshCw size={15} strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
      </Btn>
      {/* One line, whichever way it went. aria-live so the answer is heard and
          not only seen — the button's own label goes to a countdown, which on
          its own reads like nothing happened. */}
      {(sent || error) && (
        <Txt as="p" className={error ? 'auth-hint auth-hint-bad' : 'auth-hint'} aria-live="polite">
          {error || t('resend.sent')}
        </Txt>
      )}
    </Box>
  )
}
