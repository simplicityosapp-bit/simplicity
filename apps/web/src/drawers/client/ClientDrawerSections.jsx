import { useEffect, useRef, useState } from 'react'
import { Trans } from 'react-i18next'
import { ChevronDown, Pencil, Check } from 'lucide-react'
import { getClientMemberships, financeQuery, isConfirmedTx, isr, fmtShortDate, fmtTime } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import PaymentPlanSection from './PaymentPlanSection'
import DateField from '../../components/DateField'
import { Box, Txt, Btn, Input, Textarea } from '../../components/ui'

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6]

const PRIORITY_COLOR = { high: 'var(--clay)', medium: 'var(--amber-warn)', low: 'var(--sage)' }
const live = (a) => (a || []).filter((r) => !r.deleted_at)
/* Render an amount with its OWN sign — adjustments can be negative (a figure
   imported too high), so the sign can't be inferred from the row's kind. */
const signed = (n) => `${(Number(n) || 0) < 0 ? '−' : '+'}${isr(Math.abs(Number(n) || 0))}`

/* A collapsible section. When `onEdit` is supplied the header shows a real
   edit button — a SIBLING of the toggle, never nested inside it (nested
   <button> is invalid HTML and swallowed the tap on mobile). `editing`
   reflects the panel's active edit state: it forces the section open and
   flips the pencil to a "done" check. */
/* `inline` marks the three sections whose pencil opens a form with its own
   save/cancel inside the body, rather than a row-edit mode. Those hide the
   header button while the form is open: it rendered as a ✓ titled "סיום
   עריכה", but clicking it discarded everything typed. */
function Section({ title, count, defaultOpen = false, onEdit, editing = false, inline = false, children }) {
  const { t } = useT('clients')
  const [open, setOpen] = useState(defaultOpen)
  /* Entering edit mode also latches the section open, so that when editing
     ends the panel doesn't snap shut and hide the value just saved. Adjusted
     during render (not in an effect) to avoid a cascading set-state-in-effect,
     the same pattern the clients screen uses for its route/selection resets. */
  const [prevEditing, setPrevEditing] = useState(editing)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    if (editing) setOpen(true)
  }
  const isOpen = open || editing
  /* Inert while editing. `isOpen` is forced true then, so a toggle click had
     no visible effect but still flipped `open` to false underneath — and the
     section snapped shut the moment the save landed, which is exactly what
     the latch above exists to prevent. */
  const toggleOpen = () => { if (!editing) setOpen((o) => !o) }
  return (
    <Box className={`cd-section${isOpen ? ' open' : ''}${editing ? ' editing' : ''}`}>
      <Box className="cd-sec-head">
        <Btn type="button" className="cd-sec-toggle" onClick={toggleOpen} aria-expanded={isOpen} aria-disabled={editing || undefined}>
          <Txt className="cd-sec-title">
            {title}
            {count != null && <Txt className="cd-sec-count">{count}</Txt>}
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className="cd-sec-chev" aria-hidden="true" />
        </Btn>
        {onEdit && !(inline && editing) && (
          <Btn
            type="button"
            className={`cd-sec-edit${editing ? ' on' : ''}`}
            title={editing ? t('sections.editing') : t('sections.edit')}
            aria-label={t('sections.editLabelAria', { title })}
            aria-pressed={editing}
            onClick={onEdit}
          >
            {editing
              ? <Check size={14} strokeWidth={2} aria-hidden="true" />
              : <Pencil size={13} strokeWidth={1.6} aria-hidden="true" />}
          </Btn>
        )}
      </Box>
      {isOpen && <Box className="cd-sec-body">{children}</Box>}
    </Box>
  )
}

/* Inline editor for a single-value section (recurring slot / more details /
   notes). The pencil swaps the section's read view for these fields plus an
   explicit save+cancel pair — deliberately NOT save-on-blur, so there is
   always a definite "I saved" moment for a non-technical user.
   Module-level (stable identity) so the inputs never remount on a parent
   re-render — same reason EditClientModal's Section sits at module level;
   typing must keep focus. Fields come in as children, so they reconcile
   normally. */
function InlineForm({ onSave, onCancel, saving, error, children }) {
  const { t } = useT('clients')
  return (
    <Box className="cd-inline">
      {children}
      {error && <Txt as="p" className="cd-inline-err">{error}</Txt>}
      <Box className="cd-inline-actions">
        <Btn type="button" className="cd-inline-cancel" onClick={onCancel} disabled={saving}>
          {t('inline.cancel')}
        </Btn>
        <Btn type="button" className="cd-inline-save" onClick={onSave} disabled={saving}>
          {saving ? t('inline.saving') : t('inline.save')}
        </Btn>
      </Box>
    </Box>
  )
}

export default function ClientDrawerSections({ client: c, balance, txns, tasks = [], reminders = [], sessions = [], members = [], groups = [], adjustments = [], modalOpen = false, onEditTx, onEditClient, onEditSession, onEditTask, onEditReminder, onUpdateClient }) {
  const { t } = useT('clients')
  /* Which panel is currently in edit mode (one at a time). The header
     pencil toggles it; in edit mode the panel's rows become tappable and
     open the matching editor. */
  const [editKey, setEditKey] = useState(null)
  const toggleEdit = (k) => setEditKey((p) => (p === k ? null : k))

  /* ── inline single-value editing ──
     The three sections below (recurring slot / more details / notes) used to
     hand their pencil straight to the full edit modal — the same thing the
     header's "ערוך" button does. So one pencil icon meant two different
     things depending on which section it sat in. They now edit their own
     field in place; only "חברויות בקבוצות" still opens the modal, because a
     table of per-group price overrides is not a single value. */
  /* Deliberately SEPARATE from editKey above. Sharing one key meant opening
     any list section's pencil silently threw away a half-typed note, and a
     save landing after the user moved on would exit the row-edit mode they
     had just entered. The two kinds of editing are independent. */
  const [inlineKey, setInlineKey] = useState(null)
  /* Mirrors inlineKey so an in-flight save can tell, on landing, whether the
     user has since moved to a different editor — the state variable captured
     in that closure is stale by then. */
  const inlineKeyRef = useRef(null)
  useEffect(() => { inlineKeyRef.current = inlineKey }, [inlineKey])
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const closeInline = () => { setInlineKey(null); setDraft({}); setSaving(false); setSaveErr('') }
  /* A modal took over (full edit, schedule-meeting, …). Those write the same
     client through other paths, so an inline draft left open underneath would
     be stale — and saving it afterwards would silently revert what the modal
     just wrote, stamping it as a fresh edit. Drop the draft instead.
     Adjusted during render rather than in an effect, matching the pattern
     used by Section above and by the clients screen. */
  const [prevModalOpen, setPrevModalOpen] = useState(modalOpen)
  if (modalOpen !== prevModalOpen) {
    setPrevModalOpen(modalOpen)
    if (modalOpen && inlineKey) closeInline()
  }

  /* Toggle an inline editor, seeding its draft from the client on open. */
  const toggleInline = (k, seed) => {
    if (inlineKey === k) { closeInline(); return }
    setInlineKey(k); setDraft(seed); setSaving(false); setSaveErr('')
  }
  const saveInline = async (patch) => {
    if (saving) return
    const forKey = inlineKeyRef.current
    setSaving(true)
    setSaveErr('')
    try {
      await onUpdateClient?.(c.id, patch)
      setSaving(false)
      /* Only act if this editor is still the open one — a slow save landing
         after the user switched must not close, or error onto, the new one. */
      if (inlineKeyRef.current === forKey) { setInlineKey(null); setDraft({}) }
    } catch {
      /* Stay open with the draft intact so nothing typed is lost. */
      setSaving(false)
      if (inlineKeyRef.current === forKey) setSaveErr(t('inline.saveFailed'))
    }
  }

  /* Adjustments split by which number they move: 'paid' ones belong under the
     payments total (which includes them), 'balance' ones are debt written off
     and get their own group. */
  const paidAdjustments = adjustments.filter((a) => a.kind === 'paid')
  const balanceAdjustments = adjustments.filter((a) => a.kind === 'balance')

  /* The scalar is the source of truth; these rows only explain it. Anything
     that moves the scalar WITHOUT writing a row leaves a gap — the mobile app
     still writes it directly, a migration can be pending, someone can edit the
     row in the database. Rather than trusting every writer to keep the two in
     step, show whatever the rows don't account for as its own line. The total
     then always adds up, whatever happened upstream. */
  const unexplained = (col, rows) => {
    const scalar = Number(c[col]) || 0
    const explained = rows.reduce((s, a) => s + (Number(a.amount) || 0), 0)
    const gap = Math.round((scalar - explained) * 100) / 100
    return gap === 0 ? null : gap
  }
  const unexplainedPaid = unexplained('paid_adjustment', paidAdjustments)
  const unexplainedBalance = unexplained('balance_adjustment', balanceAdjustments)

  /* ── data ── */
  const payments = financeQuery({ clientId: c.id, includePending: true, source: txns })
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  /* Match the drawer header's "שולם": the client's paid total, which INCLUDES
     any informal manual "שולם" adjustment (recorded with no transaction), not
     just the summed income rows below. */
  const payTotal = balance ? balance.paid : payments.filter((f) => f.type === 'income' && isConfirmedTx(f)).reduce((s, f) => s + f.amount, 0)

  const clientSessions = live(sessions)
    .filter((s) => s.client_id === c.id || (c.group_id && s.group_id === c.group_id))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const openTasks = live(tasks).filter((t) => t.client_id === c.id && t.status !== 'done')

  const linkedReminders = live(reminders).filter((r) => r.linked_to_type === 'client' && r.linked_to_id === c.id)
  const activeReminders = linkedReminders.filter((r) => r.status === 'pending' || r.status === 'triggered')

  const memberships = getClientMemberships(c.id, members)
  const hasRecurring = c.recurring_day != null && c.recurring_time

  /* timeline — merged event feed. Each event keeps an optional `edit`
     callback so edit mode can reopen the original item. */
  const events = []
  clientSessions.forEach((s) => events.push({ type: 'meeting', date: s.date, label: `${t('sections.eventMeeting')}${s.num ? ' #' + s.num : ''}`, sub: s.summary || s.notes || '', edit: onEditSession && !s.group_id ? () => onEditSession(s) : null }))
  financeQuery({ clientId: c.id, source: txns }).forEach((f) => events.push({ type: 'payment', date: f.date, label: t('sections.eventPayment', { amount: isr(f.amount) }), sub: f.desc || '', edit: onEditTx ? () => onEditTx((txns || []).find((tx) => tx.id === f.id) || f) : null }))
  live(tasks).filter((t) => t.client_id === c.id && t.status === 'done' && t.completed_at)
    .forEach((t) => events.push({ type: 'task', date: t.completed_at, label: t.title, sub: '', edit: onEditTask ? () => onEditTask(t) : null }))
  events.sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <>
      <Box className="cd-group">
        <Txt as="p" className="cd-group-title">{t('sections.activity')}</Txt>

        <Section
          title={t('sections.recurring')}
          onEdit={onUpdateClient ? () => toggleInline('recurring', {
            recurring_day: c.recurring_day != null ? String(c.recurring_day) : '',
            recurring_time: c.recurring_time || '',
          }) : onEditClient}
          editing={inlineKey === 'recurring'}
          inline
        >
          {inlineKey === 'recurring' ? (
            <InlineForm
              saving={saving}
              error={saveErr}
              onCancel={closeInline}
              onSave={() => saveInline({
                recurring_day: draft.recurring_day !== '' ? Number(draft.recurring_day) : null,
                /* A fixed meeting needs a day; with no day the times are inert
                   — drop them so a stray time can't persist a half-set slot
                   (mirrors EditClientModal). */
                recurring_time: draft.recurring_day !== '' ? (draft.recurring_time || null) : null,
                ...(draft.recurring_day === '' ? { recurring_end_time: null } : {}),
              })}
            >
              <Box className="m-row2">
                <Box className="m-field">
                  <Box as="label" className="m-label">{t('form.recurringDay')}</Box>
                  <select
                    className="m-select"
                    value={draft.recurring_day}
                    onChange={(e) => setField('recurring_day', e.target.value)}
                    aria-label={t('form.recurringDay')}
                  >
                    <option value="">{t('form.none')}</option>
                    {DAY_KEYS.map((d) => <option key={d} value={d}>{t(`form.days.${d}`)}</option>)}
                  </select>
                </Box>
                <Box className="m-field">
                  <Box as="label" className="m-label">{t('form.recurringTime')}</Box>
                  <Input
                    type="time"
                    className="m-input"
                    value={draft.recurring_time}
                    onChange={(e) => setField('recurring_time', e.target.value)}
                    aria-label={t('form.recurringTime')}
                  />
                </Box>
              </Box>
              {/* A native time input can't be emptied on touch, so this is the
                  only path back to "no fixed meeting". */}
              {(draft.recurring_day !== '' || draft.recurring_time !== '' || !!c.recurring_end_time) && (
                <Btn
                  type="button"
                  className="m-clear-link"
                  onClick={() => { setField('recurring_day', ''); setField('recurring_time', '') }}
                >{t('form.clearRecurring')}</Btn>
              )}
            </InlineForm>
          ) : hasRecurring ? (
            <Txt as="p" className="cd-rec">
              <Trans
                t={t}
                i18nKey="sections.recurringLine"
                values={{ day: t(`form.days.${c.recurring_day}`), time: c.recurring_time }}
                components={[<b key="d" />, <b key="t" />]}
              />
            </Txt>
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noRecurring')}</Txt>
          )}
        </Section>

        <Section
          title={t('sections.sessionsTitle')}
          count={clientSessions.length}
          onEdit={onEditSession && clientSessions.some((s) => !s.group_id) ? () => toggleEdit('sess') : undefined}
          editing={editKey === 'sess'}
        >
          {clientSessions.length ? (
            clientSessions.map((s) => {
              const inner = (
                <>
                  <Box className="cd-sess-head">
                    <Txt className="cd-sess-num">{s.num || '•'}</Txt>
                    <Txt className="cd-sess-date">{fmtShortDate(s.date)}{s.group_id ? t('sections.sessionGroup') : ''}</Txt>
                    {editKey === 'sess' && !s.group_id && <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon cd-sess-editicon" aria-hidden="true" />}
                  </Box>
                  {s.summary && <Txt as="p" className="cd-sess-summary">{s.summary}</Txt>}
                </>
              )
              return editKey === 'sess' && !s.group_id ? (
                <Btn key={s.id} type="button" className="cd-sess cd-sess-edit" onClick={() => onEditSession?.(s)}>
                  {inner}
                </Btn>
              ) : (
                <Box key={s.id} className="cd-sess">{inner}</Box>
              )
            })
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noSessions')}</Txt>
          )}
        </Section>

        <Section
          title={t('sections.payments')}
          count={payments.length}
          onEdit={onEditTx && payments.length ? () => toggleEdit('pay') : undefined}
          editing={editKey === 'pay'}
        >
          <Box className="cd-pay-summary">
            <Txt>{t('sections.totalPaid')}</Txt>
            <Txt className="mono">{isr(payTotal)}</Txt>
          </Box>
          {/* ONLY the 'paid' adjustments belong here: "סה״כ שולם" above is
              balance.paid, which includes paid_adjustment but NOT
              balance_adjustment. Listing both kinds under it put a −₪150
              forgiveness inside a total it was never part of. The 'balance'
              ones get their own group below. A 'legacy' row predates migration
              0095 and has no date or reason to show. */}
          {paidAdjustments.map((a) => (
            <Box key={a.id} className="cd-row">
              <Txt className="cd-row-dot cd-dot-adjust" />
              <Box className="cd-row-body">
                <Txt as="p" className="cd-row-title">
                  {a.reason === 'legacy' ? t('adjust.legacyRow') : t(`adjust.row.${a.reason}`)}
                  {a.note ? <Txt className="cd-row-note"> · {a.note}</Txt> : null}
                </Txt>
                <Txt as="p" className="cd-row-sub">
                  {a.occurred_on ? fmtShortDate(a.occurred_on) : t('adjust.noDate')}
                </Txt>
              </Box>
              {/* Sign comes from the AMOUNT, not the kind — a correction
                  downward is a negative 'paid' adjustment and must not render
                  with a +. */}
              <Txt className="cd-row-amt mono">{signed(a.amount)}</Txt>
            </Box>
          ))}
          {unexplainedPaid != null && (
            <Box className="cd-row">
              <Txt className="cd-row-dot cd-dot-adjust" />
              <Box className="cd-row-body">
                <Txt as="p" className="cd-row-title">{t('adjust.unexplained')}</Txt>
                <Txt as="p" className="cd-row-sub">{t('adjust.unexplainedSub')}</Txt>
              </Box>
              <Txt className="cd-row-amt mono">{signed(unexplainedPaid)}</Txt>
            </Box>
          )}
          {payments.length ? (
            payments.map((f) => {
              const body = (
                <>
                  <Txt className="cd-row-dot" style={{ background: f.type === 'income' ? 'var(--sage)' : 'var(--clay)' }} />
                  <Box className="cd-row-body">
                    <Txt as="p" className="cd-row-title">{f.desc || t('sections.noDesc')}</Txt>
                    <Txt as="p" className="cd-row-sub">{fmtShortDate(f.date)}{f.status === 'pending' ? t('sections.pending') : ''}</Txt>
                  </Box>
                  <Txt className="cd-row-amt mono">{f.type === 'income' ? '+' : '−'}{isr(f.amount)}</Txt>
                </>
              )
              return editKey === 'pay' ? (
                <Btn
                  key={f.id}
                  type="button"
                  className="cd-row cd-row-edit"
                  onClick={() => onEditTx?.((txns || []).find((t) => t.id === f.id) || f)}
                >
                  {body}
                  <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon" aria-hidden="true" />
                </Btn>
              ) : (
                <Box key={f.id} className="cd-row">{body}</Box>
              )
            })
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noPayments')}</Txt>
          )}

          {/* Debt written off — real history, but NOT part of "סה״כ שולם"
              above, so it sits under its own heading rather than inside a
              total it never belonged to. */}
          {(balanceAdjustments.length > 0 || unexplainedBalance != null) && (
            <>
              <Txt as="p" className="cd-adjust-head">{t('adjust.writeOffs')}</Txt>
              {unexplainedBalance != null && (
                <Box className="cd-row">
                  <Txt className="cd-row-dot cd-dot-adjust" />
                  <Box className="cd-row-body">
                    <Txt as="p" className="cd-row-title">{t('adjust.unexplained')}</Txt>
                    <Txt as="p" className="cd-row-sub">{t('adjust.unexplainedSub')}</Txt>
                  </Box>
                  <Txt className="cd-row-amt mono">{signed(-unexplainedBalance)}</Txt>
                </Box>
              )}
              {balanceAdjustments.map((a) => (
                <Box key={a.id} className="cd-row">
                  <Txt className="cd-row-dot cd-dot-adjust" />
                  <Box className="cd-row-body">
                    <Txt as="p" className="cd-row-title">
                      {a.reason === 'legacy' ? t('adjust.legacyRow') : t(`adjust.row.${a.reason}`)}
                      {a.note ? <Txt className="cd-row-note"> · {a.note}</Txt> : null}
                    </Txt>
                    <Txt as="p" className="cd-row-sub">
                      {a.occurred_on ? fmtShortDate(a.occurred_on) : t('adjust.noDate')}
                    </Txt>
                  </Box>
                  <Txt className="cd-row-amt mono">{signed(-a.amount)}</Txt>
                </Box>
              ))}
            </>
          )}
        </Section>

        <PaymentPlanSection client={c} />

        <Section
          title={t('sections.openTasks')}
          count={openTasks.length}
          onEdit={onEditTask && openTasks.length ? () => toggleEdit('tasks') : undefined}
          editing={editKey === 'tasks'}
        >
          {openTasks.length ? (
            openTasks.map((t) => {
              const inner = (
                <>
                  <Txt className="cd-task-dot" style={{ background: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium }} />
                  <Txt as="p" className="cd-row-title cd-grow">{t.title}</Txt>
                  {editKey === 'tasks' && <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon" aria-hidden="true" />}
                </>
              )
              return editKey === 'tasks' ? (
                <Btn key={t.id} type="button" className="cd-row cd-row-edit" onClick={() => onEditTask?.(t)}>{inner}</Btn>
              ) : (
                <Box key={t.id} className="cd-row">{inner}</Box>
              )
            })
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noOpenTasks')}</Txt>
          )}
        </Section>

        <Section
          title={t('sections.timeline')}
          count={events.length}
          onEdit={events.some((e) => e.edit) ? () => toggleEdit('tl') : undefined}
          editing={editKey === 'tl'}
        >
          {events.length ? (
            events.slice(0, 30).map((e, i) => {
              const inner = (
                <>
                  <Txt className="cd-tl-label">{e.label}{e.sub ? <Txt className="cd-tl-sub"> · {e.sub.slice(0, 50)}</Txt> : null}</Txt>
                  {editKey === 'tl' && e.edit
                    ? <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon" aria-hidden="true" />
                    : <Txt className="cd-tl-date">{fmtShortDate(e.date)}</Txt>}
                </>
              )
              return editKey === 'tl' && e.edit ? (
                <Btn key={i} type="button" className="cd-tl-row cd-tl-edit" onClick={e.edit}>{inner}</Btn>
              ) : (
                <Box key={i} className="cd-tl-row">{inner}</Box>
              )
            })
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noEvents')}</Txt>
          )}
        </Section>
      </Box>

      <Box className="cd-group">
        <Txt as="p" className="cd-group-title">{t('sections.contactEnv')}</Txt>

        <Section
          title={t('sections.moreDetails')}
          onEdit={onUpdateClient ? () => toggleInline('more', {
            address: c.address || '',
            birth_date: c.birth_date || '',
          }) : onEditClient}
          editing={inlineKey === 'more'}
          inline
        >
          {inlineKey === 'more' ? (
            <InlineForm
              saving={saving}
              error={saveErr}
              onCancel={closeInline}
              onSave={() => saveInline({
                address: draft.address.trim() || null,
                birth_date: draft.birth_date || null,
              })}
            >
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.address')}</Box>
                <Input
                  className="m-input"
                  value={draft.address}
                  onChange={(e) => setField('address', e.target.value)}
                  aria-label={t('form.address')}
                  placeholder={t('form.addressPlaceholder')}
                />
              </Box>
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.birthDate')}</Box>
                <DateField
                  className="m-input"
                  value={draft.birth_date}
                  onChange={(e) => setField('birth_date', e.target.value)}
                  aria-label={t('form.birthDate')}
                />
              </Box>
            </InlineForm>
          ) : (c.address || c.birth_date) ? (
            <>
              {c.address && (
                <Box className="cd-row">
                  <Box className="cd-row-body">
                    <Txt as="p" className="cd-row-title">{c.address}</Txt>
                    <Txt as="p" className="cd-row-sub">{t('sections.address')}</Txt>
                  </Box>
                </Box>
              )}
              {c.birth_date && (
                <Box className="cd-row">
                  <Box className="cd-row-body">
                    <Txt as="p" className="cd-row-title">{fmtShortDate(c.birth_date)}</Txt>
                    <Txt as="p" className="cd-row-sub">{t('sections.birthDate')}</Txt>
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noMoreDetails')}</Txt>
          )}
        </Section>

        <Section
          title={t('sections.notes')}
          onEdit={onUpdateClient ? () => toggleInline('notes', { notes: c.notes || '' }) : onEditClient}
          editing={inlineKey === 'notes'}
          inline
        >
          {inlineKey === 'notes' ? (
            <InlineForm
              saving={saving}
              error={saveErr}
              onCancel={closeInline}
              onSave={() => {
                const next = draft.notes.trim() || null
                const patch = { notes: next }
                /* Stamp only on a real change, so re-saving an untouched note
                   never bumps the "עודכן" date shown below it. */
                if (next !== (c.notes ?? null)) patch.notes_updated_at = new Date().toISOString()
                saveInline(patch)
              }}
            >
              <Box className="m-field">
                <Textarea
                  className="m-textarea"
                  rows={4}
                  value={draft.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder={t('inline.notesPlaceholder')}
                  aria-label={t('sections.notes')}
                />
              </Box>
            </InlineForm>
          ) : c.notes ? (
            <>
              <Txt as="p" className="cd-note">{c.notes}</Txt>
              {c.notes_updated_at && <Txt as="p" className="cd-note-ts">{t('sections.notesUpdated', { date: fmtShortDate(c.notes_updated_at) })}</Txt>}
            </>
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noNotes')}</Txt>
          )}
        </Section>

        <Section
          title={t('sections.reminders')}
          count={activeReminders.length}
          onEdit={onEditReminder && linkedReminders.length ? () => toggleEdit('rem') : undefined}
          editing={editKey === 'rem'}
        >
          {linkedReminders.length ? (
            linkedReminders.map((r) => {
              const done = r.status === 'completed'
              const inner = (
                <>
                  <Box className="cd-row-body">
                    <Txt as="p" className={`cd-row-title${done ? ' done' : ''}`}>{r.title}</Txt>
                    <Txt as="p" className="cd-row-sub">{fmtShortDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}</Txt>
                  </Box>
                  {editKey === 'rem'
                    ? <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon" aria-hidden="true" />
                    : (done && <Check size={14} strokeWidth={2} className="cd-row-done" aria-hidden="true" />)}
                </>
              )
              return editKey === 'rem' ? (
                <Btn key={r.id} type="button" className="cd-row cd-row-edit" onClick={() => onEditReminder?.(r)}>{inner}</Btn>
              ) : (
                <Box key={r.id} className="cd-row">{inner}</Box>
              )
            })
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.noReminders')}</Txt>
          )}
        </Section>

        <Section title={t('sections.memberships')} count={memberships.length} onEdit={onEditClient && memberships.length ? onEditClient : undefined}>
          {memberships.length ? (
            memberships.map((m) => {
              const g = groups.find((x) => x.id === m.group_id)
              const mode = g?.billing_mode || 'package'
              /* A per-member override always wins; otherwise show the
                 group's price by its billing mode. */
              let sub
              if (m.total_override != null) {
                sub = isr(m.total_override)
              } else if (mode === 'per_session') {
                sub = g?.price_per_session ? t('sections.perSession', { price: isr(g.price_per_session) }) : t('sections.pricePerSession')
              } else if (mode === 'none') {
                sub = t('sections.noFixedPrice')
              } else {
                sub = `${g?.package_sessions ? t('sections.packageSessions', { count: g.package_sessions }) : ''}${isr(g?.package_price || 0)}`
              }
              return (
                <Box key={m.id} className="cd-row">
                  <Txt className="cd-row-dot" style={{ background: g?.color || 'var(--stone)' }} />
                  <Box className="cd-row-body">
                    <Txt as="p" className="cd-row-title">{g ? g.name : t('sections.groupDeleted')}</Txt>
                    <Txt as="p" className="cd-row-sub">{sub}</Txt>
                  </Box>
                </Box>
              )
            })
          ) : (
            <Txt as="p" className="cd-empty">{t('sections.notInGroups')}</Txt>
          )}
        </Section>
      </Box>
    </>
  )
}
