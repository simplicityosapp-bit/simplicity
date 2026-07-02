import { useState } from 'react'
import { Trans } from 'react-i18next'
import { ChevronDown, Pencil, Check } from 'lucide-react'
import { getClientMemberships, financeQuery, isConfirmedTx, isr, fmtShortDate, fmtTime } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import PaymentPlanSection from './PaymentPlanSection'
import { Box, Txt, Btn } from '../../components/ui'

const PRIORITY_COLOR = { high: 'var(--clay)', medium: 'var(--amber-warn)', low: 'var(--sage)' }
const live = (a) => (a || []).filter((r) => !r.deleted_at)

/* A collapsible section. When `onEdit` is supplied the header shows a real
   edit button — a SIBLING of the toggle, never nested inside it (nested
   <button> is invalid HTML and swallowed the tap on mobile). `editing`
   reflects the panel's active edit state: it forces the section open and
   flips the pencil to a "done" check. */
function Section({ title, count, defaultOpen = false, onEdit, editing = false, children }) {
  const { t } = useT('clients')
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = open || editing
  return (
    <Box className={`cd-section${isOpen ? ' open' : ''}${editing ? ' editing' : ''}`}>
      <Box className="cd-sec-head">
        <Btn type="button" className="cd-sec-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}>
          <Txt className="cd-sec-title">
            {title}
            {count != null && <Txt className="cd-sec-count">{count}</Txt>}
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className="cd-sec-chev" aria-hidden="true" />
        </Btn>
        {onEdit && (
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

export default function ClientDrawerSections({ client: c, txns, tasks = [], reminders = [], sessions = [], members = [], groups = [], onEditTx, onEditClient, onEditSession, onEditTask, onEditReminder }) {
  const { t } = useT('clients')
  /* Which panel is currently in edit mode (one at a time). The header
     pencil toggles it; in edit mode the panel's rows become tappable and
     open the matching editor. */
  const [editKey, setEditKey] = useState(null)
  const toggleEdit = (k) => setEditKey((p) => (p === k ? null : k))

  /* ── data ── */
  const payments = financeQuery({ clientId: c.id, includePending: true, source: txns })
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  const payTotal = payments.filter((f) => f.type === 'income' && isConfirmedTx(f)).reduce((s, f) => s + f.amount, 0)

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

        <Section title={t('sections.recurring')} onEdit={onEditClient}>
          {hasRecurring ? (
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

        <Section title={t('sections.moreDetails')} onEdit={onEditClient}>
          {(c.address || c.birth_date) ? (
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

        <Section title={t('sections.notes')} onEdit={onEditClient}>
          {c.notes ? (
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
