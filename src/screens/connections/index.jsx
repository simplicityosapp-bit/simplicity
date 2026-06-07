import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plug, Calendar, RefreshCw, Check, CircleAlert, Link2Off } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useClients } from '../../hooks/useClients'
import './ConnectionsScreen.css'

const todayStr = () => new Date().toISOString().slice(0, 10)
const yearAgoStr = () => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)

function fmtDateTime(iso, allDay) {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  if (allDay) return date
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}
function fmtDuration(min) {
  if (!min || min <= 0) return ''
  if (min < 60) return `${min} ד׳`
  const h = Math.floor(min / 60); const m = min % 60
  return m ? `${h} ש׳ ${m} ד׳` : `${h} ש׳`
}

export default function ConnectionsScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const gcal = useGoogleCalendar()
  const { events, loading: eventsLoading, refetch, assignClient } = useCalendarEvents()
  const { clients } = useClients()
  const [syncFrom, setSyncFrom] = useState(yearAgoStr())
  const [callbackError, setCallbackError] = useState('')
  const handledCode = useRef(false)

  const clientName = useMemo(() => {
    const m = new Map(); (clients || []).forEach((c) => m.set(c.id, c.name)); return m
  }, [clients])

  /* OAuth return: Google sent us back with ?code (or ?error). Exchange it
     once, then scrub the query string so a refresh can't re-fire it. */
  useEffect(() => {
    if (handledCode.current) return
    const code = params.get('code')
    const err = params.get('error')
    if (!code && !err) return
    handledCode.current = true
    const finish = () => navigate(ROUTES.CONNECTIONS, { replace: true })
    if (err) {
      Promise.resolve().then(() => setCallbackError('החיבור בוטל או נדחה.')).finally(finish)
    } else {
      gcal.completeConnect(code).then(() => refetch()).catch(() => {}).finally(finish)
    }
  }, [params, gcal, navigate, refetch])

  const status = gcal.status
  const connected = !!status?.connected
  const connecting = gcal.busy && !!params.get('code')

  const onSync = async () => { await gcal.sync().catch(() => {}); refetch() }

  return (
    <div className="screen">
      <header className="screen-head conn-head">
        <div>
          <p className="t-screen"><Plug size={20} strokeWidth={1.6} aria-hidden="true" /> חיבורים</p>
          <p className="lbl-sm">חברו שירותים חיצוניים כדי למשוך נתונים אוטומטית.</p>
        </div>
      </header>

      {/* ── Google Calendar card ──────────────────────────────── */}
      <section className="conn-card">
        <div className="conn-card-head">
          <span className="conn-icon"><Calendar size={22} strokeWidth={1.6} aria-hidden="true" /></span>
          <div className="conn-card-titles">
            <p className="conn-card-title">Google Calendar</p>
            <p className="conn-card-sub">
              {gcal.loading ? 'טוען…'
                : connected
                  ? <><Check size={13} strokeWidth={2} aria-hidden="true" /> מחובר{status?.last_synced_at ? ` · סונכרן ${fmtDateTime(status.last_synced_at)}` : ''}</>
                  : 'לא מחובר — משיכת אירועים מהיומן וזיהוי פגישות עם לקוחות.'}
            </p>
          </div>
        </div>

        {connecting && <p className="conn-note">מתחבר ומסנכרן…</p>}
        {(gcal.error || callbackError) && (
          <p className="conn-error"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {callbackError || gcal.error}</p>
        )}

        {!connected ? (
          <div className="conn-connect">
            <label className="conn-field">
              <span className="conn-field-lbl">מאיזה תאריך לסנכרן?</span>
              <input
                type="date"
                className="conn-date"
                value={syncFrom}
                min={yearAgoStr()}
                max={todayStr()}
                onChange={(e) => setSyncFrom(e.target.value)}
              />
            </label>
            <button type="button" className="conn-btn primary" disabled={gcal.busy} onClick={() => gcal.beginConnect(syncFrom)}>
              {gcal.busy ? 'פותח…' : 'חבר את Google Calendar'}
            </button>
          </div>
        ) : (
          <div className="conn-actions">
            <button type="button" className="conn-btn primary" disabled={gcal.busy} onClick={onSync}>
              <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {gcal.busy ? 'מסנכרן…' : 'סנכרן עכשיו'}
            </button>
            <button type="button" className="conn-btn ghost danger" disabled={gcal.busy} onClick={() => gcal.disconnect()}>
              <Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> נתק
            </button>
          </div>
        )}
      </section>

      {/* ── Synced events ─────────────────────────────────────── */}
      {connected && (
        <section className="conn-events">
          <p className="conn-events-h">אירועים שסונכרנו {events.length ? `(${events.length})` : ''}</p>
          {eventsLoading ? (
            <p className="conn-empty">טוען אירועים…</p>
          ) : events.length === 0 ? (
            <p className="conn-empty">אין אירועים בטווח שנבחר. נסה/י לסנכרן שוב או להרחיב את הטווח.</p>
          ) : (
            <div className="conn-event-list">
              {events.map((ev) => {
                const matched = !!ev.client_id
                return (
                  <div key={ev.id} className="conn-event">
                    <div className="conn-event-main">
                      <p className="conn-event-title">{ev.title}</p>
                      <p className="conn-event-meta">
                        {fmtDateTime(ev.start_time, ev.all_day)}{ev.duration_minutes ? ` · ${fmtDuration(ev.duration_minutes)}` : ''}
                      </p>
                    </div>
                    <div className="conn-event-side">
                      <span className={`conn-tag${matched ? ' on' : ''}`}>
                        {matched
                          ? `${ev.matched_manually ? 'שויך' : 'מזוהה'}: ${clientName.get(ev.client_id) || 'לקוח'}`
                          : 'לא מזוהה'}
                      </span>
                      <select
                        className="conn-event-select"
                        value={ev.client_id || ''}
                        onChange={(e) => assignClient(ev.id, e.target.value)}
                        aria-label="שיוך לקוח"
                      >
                        <option value="">— ללא לקוח —</option>
                        {(clients || []).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
