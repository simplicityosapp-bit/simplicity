import { useRef, useState } from 'react'
import { ChevronDown, Sprout, Check, Bell } from 'lucide-react'
import { isr, fmtMonthYear, previousMonthRange } from '@simplicity/core'
import { useInvestmentSettings } from '../../hooks/useInvestmentSettings'
import { useReminders } from '../../hooks/useReminders'
import AddReminderModal from '../../modals/AddReminderModal'
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
   ════════════════════════════════════════════════════════════════ */

export default function InvestmentRow() {
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
  const investingRef = useRef(false)
  const { addReminder } = useReminders()
  const {
    settings, setBase, setPercent, setView,
    baseAmount, targetAmount, investedAmount, baseWasNegative, hasData,
    recordInvestment,
  } = useInvestmentSettings()

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

  /* Which month the figure is drawn from — the same previous-month range the
     hook computes against, so the label can never drift from the maths. */
  const lastMonth = fmtMonthYear(previousMonthRange().from)

  const saveReminder = async (payload) => {
    await addReminder(payload)
  }

  const onInvest = async () => {
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
      await recordInvestment({ amount: liveTarget })
    } catch { /* the hook surfaces its own error toast */ } finally {
      investingRef.current = false
      setSaving(false)
    }
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
            <Txt className="inv-basis">{t('investment.basedOn', { month: lastMonth })}</Txt>
          </Box>

          {/* Why the figure reads ₪0, when it does — an unexplained zero looks
              like a broken widget rather than a quiet month. */}
          {baseWasNegative && <Txt as="p" className="inv-note">{t('investment.negativeBase')}</Txt>}
          {!hasData && !baseWasNegative && <Txt as="p" className="inv-note">{t('investment.noData')}</Txt>}

          <Box className="inv-divider" />

          {/* ── The record: what was actually invested ── */}
          <Box className="inv-field">
            <Txt as="p" className="inv-lbl">
              {settings.view === 'cumulative'
                ? t('investment.investedCumulative')
                : t('investment.investedMonthly')}
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
              <Btn
                type="button"
                className="inv-remind"
                onClick={() => setRemindOpen(true)}
              >
                <Bell size={14} strokeWidth={1.8} aria-hidden="true" />
                {t('investment.remindMe')}
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
            month: lastMonth,
          }),
        }}
      />
    </Box>
  )
}
