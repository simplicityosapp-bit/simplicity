import { useState, useMemo } from 'react'
import {
  Search, ChevronDown, BadgeCheck, Plus, Check, X, Users, CreditCard, Hand,
} from 'lucide-react'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'

/* dd/mm/yy, or "—" when missing. */
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* "היום" / "אתמול" / "לפני N ימים" / date for last-active warmth. */
function fmtLastActive(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days < 30) return `לפני ${days} ימים`
  return fmtDate(iso)
}

export default function AdminUsers() {
  const { data, loading, error } = useAdminQuery('users')
  const [subOverride, setSubOverride] = useState({}) // id → optimistic is_subscriber (manual)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)        // expanded detail row id
  const [busy, setBusy] = useState(null)        // user_id mid-toggle
  const [confirmId, setConfirmId] = useState(null) // user_id awaiting confirm
  const [sections, setSections] = useState({ all: true, subs: true, manual: true, regular: true })

  const toggleSection = (k) => setSections((s) => ({ ...s, [k]: !s[k] }))

  // Derive rows from the fetch + optimistic manual-subscriber edits. A
  // manual override only changes the 'manual' kind; 'regular' (real paid)
  // is read-only here, so an override never touches it.
  const rows = useMemo(() => (data?.rows || []).map((r) => {
    const o = subOverride[r.id]
    if (o === undefined) return r
    const kind = o ? 'manual' : (r.subscriber_kind === 'regular' ? 'regular' : null)
    return { ...r, subscriber_kind: kind, is_subscriber: !!kind }
  }), [data, subOverride])

  const applyToggle = async (u) => {
    const next = !(u.subscriber_kind === 'manual')
    setConfirmId(null)
    setBusy(u.id)
    setSubOverride((s) => ({ ...s, [u.id]: next })) // optimistic
    try {
      await callAdmin('set_subscriber', { user_id: u.id, value: next })
    } catch {
      setSubOverride((s) => ({ ...s, [u.id]: !next })) // rollback
    } finally {
      setBusy(null)
    }
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => (r.email || '').toLowerCase().includes(needle))
  }, [rows, q])

  const subs = visible.filter((r) => r.is_subscriber)
  const manual = visible.filter((r) => r.subscriber_kind === 'manual')
  const regular = visible.filter((r) => r.subscriber_kind === 'regular')

  const rowProps = {
    openId: open,
    onToggleRow: (id) => setOpen(open === id ? null : id),
    confirmId,
    busy,
    onRequestConfirm: (id) => setConfirmId(id),
    onCancelConfirm: () => setConfirmId(null),
    onApply: applyToggle,
  }

  return (
    <>
      <header className="admin-head">
        <h1>משתמשים</h1>
        <p>כל מי שנרשם — מקובץ לפי סוג, החדש קודם</p>
      </header>

      {loading && <div className="admin-state">טוען…</div>}
      {error && <div className="admin-state err">שגיאה בטעינת הנתונים</div>}

      {data && (
        <>
          <div className="admin-search">
            <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי אימייל…" dir="ltr" />
          </div>

          {/* Summary chips */}
          <div className="admin-usum">
            <span className="admin-usum-chip"><Users size={14} strokeWidth={1.8} aria-hidden="true" />סה״כ <b>{visible.length}</b></span>
            <span className="admin-usum-chip"><BadgeCheck size={14} strokeWidth={1.8} aria-hidden="true" />מנויים <b>{subs.length}</b></span>
            <span className="admin-usum-chip sub"><Hand size={13} strokeWidth={1.8} aria-hidden="true" />ידני <b>{manual.length}</b></span>
            <span className="admin-usum-chip sub"><CreditCard size={13} strokeWidth={1.8} aria-hidden="true" />רגיל <b>{regular.length}</b></span>
          </div>

          {/* All users */}
          <Section icon={Users} title="כל המשתמשים" count={visible.length} open={sections.all} onToggle={() => toggleSection('all')}>
            <UsersTable rows={visible} {...rowProps} />
          </Section>

          {/* Subscribers → manual + regular */}
          <Section icon={BadgeCheck} title="מנויים" count={subs.length} open={sections.subs} onToggle={() => toggleSection('subs')}>
            <Section nested icon={Hand} title="מנוי ידני" count={manual.length} open={sections.manual} onToggle={() => toggleSection('manual')}>
              <UsersTable rows={manual} {...rowProps} emptyText="אין מנויים ידניים" />
            </Section>
            <Section nested icon={CreditCard} title="מנוי רגיל" count={regular.length} open={sections.regular} onToggle={() => toggleSection('regular')}>
              <UsersTable rows={regular} {...rowProps} emptyText="אין מנויים רגילים (יתמלא כשתעלה תשתית תשלומים)" />
            </Section>
          </Section>
        </>
      )}
    </>
  )
}

/* Collapsible section with a count summary in the header. */
function Section({ icon: Icon, title, count, open, onToggle, nested, children }) {
  return (
    <section className={`admin-acc${nested ? ' nested' : ''}`}>
      <button type="button" className="admin-acc-head" onClick={onToggle} aria-expanded={open}>
        <ChevronDown size={16} strokeWidth={1.9} className="admin-acc-chev" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} aria-hidden="true" />
        {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
        <span className="admin-acc-title">{title}</span>
        <span className="admin-acc-count">{count}</span>
      </button>
      {open && <div className="admin-acc-body">{children}</div>}
    </section>
  )
}

function UsersTable({ rows, openId, onToggleRow, confirmId, busy, onRequestConfirm, onCancelConfirm, onApply, emptyText = 'לא נמצאו משתמשים' }) {
  return (
    <div className="admin-card admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>אימייל</th>
            <th>מנוי</th>
            <th>הצטרפות</th>
            <th>שלב onboarding</th>
            <th>רפלקציות</th>
            <th>Sessions</th>
            <th>פעיל לאחרונה</th>
            <th aria-label="הרחבה" style={{ width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={8} className="muted">{emptyText}</td></tr>}
          {rows.map((r) => (
            <UserRow
              key={r.id}
              r={r}
              isOpen={openId === r.id}
              confirming={confirmId === r.id}
              busy={busy === r.id}
              onToggle={() => onToggleRow(r.id)}
              onRequestConfirm={() => onRequestConfirm(r.id)}
              onCancelConfirm={onCancelConfirm}
              onApply={() => onApply(r)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Subscriber cell: real (paid) → static read-only badge; otherwise a
   two-step toggle (click → confirm) so a flag never happens by accident. */
function SubCell({ r, confirming, busy, onRequestConfirm, onCancelConfirm, onApply }) {
  if (r.subscriber_kind === 'regular') {
    return <span className="admin-sub-badge regular"><CreditCard size={12} strokeWidth={2} aria-hidden="true" /> מנוי רגיל</span>
  }
  const on = r.subscriber_kind === 'manual'
  if (confirming) {
    return (
      <span className="admin-sub-confirm" onClick={(e) => e.stopPropagation()}>
        <span className="admin-sub-confirm-q">{on ? 'לבטל מנוי?' : 'לסמן כמנוי?'}</span>
        <button type="button" className="admin-sub-yes" disabled={busy} onClick={onApply} aria-label="אישור"><Check size={13} strokeWidth={2.4} /></button>
        <button type="button" className="admin-sub-no" onClick={onCancelConfirm} aria-label="ביטול"><X size={13} strokeWidth={2.4} /></button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`admin-sub-toggle${on ? ' on' : ''}`}
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); onRequestConfirm() }}
      title={on ? 'לחץ כדי לבטל מנוי' : 'סמן כמנוי'}
    >
      {on ? <><BadgeCheck size={13} strokeWidth={2} aria-hidden="true" /> מנוי</> : <><Plus size={13} strokeWidth={2} aria-hidden="true" /> סמן</>}
    </button>
  )
}

function UserRow({ r, isOpen, confirming, busy, onToggle, onRequestConfirm, onCancelConfirm, onApply }) {
  return (
    <>
      <tr className={`clickable${r.is_subscriber ? ' is-sub' : ''}`} onClick={onToggle}>
        <td dir="ltr" style={{ textAlign: 'start' }}>{r.email || '—'}</td>
        <td>
          <SubCell
            r={r}
            confirming={confirming}
            busy={busy}
            onRequestConfirm={onRequestConfirm}
            onCancelConfirm={onCancelConfirm}
            onApply={onApply}
          />
        </td>
        <td>{fmtDate(r.created_at)}</td>
        <td><span className={`admin-pill${r.onboarding_done ? ' done' : ''}`}>{r.onboarding_label}</span></td>
        <td className="num">{r.reflections}</td>
        <td className="num">{r.sessions}</td>
        <td>{fmtLastActive(r.last_sign_in_at)}</td>
        <td>
          <ChevronDown size={16} strokeWidth={1.8}
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--mist)' }}
            aria-hidden="true" />
        </td>
      </tr>
      {isOpen && (
        <tr className="admin-detail">
          <td colSpan={8}>
            <div className="admin-detail-grid">
              <div><div className="k">מנוי</div><div className="v">{r.subscriber_kind === 'regular' ? 'מנוי רגיל (תשלום)' : r.subscriber_kind === 'manual' ? 'מנוי ידני' : 'לא'}</div></div>
              <div><div className="k">שלב onboarding</div><div className="v">{r.onboarding_done ? r.onboarding_label : `נעצר ב: ${r.onboarding_label}`}</div></div>
              <div><div className="k">פידבקים שהשאיר</div><div className="v">{r.feedback_count > 0 ? `${r.feedback_count} פידבק(ים)` : 'אין'}</div></div>
              <div><div className="k">רפלקציות</div><div className="v">{r.reflections}</div></div>
              <div><div className="k">Sessions</div><div className="v">{r.sessions}</div></div>
              <div><div className="k">נרשם</div><div className="v">{fmtDate(r.created_at)}</div></div>
              <div><div className="k">כניסה אחרונה</div><div className="v">{fmtLastActive(r.last_sign_in_at)}</div></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
