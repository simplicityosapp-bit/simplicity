import {
  Users, BadgeCheck, Activity, MessageSquare, CalendarCheck, Target,
} from 'lucide-react'
import { useAdminQuery } from '../../hooks/useAdmin'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useT } from '../../i18n/useT'
import { BarChart } from './AdminCharts'

/* The targets the owner can set — each auto-fills its "current" from a
   live dashboard counter, so a target is just a number to aim at. */
const TARGETS = [
  { key: 'totalUsers' },
  { key: 'active7d' },
  { key: 'sessionsThisWeek' },
]

const STAT_CARDS = [
  { key: 'totalUsers',       icon: Users },
  { key: 'subscribers',      icon: BadgeCheck, sub: 'subscribersSub' },
  { key: 'active7d',         icon: Activity },
  { key: 'openFeedback',     icon: MessageSquare },
  { key: 'sessionsThisWeek', icon: CalendarCheck },
]

/* Weekly x-label: dd/mm of the week's start. */
function weekLabel(d) {
  const [, m, day] = (d.weekStart || '').split('-')
  return day && m ? `${day}/${m}` : ''
}

export default function AdminDashboard() {
  const { t } = useT('admin')
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
        <h1>{t('dashboard.title')}</h1>
        <p>{t('dashboard.subtitle')}</p>
      </header>

      {loading && <div className="admin-state">{t('state.loading')}</div>}
      {error && <div className="admin-state err">{t('state.loadError')}</div>}

      {data && (
        <>
          {/* Headline counters */}
          <section className="admin-stats">
            {STAT_CARDS.map(({ key, icon: Icon, muted, sub }) => (
              <div className="admin-card admin-stat" key={key}>
                <div className="admin-stat-label"><Icon size={15} strokeWidth={1.8} aria-hidden="true" />{t(`dashboard.stats.${key}`)}</div>
                <div className={`admin-stat-value${muted ? ' muted' : ''}`}>
                  {(data.totals?.[key] ?? 0).toLocaleString('he-IL')}
                </div>
                {sub && <div className="admin-stat-sub">{t(`dashboard.stats.${sub}`)}</div>}
              </div>
            ))}
          </section>

          {/* Signups over time */}
          <section className="admin-section">
            <div className="admin-section-head"><h2>{t('dashboard.signupsOverTime')}</h2></div>
            <div className="admin-card admin-chart-card">
              <BarChart data={data.signups || []} formatX={weekLabel} />
            </div>
          </section>

          {/* Targets — set a number, progress auto-fills from the live data */}
          <section className="admin-section">
            <div className="admin-section-head">
              <h2><Target size={16} strokeWidth={1.8} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} aria-hidden="true" />{t('dashboard.goalsHeading')}</h2>
            </div>
            <div className="admin-goals">
              {TARGETS.map(({ key }) => {
                const now = data.totals?.[key] ?? 0
                const target = targets[key]
                const pct = target ? Math.min(100, Math.round((now / target) * 100)) : 0
                const done = target && now >= target
                return (
                  <div className="admin-card admin-goal" key={key}>
                    <div className="admin-goal-head">
                      <span className="admin-goal-label">{t(`dashboard.targets.${key}`)}</span>
                      <span className="admin-goal-now"><b>{now.toLocaleString('he-IL')}</b> / <input
                        className="admin-goal-input"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={target ?? ''}
                        placeholder={t('dashboard.targetPlaceholder')}
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
