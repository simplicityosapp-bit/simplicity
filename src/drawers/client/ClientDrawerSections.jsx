import { useState } from 'react'
import { ChevronDown, Pencil, Check } from 'lucide-react'
import { getClientMemberships } from '../../lib/clients'
import { financeQuery, isConfirmedTx, isr } from '../../lib/finance'
import { fmtShortDate, fmtTime } from '../../lib/dates'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const PRIORITY_COLOR = { high: 'var(--clay)', medium: 'var(--amber-warn)', low: 'var(--sage)' }
const live = (a) => (a || []).filter((r) => !r.deleted_at)

/* A collapsible section. When `onEdit` is supplied the header shows a real
   edit button — a SIBLING of the toggle, never nested inside it (nested
   <button> is invalid HTML and swallowed the tap on mobile). `editing`
   reflects the panel's active edit state: it forces the section open and
   flips the pencil to a "done" check. */
function Section({ title, count, defaultOpen = false, onEdit, editing = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = open || editing
  return (
    <div className={`cd-section${isOpen ? ' open' : ''}${editing ? ' editing' : ''}`}>
      <div className="cd-sec-head">
        <button type="button" className="cd-sec-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}>
          <span className="cd-sec-title">
            {title}
            {count != null && <span className="cd-sec-count">{count}</span>}
          </span>
          <ChevronDown size={16} strokeWidth={1.6} className="cd-sec-chev" aria-hidden="true" />
        </button>
        {onEdit && (
          <button
            type="button"
            className={`cd-sec-edit${editing ? ' on' : ''}`}
            title={editing ? 'סיום עריכה' : 'ערוך'}
            aria-label={`ערוך ${title}`}
            aria-pressed={editing}
            onClick={onEdit}
          >
            {editing
              ? <Check size={14} strokeWidth={2} aria-hidden="true" />
              : <Pencil size={13} strokeWidth={1.6} aria-hidden="true" />}
          </button>
        )}
      </div>
      {isOpen && <div className="cd-sec-body">{children}</div>}
    </div>
  )
}

export default function ClientDrawerSections({ client: c, txns, tasks = [], reminders = [], sessions = [], members = [], groups = [], onEditTx, onEditClient, onEditSession, onEditTask, onEditReminder }) {
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

  /* timeline — merged event feed */
  const events = []
  clientSessions.forEach((s) => events.push({ type: 'meeting', date: s.date, label: `פגישה${s.num ? ' #' + s.num : ''}`, sub: s.summary || s.notes || '' }))
  financeQuery({ clientId: c.id, source: txns }).forEach((f) => events.push({ type: 'payment', date: f.date, label: `תשלום · ${isr(f.amount)}`, sub: f.desc || '' }))
  live(tasks).filter((t) => t.client_id === c.id && t.status === 'done' && t.completed_at)
    .forEach((t) => events.push({ type: 'task', date: t.completed_at, label: t.title, sub: '' }))
  events.sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <>
      <div className="cd-group">
        <p className="cd-group-title">פעילות</p>

        <Section title="פגישה שבועית קבועה" onEdit={onEditClient}>
          {hasRecurring ? (
            <p className="cd-rec">כל יום <b>{DAYS[c.recurring_day]}</b> ב-<b>{c.recurring_time}</b></p>
          ) : (
            <p className="cd-empty">אין פגישה קבועה</p>
          )}
        </Section>

        <Section
          title="פגישות וסיכומים"
          count={clientSessions.length}
          onEdit={onEditSession && clientSessions.some((s) => !s.group_id) ? () => toggleEdit('sess') : undefined}
          editing={editKey === 'sess'}
        >
          {clientSessions.length ? (
            clientSessions.map((s) => {
              const inner = (
                <>
                  <div className="cd-sess-head">
                    <span className="cd-sess-num">{s.num || '•'}</span>
                    <span className="cd-sess-date">{fmtShortDate(s.date)}{s.group_id ? ' · קבוצתי' : ''}</span>
                    {editKey === 'sess' && !s.group_id && <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon cd-sess-editicon" aria-hidden="true" />}
                  </div>
                  {s.summary && <p className="cd-sess-summary">{s.summary}</p>}
                </>
              )
              return editKey === 'sess' && !s.group_id ? (
                <button key={s.id} type="button" className="cd-sess cd-sess-edit" onClick={() => onEditSession?.(s)}>
                  {inner}
                </button>
              ) : (
                <div key={s.id} className="cd-sess">{inner}</div>
              )
            })
          ) : (
            <p className="cd-empty">אין פגישות רשומות</p>
          )}
        </Section>

        <Section
          title="תשלומים"
          count={payments.length}
          onEdit={onEditTx && payments.length ? () => toggleEdit('pay') : undefined}
          editing={editKey === 'pay'}
        >
          <div className="cd-pay-summary">
            <span>סה״כ שולם</span>
            <span className="mono">{isr(payTotal)}</span>
          </div>
          {payments.length ? (
            payments.map((f) => {
              const body = (
                <>
                  <span className="cd-row-dot" style={{ background: f.type === 'income' ? 'var(--sage)' : 'var(--clay)' }} />
                  <div className="cd-row-body">
                    <p className="cd-row-title">{f.desc || 'ללא תיאור'}</p>
                    <p className="cd-row-sub">{fmtShortDate(f.date)}{f.status === 'pending' ? ' · ממתין' : ''}</p>
                  </div>
                  <span className="cd-row-amt mono">{f.type === 'income' ? '+' : '−'}{isr(f.amount)}</span>
                </>
              )
              return editKey === 'pay' ? (
                <button
                  key={f.id}
                  type="button"
                  className="cd-row cd-row-edit"
                  onClick={() => onEditTx?.((txns || []).find((t) => t.id === f.id) || f)}
                >
                  {body}
                  <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon" aria-hidden="true" />
                </button>
              ) : (
                <div key={f.id} className="cd-row">{body}</div>
              )
            })
          ) : (
            <p className="cd-empty">אין תשלומים עדיין</p>
          )}
        </Section>

        <Section
          title="משימות פתוחות"
          count={openTasks.length}
          onEdit={onEditTask && openTasks.length ? () => toggleEdit('tasks') : undefined}
          editing={editKey === 'tasks'}
        >
          {openTasks.length ? (
            openTasks.map((t) => {
              const inner = (
                <>
                  <span className="cd-task-dot" style={{ background: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium }} />
                  <p className="cd-row-title cd-grow">{t.title}</p>
                  {editKey === 'tasks' && <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon" aria-hidden="true" />}
                </>
              )
              return editKey === 'tasks' ? (
                <button key={t.id} type="button" className="cd-row cd-row-edit" onClick={() => onEditTask?.(t)}>{inner}</button>
              ) : (
                <div key={t.id} className="cd-row">{inner}</div>
              )
            })
          ) : (
            <p className="cd-empty">אין משימות פתוחות</p>
          )}
        </Section>

        <Section title="ציר זמן" count={events.length}>
          {events.length ? (
            events.slice(0, 30).map((e, i) => (
              <div key={i} className="cd-tl-row">
                <span className="cd-tl-label">{e.label}{e.sub ? <span className="cd-tl-sub"> · {e.sub.slice(0, 50)}</span> : null}</span>
                <span className="cd-tl-date">{fmtShortDate(e.date)}</span>
              </div>
            ))
          ) : (
            <p className="cd-empty">אין אירועים</p>
          )}
        </Section>
      </div>

      <div className="cd-group">
        <p className="cd-group-title">קשר וסביבה</p>

        <Section title="הערות" onEdit={onEditClient}>
          {c.notes ? (
            <>
              <p className="cd-note">{c.notes}</p>
              {c.notes_updated_at && <p className="cd-note-ts">עודכן {fmtShortDate(c.notes_updated_at)}</p>}
            </>
          ) : (
            <p className="cd-empty">אין הערות עדיין</p>
          )}
        </Section>

        <Section
          title="תזכורות מקושרות"
          count={activeReminders.length}
          onEdit={onEditReminder && linkedReminders.length ? () => toggleEdit('rem') : undefined}
          editing={editKey === 'rem'}
        >
          {linkedReminders.length ? (
            linkedReminders.map((r) => {
              const done = r.status === 'completed'
              const inner = (
                <>
                  <div className="cd-row-body">
                    <p className={`cd-row-title${done ? ' done' : ''}`}>{r.title}</p>
                    <p className="cd-row-sub">{fmtShortDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}</p>
                  </div>
                  {editKey === 'rem'
                    ? <Pencil size={12} strokeWidth={1.6} className="cd-row-editicon" aria-hidden="true" />
                    : (done && <Check size={14} strokeWidth={2} className="cd-row-done" aria-hidden="true" />)}
                </>
              )
              return editKey === 'rem' ? (
                <button key={r.id} type="button" className="cd-row cd-row-edit" onClick={() => onEditReminder?.(r)}>{inner}</button>
              ) : (
                <div key={r.id} className="cd-row">{inner}</div>
              )
            })
          ) : (
            <p className="cd-empty">אין תזכורות מקושרות</p>
          )}
        </Section>

        <Section title="חברויות בקבוצות" count={memberships.length} onEdit={onEditClient && memberships.length ? onEditClient : undefined}>
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
                sub = g?.price_per_session ? `${isr(g.price_per_session)} למפגש` : 'מחיר למפגש'
              } else if (mode === 'none') {
                sub = 'ללא מחיר קבוע'
              } else {
                sub = `${g?.package_sessions ? `${g.package_sessions} פגישות · ` : ''}${isr(g?.package_price || 0)}`
              }
              return (
                <div key={m.id} className="cd-row">
                  <span className="cd-row-dot" style={{ background: g?.color || 'var(--stone)' }} />
                  <div className="cd-row-body">
                    <p className="cd-row-title">{g ? g.name : '(קבוצה נמחקה)'}</p>
                    <p className="cd-row-sub">{sub}</p>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="cd-empty">לא בקבוצות</p>
          )}
        </Section>
      </div>
    </>
  )
}
