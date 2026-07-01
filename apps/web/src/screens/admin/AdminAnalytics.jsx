import { useState } from 'react'
import { useAdminQuery } from '../../hooks/useAdmin'
import { useT } from '../../i18n/useT'
import { LineChart, FunnelBars } from './AdminCharts'
import { Box, Txt, Btn } from '../../components/ui'

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
      <Box as="header" className="admin-head">
        <Txt as="h1">{t('analytics.title')}</Txt>
        <Txt as="p">{t('analytics.subtitle')}</Txt>
      </Box>

      <Box className="admin-range admin-range-top">
        {RANGES.map((r) => (
          <Btn key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{t(`analytics.ranges.${r}`)}</Btn>
        ))}
      </Box>

      {loading && <Box className="admin-state">{t('state.loading')}</Box>}
      {error && <Box className="admin-state err">{t('state.loadError')}</Box>}

      {data && (
        <>
          <Box as="section" className="admin-section">
            <Box className="admin-section-head"><Txt as="h2">{t('analytics.sessionsOverTime')}</Txt></Box>
            <Box className="admin-card admin-chart-card">
              <LineChart data={data.sessionsOverTime || []} formatX={dayLabel} gradId="admSessions" />
            </Box>
          </Box>

          <Box as="section" className="admin-section">
            <Box className="admin-section-head"><Txt as="h2">{t('analytics.reflectionsOverTime')}</Txt></Box>
            <Box className="admin-card admin-chart-card">
              <LineChart data={data.reflectionsOverTime || []} alt formatX={dayLabel} gradId="admReflections" />
            </Box>
          </Box>

          <Box as="section" className="admin-section">
            <Box className="admin-section-head"><Txt as="h2">{t('analytics.onboardingFunnel')}</Txt></Box>
            <Box className="admin-card admin-chart-card">
              <FunnelBars data={data.funnel || []} />
            </Box>
          </Box>

          <Box as="section" className="admin-section">
            <Box className="admin-section-head"><Txt as="h2">{t('analytics.landingFunnel')}</Txt></Box>
            <Box className="admin-card admin-chart-card">
              <FunnelBars data={data.landingFunnel || []} />
            </Box>
          </Box>

          <Box as="section" className="admin-section">
            <Box className="admin-section-head"><Txt as="h2">{t('analytics.landingEngagement')}</Txt></Box>
            <Box className="admin-card admin-chart-card">
              <FunnelBars data={data.landingEngagement || []} />
            </Box>
          </Box>

          <Box as="section" className="admin-section">
            <Box className="admin-section-head"><Txt as="h2">{t('analytics.topUsers')}</Txt></Box>
            <Box className="admin-card admin-table-wrap">
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
            </Box>
          </Box>
        </>
      )}
    </>
  )
}
