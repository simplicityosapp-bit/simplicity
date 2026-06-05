import { useState } from 'react'
import { useAdminQuery } from '../../hooks/useAdmin'
import { LineChart, FunnelBars } from './AdminCharts'

const RANGES = [
  { k: 'week',  l: 'שבוע' },
  { k: 'month', l: 'חודש' },
  { k: 'all',   l: 'הכול' },
]

/* "YYYY-MM-DD" → dd/mm for the x-axis. */
function dayLabel(d) {
  const [, m, day] = (d.date || '').split('-')
  return day && m ? `${day}/${m}` : ''
}

export default function AdminAnalytics() {
  const [range, setRange] = useState('month')
  const { data, loading, error } = useAdminQuery('analytics', { range })

  return (
    <>
      <header className="admin-head">
        <h1>אנליטיקס</h1>
        <p>שאלות ספציפיות על המוצר — לא Google Analytics</p>
      </header>

      <div className="admin-range admin-range-top">
        {RANGES.map((r) => (
          <button key={r.k} className={range === r.k ? 'on' : ''} onClick={() => setRange(r.k)}>{r.l}</button>
        ))}
      </div>

      {loading && <div className="admin-state">טוען…</div>}
      {error && <div className="admin-state err">שגיאה בטעינת הנתונים</div>}

      {data && (
        <>
          <section className="admin-section">
            <div className="admin-section-head"><h2>Sessions לאורך זמן</h2></div>
            <div className="admin-card admin-chart-card">
              <LineChart data={data.sessionsOverTime || []} formatX={dayLabel} gradId="admSessions" />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>רפלקציות לאורך זמן</h2></div>
            <div className="admin-card admin-chart-card">
              <LineChart data={data.reflectionsOverTime || []} alt formatX={dayLabel} gradId="admReflections" />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>משפך onboarding</h2></div>
            <div className="admin-card admin-chart-card">
              <FunnelBars data={data.funnel || []} />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><h2>המשתמשים הכי פעילים</h2></div>
            <div className="admin-card admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th style={{ width: 40 }}>#</th><th>אימייל</th><th>Sessions</th></tr>
                </thead>
                <tbody>
                  {(data.topUsers || []).length === 0 && (
                    <tr><td colSpan={3} className="muted">אין נתונים בטווח הזה</td></tr>
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
