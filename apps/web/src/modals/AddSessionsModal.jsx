import { useState } from 'react'
import Modal from './Modal'
import { isr } from '@simplicity/core'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   AddSessionsModal — add meetings to a client's quota, in one step.

   Selling another block of meetings used to mean: open the client, press
   "ערוך", find the billing section, unfold it, edit "נקבעו", save. Five
   moves for one number, four of them navigation — on the single action a
   coach repeats every time a client renews.

   The sheet asks for the one number it needs and states what it does to
   the money BEFORE saving, because this raises what the client owes. It
   never records a payment: money coming in is its own action ("קיבלתי
   תשלום"), and rolling the two together would make a renewal that has not
   been paid for look settled.
   ════════════════════════════════════════════════════════════════ */

export default function AddSessionsModal({ open, onClose, client, onSave }) {
  const { t } = useT('clients')
  const [count, setCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const n = Math.trunc(Number(count) || 0)
  const current = Number(client?.sessions) || 0
  const price = Number(client?.price_per_session) || 0
  const perSession = client?.billing_mode === 'per_session'
  /* A manual "סה״כ לתשלום" wins over sessions × price in BOTH modes, so
     adding meetings to a client who has one moves the count and nothing
     else. Better to say so up front than to let the balance sit still and
     look broken. */
  const overridden = client?.total_override != null && client?.total_override !== ''

  const close = () => { setCount(''); setBusy(false); setErr(''); onClose() }

  const submit = async () => {
    if (busy) return
    if (!(n > 0)) { setErr(t('addSessions.countRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(current + n)
      close()
    } catch {
      setBusy(false)
      setErr(t('addSessions.saveFailed'))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('addSessions.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addSessions.howMany')}</Box>
        <Input
          type="number"
          min="1"
          className="m-input"
          value={count}
          onChange={(e) => { setCount(e.target.value); if (err) setErr('') }}
          placeholder="0"
          aria-label={t('addSessions.howMany')}
        />
      </Box>

      {/* What this is about to do, in the client's own numbers. */}
      {n > 0 && (
        <Box className="adj-preview">
          <Txt as="p" className="adj-preview-line">
            {t('addSessions.previewCount', { from: current, to: current + n })}
          </Txt>
          <Txt as="p" className="adj-preview-line">
            {perSession
              ? t('addSessions.previewPerSession')
              : overridden
                ? t('addSessions.previewOverridden')
                : t('addSessions.previewMoney', { n, price: isr(price), amount: isr(n * price) })}
          </Txt>
        </Box>
      )}

      <Txt as="p" className="m-hint">{t('addSessions.paymentSeparate')}</Txt>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close} disabled={busy}>{t('inline.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? t('inline.saving') : t('inline.save')}
        </Btn>
      </Box>
    </Modal>
  )
}
