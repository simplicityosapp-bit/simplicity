import {
  Users, BadgeCheck, Activity, MessageSquare, CalendarCheck, Target,
} from 'lucide-react'
import { useAdminQuery } from '../../hooks/useAdmin'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { BarChart } from './AdminCharts'

/* The targets the owner can set — each auto-fills its "current" from a
   live dashboard counter, so a target is just a number to aim at. */
const TARGETS = [
  { key: 'totalUsers',      label: 'משתמשים רשומים' },
  { key: 'active7d',        label: 'פעילים ב-7 ימים' },
  { key: 'sessionsThisWeek', label: 'Sessions השבוע' },
]

const STAT_CARDS = [
  { key: 'totalUsers',       label: 'משתמשים רשומים',   icon: Users },
  { key: 'subscribers',      label: 'מנויים',           icon: BadgeCheck, sub: 'מסומן ידנית' },
  { key: 'active7d',         label: 'פעילים ב-7 ימים',  icon: Activity },
  { key: 'openFeedback',     label: 'פידבקים שלא טופלו', icon: MessageSquare },
  { key: 'sessionsThisWeek', label: 'Sessions השבוע',   icon: CalendarCheck },
]

/* Weekly x-label: dd/mm of the week's start. */
function weekLabel(d) {
  const [, m, day] = (d.weekStart || '').split('-')
  return day && m ? `${day}/${m}` : ''
}

export default function AdminDashboard() {
  const { data, loading, error } = useAdminQuery('dashboard')
  const { prefs, update } = useUserPreferences()
  const targets = prefs?.adminTargets || {}

  const setTarget = (key, raw) => {
    const n = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0)
    update({ adminTargets: { ...targets, [key]: n } })
  }

  return (
    <>
      <header className="admin-head">
        <h1>דשבורד</h1>
        <p>תמונת מצב מיידית של המערכת</p>
      </header>

      {loading && <div className="admin-state">טוען…</div>}
      {error && <div className="admin-state err">שגיאה בטעינת הנתונים</div>}

      {data && (
        <>
          {/* Headline counters */}
          <section className="admin-stats">
            {STAT_CARDS.map(({ key, label, icon: Icon, muted, sub }) => (
              <div className="admin-card admin-stat" key={key}>
                <div className="admin-stat-label"><Icon size={15} strokeWidth={1.8} aria-hidden="true" />{label}</div>
                <div className={`admin-stat-value${muted ? ' muted' : ''}`}>
                  {(data.totals?.[key] ?? 0).toLocaleString('he-IL')}
                </div>
                {sub && <div className="admin-stat-sub">{sub}</div>}
              </div>
            ))}
          </section>

          {/* Signups over time */}
          <section className="admin-section">
            <div className="admin-section-head"><h2>הצטרפויות לאורך זמן</h2></div>
            <div className="admin-card admin-chart-card">
              <BarChart data={data.signups || []} formatX={weekLabel} />
            </div>
          </section>

          {/* Targets — set a number, progress auto-fills from the live data */}
          <section className="admin-section">
            <div className="admin-section-head">
              <h2><Target size={16} strokeWidth={1.8} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} aria-hidden="true" />יעדים</h2>
            </div>
            <div className="admin-goals">
              {TARGETS.map(({ key, label }) => {
                const now = data.totals?.[key] ?? 0
                const target = targets[key]
                const pct = target ? Math.min(100, Math.round((now / target) * 100)) : 0
                const done = target && now >= target
                return (
                  <div className="admin-card admin-goal" key={key}>
                    <div className="admin-goal-head">
                      <span className="admin-goal-label">{label}</span>
                      <span className="admin-goal-now"><b>{now.toLocaleString('he-IL')}</b> / <input
                        className="admin-goal-input"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={target ?? ''}
                        placeholder="יעד"
                        onChange={(e) => setTarget(key, e.target.value)}
                      /></span>
                    </div>
                    <div className="admin-goal-bar">
                      <span className={done ? 'done' : ''} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </>
  )
}
