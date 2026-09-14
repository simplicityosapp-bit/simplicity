import { useState } from 'react'
import { fmtShortDate } from '@simplicity/core'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* Resuming a recurring rule that missed dates while it was paused. Only the
   user knows whether those dates happened, so they choose: create them as
   pending (each is then approved or skipped as usual), or mark them all
   skipped. The order of the writes, and why, lives in core
   resumeRecurringTemplate. On failure the dialog stays open and says so —
   the rule is still paused, and trying again is safe. */
export default function ResumeRecurringModal({ open, onClose, missed = [], onChoose }) {
  const { t } = useT('finance')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const close = () => {
    if (busy) return
    setFailed(false)
    onClose()
  }
  const choose = async (markSkipped) => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await onChoose(markSkipped)
      setBusy(false)
      onClose()
    } catch {
      setBusy(false)
      setFailed(true)
    }
  }
  const count = missed.length
  const from = count ? fmtShortDate(missed[0].date) : ''
  const to = count ? fmtShortDate(missed[count - 1].date) : ''

  return (
    <Modal open={open} onClose={close} title={t('recurring.resumeMissed.title')}>
      <Txt as="p" className="m-confirm-msg">{t('recurring.resumeMissed.message', { count, from, to })}</Txt>
      {failed && <Txt as="p" className="m-error" role="alert">{t('recurring.resumeMissed.failed')}</Txt>}
      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close} disabled={busy}>{t('recurring.resumeMissed.cancel')}</Btn>
        <Btn type="button" className="m-btn-cancel" onClick={() => choose(true)} disabled={busy}>{t('recurring.resumeMissed.markSkipped')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={() => choose(false)} disabled={busy}>
          {busy ? '…' : t('recurring.resumeMissed.createPending')}
        </Btn>
      </Box>
    </Modal>
  )
}
