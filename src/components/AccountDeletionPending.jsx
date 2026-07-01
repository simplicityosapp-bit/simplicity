import { useState } from 'react'
import { Trans } from 'react-i18next'
import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useAuth } from '../auth/AuthContext'
import { useAddress } from '../hooks/useAddress'
import { useT } from '../i18n/useT'
import './AccountDeletionPending.css'
import { Box, Txt, Btn } from './ui'

/* ════════════════════════════════════════════════════════════════
   ACCOUNT DELETION PENDING — the locked grace-period gate.
   ════════════════════════════════════════════════════════════════
   Shown by AppShell whenever prefs.accountDeletion.scheduled_for is
   set (see App.jsx). The whole app is locked behind this screen until
   the user either CANCELS (clears the request → back to normal use) or
   the grace window passes and a scheduled edge function deletes the
   auth user for real. Data is NOT deleted during the grace window, so
   canceling fully restores the account — we just clear the flag.
   ════════════════════════════════════════════════════════════════ */

/* Whole days left until the scheduled deletion (never negative). */
function daysLeft(scheduledFor) {
  const ms = new Date(scheduledFor).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

export default function AccountDeletionPending() {
  const { tryAgain } = useAddress()
  const { t } = useT('components')
  const { prefs, update } = useUserPreferences()
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const del = prefs?.accountDeletion || {}
  const left = del.scheduled_for ? daysLeft(del.scheduled_for) : 0
  const targetDate = del.scheduled_for
    ? new Date(del.scheduled_for).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const cancel = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      await update({ accountDeletion: null })
      /* On success the AppShell gate re-renders and the app returns to
         normal — nothing else to do here. */
    } catch (e) {
      setErr(e?.message || t('deletion.cancelFailed', { tryAgain }))
      setBusy(false)
    }
  }

  return (
    <Box className="adp-wrap" dir="rtl">
      <Box className="adp-card anim">
        <Txt className="adp-icon" aria-hidden="true">
          <AlertTriangle size={30} strokeWidth={1.7} />
        </Txt>
        <Txt as="h1" className="adp-title">{t('deletion.title')}</Txt>

        <Box className="adp-countdown">
          <Txt className="adp-count-num mono">{left}</Txt>
          <Txt className="adp-count-unit">{left === 1 ? t('deletion.dayUnit') : t('deletion.daysUnit')}</Txt>
        </Box>

        <Txt as="p" className="adp-body">
          {t('deletion.bodyLead', { regret: t('deletion.regret') })}
          {targetDate && (
            <>
              {' '}
              <Trans t={t} i18nKey="deletion.bodyDeadline" values={{ date: targetDate }} components={[<strong key="d" />]} />
            </>
          )}
        </Txt>

        {err && <Txt as="p" className="adp-err">{err}</Txt>}

        <Btn type="button" className="adp-btn-cancel" onClick={cancel} disabled={busy}>
          <RotateCcw size={17} strokeWidth={1.8} aria-hidden="true" />
          {busy ? t('deletion.canceling') : t('deletion.cancel')}
        </Btn>
        <Btn type="button" className="adp-btn-logout" onClick={() => signOut()} disabled={busy}>
          <LogOut size={16} strokeWidth={1.7} aria-hidden="true" />
          {t('deletion.logout')}
        </Btn>
      </Box>
    </Box>
  )
}
