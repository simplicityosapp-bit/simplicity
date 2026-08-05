import { useState } from 'react'
import { isr, fmtMonthYear } from '@simplicity/core'
import DateField from '../components/DateField'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

const pad = (n) => String(n).padStart(2, '0')
/* LOCAL, never toISOString — on an Israeli evening the UTC form rolls to
   tomorrow, which would pre-fill a future date the validator then rejects. */
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/* ════════════════════════════════════════════════════════════════
   RecordInvestmentModal — which date does this investment land on?
   ════════════════════════════════════════════════════════════════
   Shown only when the finance screen is parked on a month that is NOT the
   one in progress. On the current month "השקעתי" stays a single tap that
   stamps today, because that is what it means almost every time; asking
   there would be a dialog whose answer is always the default.

   ONE date, deliberately. Recording an investment writes two rows — an
   expense in the ledger and the investments record — and useInvestments
   resolves their date once, together, precisely so they can never straddle
   a month boundary and disagree about which bucket the money is in.
   Offering "when it went out" apart from "which month to book it in" would
   hand the user a way to split the very pair that invariant protects.

   Defaults to today even when the screen is on June: the money moved when
   it moved. The shortcut to the end of the month on screen is there for
   the other reading, one tap away.
   ════════════════════════════════════════════════════════════════ */
export default function RecordInvestmentModal({ open, onClose, onConfirm, amount, month }) {
  const { t } = useT('finance')
  const today = isoOf(new Date())
  const [date, setDate] = useState(today)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  /* Last day of the month on screen. Day 0 of the next month is the last of
     this one, and it rolls the year on its own. */
  const monthEnd = month ? isoOf(new Date(month.getFullYear(), month.getMonth() + 1, 0)) : null
  /* Offered only when it is not in the future — a future month's last day
     would be a shortcut straight into the error below. */
  const canUseMonthEnd = monthEnd && monthEnd <= today && monthEnd !== date

  const submit = async () => {
    if (busy) return
    if (!date) { setErr(t('investment.recordNeedDate')); return }
    /* An investment dated forward is money that has not moved yet. It would
       also sit in a month the finance screen has no rows for, so the widget
       would show a total the ledger can't account for. */
    if (date > today) { setErr(t('investment.recordNoFuture')); return }
    setBusy(true)
    setErr('')
    try {
      await onConfirm(date)
      onClose()
    } catch {
      /* useInvestments raises its own toast on failure. Just let the sheet
         stay open so the date isn't lost. */
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('investment.recordTitle')}>
      <Txt as="p" className="m-sub">{t('investment.recordAmount', { amount: isr(amount) })}</Txt>

      <Box className="m-field">
        <Box className="m-label-row">
          <Box as="label" className="m-label">{t('investment.recordDateLabel')}</Box>
          {canUseMonthEnd && (
            <Btn type="button" className="m-clear-link" onClick={() => { setDate(monthEnd); setErr('') }}>
              {t('investment.recordUseMonthEnd', { month: fmtMonthYear(month) })}
            </Btn>
          )}
        </Box>
        <DateField value={date} onChange={(e) => { setDate(e.target.value); setErr('') }} />
        <Txt as="p" className="m-hint">{t('investment.recordDateHint')}</Txt>
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>
          {t('investment.recordCancel')}
        </Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? t('investment.recordSaving') : t('investment.recordConfirm')}
        </Btn>
      </Box>
    </Modal>
  )
}
