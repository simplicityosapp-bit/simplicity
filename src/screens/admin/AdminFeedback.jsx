import { useState, useMemo } from 'react'
import { Bug, Lightbulb, Heart, MessageCircle } from 'lucide-react'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'

const TYPE_META = {
  bug:    { label: 'באג',    icon: Bug },
  idea:   { label: 'רעיון',  icon: Lightbulb },
  praise: { label: 'מחמאה',  icon: Heart },
  other:  { label: 'אחר',    icon: MessageCircle },
}
const STATUSES = [
  { k: 'new',         l: 'חדש' },
  { k: 'in_progress', l: 'בטיפול' },
  { k: 'done',        l: 'טופל' },
]
const TYPE_FILTERS = [{ k: 'all', l: 'הכול' }, ...Object.entries(TYPE_META).map(([k, v]) => ({ k, l: v.label }))]
const STATUS_FILTERS = [{ k: 'all', l: 'הכול' }, ...STATUSES.map((s) => ({ k: s.k, l: s.l }))]

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function AdminFeedback() {
  const { data, loading, error } = useAdminQuery('feedback_list')
  const [statusOverride, setStatusOverride] = useState({}) // id → optimistic status
  const [typeF, setTypeF] = useState('all')
  const [statusF, setStatusF] = useState('all')

  // Derive the list from the fetch + any optimistic status edits — no
  // effect-syncing of fetched data into state (avoids cascading renders).
  const items = useMemo(
    () => (data?.items || []).map((it) => ({ ...it, status: statusOverride[it.id] ?? it.status })),
    [data, statusOverride],
  )

  const changeStatus = async (id, status) => {
    const prev = statusOverride[id]
    setStatusOverride((o) => ({ ...o, [id]: status })) // optimistic
    try {
      await callAdmin('feedback_update_status', { id, status })
    } catch {
      setStatusOverride((o) => ({ ...o, [id]: prev })) // roll back (undefined → original)
    }
  }

  const filtered = useMemo(() => items.filter((it) => {
    if (typeF !== 'all' && (it.type || 'other') !== typeF) return false
    if (statusF !== 'all' && (it.status || 'new') !== statusF) return false
    return true
  }), [items, typeF, statusF])

  return (
    <>
      <header className="admin-head">
        <h1>פידבקים</h1>
        <p>כל הפידבקים והבאגים במקום אחד — החדשים קודם</p>
      </header>

      {loading && <div className="admin-state">טוען…</div>}
      {error && <div className="admin-state err">שגיאה בטעינת הנתונים</div>}

      {data && (
        <>
          <div className="admin-fb-filters">
            <div className="admin-range">
              {TYPE_FILTERS.map((f) => (
                <button key={f.k} className={typeF === f.k ? 'on' : ''} onClick={() => setTypeF(f.k)}>{f.l}</button>
              ))}
            </div>
            <div className="admin-range">
              {STATUS_FILTERS.map((f) => (
                <button key={f.k} className={statusF === f.k ? 'on' : ''} onClick={() => setStatusF(f.k)}>{f.l}</button>
              ))}
            </div>
          </div>

          <div className="admin-fb-list">
            {filtered.length === 0 && <div className="admin-state">אין פידבקים להצגה</div>}
            {filtered.map((it) => {
              const meta = TYPE_META[it.type]
              const Icon = meta?.icon
              return (
                <div className="admin-card admin-fb-card" key={it.id}>
                  <div className="admin-fb-top">
                    <span className="admin-fb-from" dir="ltr">{it.email || 'משתמש לא מזוהה'}</span>
                    <span className="admin-fb-date">{fmtDate(it.created_at)}</span>
                    {meta && (
                      <span className={`admin-chip type-${it.type}`}>
                        {Icon && <Icon size={12} strokeWidth={1.9} aria-hidden="true" />}{meta.label}
                      </span>
                    )}
                    <div className="admin-status-row" role="group" aria-label="סטטוס">
                      {STATUSES.map((s) => (
                        <button
                          key={s.k}
                          className={(it.status || 'new') === s.k ? 'on' : ''}
                          onClick={() => changeStatus(it.id, s.k)}
                        >
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="admin-fb-msg">{it.message}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
