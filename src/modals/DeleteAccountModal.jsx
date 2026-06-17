import { useState } from 'react'
import { Trans } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { ACCOUNT_DELETION_GRACE_DAYS } from '../lib/api/account'
import { useT } from '../i18n/useT'

/* ════════════════════════════════════════════════════════════════
   DELETE ACCOUNT — permanent removal with a 30-day grace window.
   ════════════════════════════════════════════════════════════════
   Distinct from ResetAccountModal (which only wipes data). Here we
   schedule the whole account for deletion: a DOUBLE confirmation —
     step 1 — plain-language warning + the grace-period promise.
     step 2 — the user must TYPE the confirmation phrase.
   The phrase differs from the reset modal's confirmation word, so
   muscle-memory from the reset flow can't trigger an account delete;
   both are sourced from the active locale so the typed match stays
   consistent with the on-screen instruction.
   onConfirm() records the request and may throw; we surface the error
   in plain language and keep the modal open so nothing is lost silently.
   ════════════════════════════════════════════════════════════════ */

export default function DeleteAccountModal({ open, onClose, onConfirm }) {
  const { t } = useT('modalsSystem')
  const tryAgain = t('common.tryAgain')
  const CONFIRM_PHRASE = t('deleteAccount.confirmPhrase')
  const [step, setStep] = useState(1)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const close = () => {
    if (busy) return
    setStep(1); setTyped(''); setErr('')
    onClose()
  }

  const run = async () => {
    if (busy || typed.trim() !== CONFIRM_PHRASE) return
    setBusy(true); setErr('')
    try {
      await onConfirm()
      setStep(1); setTyped('')
      onClose()
    } catch (e) {
      setErr(e?.message || t('deleteAccount.genericError', { tryAgain }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('deleteAccount.title')}>
      <div className="m-confirm-msg" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <AlertTriangle size={20} strokeWidth={1.5} style={{ color: 'var(--clay)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        {step === 1 ? (
          <span>
            <Trans t={t} i18nKey="deleteAccount.step1" components={[<strong key="0" />, <strong key="1" />]} />
            <br />
            <Trans t={t} i18nKey="deleteAccount.step1b" values={{ days: ACCOUNT_DELETION_GRACE_DAYS }} components={[<strong key="0" />, <strong key="1" />]} />
          </span>
        ) : (
          <span>
            <Trans t={t} i18nKey="deleteAccount.step2" values={{ type: t('deleteAccount.typeVerb'), phrase: CONFIRM_PHRASE, days: ACCOUNT_DELETION_GRACE_DAYS }} components={[<strong key="0" />]} />
          </span>
        )}
      </div>

      {step === 2 && (
        <div style={{ marginTop: 4 }}>
          <label className="m-label" htmlFor="delete-account-input">{t('deleteAccount.inputLabel')} {CONFIRM_PHRASE}</label>
          <input
            id="delete-account-input"
            className={`m-input${typed && typed.trim() !== CONFIRM_PHRASE ? ' err' : ''}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            disabled={busy}
          />
        </div>
      )}

      {err && <p className="m-confirm-msg" style={{ color: 'var(--clay)', fontWeight: 600 }}>{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close} disabled={busy}>{t('common.cancel')}</button>
        {step === 1 ? (
          <button type="button" className="m-btn-save danger" onClick={() => setStep(2)}>
            {t('deleteAccount.continue')}
          </button>
        ) : (
          <button
            type="button"
            className="m-btn-save danger"
            onClick={run}
            disabled={busy || typed.trim() !== CONFIRM_PHRASE}
          >
            {busy ? t('deleteAccount.deleting') : t('deleteAccount.confirmBtn')}
          </button>
        )}
      </div>
    </Modal>
  )
}
