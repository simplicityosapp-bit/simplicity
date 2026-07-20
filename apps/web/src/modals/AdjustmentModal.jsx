import { useState } from 'react'
import Modal from './Modal'
import { isr } from '@simplicity/core'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   AdjustmentModal — record a manual adjustment BY REASON.

   Until now the user had to know that a discount is entered by editing
   «יתרה» while cash-in-hand is entered by editing «שולם». That mapping
   is internal knowledge with nothing on screen to hint at it. Here they
   pick what actually happened, in their own words, and the reason
   decides which number moves:

     הנחה                     → balance  (lowers what's owed; «שולם» stays put)
     תיקון נתוני ייבוא        → paid     (corrects a wrong imported figure)
     תשלום שהתקבל ולא נרשם   → paid     (money in hand, deliberately not booked)

   The live line underneath states the outcome before saving. For the one
   reason where the money genuinely exists, the sheet also offers to book it
   as real income INSTEAD — asked in context, rather than as a popup after
   typing into a number field.

   Amounts are SIGNED. A correction downward is the natural gesture for a
   figure that came in too high, and the deltas handed over by the edit modal
   carry their own sign.
   ════════════════════════════════════════════════════════════════ */

const REASONS = [
  { k: 'discount',           kind: 'balance', labelKey: 'adjust.reasonDiscount' },
  { k: 'import_fix',         kind: 'paid',    labelKey: 'adjust.reasonImportFix' },
  { k: 'unrecorded_payment', kind: 'paid',    labelKey: 'adjust.reasonUnrecorded' },
]

/* `presetAmount` / `presetReason` seed the form when the sheet is opened FROM
   an edit of «שולם» or «יתרה» in the edit modal — the user already said how
   much and roughly what, so they only confirm. Parent keys this modal on the
   preset so it re-seeds each time it opens. */
export default function AdjustmentModal({ open, onClose, balance, onSave, onAlsoRecordIncome, presetAmount = null, presetReason = null }) {
  const { t } = useT('clients')
  const [reason, setReason] = useState(presetReason || 'discount')
  /* The preset arrives SIGNED — lowering «שולם» from 500 to 300 hands over
     -200. Keep the sign: absolute-valuing it here turned every downward
     correction into an increase, moving the number by 2×delta the wrong way.
     The field stays signed-editable for the same reason (an imported figure
     that came in too high has no other way down). */
  const [amount, setAmount] = useState(presetAmount != null ? String(presetAmount) : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const picked = REASONS.find((r) => r.k === reason) || REASONS[0]
  const delta = Number(amount) || 0
  const paidNow = balance?.paid ?? 0
  const balanceNow = balance?.balance ?? 0
  /* A 'paid' adjustment raises «שולם» and therefore drops «יתרה» by the same
     amount; a 'balance' adjustment forgives debt without claiming payment. */
  const paidNext = picked.kind === 'paid' ? paidNow + delta : paidNow
  const balanceNext = balanceNow - delta

  const close = () => {
    setReason(presetReason || 'discount')
    setAmount(presetAmount != null ? String(presetAmount) : '')
    setNote(''); setBusy(false); setErr('')
    onClose()
  }

  const submit = async () => {
    if (busy) return
    if (!delta) { setErr(t('adjust.amountRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({ kind: picked.kind, reason: picked.k, amount: delta, note: note.trim() || null })
      close()
    } catch {
      setBusy(false)
      setErr(t('adjust.saveFailed'))
    }
  }

  /* Book it as real income INSTEAD of an adjustment — never as well as one.
     clientBalance sums paid = real income + paid_adjustment, so writing both
     counts the same shekel twice. An adjustment exists precisely for money
     that is NOT in the books; once it goes in the books it stops being one.
     The parent closes this sheet and opens the income form (doing both here
     would let React batch the close over the open, which silently swallowed
     the action). */
  const recordAsIncome = () => {
    if (busy) return
    if (!delta) { setErr(t('adjust.amountRequired')); return }
    onAlsoRecordIncome?.(delta, note.trim() || null)
  }

  return (
    <Modal open={open} onClose={close} title={t('adjust.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('adjust.whatHappened')}</Box>
        <Box className="m-pills">
          {REASONS.map((r) => (
            <Btn
              key={r.k}
              type="button"
              className={`m-pill${reason === r.k ? ' on' : ''}`}
              onClick={() => { setReason(r.k); if (err) setErr('') }}
            >
              {t(r.labelKey)}
            </Btn>
          ))}
        </Box>
      </Box>

      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('adjust.amount')}</Box>
          <Input
            type="number"
            className="m-input"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); if (err) setErr('') }}
            aria-label={t('adjust.amount')}
            placeholder="0"
          />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('adjust.note')}</Box>
          <Input
            className="m-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={t('adjust.note')}
            placeholder={t('adjust.notePlaceholder')}
          />
        </Box>
      </Box>

      {/* Opened from a hand-edited «שולם»/«יתרה»: that edit was deliberately
          NOT written yet, so cancelling here drops it. Say so, rather than
          letting a modal that reported "saved" quietly lose a number. */}
      {presetAmount != null && (
        <Txt as="p" className="m-hint">{t('adjust.cancelDiscards')}</Txt>
      )}

      {/* States the outcome BEFORE saving — the whole point is that the user
          never has to work out which number a reason moves. */}
      {delta !== 0 && (
        <Box className="adj-preview">
          <Txt as="p" className="adj-preview-line">
            {t('adjust.previewPaid', { from: isr(paidNow), to: isr(paidNext) })}
            {' · '}
            {t('adjust.previewBalance', { from: isr(balanceNow), to: isr(balanceNext) })}
          </Txt>
        </Box>
      )}

      <Txt as="p" className="m-hint">{t('adjust.notInReports')}</Txt>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close} disabled={busy}>{t('inline.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? t('inline.saving') : t('inline.save')}
        </Btn>
      </Box>

      {/* Offered only for money that actually changed hands — and it REPLACES
          the adjustment rather than adding to it. */}
      {picked.k === 'unrecorded_payment' && (
        <Btn type="button" className="adj-also-income" onClick={recordAsIncome} disabled={busy}>
          {t('adjust.alsoRecordIncome')}
        </Btn>
      )}
    </Modal>
  )
}
