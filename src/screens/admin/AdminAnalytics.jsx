import { useState } from 'react'
import { useAdminQuery } from '../../hooks/useAdmin'
import { useT } from '../../i18n/useT'
import { LineChart, FunnelBars } from './AdminCharts'

const RANGES = ['week', 'month', 'all']

/* "YYYY-MM-DD" → dd/mm for the x-axis. */
function dayLabel(d) {
  const [, m, day] = (d.date || '').split('-')
  return day && m ? `${day}/${m}` : ''
}

export default function AdminAnalytics() {
  const { t } = useT('admin')
  const [range, setRange] = useState('month')
  const { data, loading, error } = useAdminQuery('analytics', { range })

  return (
    <>
      <header className="admin-head">
        <h1>{t('analytics.title')}</h1>
        <p>{t('analytics.subtitle')}</p>
      </header>

      <div className="admin-range admin-range-top">
        {RANGES.map((r) => (
          <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{t(`analytics.ranges.${r}`)}</button>
        ))}
      </div>

      {loading && <div className="admin-state">{t('state.loading')}</div>}
      {error && <div className="admin-state err">{t('state.loadError')}</div>}

      {data && (
        <>
          <section className="admin-section">
            <div className="admin-section-head"><h2>{t('analytics.sessionsOverTime')}</h2></div>
            <div className="admin-card admin-chart-card">
              <LineChart data={data.sessionsOverTime || []} formatX={dayLabel} gradId="admSessions" />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>{t('analytics.reflectionsOverTime')}</h2></div>
            <div className="admin-card admin-chart-card">
              <LineChart data={data.reflectionsOverTime || []} alt formatX={dayLabel} gradId="admReflections" />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>{t('analytics.onboardingFunnel')}</h2></div>
            <div className="admin-card admin-chart-card">
              <FunnelBars data={data.funnel || []} />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>{t('analytics.landingFunnel')}</h2></div>
            <div className="admin-card admin-chart-card">
              <FunnelBars data={data.landingFunnel || []} />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>{t('analytics.landingEngagement')}</h2></div>
            <div className="admin-card admin-chart-card">
              <FunnelBars data={data.landingEngagement || []} />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>{t('analytics.topUsers')}</h2></div>
            <div className="admin-card admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th style={{ width: 40 }}>{t('analytics.rank')}</th><th>{t('analytics.email')}</th><th>{t('analytics.sessions')}</th></tr>
                </thead>
                <tbody>
                  {(data.topUsers || []).length === 0 && (
                    <tr><td colSpan={3} className="muted">{t('analytics.topUsersEmpty')}</td></tr>
                  )}
                  {(data.topUsers || []).map((u, i) => (
                    <tr key={i}>
                      <td className="num muted">{i + 1}</td>
                      <td dir="ltr" style={{ textAlign: 'start' }}>{u.email || '—'}</td>
                      <td className="num">{u.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )
}
