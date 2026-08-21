import { useState } from 'react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { isr } from '@simplicity/core'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   AdjustmentModal — fix the numbers on a client's card, and say why.

   TWO MODES, because two different jobs used to share one sheet:

   • EDIT (from the card's own «התאמה» link). The sheet shows the three
     figures the card's hero prints — פגישות, שולם, יתרה — exactly as they
     read up there, only editable. Beta feedback 2026-08-21: the button was
     "כללי מידי", and opening it told you nothing new, because the title was
     the same single word and the sheet asked for an amount with no sign of
     what that amount would be added to. Now the current state IS the form.

   • REASON (opened BY an edit of «שולם»/«יתרה» in EditClientModal, which
     passes presetAmount/presetReason). There the user has already typed the
     number on another screen; all that is missing is why. That form is the
     one this file has always had, untouched.

   WHY A REASON AT ALL. The reason decides which figure moves, so the user
   never has to know that a discount is entered by editing «יתרה» while cash
   in hand is entered by editing «שולם»:

     הנחה                     → balance  (lowers what's owed; «שולם» stays put)
     תיקון נתוני ייבוא        → paid     (corrects a wrong imported figure)
     תשלום שהתקבל ולא נרשם   → paid     (money in hand, deliberately not booked)

   ONE REASON PER FIGURE, not one per sheet. client_adjustments.kind is
   'paid' | 'balance' and a CHECK constraint binds each reason to exactly one
   of them, so a single row can only ever explain a single figure. Changing
   both in one go therefore writes two rows — which is why the old flow
   queued a SECOND sheet after the first. Here both reasons are asked on the
   one sheet and both rows are written by one save.

   Amounts are SIGNED. A correction downward is the natural gesture for a
   figure that came in too high, and the deltas handed over by the edit modal
   carry their own sign.
   ════════════════════════════════════════════════════════════════ */

const REASONS = [
  { k: 'discount',           kind: 'balance', labelKey: 'adjust.reasonDiscount' },
  { k: 'import_fix',         kind: 'paid',    labelKey: 'adjust.reasonImportFix' },
  { k: 'unrecorded_payment', kind: 'paid',    labelKey: 'adjust.reasonUnrecorded' },
]
/* The two a change to «שולם» can mean. «יתרה» has no such list: 'discount' is
   the ONLY reason the database accepts against kind 'balance', so lowering a
   balance is a discount by definition and a picker with one option would be
   asking a question with one answer. The sheet states it instead. */
const PAID_REASONS = REASONS.filter((r) => r.kind === 'paid')

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function AdjustmentModal({
  open,
  onClose,
  client,
  balance,
  onSave,
  onSaveClient,
  onAlsoRecordIncome,
  presetAmount = null,
  presetReason = null,
  moreQueued = false,
}) {
  const { t } = useT('clients')
  const { t: ts } = useT('modalsSystem') // shared modal chrome (discard prompt)
  /* Which job this sheet is doing — see the header. A preset can only come
     from EditClientModal, and only ever carries a money delta. */
  const reasonOnly = presetAmount != null

  return reasonOnly
    ? <ReasonOnlySheet {...{ open, onClose, balance, onSave, onAlsoRecordIncome, presetAmount, presetReason, moreQueued, t, ts }} />
    : <EditSheet {...{ open, onClose, client, balance, onSave, onSaveClient, onAlsoRecordIncome, t }} />
}

/* ════════════════════════════════════════════════════════════════
   EDIT — the card's numbers, opened up.
   ════════════════════════════════════════════════════════════════ */
function EditSheet({ open, onClose, client, balance, onSave, onSaveClient, onAlsoRecordIncome, t }) {
  const paid0 = balance?.paid ?? 0
  const balance0 = balance?.balance ?? 0
  const adj0 = balance?.adjustment ?? 0
  const memberTotal = balance?.memberTotal ?? 0
  const held = balance?.personalHeld ?? 0
  const perSession = !!balance?.perSession

  const start = () => ({
    scheduled: String(balance?.personalQuota ?? 0),
    done: String(balance?.personalDone ?? 0),
    paid: String(paid0),
  })
  const [form, setForm] = useState(start)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /* Extra forgiveness the user is adding on top of whatever balance_adjustment
     the client already carries. Held rather than an absolute balance because
     «יתרה» is DERIVED — see below. */
  const [forgive, setForgive] = useState(0)
  const [paidReason, setPaidReason] = useState('unrecorded_payment')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const scheduledNext = num(form.scheduled)
  const doneNext = num(form.done)
  const paidNext = num(form.paid)

  /* The private portion of the bill, recomputed from the session counts in
     THIS form — editing them really does re-bill the client, so the balance
     underneath has to move as you type. A manual «סה״כ לתשלום» overrides both
     modes and is not editable here (it lives in the edit form, which owns the
     terms of the deal rather than corrections to them). Same arithmetic
     clientBalance runs, so what this promises is what the card will show. */
  const override = client?.total_override
  const privateTotal = override != null && override !== ''
    ? Number(override)
    : (perSession ? doneNext : scheduledNext) * (client?.price_per_session || 0)
  const totalNext = memberTotal + privateTotal
  const balanceNext = totalNext - paidNext - (adj0 + forgive)

  /* «יתרה» is the one DERIVED field: it renders balanceNext, which is
     recomputed on every keystroke anywhere else in the form. That round-trip
     destroys the intermediate states a number has to pass through — a number
     input reports value="" while its text is not yet valid, so typing "-" (an
     overpaid client) or the "." of "150.5" would feed 0 back and overwrite
     what is being typed. So hold the raw text while editing and commit only
     once it parses. Same fix EditClientModal carries for the same field. */
  const [balanceDraft, setBalanceDraft] = useState(null)
  const onBalanceInput = (v) => {
    setBalanceDraft(v)
    if (v !== '' && Number.isFinite(Number(v))) setForgive(totalNext - paidNext - adj0 - Number(v))
    if (err) setErr('')
  }

  const paidDelta = paidNext - paid0
  const sessionsChanged = scheduledNext !== (balance?.personalQuota ?? 0)
  const doneChanged = doneNext !== (balance?.personalDone ?? 0)
  const dirty = paidDelta !== 0 || forgive !== 0 || sessionsChanged || doneChanged

  const close = () => {
    setForm(start()); setForgive(0); setBalanceDraft(null)
    setPaidReason('unrecorded_payment'); setNote(''); setBusy(false); setErr('')
    onClose()
  }

  const submit = async () => {
    if (busy) return
    if (!dirty) { setErr(t('adjust.nothingChanged')); return }
    setBusy(true)
    setErr('')
    try {
      /* Sessions first, and NOT as an adjustment: they are not money, carry no
         reason and live on the client row. «בוצעו» stores the GAP against what
         the app actually logged rather than rewriting history — the same thing
         the edit form does with the same number. */
      const patch = {}
      if (sessionsChanged) patch.sessions = scheduledNext
      if (doneChanged) patch.sessions_done_adjustment = doneNext - held
      if (Object.keys(patch).length) await onSaveClient?.(patch)

      /* One row per figure — see the header. Written in the order they are
         asked for, so the ledger reads the way the sheet did. */
      if (paidDelta !== 0) {
        await onSave({ kind: 'paid', reason: paidReason, amount: paidDelta, note: note.trim() || null })
      }
      if (forgive !== 0) {
        await onSave({ kind: 'balance', reason: 'discount', amount: forgive, note: note.trim() || null })
      }
      close()
    } catch {
      setBusy(false)
      setErr(t('adjust.saveFailed'))
    }
  }

  /* Book it as real income INSTEAD of an adjustment — never as well as one.
     clientBalance sums paid = real income + paid_adjustment, so writing both
     counts the same shekel twice. Offered only for the reason where the money
     genuinely exists, and only when «שולם» is what moved. */
  const canRecordIncome = paidDelta > 0 && paidReason === 'unrecorded_payment'
  const recordAsIncome = () => {
    if (busy) return
    onAlsoRecordIncome?.(paidDelta, note.trim() || null)
  }

  return (
    <Modal open={open} onClose={close} onSubmit={submit} title={t('adjust.title')}>
      {/* What this sheet is for, in one line. The old one opened on a bare
          "מה קרה?" over an empty amount box, which named neither the client's
          numbers nor the fact that they were about to change. */}
      <Txt as="p" className="m-hint">{t('adjust.intro')}</Txt>

      {/* The card's hero, opened up — same three figures, same order. */}
      {balance?.hasPersonal && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('adjust.sessionsHeading')}</Box>
          <Box className="ec-bill ec-bill-2">
            <Box className="ec-bill-cell">
              <Txt as="p" className="ec-bill-label">{t('adjust.scheduled')}</Txt>
              <Box className="ec-bill-money">
                <Input type="number" min="0" className="ec-bill-input" value={form.scheduled}
                  onChange={(e) => { set('scheduled', e.target.value); if (err) setErr('') }}
                  aria-label={t('adjust.scheduled')} />
              </Box>
            </Box>
            <Box className="ec-bill-cell divided-start">
              <Txt as="p" className="ec-bill-label">{t('adjust.done')}</Txt>
              <Box className="ec-bill-money">
                <Input type="number" min="0" className="ec-bill-input" value={form.done}
                  onChange={(e) => { set('done', e.target.value); if (err) setErr('') }}
                  aria-label={t('adjust.done')} />
              </Box>
            </Box>
          </Box>
          {/* A hand-edited «בוצעו» does not rewrite history — it records the gap
              against what was actually logged, and that gap outlives the edit. */}
          {doneChanged && (
            <Txt as="p" className="m-hint">
              {t('adjust.doneGap', { held, delta: doneNext - held > 0 ? `+${doneNext - held}` : String(doneNext - held) })}
            </Txt>
          )}
        </Box>
      )}

      <Box className="m-field">
        <Box as="label" className="m-label">{t('adjust.moneyHeading')}</Box>
        <Box className="ec-bill ec-bill-2">
          <Box className="ec-bill-cell">
            <Txt as="p" className="ec-bill-label">{t('adjust.paid')}</Txt>
            <Box className="ec-bill-money">
              <Txt className="ec-bill-cur">₪</Txt>
              <Input type="number" className="ec-bill-input" value={form.paid}
                onChange={(e) => { set('paid', e.target.value); if (err) setErr('') }}
                aria-label={t('adjust.paid')} />
            </Box>
          </Box>
          <Box className="ec-bill-cell divided-start">
            <Txt as="p" className="ec-bill-label">{t('adjust.balance')}</Txt>
            <Box className="ec-bill-money">
              <Txt className="ec-bill-cur">₪</Txt>
              <Input type="number" className="ec-bill-input" value={balanceDraft ?? String(balanceNext)}
                onChange={(e) => onBalanceInput(e.target.value)}
                onBlur={() => setBalanceDraft(null)}
                aria-label={t('adjust.balance')} />
            </Box>
          </Box>
        </Box>
        <Txt as="p" className="ec-bill-hint">{t('adjust.totalHint', { total: isr(totalNext) })}</Txt>
      </Box>

      {/* A reason per figure that moved, and only for the ones that did. */}
      {paidDelta !== 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('adjust.whyPaid')}</Box>
          <Box className="m-pills">
            {PAID_REASONS.map((r) => (
              <Btn
                key={r.k}
                type="button"
                className={`m-pill${paidReason === r.k ? ' on' : ''}`}
                onClick={() => setPaidReason(r.k)}
              >
                {t(r.labelKey)}
              </Btn>
            ))}
          </Box>
        </Box>
      )}

      {forgive !== 0 && (
        <Txt as="p" className="m-hint">{t('adjust.balanceIsDiscount')}</Txt>
      )}

      {dirty && (
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
      )}

      {/* Says the outcome before saving. Only the lines that actually move —
          a preview that restates three unchanged figures is noise. */}
      {dirty && (
        <Box className="adj-preview">
          {(sessionsChanged || doneChanged) && (
            <Txt as="p" className="adj-preview-line">
              {t('adjust.previewSessions', {
                from: `${balance?.personalDone ?? 0}/${balance?.personalQuota ?? 0}`,
                to: `${doneNext}/${scheduledNext}`,
              })}
            </Txt>
          )}
          {paidDelta !== 0 && (
            <Txt as="p" className="adj-preview-line">
              {t('adjust.previewPaid', { from: isr(paid0), to: isr(paidNext) })}
            </Txt>
          )}
          {balanceNext !== balance0 && (
            <Txt as="p" className="adj-preview-line">
              {t('adjust.previewBalance', { from: isr(balance0), to: isr(balanceNext) })}
            </Txt>
          )}
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

      {canRecordIncome && (
        <Btn type="button" className="adj-also-income" onClick={recordAsIncome} disabled={busy}>
          {t('adjust.alsoRecordIncome')}
        </Btn>
      )}
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════════════
   REASON — the number is already typed; only the why is missing.
   Reached from EditClientModal's «שולם»/«יתרה» fields.
   ════════════════════════════════════════════════════════════════ */
function ReasonOnlySheet({ open, onClose, balance, onSave, onAlsoRecordIncome, presetAmount, presetReason, moreQueued, t, ts }) {
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
  const delta = num(amount)
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
  /* The edit that opened this sheet was deliberately not written yet — it is
     waiting on the reason asked for here. Backing out therefore throws away a
     number the user typed on a screen that has already closed and reported
     itself saved. The line below the fields says so, but a line is easy to
     miss on a dialog that appeared unbidden, so the exits confirm. */
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const requestClose = () => { if (!busy) setConfirmDiscard(true); else close() }

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

  /* Booked INSTEAD of an adjustment, never as well — see the header. The
     parent closes this sheet and opens the income form (doing both here would
     let React batch the close over the open, silently swallowing the action). */
  const recordAsIncome = () => {
    if (busy) return
    if (!delta) { setErr(t('adjust.amountRequired')); return }
    onAlsoRecordIncome?.(delta, note.trim() || null)
  }

  return (
    <Modal open={open} onClose={requestClose} onSubmit={submit} title={t('adjust.title')}>
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

      <Txt as="p" className="m-hint">{t('adjust.cancelDiscards')}</Txt>

      {/* One save changed both «שולם» and «יתרה», so a second sheet follows
          this one. Said up front — a dialog reappearing straight after the
          first was confirmed reads as a glitch otherwise. */}
      {moreQueued && (
        <Txt as="p" className="m-hint">{t('adjust.moreQueued')}</Txt>
      )}

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
        <Btn type="button" className="m-btn-cancel" onClick={requestClose} disabled={busy}>{t('inline.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? t('inline.saving') : t('inline.save')}
        </Btn>
      </Box>

      {picked.k === 'unrecorded_payment' && (
        <Btn type="button" className="adj-also-income" onClick={recordAsIncome} disabled={busy}>
          {t('adjust.alsoRecordIncome')}
        </Btn>
      )}

      <ConfirmModal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={ts('discard.title')}
        message={t('adjust.cancelDiscards')}
        confirmLabel={ts('discard.confirm')}
        cancelLabel={ts('discard.cancel')}
        danger
        onConfirm={() => { setConfirmDiscard(false); close() }}
      />
    </Modal>
  )
}
