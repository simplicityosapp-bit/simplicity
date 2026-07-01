import { useState } from 'react'
import { Trans } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   RESET ACCOUNT — irreversible "delete everything" with a DOUBLE
   confirmation:
     step 1 — a plain-language warning of exactly what will be erased.
     step 2 — the user must TYPE the confirmation word, so it can't be
              triggered by a stray click.
   onConfirm() does the actual wipe and may throw; we surface the error
   in plain language and keep the modal open so nothing is lost silently.
   The confirmation word is sourced from the active locale so the typed
   match stays consistent with the on-screen instruction.
   ════════════════════════════════════════════════════════════════ */

export default function ResetAccountModal({ open, onClose, onConfirm }) {
  const { t } = useT('modalsSystem')
  const tryAgain = t('common.tryAgain')
  const CONFIRM_WORD = t('resetAccount.confirmWord')
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
    if (busy || typed.trim() !== CONFIRM_WORD) return
    setBusy(true); setErr('')
    try {
      await onConfirm()
      setStep(1); setTyped('')
      onClose()
    } catch (e) {
      setErr(e?.message || t('resetAccount.genericError', { tryAgain }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('resetAccount.title')}>
      <Box className="m-confirm-msg" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <AlertTriangle size={20} strokeWidth={1.5} style={{ color: 'var(--clay)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        {step === 1 ? (
          <Txt>
            <Trans t={t} i18nKey="resetAccount.step1" components={[<strong key="0" />]} />
            <br />
            <Trans t={t} i18nKey="resetAccount.step1b" values={{ enableTo: t('resetAccount.step1bEnable') }} components={[<strong key="0" />]} />
          </Txt>
        ) : (
          <Txt>
            <Trans t={t} i18nKey="resetAccount.step2" values={{ type: t('resetAccount.typeVerb'), word: CONFIRM_WORD }} components={[<strong key="0" />]} />
          </Txt>
        )}
      </Box>

      {step === 2 && (
        <Box style={{ marginTop: 4 }}>
          <Box as="label" className="m-label" htmlFor="reset-confirm-input">{t('resetAccount.inputLabel')} {CONFIRM_WORD}</Box>
          <Input
            id="reset-confirm-input"
            className={`m-input${typed && typed.trim() !== CONFIRM_WORD ? ' err' : ''}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            disabled={busy}
          />
        </Box>
      )}

      {err && <Txt as="p" className="m-confirm-msg" style={{ color: 'var(--clay)', fontWeight: 600 }}>{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close} disabled={busy}>{t('common.cancel')}</Btn>
        {step === 1 ? (
          <Btn type="button" className="m-btn-save danger" onClick={() => setStep(2)}>
            {t('resetAccount.continue')}
          </Btn>
        ) : (
          <Btn
            type="button"
            className="m-btn-save danger"
            onClick={run}
            disabled={busy || typed.trim() !== CONFIRM_WORD}
          >
            {busy ? t('resetAccount.deleting') : t('resetAccount.confirmBtn')}
          </Btn>
        )}
      </Box>
    </Modal>
  )
}
