import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Sprout, Check, Bell, BellRing, Info } from 'lucide-react'
import { isr, fmtMonthYear, fmtShortDate } from '@simplicity/core'
import { useInvestmentSettings } from '../../hooks/useInvestmentSettings'
import { useReminders } from '../../hooks/useReminders'
import AddReminderModal from '../../modals/AddReminderModal'
import RecordInvestmentModal from '../../modals/RecordInvestmentModal'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../components/ui'
import './InvestmentRow.css'

/* Default slot for the reminder: 09:00 tomorrow, as the form's own date/time
   strings. Today would frequently already be in the past by the time someone
   opens the finance screen, and a reminder born overdue is noise. */
function defaultRemindAt() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const pad = (x) => String(x).padStart(2, '0')
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: '09:00' }
}

/* ════════════════════════════════════════════════════════════════
   InvestmentRow — "כמה מההכנסה להפריש להשקעות".
   ════════════════════════════════════════════════════════════════
   One line at rest, by design: the answer ("set aside ₪1,000") is the
   whole point, and it earns a single line of the finance screen — not a
   card. Tapping the line opens the settings underneath it.

   The target is always visible in the header, in both toggle states. The
   חודשי/מצטבר toggle switches only the SECOND number — what has actually
   been invested — which is a record, not a prescription. Wiring the
   toggle to the target instead is the mistake this component exists to
   avoid; useInvestmentSettings has a test pinning them apart.

   `month` is the month the finance screen is parked on, so the row can
   never quote a different period from the header above it. Every label
   here names the month it is actually talking about — when the basis has
   fallen back, the figure's month and the screen's month differ, and the
   row says which is which rather than leaving the user to guess.
   ════════════════════════════════════════════════════════════════ */

export default function InvestmentRow({ month = null }) {
  const { t } = useT('finance')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  /* `sliding` holds the thumb's value mid-drag; `draft` holds the typed value
     while the number is being edited. Both are null when the saved setting is
     the truth, which is the normal state. */
  const [sliding, setSliding] = useState(null)
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(false)
  const [remindOpen, setRemindOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const investingRef = useRef(false)
  const { reminders, addReminder } = useReminders()

  /* An investment reminder that is still owed. Completed and soft-deleted ones
     drop out — a reminder the user already acted on is not "set". Recurring
     ones never sit in 'completed' (they advance), so they stay listed, which
     is right: the next occurrence is still coming. */
  const activeReminder = useMemo(() => (reminders || [])
    .filter((r) => r.linked_to_type === 'investment' && !r.deleted_at && r.status !== 'completed')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || null,
  [reminders])
  const {
    settings, setBase, setPercent, setView,
    baseAmount, targetAmount, investedAmount, baseWasNegative, hasData,
    basisFellBack, basisMonth, selectedMonth, isCurrentMonth, recordInvestment,
  } = useInvestmentSettings(month)

  const shownPct = sliding ?? settings.percent

  /* The amount the row prints. Recomputed locally from `shownPct` so it tracks
     the thumb during a drag, before anything is saved. Identical to the hook's
     targetAmount whenever nothing is being dragged — same formula, same floor. */
  const liveTarget = sliding == null
    ? targetAmount
    : (baseWasNegative ? 0 : (shownPct / 100) * baseAmount)

  /* Both commits AWAIT the save before releasing the local value. Clearing it
     first opens a window where the saved setting hasn't landed yet, so the row
     snaps back to the OLD percentage for a frame — and anything that reads the
     displayed value in that window (tapping the number to edit it, most
     obviously) captures the stale number and writes it straight back, quietly
     undoing the drag. */
  const commitSlide = async () => {
    if (sliding == null) return
    await setPercent(sliding)
    setSliding(null)
  }

  const commitDraft = async () => {
    if (draft != null) await setPercent(draft)
    setDraft(null)
    setEditing(false)
  }

  /* Which month the figure is actually drawn from, and which one is on screen.
     Both come straight out of the hook's own ranges, so a label can never
     drift from the maths that produced the number beside it. They are the same
     month unless the basis fell back. */
  const basisLabel = fmtMonthYear(basisMonth)
  const selectedLabel = fmtMonthYear(selectedMonth)

  const saveReminder = async (payload) => {
    await addReminder(payload)
  }

  /* `investedOn` null means "today", which is what recordInvestment defaults
     to. Only the modal ever passes a date. */
  const doRecord = async (investedOn = null) => {
    /* Ref, not the `saving` state: setSaving only disables the button after a
       re-render, so a fast double-tap can get two clicks in before the disabled
       prop lands — and this records money. The ref shuts the second one out
       synchronously. */
    if (investingRef.current || liveTarget <= 0) return
    investingRef.current = true
    setSaving(true)
    try {
      /* recordInvestment rounds to whole shekels, so what the button printed
         is what gets stored. */
      await recordInvestment({ amount: liveTarget, investedOn })
    } finally {
      investingRef.current = false
      setSaving(false)
    }
  }

  const onInvest = async () => {
    /* On the month in progress this stays a single tap that stamps today —
       asking there would be a dialog whose answer is always the default. On any
       other month the date is a real question: the money moved today, but the
       user may well mean it for the month they are looking at. */
    if (!isCurrentMonth) { setRecordOpen(true); return }
    /* The hook surfaces its own error toast; nothing to add here. */
    await doRecord().catch(() => {})
  }

  return (
    <Box as="section" className={`inv-row${open ? ' open' : ''}`}>
      <Btn
        type="button"
        className="inv-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="inv-body"
      >
        <Txt className="inv-ic" aria-hidden="true"><Sprout size={15} strokeWidth={1.8} /></Txt>
        <Txt className="inv-title">{t('investment.title')}</Txt>
        {/* Both markers stay glyph-only so the resting state is still ONE line:
            a set reminder, and a figure drawn from the month before the one on
            screen because that one has taken nothing in yet. */}
        {activeReminder && (
          <Txt className="inv-flag rem" title={t('investment.reminderSetOn', { date: fmtShortDate(activeReminder.scheduled_at) })}>
            <BellRing size={13} strokeWidth={1.8} aria-hidden="true" />
            <Txt className="sr-only">{t('investment.reminderSetOn', { date: fmtShortDate(activeReminder.scheduled_at) })}</Txt>
          </Txt>
        )}
        {basisFellBack && (
          <Txt className="inv-flag warn" title={t('investment.staleBasis', { selected: selectedLabel, month: basisLabel })}>
            <Info size={13} strokeWidth={1.8} aria-hidden="true" />
            <Txt className="sr-only">{t('investment.staleBasis', { selected: selectedLabel, month: basisLabel })}</Txt>
          </Txt>
        )}
        {/* The month the figure came from, on the resting line. Without it the
            row prints a bare sum while the screen's own header names a month —
            and when the basis has fallen back those are two different months,
            which is exactly when a bare sum reads as a bug. */}
        <Txt className="inv-month">{basisLabel}</Txt>
        <Txt className="inv-amount mono">{isr(liveTarget)}</Txt>
        <ChevronDown size={15} strokeWidth={1.8} className="inv-chev" aria-hidden="true" />
      </Btn>

      {open && (
        <Box id="inv-body" className="inv-body">
          {/* ── What the percentage is taken of ── */}
          <Box className="inv-field">
            <Txt as="p" className="inv-lbl">{t('investment.baseLabel')}</Txt>
            <Box className="mg-toggle" role="tablist" aria-label={t('investment.settingsAria')}>
              <Btn
                type="button"
                role="tab"
                aria-selected={settings.base === 'income'}
                className={`mg-toggle-btn${settings.base === 'income' ? ' on' : ''}`}
                onClick={() => setBase('income')}
              >
                {t('investment.baseIncome')}
              </Btn>
              <Btn
                type="button"
                role="tab"
                aria-selected={settings.base === 'net'}
                className={`mg-toggle-btn${settings.base === 'net' ? ' on' : ''}`}
                onClick={() => setBase('net')}
              >
                {t('investment.baseNet')}
              </Btn>
            </Box>
          </Box>

          {/* ── The percentage itself ── */}
          <Box className="inv-field inv-field-pct">
            <Box className="inv-pct-head">
              <Txt as="p" className="inv-lbl">{t('investment.percentLabel')}</Txt>
              {editing ? (
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.5"
                  autoFocus
                  className="inv-pct-input mono"
                  aria-label={t('investment.percentAria')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitDraft()
                    /* Escape abandons the edit rather than committing whatever
                       half-typed number is in the field. */
                    if (e.key === 'Escape') { setDraft(null); setEditing(false) }
                  }}
                />
              ) : (
                /* The number is the control: tapping it swaps in an input, for
                   the cases where dragging to an exact 17% is a fight. */
                <Btn
                  type="button"
                  className="inv-pct-val mono"
                  onClick={() => { setDraft(String(shownPct)); setEditing(true) }}
                  aria-label={t('investment.percentAria')}
                >
                  {shownPct}%
                </Btn>
              )}
            </Box>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              className="inv-slider"
              aria-label={t('investment.percentAria')}
              value={shownPct}
              onChange={(e) => setSliding(Number(e.target.value))}
              /* Committed on release, not on every pixel of the drag: onChange
                 fires continuously, and each commit is a Supabase write. The
                 figure above still tracks the thumb live because it is computed
                 from `shownPct`, not from the saved setting. */
              onPointerUp={commitSlide}
              onKeyUp={commitSlide}
              onBlur={commitSlide}
            />
            <Txt className="inv-basis">{t('investment.basedOn', { month: basisLabel })}</Txt>
          </Box>

          {/* Why the figure reads ₪0, when it does — an unexplained zero looks
              like a broken widget rather than a quiet month. Both name the
              month, since the row no longer always means "last month". */}
          {baseWasNegative && (
            <Txt as="p" className="inv-note">{t('investment.negativeBase', { month: basisLabel })}</Txt>
          )}
          {!hasData && !baseWasNegative && (
            <Txt as="p" className="inv-note">{t('investment.noData', { month: selectedLabel })}</Txt>
          )}
          {/* Spelled out here, where there is room for the reason rather than
              just the glyph in the header. */}
          {basisFellBack && (
            <Txt as="p" className="inv-note warn">
              {t('investment.staleBasis', { selected: selectedLabel, month: basisLabel })}
            </Txt>
          )}

          <Box className="inv-divider" />

          {/* ── The record: what was actually invested ── */}
          <Box className="inv-field">
            {/* "הושקע החודש" only when the month on screen IS this month —
                otherwise it names the month, because the total below follows
                the screen and would otherwise claim to be about today. */}
            <Txt as="p" className="inv-lbl">
              {settings.view === 'cumulative'
                ? t('investment.investedCumulative')
                : (isCurrentMonth
                  ? t('investment.investedMonthly')
                  : t('investment.investedInMonth', { month: selectedLabel }))}
            </Txt>
            <Box className="mg-toggle" role="tablist" aria-label={t('investment.viewAria')}>
              <Btn
                type="button"
                role="tab"
                aria-selected={settings.view === 'monthly'}
                className={`mg-toggle-btn${settings.view === 'monthly' ? ' on' : ''}`}
                onClick={() => setView('monthly')}
              >
                {t('investment.viewMonthly')}
              </Btn>
              <Btn
                type="button"
                role="tab"
                aria-selected={settings.view === 'cumulative'}
                className={`mg-toggle-btn${settings.view === 'cumulative' ? ' on' : ''}`}
                onClick={() => setView('cumulative')}
              >
                {t('investment.viewCumulative')}
              </Btn>
            </Box>
          </Box>

          <Box className="inv-invested">
            <Txt className="inv-invested-v mono">{isr(investedAmount)}</Txt>
            <Box className="inv-actions">
              {/* Says which state it is in rather than offering "remind me" to
                  someone who already has one waiting. */}
              <Btn
                type="button"
                className={`inv-remind${activeReminder ? ' on' : ''}`}
                onClick={() => setRemindOpen(true)}
              >
                {activeReminder
                  ? <BellRing size={14} strokeWidth={1.8} aria-hidden="true" />
                  : <Bell size={14} strokeWidth={1.8} aria-hidden="true" />}
                {activeReminder
                  ? t('investment.reminderSetOn', { date: fmtShortDate(activeReminder.scheduled_at) })
                  : t('investment.remindMe')}
              </Btn>
              <Btn
                type="button"
                className="inv-cta"
                onClick={onInvest}
                disabled={saving || liveTarget <= 0}
              >
                <Check size={14} strokeWidth={2} aria-hidden="true" />
                {t('investment.didInvest')} {isr(liveTarget)}
              </Btn>
            </Box>
          </Box>
        </Box>
      )}

      {/* The app's own reminder sheet rather than a bespoke one: it already
          offers one-off / weekly / monthly, validates the timing and writes to
          the reminders entity. Pre-filled with the percentage in the title and
          the CURRENT figure in the details — the title stays true if the user
          makes it recurring, which a frozen "₪38" would not.
          Keyed on OPEN/CLOSED only. Keying on the amount too would remount the
          sheet mid-edit whenever a background refetch nudged the figure — and
          a remount throws away whatever the user had typed into it. The
          closed→open flip is already enough to re-seed the prefill. */}
      <AddReminderModal
        key={remindOpen ? 'inv-open' : 'inv-closed'}
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
        onSave={saveReminder}
        defaultLinkedTo={{ type: 'investment', id: null }}
        linkedSubjectName={t('investment.title')}
        initialDate={defaultRemindAt().date}
        initialTime={defaultRemindAt().time}
        prefill={{
          title: t('investment.reminderTitle', { percent: shownPct }),
          description: t('investment.reminderBody', {
            amount: isr(liveTarget),
            month: basisLabel,
          }),
        }}
      />

      {/* Only reached from a month that is not the one in progress — see
          onInvest. Keyed the same way as the reminder sheet, so reopening it
          re-seeds the date to today rather than keeping the last pick. */}
      <RecordInvestmentModal
        key={recordOpen ? 'rec-open' : 'rec-closed'}
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onConfirm={doRecord}
        amount={liveTarget}
        month={selectedMonth}
      />
    </Box>
  )
}
